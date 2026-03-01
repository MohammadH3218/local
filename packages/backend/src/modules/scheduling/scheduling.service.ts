import { BadRequestException, Injectable } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { AppointmentStatus, Company, DaySchedule } from '@handycall/shared';
import {
  addUtcDays,
  getLocalDateParts,
  getWeekdayKey,
  parseHHmm,
  zonedTimeToUtcMs,
} from './timezone';

export type AvailabilitySlot = {
  start_time: string; // UTC ISO
  end_time: string; // UTC ISO
};

function asMs(input: string): number {
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) throw new BadRequestException(`Invalid ISO time: ${input}`);
  return ms;
}

function getScheduleForDay(company: Company, weekdayKey: string): DaySchedule | undefined {
  const hours: any = company.business_hours || {};
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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

type Segment = { open: string; close: string };
type ScheduleLike = DaySchedule & { segments?: Segment[] };

function normalizeSegments(schedule?: ScheduleLike): Segment[] {
  if (!schedule || (schedule as any).closed) return [];
  const segs = Array.isArray((schedule as any).segments) ? ((schedule as any).segments as Segment[]) : [];
  if (segs.length) return segs.filter((s) => s?.open && s?.close);
  const open = (schedule as any).open;
  const close = (schedule as any).close;
  if (open && close) return [{ open, close }];
  return [];
}

function findOverrideForDate(company: any, ymd: string): any | undefined {
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

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

@Injectable()
export class SchedulingService {
  constructor(private readonly dynamodb: DynamoDBService) {}

  private async listSlotHolds(
    companyId: string,
    startMs: number,
    endMs: number,
    ignoreCallId?: string
  ): Promise<Array<{ start: number; end: number }>> {
    const nowTtl = Math.floor(Date.now() / 1000);
    const prefix = `hold#${companyId}#`;
    const scan = await this.dynamodb.scan('realtime_cache', {
      filterExpression: 'begins_with(#contact_id, :prefix) AND #type = :type AND #ttl > :now',
      expressionAttributeNames: {
        '#contact_id': 'contact_id',
        '#type': 'type',
        '#ttl': 'ttl',
      },
      expressionAttributeValues: {
        ':prefix': prefix,
        ':type': 'slot_hold',
        ':now': nowTtl,
      },
      limit: 200,
    });

    const holds: Array<{ start: number; end: number }> = [];
    for (const item of scan.items || []) {
      if (ignoreCallId && item?.call_id && item.call_id === ignoreCallId) continue;
      const start = typeof item?.slot_start_ms === 'number' ? item.slot_start_ms : Date.parse(item?.slot_start);
      const end = typeof item?.slot_end_ms === 'number' ? item.slot_end_ms : Date.parse(item?.slot_end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (end <= startMs || start >= endMs) continue;
      holds.push({ start, end });
    }
    return holds;
  }

  getSlotIntervalMinutes(company: Company): number {
    const anyCompany: any = company as any;
    const minutes = typeof anyCompany?.slot_interval_minutes === 'number' ? anyCompany.slot_interval_minutes : 30;
    return Math.max(5, Math.min(120, Math.floor(minutes)));
  }

  getDurationMinutes(company: Company): number {
    const anyCompany: any = company as any;
    const minutes =
      typeof anyCompany?.appointment_duration_minutes === 'number' ? anyCompany.appointment_duration_minutes : 60;
    return Math.max(10, Math.min(240, Math.floor(minutes)));
  }

  async listAppointmentsInRange(companyId: string, startMs: number, endMs: number): Promise<any[]> {
    try {
      const result = await this.dynamodb.queryByCompany(
        'appointments',
        companyId,
        {
          keyCondition: '#scheduled_start BETWEEN :start AND :end',
          expressionAttributeNames: { '#scheduled_start': 'scheduled_start' },
          expressionAttributeValues: { ':start': startMs, ':end': endMs },
        },
        {
          indexName: 'date-index',
          scanIndexForward: true,
          limit: 500,
        }
      );
      return result.items || [];
    } catch {
      const scan = await this.dynamodb.scan('appointments', {
        filterExpression: '#company_id = :company_id AND #scheduled_start BETWEEN :start AND :end',
        expressionAttributeNames: { '#company_id': 'company_id', '#scheduled_start': 'scheduled_start' },
        expressionAttributeValues: { ':company_id': companyId, ':start': startMs, ':end': endMs },
        limit: 500,
      });
      return scan.items || [];
    }
  }

  async getAvailability(
    company: Company,
    startIso: string,
    endIso: string,
    options?: { ignoreCallId?: string }
  ): Promise<AvailabilitySlot[]> {
    const startMs = asMs(startIso);
    const endMs = asMs(endIso);
    if (endMs <= startMs) throw new BadRequestException('end_time must be after start_time');

    const timeZone =
      (company as any)?.calendar_connection?.timezone ||
      (company as any)?.calendar_connection?.timeZone ||
      company.timezone ||
      'UTC';
    const durationMinutes = this.getDurationMinutes(company);
    const intervalMinutes = this.getSlotIntervalMinutes(company);

    const rangeStart = new Date(startMs);
    const rangeEnd = new Date(endMs);

    const firstDay = getLocalDateParts(rangeStart, timeZone);
    const lastDay = getLocalDateParts(rangeEnd, timeZone);

    const durationMs = durationMinutes * 60_000;
    const intervalMs = intervalMinutes * 60_000;

    const appts = await this.listAppointmentsInRange(company.company_id, startMs - durationMs, endMs + durationMs);
    const busy = (appts || [])
      .filter((a) => {
        if (typeof a?.scheduled_start !== 'number' || typeof a?.scheduled_end !== 'number') return false;
        const status = typeof a?.status === 'string' ? a.status : '';
        return status !== AppointmentStatus.CANCELLED && status !== AppointmentStatus.NO_SHOW;
      })
      .map((a) => ({ start: a.scheduled_start as number, end: a.scheduled_end as number }));
    const holds = await this.listSlotHolds(company.company_id, startMs - durationMs, endMs + durationMs, options?.ignoreCallId);
    busy.push(...holds);

    const slots: AvailabilitySlot[] = [];

    const sameDay = (a: any, b: any) => a.year === b.year && a.month === b.month && a.day === b.day;
    for (let day = firstDay, guard = 0; guard < 370; day = addUtcDays(day, 1), guard++) {
      if (guard > 0 && sameDay(day, addUtcDays(lastDay, 1))) break;

      const ymdKey = `${day.year}-${pad2(day.month)}-${pad2(day.day)}`;
      const pivotUtc = new Date(Date.UTC(day.year, day.month - 1, day.day, 12, 0, 0));
      const weekdayKey = getWeekdayKey(pivotUtc, timeZone);

      const override = findOverrideForDate(company as any, ymdKey);
      if (override?.closed) {
        if (sameDay(day, lastDay)) break;
        continue;
      }

      const weekdaySchedule = getScheduleForDay(company, weekdayKey) as any;
      const schedule = (override ?? weekdaySchedule) as any;
      const segments = normalizeSegments(schedule as any);
      if (!segments.length) {
        if (sameDay(day, lastDay)) break;
        continue;
      }

      for (const seg of segments) {
        const open = parseHHmm(seg.open);
        const close = parseHHmm(seg.close);

        const openUtc = zonedTimeToUtcMs(
          { year: day.year, month: day.month, day: day.day, hour: open.hour, minute: open.minute },
          timeZone
        );
        const closeUtc = zonedTimeToUtcMs(
          { year: day.year, month: day.month, day: day.day, hour: close.hour, minute: close.minute },
          timeZone
        );

        const windowStart = Math.max(openUtc, startMs);
        const windowEnd = Math.min(closeUtc, endMs);
        if (windowEnd - windowStart < durationMs) {
          continue;
        }

        // Align to the configured interval without skipping an already-aligned start.
        const firstSlotStart =
          windowStart % intervalMs === 0 ? windowStart : windowStart - (windowStart % intervalMs) + intervalMs;
        for (let t = firstSlotStart; t + durationMs <= windowEnd; t += intervalMs) {
          const tEnd = t + durationMs;
          const isBusy = busy.some((b) => overlaps(t, tEnd, b.start, b.end));
          if (!isBusy) {
            slots.push({ start_time: new Date(t).toISOString(), end_time: new Date(tEnd).toISOString() });
          }
        }
      }

      if (sameDay(day, lastDay)) break;
    }

    return slots;
  }
}
