import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CompaniesService } from '../companies/companies.service';
import { resolveServiceTemplateId } from '../companies/service-template-map';
import { AgentConfigService } from '../agent-config/agent-config.service';
import { CompanyNumbersService } from '../company-numbers/company-numbers.service';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { S3Service } from '../../infrastructure/storage/s3.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { UsageService } from '../billing/usage.service';
import { UsageGateService } from '../billing/usage-gate.service';
import { getLocalDateParts, getWeekdayKey, zonedTimeToUtcMs } from '../scheduling/timezone';
import * as chrono from 'chrono-node';
import { AppointmentsService } from '../appointments/appointments.service';
import {
  Call,
  CallDirection,
  CallStatus,
  Contact,
  AppointmentStatus,
  CompanyStatus,
  CallHandlingMode,
} from '@handycall/shared';
import { CreateLeadDto } from './dto/create-lead.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { GetAvailabilityDto } from './dto/get-availability.dto';
import { KnowledgeSearchDto } from './dto/knowledge-search.dto';
import { SaveCallDto } from './dto/save-call.dto';
import { ConfigService } from '@nestjs/config';
import { SaveRecordingDto } from './dto/save-recording.dto';
import { signBookingToken } from '../public-booking/booking-link.util';
import { sendSesEmail } from '../public-booking/email.util';
import { renderHandycallEmail } from '../../common/email-templates';
import { isValidEmail } from '@handycall/shared';
import { WebhooksService } from '../webhooks/webhooks.service';
import { FollowUpSequencesService } from '../follow-up-sequences/follow-up-sequences.service';

function asE164(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

type ActiveBookingService = {
  service_id: string;
  name: string;
  description?: string;
  amount_cents: number;
  currency?: string;
  billing_type?: 'ONE_TIME' | 'SUBSCRIPTION';
  billing_interval?: 'day' | 'week' | 'month' | 'year';
  billing_interval_count?: number;
  trial_period_days?: number;
  collect_payment?: boolean;
  active?: boolean;
};

type ServiceSelection = {
  service_id: string;
  name: string;
  billing_type: 'ONE_TIME' | 'SUBSCRIPTION';
};

@Injectable()
export class RealtimeToolsService {
  constructor(
    private readonly config: ConfigService,
    private readonly companies: CompaniesService,
    private readonly agentConfig: AgentConfigService,
    private readonly companyNumbers: CompanyNumbersService,
    private readonly dynamodb: DynamoDBService,
    private readonly s3: S3Service,
    private readonly knowledge: KnowledgeService,
    private readonly scheduling: SchedulingService,
    private readonly usageService: UsageService,
    private readonly usageGate: UsageGateService,
    private readonly appointmentsService: AppointmentsService,
    private readonly webhooks: WebhooksService,
    private readonly followUps: FollowUpSequencesService,
  ) { }

  private twilioAuthHeader(): string {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!sid || !token) {
      throw new Error('Missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN');
    }
    const basic = Buffer.from(`${sid}:${token}`, 'utf8').toString('base64');
    return `Basic ${basic}`;
  }

  private getBookingSecret(): string {
    const secret =
      this.config.get<string>('BOOKING_LINK_SECRET') || this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('Missing BOOKING_LINK_SECRET/JWT_SECRET');
    return secret;
  }

  private getFrontendBaseUrl(): string {
    return (this.config.get<string>('FRONTEND_URL') || 'https://handycall.org').replace(/\/$/, '');
  }

  private resolveCompanyTimeZone(company: any, fallback = 'UTC'): string {
    const candidate =
      company?.calendar_connection?.timezone ||
      company?.calendar_connection?.timeZone ||
      company?.timezone ||
      fallback;
    return candidate || fallback;
  }

  private pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  private findOverrideForDate(company: any, ymd: string): any | undefined {
    const overrides = company?.schedule_overrides;
    if (!overrides) return undefined;

    if (Array.isArray(overrides)) {
      return overrides.find((o) => o?.date === ymd);
    }

    if (typeof overrides === 'object') {
      return overrides[ymd];
    }

    return undefined;
  }

  private getScheduleForDay(company: any, weekdayKey: string): any | undefined {
    const hours: any = company?.business_hours || {};
    const direct = hours?.[weekdayKey];
    if (direct) return direct;
    const shortMap: Record<string, string> = {
      monday: 'mon',
      tuesday: 'tue',
      wednesday: 'wed',
      thursday: 'thu',
      friday: 'fri',
      saturday: 'sat',
      sunday: 'sun',
    };
    const shortKey = shortMap[weekdayKey];
    return shortKey ? hours?.[shortKey] : undefined;
  }

  private normalizeSegments(schedule?: any): Array<{ open: string; close: string }> {
    if (!schedule || schedule?.closed) return [];
    const segs = Array.isArray(schedule?.segments) ? schedule.segments : [];
    if (segs.length) return segs.filter((s: any) => s?.open && s?.close);
    const open = schedule?.open;
    const close = schedule?.close;
    if (open && close) return [{ open, close }];
    return [];
  }

  private getClosedInfo(company: any, target: Date, timeZone: string): { closed: boolean; dayLabel: string } {
    const parts = getLocalDateParts(target, timeZone);
    const ymdKey = `${parts.year}-${this.pad2(parts.month)}-${this.pad2(parts.day)}`;
    const override = this.findOverrideForDate(company, ymdKey);
    const pivotUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
    const weekdayKey = getWeekdayKey(pivotUtc, timeZone);
    const schedule = override ?? this.getScheduleForDay(company, weekdayKey);
    const segments = this.normalizeSegments(schedule);
    const closed = Boolean(override?.closed) || segments.length === 0;
    const dayLabel = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(target);
    return { closed, dayLabel };
  }

  private normalizeServiceLabel(value: string | undefined): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ');
  }

  private normalizeBillingType(value: any): 'ONE_TIME' | 'SUBSCRIPTION' | undefined {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return undefined;
    if (raw === 'SUBSCRIPTION' || raw === 'RECURRING' || raw === 'PLAN' || raw === 'MEMBERSHIP') {
      return 'SUBSCRIPTION';
    }
    if (raw === 'ONE_TIME' || raw === 'ONETIME' || raw === 'ONE-TIME' || raw === 'SINGLE') {
      return 'ONE_TIME';
    }
    return undefined;
  }

  private resolveActiveBookingServices(company: any): ActiveBookingService[] {
    const raw = Array.isArray(company?.booking_services) ? company.booking_services : [];
    return raw
      .filter((item: any) => item && item.active !== false)
      .map((item: any) => ({
        service_id: String(item.service_id || ''),
        name: String(item.name || '').trim(),
        description: item.description ? String(item.description) : undefined,
        amount_cents: Number.isFinite(Number(item.amount_cents)) ? Math.round(Number(item.amount_cents)) : 0,
        currency: item.currency ? String(item.currency).toLowerCase() : 'usd',
        billing_type: item.billing_type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'ONE_TIME',
        billing_interval:
          ['day', 'week', 'month', 'year'].includes(String(item.billing_interval || '').toLowerCase())
            ? (String(item.billing_interval || '').toLowerCase() as 'day' | 'week' | 'month' | 'year')
            : 'month',
        billing_interval_count: Math.max(1, Math.floor(Number(item.billing_interval_count || 1))),
        trial_period_days: Math.max(0, Math.floor(Number(item.trial_period_days || 0))),
        collect_payment: item.collect_payment !== false,
        active: item.active !== false,
      }))
      .filter((item: ActiveBookingService) => !!item.service_id && !!item.name);
  }

  private resolveServiceSelection(
    company: any,
    input: {
      call?: any;
      details?: Record<string, any>;
      preferredServiceId?: string;
      preferredServiceName?: string;
      preferredBillingType?: string;
    }
  ): ServiceSelection | undefined {
    const services = this.resolveActiveBookingServices(company);
    if (!services.length) return undefined;

    const fromDetails = input.details && typeof input.details === 'object' ? input.details : {};
    const fromCall =
      input.call && typeof input.call?.collected_info === 'object' ? (input.call.collected_info as Record<string, any>) : {};

    const findById = (serviceId: string | undefined): ServiceSelection | undefined => {
      if (!serviceId) return undefined;
      const match = services.find((service) => service.service_id === serviceId.trim());
      if (!match) return undefined;
      return {
        service_id: match.service_id,
        name: match.name,
        billing_type: match.billing_type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'ONE_TIME',
      };
    };

    const findByName = (label: string | undefined): ServiceSelection | undefined => {
      const normalized = this.normalizeServiceLabel(label);
      if (!normalized) return undefined;
      const exact = services.find((service) => this.normalizeServiceLabel(service.name) === normalized);
      const partial =
        exact ||
        services.find(
          (service) =>
            this.normalizeServiceLabel(service.name).includes(normalized) ||
            normalized.includes(this.normalizeServiceLabel(service.name)),
        );
      if (!partial) return undefined;
      return {
        service_id: partial.service_id,
        name: partial.name,
        billing_type: partial.billing_type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'ONE_TIME',
      };
    };

    const idCandidates = [
      input.preferredServiceId,
      typeof fromDetails.selected_service_id === 'string' ? fromDetails.selected_service_id : undefined,
      typeof fromDetails.service_id === 'string' ? fromDetails.service_id : undefined,
      typeof fromDetails.booking_service_id === 'string' ? fromDetails.booking_service_id : undefined,
      typeof fromCall.selected_service_id === 'string' ? fromCall.selected_service_id : undefined,
      typeof fromCall.service_id === 'string' ? fromCall.service_id : undefined,
      typeof input.call?.selected_service_id === 'string' ? input.call.selected_service_id : undefined,
    ];
    for (const serviceId of idCandidates) {
      const byId = findById(serviceId);
      if (byId) return byId;
    }

    const nameCandidates = [
      input.preferredServiceName,
      typeof fromDetails.selected_service_name === 'string' ? fromDetails.selected_service_name : undefined,
      typeof fromDetails.service_name === 'string' ? fromDetails.service_name : undefined,
      typeof fromDetails.plan_name === 'string' ? fromDetails.plan_name : undefined,
      typeof fromDetails.subscription_name === 'string' ? fromDetails.subscription_name : undefined,
      typeof fromDetails.service === 'string' ? fromDetails.service : undefined,
      typeof fromDetails.service_type === 'string' ? fromDetails.service_type : undefined,
      typeof fromCall.selected_service_name === 'string' ? fromCall.selected_service_name : undefined,
      typeof fromCall.service_name === 'string' ? fromCall.service_name : undefined,
      typeof fromCall.plan_name === 'string' ? fromCall.plan_name : undefined,
      typeof fromCall.subscription_name === 'string' ? fromCall.subscription_name : undefined,
      typeof fromCall.service === 'string' ? fromCall.service : undefined,
      typeof fromCall.service_type === 'string' ? fromCall.service_type : undefined,
      typeof input.call?.selected_service_name === 'string' ? input.call.selected_service_name : undefined,
    ];
    for (const serviceName of nameCandidates) {
      const byName = findByName(serviceName);
      if (byName) return byName;
    }

    const billingType =
      this.normalizeBillingType(input.preferredBillingType) ||
      this.normalizeBillingType(fromDetails.selected_billing_type) ||
      this.normalizeBillingType(fromDetails.billing_type) ||
      this.normalizeBillingType(fromDetails.plan_type) ||
      this.normalizeBillingType(fromCall.selected_billing_type) ||
      this.normalizeBillingType(fromCall.billing_type) ||
      this.normalizeBillingType(input.call?.selected_billing_type);

    if (billingType) {
      const matching = services.filter(
        (service) => (service.billing_type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'ONE_TIME') === billingType,
      );
      if (matching.length === 1) {
        return {
          service_id: matching[0].service_id,
          name: matching[0].name,
          billing_type: billingType,
        };
      }
    }

    if (services.length === 1) {
      const only = services[0];
      return {
        service_id: only.service_id,
        name: only.name,
        billing_type: only.billing_type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'ONE_TIME',
      };
    }

    return undefined;
  }

  private buildServiceSelectionGuide(
    company: any,
    services: ActiveBookingService[],
  ): { require_selection_before_booking: boolean; ask_when_unsure: boolean; default_question: string; summary: string } {
    const hasOneTime = services.some((service) => (service.billing_type || 'ONE_TIME') === 'ONE_TIME');
    const hasSubscription = services.some((service) => service.billing_type === 'SUBSCRIPTION');
    const requireSelection = services.length > 1 || (hasOneTime && hasSubscription);
    const serviceType = String(company?.service_type || '').toUpperCase();
    const verticalHint =
      serviceType === 'PEST_CONTROL'
        ? 'For pest control, clearly ask whether the caller wants a recurring protection plan or a one-time treatment.'
        : serviceType === 'LANDSCAPING' || serviceType === 'LAWN_CARE'
          ? 'For landscaping/lawn care, first identify the exact scope (mowing, trimming, tree work, mulch, seeding) before choosing a package.'
          : 'Clarify the exact service package before booking.';

    const shortList = services
      .slice(0, 5)
      .map((service) => {
        const cadence =
          service.billing_type === 'SUBSCRIPTION'
            ? `subscription every ${service.billing_interval_count || 1} ${service.billing_interval || 'month'}${(service.billing_interval_count || 1) > 1 ? 's' : ''}`
            : 'one-time';
        return `${service.name} (${cadence})`;
      })
      .join('; ');

    return {
      require_selection_before_booking: requireSelection,
      ask_when_unsure: true,
      default_question: hasOneTime && hasSubscription
        ? 'Would you like a one-time service or a subscription plan?'
        : services.length > 1
          ? 'Which service option would you like to book?'
          : 'Would you like to proceed with this service?',
      summary: shortList
        ? `${verticalHint} Available options: ${shortList}. Give a short explanation of each option and confirm one selection before booking.`
        : `${verticalHint} Confirm one service selection before booking.`,
    };
  }

  private buildBookingLink(
    companyId: string,
    callId: string,
    expiresAtMs?: number,
    selection?: ServiceSelection,
  ): string {
    const now = Date.now();
    const fallbackMs = Number(this.config.get<string>('BOOKING_LINK_EXPIRES_MS') || 7 * 24 * 60 * 60 * 1000);
    const exp =
      typeof expiresAtMs === 'number' && Number.isFinite(expiresAtMs)
        ? expiresAtMs
        : now + fallbackMs;
    const token = signBookingToken(
      {
        company_id: companyId,
        call_id: callId,
        exp,
        ...(selection
          ? {
              selected_service_id: selection.service_id,
              selected_service_name: selection.name,
              selected_billing_type: selection.billing_type,
            }
          : {}),
      },
      this.getBookingSecret(),
    );
    return `${this.getFrontendBaseUrl()}/book/${token}`;
  }

  private buildSummaryFallback(collected: Record<string, any> | undefined): string | undefined {
    if (!collected || typeof collected !== 'object') return undefined;

    const pieces: string[] = [];
    const service = typeof collected.service === 'string' ? collected.service.trim() : '';
    const issue = typeof collected.issue === 'string' ? collected.issue.trim() : '';
    const name = typeof collected.name === 'string' ? collected.name.trim() : '';
    const first = typeof collected.first_name === 'string' ? collected.first_name.trim() : '';
    const last = typeof collected.last_name === 'string' ? collected.last_name.trim() : '';
    const address = typeof collected.address === 'string' ? collected.address.trim() : '';
    const zip = typeof collected.zip === 'string' ? collected.zip.trim() : '';
    const preferred = typeof collected.preferred_time === 'string' ? collected.preferred_time.trim() : '';

    const displayName = name || [first, last].filter(Boolean).join(' ').trim();

    if (service) pieces.push(`Service: ${service}.`);
    if (issue) pieces.push(`Issue: ${issue}.`);
    if (displayName) pieces.push(`Name: ${displayName}.`);
    if (address) pieces.push(`Address: ${address}.`);
    if (zip) pieces.push(`Zip: ${zip}.`);
    if (preferred) pieces.push(`Preferred time: ${preferred}.`);

    const text = pieces.join(' ').trim();
    return text || undefined;
  }

  private selectBestParsedResult(results: chrono.ParsedResult[] | undefined | null): chrono.ParsedResult | null {
    if (!results || results.length === 0) return null;
    const score = (result: chrono.ParsedResult) => {
      const start = result?.start;
      if (!start) return 0;
      let points = 0;
      if (start.isCertain('hour') || start.isCertain('minute')) points += 4;
      if (start.isCertain('weekday')) points += 3;
      if (start.isCertain('day')) points += 2;
      if (start.isCertain('month')) points += 1;
      if (start.isCertain('year')) points += 1;
      const textLen = String(result?.text || '').length;
      points += Math.min(2, Math.floor(textLen / 12));
      return points;
    };
    return results.reduce((best, current) => (score(current) > score(best) ? current : best));
  }

  private getRequestedLocalParts(
    parsed: chrono.ParsedResult | null,
    dayAnchor: Date | null,
    timeZone: string
  ): { year: number; month: number; day: number; hour: number; minute: number } | null {
    const start: any = parsed?.start;
    if (!start) return null;
    const hasHour = start.isCertain?.('hour') || start.isCertain?.('minute');
    if (!hasHour) return null;
    const hour = Number(start.get?.('hour'));
    const minute = Number(start.get?.('minute') ?? 0);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

    let year = Number(start.get?.('year'));
    let month = Number(start.get?.('month'));
    let day = Number(start.get?.('day'));

    // Keep requested-time matching aligned with the same day used for availability windowing.
    // This avoids contradictions like "time unavailable" while suggesting the same time on the
    // target day (e.g., "next week Friday at 1 PM").
    if (dayAnchor) {
      const parts = getLocalDateParts(dayAnchor, timeZone);
      year = parts.year;
      month = parts.month;
      day = parts.day;
    }

    if (!(year && month && day)) return null;
    return { year, month, day, hour, minute };
  }

  private slotMatchesRequestedLocal(
    slotIso: string,
    timeZone: string,
    requested: { year: number; month: number; day: number; hour: number; minute: number }
  ): boolean {
    const date = new Date(slotIso);
    if (!Number.isFinite(date.getTime())) return false;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(date);
      const year = Number(parts.find((p) => p.type === 'year')?.value);
      const month = Number(parts.find((p) => p.type === 'month')?.value);
      const day = Number(parts.find((p) => p.type === 'day')?.value);
      const hour = Number(parts.find((p) => p.type === 'hour')?.value);
      const minute = Number(parts.find((p) => p.type === 'minute')?.value);
      return (
        year === requested.year &&
        month === requested.month &&
        day === requested.day &&
        hour === requested.hour &&
        minute === requested.minute
      );
    } catch {
      return false;
    }
  }

  private bumpNextWeekIfNeeded(raw: string, parsedDate: Date, referenceDate: Date): Date {
    const lower = String(raw || '').toLowerCase();
    if (!lower.includes('next week')) return parsedDate;
    const diff = parsedDate.getTime() - referenceDate.getTime();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    if (diff < oneWeekMs) {
      return new Date(parsedDate.getTime() + oneWeekMs);
    }
    return parsedDate;
  }

  private extractCollectedInfoFromTranscript(transcript: string): Record<string, any> {
    const out: Record<string, any> = {};
    const t = String(transcript || '');

    const phoneMatches = t.match(/(\+?1[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g);
    if (phoneMatches && phoneMatches.length) {
      const last = phoneMatches[phoneMatches.length - 1];
      const e164 = asE164(last);
      if (e164) out.phone = e164;
    }

    const zipMatches = t.match(/\b\d{5}\b/g);
    if (zipMatches && zipMatches.length) {
      out.zip = zipMatches[zipMatches.length - 1];
    }

    const nameMatch = t.match(/(?:my name is|this is)\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,3})/i);
    if (nameMatch?.[1]) {
      const name = nameMatch[1].trim();
      if (name && name.length <= 60) out.name = name;
    }

    const addressMatch = t.match(
      /(?:address is|my address is|located at)\s+([0-9]{1,6}\s+.+?)(?:[.,]\s+|\s+(?:zip|zipcode)\b|$)/i
    );
    if (addressMatch?.[1]) {
      const address = addressMatch[1].trim();
      if (address && address.length <= 120) out.address = address;
    }

    return out;
  }

  private pickDetail(details: Record<string, any>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = details?.[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return undefined;
  }

  private parseAddressFromDetails(details: Record<string, any>): { street?: string; city?: string; state?: string; zip?: string } | undefined {
    const addressValue =
      details?.address ??
      details?.service_address ??
      details?.location_address ??
      details?.street_address ??
      details?.service_location ??
      details?.home_address;

    const zip = this.pickDetail(details, ['zip', 'zipcode', 'zip_code', 'postal_code']);
    const city = this.pickDetail(details, ['city', 'town']);
    const state = this.pickDetail(details, ['state', 'province']);

    if (addressValue && typeof addressValue === 'object') {
      const obj = addressValue as { street?: string; city?: string; state?: string; zip?: string };
      const merged = {
        street: obj.street,
        city: obj.city ?? city,
        state: obj.state ?? state,
        zip: obj.zip ?? zip,
      };
      return Object.values(merged).some((v) => typeof v === 'string' && v.trim()) ? merged : undefined;
    }

    if (typeof addressValue === 'string' && addressValue.trim()) {
      const parts = addressValue.split(',').map((p) => p.trim()).filter(Boolean);
      const parsed: { street?: string; city?: string; state?: string; zip?: string } = {};
      if (parts[0]) parsed.street = parts[0];
      if (parts[1]) parsed.city = parts[1];
      if (parts[2]) {
        const stateZip = parts[2].split(/\s+/).filter(Boolean);
        if (stateZip[0]) parsed.state = stateZip[0];
        if (stateZip.length > 1) parsed.zip = stateZip.slice(1).join(' ');
      }
      if (city && !parsed.city) parsed.city = city;
      if (state && !parsed.state) parsed.state = state;
      if (zip && !parsed.zip) parsed.zip = zip;
      return Object.values(parsed).some((v) => typeof v === 'string' && v.trim()) ? parsed : undefined;
    }

    if (zip || city || state) {
      return {
        ...(city ? { city } : {}),
        ...(state ? { state } : {}),
        ...(zip ? { zip } : {}),
      };
    }

    return undefined;
  }

  private buildNotesFromDetails(details: Record<string, any>): string | undefined {
    if (!details || typeof details !== 'object') return undefined;
    const ignored = new Set(['name', 'full_name', 'zip', 'zipcode', 'preferred_time', 'email', 'phone', 'phone_number']);
    const lines: string[] = [];
    for (const [key, value] of Object.entries(details)) {
      const normalized = String(key || '').toLowerCase();
      if (!key || ignored.has(normalized)) continue;
      if (value === undefined || value === null || String(value).trim() === '') continue;
      if (normalized === 'address') {
        if (typeof value === 'object') {
          const addrObj = value as { street?: string; city?: string; state?: string; zip?: string };
          const addr = [addrObj.street, addrObj.city, addrObj.state, addrObj.zip].filter(Boolean).join(', ');
          if (addr) lines.push(`Address: ${addr}`);
        } else if (typeof value === 'string') {
          lines.push(`Address: ${value.trim()}`);
        }
        continue;
      }
      lines.push(`${String(key).replace(/[_-]+/g, ' ').trim()}: ${String(value).trim()}`);
    }
    return lines.length ? lines.join('\n') : undefined;
  }

  private coerceToUtcIso(input: string, timeZone: string, referenceDate?: Date): string {
    const raw = String(input || '').trim();
    if (!raw) throw new BadRequestException('start_time/end_time is required');

    const msIso = Date.parse(raw);
    const looksTzStamped = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
    if (Number.isFinite(msIso) && looksTzStamped) {
      return new Date(msIso).toISOString();
    }

    const ref = referenceDate ?? new Date();
    const parsedRange = chrono.parse(raw, ref);
    const parsed = this.selectBestParsedResult(parsedRange);
    const start: any = parsed?.start;
    if (!start) {
      throw new BadRequestException(`Unrecognized date/time: ${raw}`);
    }

    let year = Number(start.get?.('year'));
    let month = Number(start.get?.('month'));
    let day = Number(start.get?.('day'));
    if (!year || !month || !day) {
      const fallback = start.date?.() ?? chrono.parseDate(raw, ref);
      if (!fallback) {
        throw new BadRequestException(`Unrecognized date/time: ${raw}`);
      }
      year = fallback.getFullYear();
      month = fallback.getMonth() + 1;
      day = fallback.getDate();
    }

    let hour = start.isCertain?.('hour') ? Number(start.get?.('hour')) : 9;
    let minute = start.isCertain?.('minute') ? Number(start.get?.('minute')) : 0;
    if (!Number.isFinite(hour)) hour = 9;
    if (!Number.isFinite(minute)) minute = 0;

    if (raw.toLowerCase().includes('next week')) {
      const parsedDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
      const bumped = this.bumpNextWeekIfNeeded(raw, parsedDate, ref);
      year = bumped.getUTCFullYear();
      month = bumped.getUTCMonth() + 1;
      day = bumped.getUTCDate();
    }

    const utcMs = zonedTimeToUtcMs({ year, month, day, hour, minute }, timeZone);
    return new Date(utcMs).toISOString();
  }

  private formatSlotForCaller(slotIso: string, timeZone: string): string {
    const date = new Date(slotIso);
    if (!Number.isFinite(date.getTime())) return slotIso;
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(date);
    } catch {
      return slotIso;
    }
  }

  private formatSlotTimeOnly(slotIso: string, timeZone: string): string {
    const date = new Date(slotIso);
    if (!Number.isFinite(date.getTime())) return slotIso;
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(date);
    } catch {
      return slotIso;
    }
  }

  private normalizeTimeZone(input: string | undefined, fallback: string): string {
    const candidate = String(input || '').trim();
    const safeFallback = String(fallback || 'UTC').trim() || 'UTC';
    if (!candidate) return safeFallback;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
      return candidate;
    } catch {
      return safeFallback;
    }
  }

  private isGenericSummary(text: string | undefined): boolean {
    const t = (text || '').trim().toLowerCase();
    if (!t) return true;
    const generic = new Set([
      'call ended.',
      'call ended',
      'caller confirmed details and ended the call.',
      'caller confirmed details and ended the call',
    ]);
    return generic.has(t);
  }

  async resolveTenant(toNumberRaw: string) {
    const to_number = asE164(toNumberRaw);
    if (!to_number) throw new BadRequestException('to_number is required');

    const mappedCompanyId = await this.companyNumbers.resolveCompanyIdByDid(to_number);
    const company =
      (mappedCompanyId && (await this.companies.findById(mappedCompanyId))) ||
      (await this.companies.findByConnectPhoneNumber(to_number)) ||
      (await this.companies.findByPhone(to_number));

    if (!company) {
      throw new NotFoundException('No tenant found for this number');
    }

    let effectiveCompany = company;
    try {
      await this.usageGate.enforceUsagePolicy(company.company_id);
      const refreshed = await this.companies.findById(company.company_id);
      if (refreshed) effectiveCompany = refreshed;
    } catch (err) {
      console.warn('[RealtimeToolsService] Usage gate enforcement failed during tenant resolve:', err);
    }

    const accountBlocked =
      effectiveCompany.status === CompanyStatus.INACTIVE ||
      effectiveCompany.status === CompanyStatus.SUSPENDED;
    const aiCallsEnabled = effectiveCompany.calls_enabled !== (false as any) && !accountBlocked;

    const config = (await this.agentConfig.getConfig(effectiveCompany.company_id)) ?? undefined;

    let service_template_id =
      (effectiveCompany as any).service_template_id || resolveServiceTemplateId(effectiveCompany.service_type);
    if (!service_template_id) {
      service_template_id = 'tmpl_general_v1';
    }
    let service_template: any = null;
    try {
      service_template = await this.dynamodb.get('service_templates', { template_id: service_template_id });
    } catch {
      service_template = null;
    }
    if (!service_template && service_template_id !== 'tmpl_general_v1') {
      try {
        service_template_id = 'tmpl_general_v1';
        service_template = await this.dynamodb.get('service_templates', { template_id: service_template_id });
      } catch {
        service_template = null;
      }
    }
    if (!(effectiveCompany as any).service_template_id && service_template_id) {
      this.dynamodb
        .update('companies', { company_id: effectiveCompany.company_id }, { service_template_id })
        .catch(() => null);
    }

    const activeBookingServices = this.resolveActiveBookingServices(effectiveCompany);
    const serviceSelectionGuide = this.buildServiceSelectionGuide(effectiveCompany, activeBookingServices);
    const serviceTemplateWithGuide = service_template
      ? {
          ...service_template,
          base_system_prompt: `${String(service_template.base_system_prompt || '').trim()}

Service selection and billing rules:
- ${serviceSelectionGuide.summary}
- Ask this when needed: "${serviceSelectionGuide.default_question}"
- Do not call create_booking until one service/plan choice is confirmed and included in details.
- Save the selected service in details using keys selected_service_id, selected_service_name, and selected_billing_type whenever available.`.trim(),
        }
      : undefined;

    return {
      company_id: effectiveCompany.company_id,
      company_name: effectiveCompany.company_name,
      phone_number: effectiveCompany.phone_number || undefined,
      timezone: this.resolveCompanyTimeZone(effectiveCompany),
      service_type: effectiveCompany.service_type,
      service_template_id,
      service_template: serviceTemplateWithGuide,
      subscription_status: (effectiveCompany as any).subscription_status || 'active',
      calls_enabled: aiCallsEnabled,
      account_status: effectiveCompany.status,
      business_hours: effectiveCompany.business_hours,
      service_area_zipcodes: (effectiveCompany as any).service_area_zipcodes || [],
      booking_services: activeBookingServices.map((service) => ({
        service_id: service.service_id,
        name: service.name,
        description: service.description,
        amount_cents: service.amount_cents,
        currency: service.currency || 'usd',
        billing_type: service.billing_type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'ONE_TIME',
        billing_interval: service.billing_interval || 'month',
        billing_interval_count: service.billing_interval_count || 1,
      })),
      service_selection_guide: serviceSelectionGuide,
      pricing_profile: (effectiveCompany as any).pricing_profile || undefined,
      transfer_enabled: (effectiveCompany as any).transfer_enabled === true,
      transfer_number: (effectiveCompany as any).transfer_number || undefined,
      call_handling_mode: (effectiveCompany as any).call_handling_mode || CallHandlingMode.ALWAYS,
      agent_config: config ? {
        language: (config as any).language || 'en',
        realtime_voice: (config as any).realtime_voice || (config as any).voice || 'marin',
        realtime_model: (config as any).realtime_model || (config as any).model || 'gpt-realtime',
        // Keep legacy keys for older bridge clients.
        voice: (config as any).realtime_voice || (config as any).voice || 'marin',
        model: (config as any).realtime_model || (config as any).model || 'gpt-realtime',
        extra_instructions: (config as any).custom_greeting || ''
      } : undefined
    };
  }

  async startCall(dto: { company_id: string; call_id: string; from_number: string; to_number: string }) {
    const company_id = dto.company_id;
    if (!company_id) throw new BadRequestException('company_id is required');

    const call_id = dto.call_id;
    if (!call_id) throw new BadRequestException('call_id is required');

    const from_number = asE164(dto.from_number);
    const to_number = asE164(dto.to_number);
    if (!from_number || !to_number) {
      throw new BadRequestException('from_number and to_number are required');
    }

    const existing = await this.dynamodb.get('calls', { company_id, call_id });
    const now = Date.now();
    if (existing) {
      await this.dynamodb.update('calls', { company_id, call_id }, {
        from_number,
        to_number,
        status: CallStatus.IN_PROGRESS,
        updated_at: now,
      });
      return { ok: true, call_id };
    }

    const call: Call = {
      company_id,
      call_id,
      direction: CallDirection.INBOUND,
      from_number,
      to_number,
      status: CallStatus.IN_PROGRESS,
      ai_handled: true,
      escalated: false,
      lead_captured: false,
      started_at: now,
      created_at: now,
    };

    await this.dynamodb.put('calls', call);
    return { ok: true, call_id };
  }

  async createLead(dto: CreateLeadDto) {
    const company_id = dto.company_id;
    if (!company_id) throw new BadRequestException('company_id is required');

    const from_number = asE164(dto.from_number);
    const to_number = asE164(dto.to_number);
    if (!from_number || !to_number) {
      throw new BadRequestException('from_number and to_number are required');
    }

    const call_id = dto.call_id ?? uuidv4();
    const now = Date.now();

    // Prefer phone-lookup index when available, but fall back to a filtered scan to avoid runtime index dependency.
    let existing: { items: any[] } = { items: [] };
    try {
      existing = await this.dynamodb.queryByCompany(
        'contacts',
        company_id,
        {
          keyCondition: '#phone_number = :phone_number',
          expressionAttributeNames: { '#phone_number': 'phone_number' },
          expressionAttributeValues: { ':phone_number': from_number },
        },
        { indexName: 'phone-lookup', limit: 1 }
      );
    } catch {
      const scan = await this.dynamodb.scan('contacts', {
        filterExpression: '#company_id = :company_id AND #phone_number = :phone_number',
        expressionAttributeNames: { '#company_id': 'company_id', '#phone_number': 'phone_number' },
        expressionAttributeValues: { ':company_id': company_id, ':phone_number': from_number },
        limit: 1,
      });
      existing = { items: scan.items || [] };
    }

    const collected = dto.collected_info ?? {};
    const fullName =
      typeof collected.full_name === 'string'
        ? collected.full_name
        : typeof collected.name === 'string'
          ? collected.name
          : undefined;
    const [firstFromFull, ...restFromFull] = typeof fullName === 'string' ? fullName.trim().split(/\s+/) : [];
    const derivedLast = restFromFull.length ? restFromFull.join(' ') : undefined;
    const first_name = typeof collected.first_name === 'string' ? collected.first_name : firstFromFull || undefined;
    const last_name = typeof collected.last_name === 'string' ? collected.last_name : derivedLast;
    const email = typeof collected.email === 'string' ? collected.email : undefined;
    const zipcode = typeof collected.zip === 'string' ? collected.zip : undefined;
    const address = typeof collected.address === 'string' ? collected.address : undefined;
    const legacyName = [first_name, last_name].filter(Boolean).join(' ').trim() || fullName?.trim();

    // Only update existing contacts — do NOT create new contacts from calls alone.
    // Contacts are created when a customer books an appointment.
    let contact_id: string | undefined;
    if (existing.items.length > 0) {
      const contact = existing.items[0] as Contact;
      contact_id = contact.contact_id;
      const contactUpdates = {
        ...(legacyName && { name: legacyName }),
        ...(from_number && { phone: from_number }),
        ...(first_name && { first_name }),
        ...(last_name && { last_name }),
        ...(email && { email }),
        ...(zipcode && { zipcode }),
        ...(address && { address }),
        updated_at: now,
        last_contact_at: now,
      };
      await this.dynamodb.update('contacts', { company_id, contact_id }, contactUpdates);
      const updatedContact = { ...contact, ...contactUpdates };
      void this.webhooks.emitEvent(company_id, 'contact.updated', { contact: updatedContact });
    }

    const call: Call = {
      company_id,
      call_id,
      ...(contact_id ? { contact_id } : {}),
      direction: CallDirection.INBOUND,
      from_number,
      to_number,
      status: CallStatus.IN_PROGRESS,
      ai_handled: true,
      escalated: false,
      lead_captured: true,
      started_at: now,
      created_at: now,
    };

    await this.dynamodb.put('calls', call);

    return { call_id, contact_id };
  }

  async saveCall(dto: SaveCallDto) {
    const company_id = dto.company_id;
    const call_id = dto.call_id;
    if (!company_id || !call_id) {
      throw new BadRequestException('company_id and call_id are required');
    }

    let existing: any = await this.dynamodb.get('calls', { company_id, call_id });
    if (!existing) {
      // Be resilient: if the call record didn't get created for some reason, create a minimal record instead of failing.
      const now = Date.now();
      const call: Call = {
        company_id,
        call_id,
        direction: CallDirection.INBOUND,
        // Unknown fallback; create_lead is responsible for persisting real from/to numbers.
        from_number: '',
        to_number: '',
        status: CallStatus.IN_PROGRESS,
        ai_handled: true,
        escalated: false,
        started_at: now,
        created_at: now,
      };
      await this.dynamodb.put('calls', call);
      existing = call;
    }

    const wasCompleted = existing?.status === CallStatus.COMPLETED;

    const transcriptText = dto.transcript && dto.transcript.trim() ? dto.transcript.trim() : undefined;

    const skipContactUpdate = dto.skip_contact_update === true;

    const incomingCollected =
      dto.collected_info && typeof dto.collected_info === 'object'
        ? (dto.collected_info as Record<string, any>)
        : undefined;
    const incomingHasAny =
      !!incomingCollected &&
      Object.keys(incomingCollected).some(
        (k) =>
          incomingCollected[k] !== undefined &&
          incomingCollected[k] !== null &&
          `${incomingCollected[k]}`.trim() !== ''
      );

    const extractedCollected =
      transcriptText && !incomingHasAny && !skipContactUpdate ? this.extractCollectedInfoFromTranscript(transcriptText) : {};
    const extractedHasAny = Object.keys(extractedCollected).some(
      (k) => extractedCollected[k] !== undefined && extractedCollected[k] !== null && `${extractedCollected[k]}`.trim() !== ''
    );

    let transcript_url: string | undefined;
    if (transcriptText) {
      try {
        transcript_url = await this.s3.uploadTranscript(company_id, call_id, {
          text: transcriptText,
          collected_info: incomingHasAny ? incomingCollected : extractedHasAny ? extractedCollected : dto.collected_info,
          saved_at: Date.now(),
        });
      } catch (err) {
        console.error('[RealtimeToolsService] Failed to upload transcript (non-fatal):', err);
      }
    }

    const now = Date.now();
    const startedAt = typeof existing?.started_at === 'number' ? existing.started_at : undefined;
    const derivedDuration =
      typeof dto.duration_seconds === 'number'
        ? dto.duration_seconds
        : startedAt
          ? Math.max(1, Math.ceil((now - startedAt) / 1000))
          : undefined;

    const existingSummary = typeof existing?.summary === 'string' ? existing.summary.trim() : '';
    const dtoSummary = typeof dto.summary === 'string' ? dto.summary.trim() : '';
    const collectedForSummary: Record<string, any> = {
      ...(typeof existing?.collected_info === 'object' && existing.collected_info ? existing.collected_info : {}),
      ...(extractedHasAny ? extractedCollected : {}),
      ...(incomingHasAny ? incomingCollected : {}),
    };
    const fallbackSummary = this.buildSummaryFallback(collectedForSummary);

    let summary: string | undefined;
    if (dtoSummary && !this.isGenericSummary(dtoSummary)) {
      summary = dtoSummary;
    } else if (!existingSummary || this.isGenericSummary(existingSummary)) {
      summary = fallbackSummary || (dtoSummary || undefined);
    }

    const updates: Partial<Call> & Record<string, any> = {
      ...(summary && { summary }),
      ...(transcript_url && { transcript_url }),
      ...(transcriptText && {
        transcript:
          Buffer.byteLength(transcriptText, 'utf8') <= 200 * 1024
            ? transcriptText
            : `${transcriptText.slice(0, 120000)}\n\n[Transcript truncated — see transcript_url for the full JSON.]`,
      }),
      ...(typeof derivedDuration === 'number' && { duration_seconds: derivedDuration }),
      status: CallStatus.COMPLETED,
      ended_at: now,
      updated_at: now,
    };

    if (incomingHasAny || extractedHasAny) {
      updates.collected_info = {
        ...(typeof existing?.collected_info === 'object' && existing.collected_info ? existing.collected_info : {}),
        ...(extractedHasAny ? extractedCollected : {}),
        ...(incomingHasAny ? incomingCollected : {}),
      };

      // Normalize phone if present (always store E.164 if we can).
      const phoneValue = (updates.collected_info as any)?.phone;
      if (typeof phoneValue === 'string' && phoneValue.trim()) {
        const normalized = asE164(phoneValue);
        if (normalized) (updates.collected_info as any).phone = normalized;
      }
    }

    // Ensure contact is de-duplicated by phone number and enriched by collected fields.
    if (!skipContactUpdate) {
      try {
        const collected = (updates.collected_info as any) ?? dto.collected_info ?? {};
        const name = typeof collected.name === 'string' ? collected.name.trim() : '';
        const first =
          (typeof collected.first_name === 'string' ? collected.first_name.trim() : '') ||
          (name ? name.split(/\s+/)[0]?.trim() : '');
        const last =
          (typeof collected.last_name === 'string' ? collected.last_name.trim() : '') ||
          (name ? name.split(/\s+/).slice(1).join(' ')?.trim() : '');
        const email = typeof collected.email === 'string' ? collected.email.trim() : '';
        const address = typeof collected.address === 'string' ? collected.address.trim() : '';
        const zip = typeof collected.zip === 'string' ? collected.zip.trim() : '';

        const fromNumber = asE164(
          (typeof existing?.from_number === 'string' && existing.from_number) ||
          (typeof collected.phone === 'string' && collected.phone) ||
          ''
        );

        let contact_id: string | undefined = existing?.contact_id;
        if (!contact_id && existing?.appointment_id) {
          try {
            const appt = await this.appointmentsService.getAppointment(company_id, existing.appointment_id);
            if (appt?.contact_id) {
              contact_id = appt.contact_id;
              updates.contact_id = contact_id as any;
            }
          } catch {
            // non-fatal
          }
        }
        if (!contact_id && fromNumber) {
          // Best-effort find by phone; avoid requiring the phone-lookup index.
          const scan = await this.dynamodb.scan('contacts', {
            filterExpression: '#company_id = :company_id AND #phone_number = :phone_number',
            expressionAttributeNames: { '#company_id': 'company_id', '#phone_number': 'phone_number' },
            expressionAttributeValues: { ':company_id': company_id, ':phone_number': fromNumber },
            limit: 1,
          });
          contact_id = scan.items?.[0]?.contact_id;
        }

        // Do NOT create a new contact from a call alone.
        // Contacts are only created when a customer books an appointment.

        if (contact_id) {
          updates.contact_id = contact_id as any;
          const contactUpdates: Record<string, any> = {
            ...(first ? { first_name: first } : {}),
            ...(last ? { last_name: last } : {}),
            ...(email ? { email } : {}),
            ...(address ? { address } : {}),
            ...(zip ? { zipcode: zip } : {}),
            last_contact_at: now,
            updated_at: now,
          };
          if (Object.keys(contactUpdates).length > 2) {
            await this.dynamodb.update('contacts', { company_id, contact_id }, contactUpdates);
          } else {
            await this.dynamodb.update('contacts', { company_id, contact_id }, { last_contact_at: now, updated_at: now });
          }

          const displayName = [first, last].filter(Boolean).join(' ').trim();
          if (displayName) updates.caller_name = displayName;
        }
      } catch (err) {
        console.error('[RealtimeToolsService] Failed to update contact from collected_info (non-fatal):', err);
      }
    }

    // Track call usage for billing (idempotent, supports multiple saves with increasing accuracy)
    if (typeof derivedDuration === 'number' && derivedDuration > 0) {
      const seconds = Math.max(1, Math.floor(derivedDuration));
      const recordedSeconds =
        typeof existing?.usage_seconds_recorded === 'number'
          ? existing.usage_seconds_recorded
          : typeof existing?.usage_minutes_recorded === 'number'
            ? Math.round(existing.usage_minutes_recorded * 60)
            : 0;
      const deltaSeconds = Math.max(0, seconds - recordedSeconds);
      const callsCounted = Boolean(existing?.usage_call_counted);

      if (deltaSeconds > 0) {
        try {
          await this.usageService.incrementCallMinutes(company_id, Number((deltaSeconds / 60).toFixed(2)), callsCounted ? 0 : 1);
          await this.usageGate.enforceUsagePolicy(company_id);
          updates.usage_seconds_recorded = seconds;
          updates.usage_call_counted = true;
        } catch (err) {
          console.error('[RealtimeToolsService] Failed to track call usage (non-fatal):', err);
        }
      } else if (!callsCounted) {
        // Ensure we count the call even if minutes were already recorded somehow.
        try {
          await this.usageService.incrementCallMinutes(company_id, 0, 1);
          await this.usageGate.enforceUsagePolicy(company_id);
          updates.usage_call_counted = true;
        } catch (err) {
          console.error('[RealtimeToolsService] Failed to track call count (non-fatal):', err);
        }
      }
    }

    await this.dynamodb.update('calls', { company_id, call_id }, updates);

    if (!wasCompleted) {
      const callPayload = {
        call_id,
        company_id,
        contact_id: updates.contact_id ?? existing?.contact_id,
        from_number: existing?.from_number,
        to_number: existing?.to_number,
        status: CallStatus.COMPLETED,
        summary: updates.summary ?? existing?.summary,
        duration_seconds: updates.duration_seconds ?? existing?.duration_seconds,
        started_at: existing?.started_at,
        ended_at: updates.ended_at ?? existing?.ended_at ?? now,
        appointment_id: updates.appointment_id ?? existing?.appointment_id,
        lead_captured: existing?.lead_captured,
        ai_handled: existing?.ai_handled,
        transcript_url: updates.transcript_url ?? existing?.transcript_url,
        recording_url: existing?.recording_url,
        collected_info: updates.collected_info ?? existing?.collected_info,
      };
      void this.webhooks.emitEvent(company_id, 'call.completed', { call: callPayload });

      const hasAppointment = Boolean(updates.appointment_id ?? existing?.appointment_id);
      if (!hasAppointment) {
        const bookingLink = this.buildBookingLink(company_id, call_id);
        void this.followUps
          .scheduleAfterCall({
            company_id,
            contact_id: (updates.contact_id ?? existing?.contact_id) as string | undefined,
            contact_phone: existing?.from_number,
            contact_name: (updates.caller_name ?? existing?.caller_name) as string | undefined,
            booking_link: bookingLink,
          })
          .catch((err) => {
            console.warn('[RealtimeToolsService] Failed to schedule follow-up sequence:', err);
          });
      }
    }

    return { ok: true, call_id, transcript_url };
  }

  async saveRecording(dto: SaveRecordingDto) {
    const company_id = dto.company_id;
    const call_id = dto.call_id;
    const recording_sid = dto.recording_sid;
    if (!company_id || !call_id || !recording_sid) {
      throw new BadRequestException('company_id, call_id, and recording_sid are required');
    }

    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    if (!accountSid) throw new Error('Missing TWILIO_ACCOUNT_SID');

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recording_sid}.mp3`;
    const res = await fetch(url, { method: 'GET', headers: { Authorization: this.twilioAuthHeader() } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to download Twilio recording (${res.status}): ${text}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    await this.s3.uploadRecording(company_id, call_id, buf, 'audio/mpeg');

    const updates: Record<string, any> = { updated_at: Date.now() };
    if (typeof dto.duration_seconds === 'number' && dto.duration_seconds > 0) {
      updates.duration_seconds = dto.duration_seconds;
    }

    // Don't fail if call record is missing; create minimal if needed.
    const existing = await this.dynamodb.get('calls', { company_id, call_id });
    if (!existing) {
      const now = Date.now();
      const call: Call = {
        company_id,
        call_id,
        direction: CallDirection.INBOUND,
        from_number: '',
        to_number: '',
        status: CallStatus.COMPLETED,
        ai_handled: true,
        escalated: false,
        started_at: now,
        created_at: now,
        ended_at: now,
        ...(typeof dto.duration_seconds === 'number' ? { duration_seconds: dto.duration_seconds } : {}),
      } as any;
      await this.dynamodb.put('calls', call as any);
      return { ok: true, call_id, recording_saved: true };
    }

    await this.dynamodb.update('calls', { company_id, call_id }, updates);
    return { ok: true, call_id, recording_saved: true };
  }

  async knowledgeSearch(dto: KnowledgeSearchDto) {
    const company_id = dto.company_id;
    if (!company_id) throw new BadRequestException('company_id is required');
    const query = (dto.query || '').trim();
    if (!query) throw new BadRequestException('query is required');

    const results = await this.knowledge.searchKnowledge(company_id, query, dto.top_k ?? 5);
    // Return only what the model needs (keep payload small for latency/cost).
    return (results || []).map((r: any) => ({
      knowledge_id: r?.item?.knowledge_id,
      title: r?.item?.title,
      type: r?.item?.type,
      text: (r?.text || '').slice(0, 1000),
      similarity: r?.similarity,
    }));
  }

  async getAvailability(dto: GetAvailabilityDto) {
    const startedAt = Date.now();
    const company_id = dto.company_id;
    if (!company_id) throw new BadRequestException('company_id is required');

    const company = await this.companies.findById(company_id);
    if (!company) throw new NotFoundException('Company not found');

    const timeZone = this.normalizeTimeZone(dto.timezone, this.resolveCompanyTimeZone(company));
    const referenceDate = new Date(new Date().toLocaleString('en-US', { timeZone }));
    const startRaw = String(dto.start_time || '').trim();
    const endRaw = String(dto.end_time || '').trim();
    let dayAnchor: Date | null = null;
    let dayOnly = false;
    const parsedRange = chrono.parse(startRaw, referenceDate);
    const parsed = this.selectBestParsedResult(parsedRange);
    const hasTime = !!(parsed?.start?.isCertain('hour') || parsed?.start?.isCertain('minute'));
    const hasExplicitDate = !!(
      parsed?.start?.isCertain('day') ||
      parsed?.start?.isCertain('weekday') ||
      parsed?.start?.isCertain('month') ||
      parsed?.start?.isCertain('year')
    );
    const requestedIso = this.coerceToUtcIso(startRaw, timeZone, referenceDate);
    let startIso = requestedIso;
    if (parsed && hasExplicitDate) {
      const dt = parsed.start?.date?.() ?? chrono.parseDate(startRaw, referenceDate);
      if (dt) {
        dayAnchor = this.bumpNextWeekIfNeeded(startRaw, dt, referenceDate);
      }
    }
    const weekdayOnly =
      !!(
        parsed?.start?.isCertain('weekday') &&
        !parsed?.start?.isCertain('day') &&
        !parsed?.start?.isCertain('month') &&
        !parsed?.start?.isCertain('year')
      );
    if (weekdayOnly && dayAnchor) {
      const dayKey = (d: Date) =>
        new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
      if (dayKey(dayAnchor) < dayKey(referenceDate)) {
        dayAnchor = new Date(dayAnchor.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
    }
    if (parsed && hasExplicitDate && !hasTime && dayAnchor) {
      dayOnly = true;
    }
    let endIso = '';
    if (endRaw) {
      try {
        endIso = this.coerceToUtcIso(endRaw, timeZone, referenceDate);
      } catch {
        endIso = '';
      }
    }
    const usesDayWindow = !!(dayAnchor && (dayOnly || (hasTime && !endRaw)));
    if (usesDayWindow && dayAnchor) {
      const startUtcMs = zonedTimeToUtcMs(
        {
          year: dayAnchor.getFullYear(),
          month: dayAnchor.getMonth() + 1,
          day: dayAnchor.getDate(),
          hour: 8,
          minute: 0,
        },
        timeZone
      );
      const endUtcMs = zonedTimeToUtcMs(
        {
          year: dayAnchor.getFullYear(),
          month: dayAnchor.getMonth() + 1,
          day: dayAnchor.getDate(),
          hour: 18,
          minute: 0,
        },
        timeZone
      );
      startIso = new Date(startUtcMs).toISOString();
      endIso = new Date(endUtcMs).toISOString();
    }

    const durationMinutes = this.scheduling.getDurationMinutes(company);
    const startMs = Date.parse(startIso);
    let endMs = endIso ? Date.parse(endIso) : NaN;
    const minWindowMs = durationMinutes * 60_000;
    const endTooShort = Number.isFinite(endMs) && endMs - startMs < minWindowMs;
    if (!Number.isFinite(endMs) || endMs <= startMs || endTooShort) {
      const extendMinutes = hasTime ? Math.max(120, durationMinutes) : Math.max(10 * 60, durationMinutes);
      endIso = new Date(startMs + extendMinutes * 60_000).toISOString();
      endMs = Date.parse(endIso);
    }
    const requestedLocal = hasTime ? this.getRequestedLocalParts(parsed, dayAnchor, timeZone) : null;
    const closedCheckDate = requestedLocal
      ? new Date(Date.UTC(requestedLocal.year, requestedLocal.month - 1, requestedLocal.day, 12, 0, 0))
      : dayAnchor ?? new Date(startMs);
    const closedInfo = (dayOnly || hasTime) ? this.getClosedInfo(company, closedCheckDate, timeZone) : null;
    const closedDay = closedInfo?.closed === true;

    console.log('[getAvailability]', {
      company_id,
      timeZone,
      startRaw,
      requestedIso,
      startIso,
      endIso,
      hasTime,
      hasExplicitDate,
    });

    const slots = await this.scheduling.getAvailability(company, startIso, endIso);
    const readableSlots = slots.map((s) => this.formatSlotForCaller(s.start_time, timeZone));
    const timeOnlySlots = slots.map((s) => this.formatSlotTimeOnly(s.start_time, timeZone));
    let suggestedSlots: string[] = [];
    let suggestedTimeOnly: string[] = [];
    let requested_time_available: boolean | undefined;
    let requested_slot: string | undefined;
    if (hasTime && requestedLocal) {
      const match = slots.find((s) => this.slotMatchesRequestedLocal(s.start_time, timeZone, requestedLocal));
      if (match) {
        requested_time_available = true;
        requested_slot = match.start_time;
      } else {
        requested_time_available = false;
      }
    }
    if (hasTime && requested_time_available === undefined) {
      const requestedMs = Date.parse(requestedIso);
      if (Number.isFinite(requestedMs)) {
        const match = slots.find((s) => {
          const slotMs = Date.parse(s.start_time);
          return Number.isFinite(slotMs) && Math.abs(slotMs - requestedMs) <= 5 * 60_000;
        });
        if (match) {
          requested_time_available = true;
          requested_slot = match.start_time;
        } else {
          requested_time_available = false;
        }
      } else {
        requested_time_available = false;
      }
      if (!requested_slot && slots.length) {
        try {
          const requestedParts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour: 'numeric',
            minute: '2-digit',
            hour12: false,
          }).formatToParts(new Date(requestedIso));
          const reqHour = Number(requestedParts.find((p) => p.type === 'hour')?.value);
          const reqMinute = Number(requestedParts.find((p) => p.type === 'minute')?.value);
          if (Number.isFinite(reqHour) && Number.isFinite(reqMinute)) {
            const match = slots.find((s) => {
              const slotParts = new Intl.DateTimeFormat('en-US', {
                timeZone,
                hour: 'numeric',
                minute: '2-digit',
                hour12: false,
              }).formatToParts(new Date(s.start_time));
              const slotHour = Number(slotParts.find((p) => p.type === 'hour')?.value);
              const slotMinute = Number(slotParts.find((p) => p.type === 'minute')?.value);
              return Number.isFinite(slotHour) && Number.isFinite(slotMinute) && slotHour === reqHour && slotMinute === reqMinute;
            });
            if (match) {
              requested_time_available = true;
              requested_slot = match.start_time;
            }
          }
        } catch {
          // ignore formatting failures
        }
      }
    }
    if (hasTime && slots.length) {
      const requestedMs = Date.parse(requestedIso);
      if (Number.isFinite(requestedMs)) {
        suggestedSlots = slots
          .slice()
          .sort(
            (a, b) =>
              Math.abs(Date.parse(a.start_time) - requestedMs) -
              Math.abs(Date.parse(b.start_time) - requestedMs)
          )
          .slice(0, 3)
          .map((s) => s.start_time);
        suggestedTimeOnly = suggestedSlots.map((s) => this.formatSlotTimeOnly(s, timeZone));
      }
    }

    let spokenAvailability = '';
    if (closedDay && !slots.length) {
      const label = closedInfo?.dayLabel || 'that day';
      spokenAvailability = `We are closed on ${label}. What day works instead?`;
    } else if (hasTime) {
      if (requested_time_available === true) {
        spokenAvailability = `That time is available. Let me book it for you.`;
      } else if (requested_time_available === false) {
        if (slots.length) {
          const sample = (suggestedTimeOnly.length ? suggestedTimeOnly : timeOnlySlots).slice(0, 3);
          spokenAvailability = `That time isn't available. I have ${sample.join(', ')}. Which time works best?`;
        } else {
          spokenAvailability = `That time isn't available. What day or time works instead?`;
        }
      }
    } else if (slots.length) {
      const sample = timeOnlySlots.slice(0, 3);
      spokenAvailability = `I have ${sample.join(', ')}. Which time works best?`;
    }

    console.log('[getAvailability:done]', {
      company_id,
      duration_ms: Date.now() - startedAt,
      slot_count: slots.length,
      requested_time_available,
      closed_day: closedDay,
    });

    return {
      ok: true,
      company_id,
      timezone: timeZone,
      slots: slots.map((s) => s.start_time),
      readable_slots: readableSlots,
      suggested_slots: suggestedSlots,
      suggested_time_only: suggestedTimeOnly,
      spoken_availability: spokenAvailability,
      instruction:
        'Tell the caller the spoken_availability. If suggested_time_only is present, offer those times. When they pick a slot, use the matching ISO string from the slots array as start_time in create_booking.',
      ...(closedInfo ? { closed_day: closedDay, closed_day_label: closedInfo.dayLabel } : {}),
      ...(typeof requested_time_available === 'boolean' ? { requested_time_available } : {}),
      ...(requested_slot ? { requested_slot } : {}),
    };
  }

  async createBooking(dto: CreateBookingDto) {
    const company_id = dto.company_id;
    if (!company_id) throw new BadRequestException('company_id is required');

    if (!dto.confirmed) {
      throw new BadRequestException('Booking not confirmed. Ask user to confirm first.');
    }

    const company = await this.companies.findById(company_id);
    if (!company) throw new NotFoundException('Company not found');

    const timeZone = this.normalizeTimeZone(dto.timezone, this.resolveCompanyTimeZone(company));
    const referenceDate = new Date(new Date().toLocaleString('en-US', { timeZone }));
    let details = dto.details && typeof dto.details === 'object' ? { ...(dto.details as Record<string, any>) } : {};
    const detailEmail =
      this.pickDetail(details, ['email', 'customer_email', 'contact_email']) || undefined;
    const customerEmail =
      (dto.customer_email && dto.customer_email.trim()) ||
      detailEmail ||
      `caller-${(dto.contact_id || dto.call_id || 'unknown').replace(/[^a-zA-Z0-9]/g, '')}@handycall.invalid`;

    const startIso = this.coerceToUtcIso(dto.start_time, timeZone, referenceDate);
    const durationMinutes = this.scheduling.getDurationMinutes(company);
    let endIso = dto.end_time
      ? this.coerceToUtcIso(dto.end_time, timeZone, referenceDate)
      : new Date(Date.parse(startIso) + durationMinutes * 60_000).toISOString();
    const startMs = Date.parse(startIso);
    let endMs = Date.parse(endIso);
    if (!Number.isFinite(endMs) || endMs <= startMs || endMs - startMs < durationMinutes * 60_000) {
      endIso = new Date(startMs + durationMinutes * 60_000).toISOString();
      endMs = Date.parse(endIso);
    }

    const slots = await this.scheduling.getAvailability(company, startIso, endIso, { ignoreCallId: dto.call_id });
    const requestedMs = Date.parse(startIso);
    const slot = slots.find((s) => {
      const slotMs = Date.parse(s.start_time);
      return Number.isFinite(slotMs) && Number.isFinite(requestedMs) && Math.abs(slotMs - requestedMs) <= 2 * 60_000;
    });
    if (!slot) {
      throw new BadRequestException('Requested time is no longer available');
    }

    // Use the canonical appointments service so the record is consistent and external calendars are synced.
    let contact_phone: string | undefined;
    let callRecord: any = null;
    if (dto.call_id) {
      try {
        callRecord = await this.dynamodb.get('calls', { company_id, call_id: dto.call_id });
        if (typeof callRecord?.from_number === 'string' && callRecord.from_number.trim()) {
          contact_phone = callRecord.from_number.trim();
        }
      } catch {
        // non-fatal
      }
    }
    const detailPhone =
      this.pickDetail(details, ['phone', 'phone_number', 'contact_phone']) || undefined;
    if (detailPhone) {
      contact_phone = detailPhone;
    }
    if (contact_phone) {
      contact_phone = asE164(contact_phone);
    }

    const customerName =
      (dto.customer_name && dto.customer_name.trim()) ||
      (dto.full_name && dto.full_name.trim()) ||
      this.pickDetail(details, ['full_name', 'name', 'customer_name', 'caller_name']);

    const selectedService = this.resolveServiceSelection(company, {
      call: callRecord,
      details,
      preferredServiceName: dto.service_type,
      preferredBillingType:
        this.pickDetail(details, ['selected_billing_type', 'billing_type', 'plan_type']) || undefined,
    });
    if (selectedService) {
      details = {
        ...details,
        selected_service_id: selectedService.service_id,
        selected_service_name: selectedService.name,
        selected_billing_type: selectedService.billing_type,
      };
    }

    const address = this.parseAddressFromDetails(details);
    const baseNotes = (dto.notes && dto.notes.trim()) || this.buildNotesFromDetails(details);
    const billingContext =
      selectedService?.billing_type === 'SUBSCRIPTION'
        ? 'Billing type: Subscription'
        : selectedService?.billing_type === 'ONE_TIME'
          ? 'Billing type: One-time'
          : '';
    const notes = [baseNotes, billingContext].filter(Boolean).join('\n') || undefined;
    const serviceType =
      (dto.service_type && dto.service_type.trim()) ||
      selectedService?.name ||
      this.pickDetail(details, ['selected_service_name', 'service_name', 'plan_name', 'service_type', 'service']) ||
      company.service_type ||
      'General';

    const appointment: any = await this.appointmentsService.createAppointment(company_id, {
      scheduled_start: new Date(slot.start_time).getTime(),
      scheduled_end: new Date(slot.end_time).getTime(),
      contact_name: customerName,
      contact_email: customerEmail,
      contact_phone,
      service_type: serviceType,
      notes,
      ...(address ? { address } : {}),
      created_by: 'AI',
    });

    const appointment_id = appointment?.appointment_id;

    if (dto.call_id) {
      await this.dynamodb.update(
        'calls',
        { company_id, call_id: dto.call_id },
        {
          appointment_created: true,
          appointment_id,
          ...(selectedService
            ? {
                selected_service_id: selectedService.service_id,
                selected_service_name: selectedService.name,
                selected_billing_type: selectedService.billing_type,
              }
            : {}),
          updated_at: Date.now(),
          ...(Object.keys(details).length ? { collected_info: details } : {}),
        }
      );
    }

    return {
      ok: true,
      appointment_id,
      start_time: slot.start_time,
      end_time: slot.end_time,
    };
  }

  async holdSlot(dto: { company_id: string; slot: string; timezone?: string; hold_minutes?: number; call_id?: string }) {
    const company_id = dto.company_id;
    if (!company_id) throw new BadRequestException('company_id is required');
    const company = await this.companies.findById(company_id);
    if (!company) throw new NotFoundException('Company not found');

    const timeZone = this.normalizeTimeZone(dto.timezone, this.resolveCompanyTimeZone(company));
    const referenceDate = new Date(new Date().toLocaleString('en-US', { timeZone }));
    const startIso = this.coerceToUtcIso(dto.slot, timeZone, referenceDate);
    const durationMinutes = this.scheduling.getDurationMinutes(company);
    const startMs = Date.parse(startIso);
    const endIso = new Date(startMs + durationMinutes * 60_000).toISOString();
    const endMs = Date.parse(endIso);

    const holdId = `hold#${company_id}#${startIso}`;
    const nowTtl = Math.floor(Date.now() / 1000);
    const existing = await this.dynamodb.get('realtime_cache', { contact_id: holdId });
    if (existing && typeof existing?.ttl === 'number' && existing.ttl > nowTtl) {
      if (existing?.call_id && dto.call_id && existing.call_id !== dto.call_id) {
        throw new BadRequestException('Requested time is no longer available');
      }
    }

    const availability = await this.scheduling.getAvailability(company, startIso, endIso, {
      ignoreCallId: dto.call_id,
    });
    const isAvailable = Array.isArray(availability) && availability.some((slot) => slot?.start_time === startIso);
    if (!isAvailable) {
      throw new BadRequestException('Requested time is no longer available');
    }

    const holdMinutes = Math.max(2, Math.min(15, Number(dto.hold_minutes || 5)));
    const ttl = Math.floor(Date.now() / 1000) + holdMinutes * 60;

    await this.dynamodb.put('realtime_cache', {
      contact_id: holdId,
      company_id,
      type: 'slot_hold',
      slot_start: startIso,
      slot_end: endIso,
      slot_start_ms: startMs,
      slot_end_ms: endMs,
      call_id: dto.call_id,
      ttl,
      created_at: Date.now(),
    });

    return { ok: true, hold_id: holdId, expires_at: ttl };
  }

  private resolveBookingFromEmail(company: any): { from: string; display: string } {
    const explicitFrom =
      this.config.get<string>('BOOKING_FROM_EMAIL') ||
      this.config.get<string>('NO_REPLY_EMAIL') ||
      this.config.get<string>('NO_CONTACT_EMAIL') ||
      '';
    const override =
      (typeof company?.booking_from_email === 'string' && company.booking_from_email) ||
      (typeof company?.email_from === 'string' && company.email_from);
    const domain =
      this.config.get<string>('BOOKING_EMAIL_DOMAIN') ||
      this.config.get<string>('SES_FROM_DOMAIN') ||
      'handycall.org';
    const rawName = String(company?.company_name || company?.company_id || 'company');
    const slug = rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    const local = `no-reply+${slug || company?.company_id || 'company'}`;
    const from = explicitFrom || override || `${local}@${domain}`;
    const display = rawName;
    return { from, display };
  }

  async sendBookingLink(dto: {
    company_id: string;
    call_id: string;
    email?: string;
    service_id?: string;
    selected_service_name?: string;
    selected_billing_type?: 'ONE_TIME' | 'SUBSCRIPTION';
  }) {
    const company_id = dto.company_id;
    const call_id = dto.call_id;
    if (!company_id || !call_id) {
      throw new BadRequestException('company_id and call_id are required');
    }

    const company = await this.companies.findById(company_id);
    if (!company) throw new NotFoundException('Company not found');

    const existingCall = await this.dynamodb.get('calls', { company_id, call_id });
    const email = typeof dto.email === 'string' ? dto.email.trim() : '';
    if (!email || !isValidEmail(email)) {
      throw new BadRequestException('A valid email is required');
    }

    const alreadyBooked = Boolean((existingCall as any)?.appointment_created);
    if (!alreadyBooked) {
      throw new BadRequestException('Booking link can only be sent after the appointment is booked.');
    }

    let appointment: any = null;
    const appointmentId = existingCall?.appointment_id;
    if (appointmentId) {
      try {
        appointment = await this.appointmentsService.getAppointment(company_id, appointmentId);
      } catch {
        appointment = null;
      }
    }
    const appointmentEndRaw =
      typeof appointment?.scheduled_end === 'number'
        ? appointment.scheduled_end
        : typeof appointment?.scheduled_end === 'string'
          ? Date.parse(appointment.scheduled_end)
          : undefined;
    const appointmentEnd = typeof appointmentEndRaw === 'number' && Number.isFinite(appointmentEndRaw)
      ? appointmentEndRaw
      : undefined;
    const selectedService = this.resolveServiceSelection(company, {
      call: existingCall,
      preferredServiceId: dto.service_id,
      preferredServiceName: dto.selected_service_name || appointment?.service_type,
      preferredBillingType: dto.selected_billing_type || (existingCall as any)?.selected_billing_type,
    });
    const bookingLink = this.buildBookingLink(company_id, call_id, appointmentEnd, selectedService);
    const message = `Thanks for booking with ${company.company_name}. Manage or update your appointment here: ${bookingLink}`;
    console.log('[send_booking_link] preparing', {
      company_id,
      call_id,
      email,
    });

    const region = this.config.get<string>('SES_REGION') || this.config.get<string>('AWS_REGION') || 'us-east-1';
    const fromMeta = this.resolveBookingFromEmail(company);
    const fromAddress = `${fromMeta.display} <${fromMeta.from}>`;
    const subject = `${company.company_name} booking details`;
    const html = renderHandycallEmail({
      title: `${company.company_name} booking details`,
      preheader: `Manage your ${company.company_name} appointment.`,
      greeting: 'Hi there,',
      body: `<p style="margin:0 0 16px;">Thanks for booking with <strong>${company.company_name}</strong>.</p>
             <p style="margin:0 0 16px;">Use the link below to view or manage your appointment.</p>`,
      cta: { label: 'Manage appointment', url: bookingLink },
      footer: `Need help? Reply to this email and our team will assist.`,
    });

    try {
      const result = await sendSesEmail({
        region,
        from: fromAddress,
        to: [email],
        subject,
        text: message,
        html,
      });
      console.log('[send_booking_link] email sent', {
        message_id: (result as any)?.MessageId,
        email,
        from: fromMeta.from,
        region,
      });
    } catch (err: any) {
      console.error('[send_booking_link] email send failed', {
        message: err?.message ?? String(err),
        email,
        from: fromMeta.from,
      });
      const rawMessage = String(err?.message ?? '').toLowerCase();
      if (rawMessage.includes('address is not verified') || rawMessage.includes('email address is not verified')) {
        throw new BadRequestException(
          'Email could not be sent because SES is in sandbox mode. The recipient email must be verified in SES.'
        );
      }
      if (rawMessage.includes('message rejected')) {
        throw new BadRequestException('Email could not be sent. SES rejected the message.');
      }
      throw err;
    }

    const now = Date.now();
    if (existingCall) {
      const updates: Record<string, any> = {
        booking_link_sent_at: now,
        booking_link_channel: 'EMAIL',
        lead_email: email,
        booking_link: bookingLink,
        ...(selectedService
          ? {
              selected_service_id: selectedService.service_id,
              selected_service_name: selectedService.name,
              selected_billing_type: selectedService.billing_type,
            }
          : {}),
        ...(appointmentEnd ? { booking_link_expires_at: appointmentEnd } : {}),
        updated_at: now,
      };
      await this.dynamodb.update('calls', { company_id, call_id }, updates);
    } else {
      const call: Call = {
        company_id,
        call_id,
        direction: CallDirection.INBOUND,
        from_number: '',
        to_number: '',
        status: CallStatus.IN_PROGRESS,
        ai_handled: true,
        escalated: false,
        lead_captured: true,
        started_at: now,
        created_at: now,
        outcome: 'LEAD' as any,
        lead_email: email,
        booking_link_channel: 'EMAIL',
        booking_link: bookingLink,
        ...(selectedService
          ? {
              selected_service_id: selectedService.service_id,
              selected_service_name: selectedService.name,
              selected_billing_type: selectedService.billing_type,
            }
          : {}),
        ...(appointmentEnd ? { booking_link_expires_at: appointmentEnd } : {}),
      } as any;
      await this.dynamodb.put('calls', call);
    }

    const contactId = appointment?.contact_id || existingCall?.contact_id;
    if (contactId) {
      try {
        await this.dynamodb.update(
          'contacts',
          { company_id, contact_id: contactId },
          { email, updated_at: now, last_contact_at: now }
        );
      } catch (err) {
        console.warn('[send_booking_link] contact email update failed', err);
      }
    }

    if (appointmentId) {
      const apptUpdates: Record<string, any> = {
        booking_link: bookingLink,
        contact_email: email,
        ...(selectedService
          ? {
              selected_service_id: selectedService.service_id,
              selected_service_name: selectedService.name,
              selected_billing_type: selectedService.billing_type,
            }
          : {}),
        ...(appointmentEnd ? { booking_link_expires_at: appointmentEnd } : {}),
        updated_at: now,
      };
      await this.dynamodb.update('appointments', { company_id, appointment_id: appointmentId }, apptUpdates);
    }

    return {
      ok: true,
      sent: true,
      ...(selectedService
        ? {
            selected_service_id: selectedService.service_id,
            selected_service_name: selectedService.name,
            selected_billing_type: selectedService.billing_type,
          }
        : {}),
    };
  }

  async checkServiceArea(company_id: string, zip: string) {
    const company = await this.companies.findById(company_id);
    if (!company) throw new NotFoundException('Company not found');

    const zips = (company as any).service_area_zipcodes ?? [];
    if (!zips.length) return { eligible: true };

    const normalized = zip.trim();
    const eligible = zips.includes(normalized);

    return {
      eligible,
      message: eligible ? undefined : `Sorry, we don’t service zipcode ${normalized}.`,
    };
  }

  async listAppointmentsByPhone(dto: { company_id: string; phone: string; range_days?: number }) {
    const days = dto.range_days ?? 90;
    const now = Date.now();
    const startMs = now - days * 24 * 60 * 60 * 1000;
    const endMs = now + days * 24 * 60 * 60 * 1000;

    // First find the contact by phone
    const contactScan = await this.dynamodb.scan('contacts', {
      filterExpression: '#company_id = :company_id AND #phone = :phone',
      expressionAttributeNames: { '#company_id': 'company_id', '#phone': 'phone_number' },
      expressionAttributeValues: { ':company_id': dto.company_id, ':phone': dto.phone },
      limit: 1,
    });

    const contact = contactScan.items?.[0];
    if (!contact) return { appointments: [] };

    // Then find appointments by contact-appointments GSI
    const company_contact = `${dto.company_id}#${contact.contact_id}`;
    const result = await this.dynamodb.query(
      'appointments',
      '#company_contact = :cc AND #start BETWEEN :s AND :e',
      { '#company_contact': 'company_contact', '#start': 'scheduled_start' },
      { ':cc': company_contact, ':s': startMs, ':e': endMs },
      { indexName: 'contact-appointments' }
    );

    return {
      appointments: (result.items || []).map((a: any) => ({
        appointment_id: a.appointment_id,
        start_time: new Date(a.scheduled_start).toISOString(),
        end_time: new Date(a.scheduled_end).toISOString(),
        service_type: a.service_type,
        status: a.status,
        notes: a.notes,
      })),
    };
  }

  async cancelAppointment(dto: { company_id: string; appointment_id: string; reason?: string }) {
    const result = await this.appointmentsService.cancelAppointment(dto.company_id, dto.appointment_id);
    if (dto.reason) {
      await this.dynamodb.update(
        'appointments',
        { company_id: dto.company_id, appointment_id: dto.appointment_id },
        { notes: `Cancellation reason: ${dto.reason}. Updated at: ${new Date().toISOString()}` }
      );
    }
    return { ok: true, appointment_id: dto.appointment_id };
  }

  async rescheduleAppointment(dto: {
    company_id: string;
    appointment_id: string;
    new_start_time: string;
    timezone?: string;
  }) {
    const company = await this.companies.findById(dto.company_id);
    if (!company) throw new NotFoundException('Company not found');

    const timeZone = this.normalizeTimeZone(dto.timezone, this.resolveCompanyTimeZone(company));
    const startIso = this.coerceToUtcIso(dto.new_start_time, timeZone);
    const startMs = Date.parse(startIso);

    const appt = await this.appointmentsService.getAppointment(dto.company_id, dto.appointment_id);
    const durationMs = appt.scheduled_end - appt.scheduled_start;
    const endMs = startMs + durationMs;

    const updated = await this.appointmentsService.updateAppointment(dto.company_id, dto.appointment_id, {
      scheduled_start: startMs,
      scheduled_end: endMs,
    });

    return {
      ok: true,
      appointment_id: dto.appointment_id,
      start_time: new Date(startMs).toISOString(),
      end_time: new Date(endMs).toISOString(),
    };
  }
}
