'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { usePortalBasePath } from '@/lib/portal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_TIMEZONE, TIMEZONE_OPTIONS, hasTimezoneOption } from '@/constants/timezones';
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconPlus,
  IconEdit,
  IconTrash,
  IconSettings,
  IconX,
} from '@tabler/icons-react';
import { PageHeader } from '@/components/portal/page-header';

type TimeSegment = { open: string; close: string };
type DayScheduleDraft = { closed?: boolean; open?: string; close?: string; segments?: TimeSegment[] };
type BusinessHoursDraft = Record<string, DayScheduleDraft>;
type DateOverrideDraft = { date: string; closed?: boolean; segments?: TimeSegment[] };

const WEEKDAYS: Array<{ key: string; label: string }> = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

function normalizeDaySchedule(raw: any): DayScheduleDraft {
  if (!raw) return { closed: true, segments: [] };
  if (raw.closed) return { closed: true, segments: [] };
  const segs = Array.isArray(raw.segments)
    ? raw.segments
        .filter((s: any) => s?.open && s?.close)
        .map((s: any) => ({ open: String(s.open), close: String(s.close) }))
    : [];
  if (segs.length) return { closed: false, segments: segs };
  if (raw.open && raw.close) return { closed: false, segments: [{ open: String(raw.open), close: String(raw.close) }] };
  return { closed: true, segments: [] };
}

function normalizeBusinessHours(raw: any): BusinessHoursDraft {
  const out: BusinessHoursDraft = {};
  for (const { key } of WEEKDAYS) out[key] = normalizeDaySchedule(raw?.[key]);
  return out;
}

function normalizeOverrides(raw: any): DateOverrideDraft[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((o) => ({
        date: String(o?.date || ''),
        closed: !!o?.closed,
        segments: Array.isArray(o?.segments)
          ? o.segments
              .filter((s: any) => s?.open && s?.close)
              .map((s: any) => ({ open: String(s.open), close: String(s.close) }))
          : [],
      }))
      .filter((o) => !!o.date);
  }
  if (typeof raw === 'object') {
    return Object.entries(raw).map(([date, o]: any) => ({
      date,
      closed: !!o?.closed,
      segments: Array.isArray(o?.segments)
        ? o.segments
            .filter((s: any) => s?.open && s?.close)
            .map((s: any) => ({ open: String(s.open), close: String(s.close) }))
        : [],
    }));
  }
  return [];
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ymdFromParts(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function getZonedParts(ts: number | string | Date, timeZone?: string) {
  const date = ts instanceof Date ? ts : new Date(ts);
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }
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
    const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return {
      year: value('year'),
      month: value('month'),
      day: value('day'),
      hour: value('hour'),
      minute: value('minute'),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }
}

function toZonedDate(ts: number | string | Date, timeZone?: string) {
  const parts = getZonedParts(ts, timeZone);
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
}

function formatDateTime(ts?: number | string, timeZone?: string) {
  if (!ts) return '-';
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return date.toLocaleString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(ts: number | string | Date, timeZone?: string) {
  const date = ts instanceof Date ? ts : new Date(ts);
  return date.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
}

function formatShortDate(date: Date, timeZone?: string) {
  return date.toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' });
}

function formatHourLabel(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString('en-US', { hour: 'numeric' }).toLowerCase();
}

function timeToMinutes(value?: string) {
  if (!value) return null;
  const [h, m] = value.split(':').map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function statusBadge(status?: string): { label: string; className: string } {
  const s = String(status || '').toUpperCase();
  if (s === 'SCHEDULED') return { label: 'Scheduled', className: 'bg-amber-50 text-amber-700 border border-amber-100' };
  if (s === 'CONFIRMED') return { label: 'Confirmed', className: 'bg-emerald-50 text-emerald-700 border border-emerald-100' };
  if (s === 'CANCELLED') return { label: 'Cancelled', className: 'bg-red-50 text-red-700 border border-red-100' };
  if (s === 'COMPLETED') return { label: 'Completed', className: 'bg-slate-100 text-slate-600' };
  return { label: status || 'Unknown', className: 'bg-slate-100 text-slate-600' };
}

function eventTone(status?: string) {
  const s = String(status || '').toUpperCase();
  if (s === 'CANCELLED') return 'bg-red-50 text-red-700 border border-red-100';
  if (s === 'COMPLETED') return 'bg-slate-100 text-slate-600 border border-slate-200';
  if (s === 'CONFIRMED') return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
  return 'bg-amber-50 text-amber-700 border border-amber-100';
}

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 bg-white';
const primaryBtnCls = 'bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const outlineBtnCls = 'border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const destructiveBtnCls = 'bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const iconBtnCls = 'border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg p-2 transition-colors disabled:opacity-50 flex items-center justify-center';

export default function AppointmentsPage() {
  const { toast } = useToast();
  const [company, setCompany] = useState<any>(null);
  const setCompanyInStore = useAuthStore((state) => state.setCompany);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SCHEDULED' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [serviceFilter, setServiceFilter] = useState('ALL');

  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 12, 0, 0));
  });

  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month' | 'list'>('week');
  const [focusDate, setFocusDate] = useState(() => new Date());

  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(null);

  // Edit appointment state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<any>({});

  // Delete confirmation state
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Calendar settings state
  const [isCalendarSettingsOpen, setIsCalendarSettingsOpen] = useState(false);
  const [pendingCalendarSettingsOpen, setPendingCalendarSettingsOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isDeleteCalendarConfirmOpen, setIsDeleteCalendarConfirmOpen] = useState(false);
  const [calendarTimezone, setCalendarTimezone] = useState('');
  const [businessHoursDraft, setBusinessHoursDraft] = useState<BusinessHoursDraft>(() => normalizeBusinessHours(null));
  const [dateOverridesDraft, setDateOverridesDraft] = useState<DateOverrideDraft[]>([]);

  // Show more appointments state
  const [showAllAppointments, setShowAllAppointments] = useState(false);

  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [setupChoice, setSetupChoice] = useState<'INTERNAL' | 'EXTERNAL' | null>(null);
  const [setupTimezone, setSetupTimezone] = useState(DEFAULT_TIMEZONE);

  const [isCalendarProviderDialogOpen, setIsCalendarProviderDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'GOOGLE' | 'MICROSOFT' | 'APPLE' | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<any>({
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    service_type: '',
    date: '',
    start_time: '09:00',
    duration_minutes: 60,
    notes: '',
    address_street: '',
    address_city: '',
    address_state: '',
    address_zip: '',
    price: '',
    recurrence_enabled: false,
    recurrence_frequency: 'WEEKLY',
    recurrence_interval: 1,
    recurrence_count: 4,
  });

  const displayTimezone =
    calendarTimezone || company?.calendar_connection?.timezone || company?.calendar_connection?.timeZone || company?.timezone || undefined;

  const monthLabel = useMemo(() => {
    const parts = getZonedParts(monthCursor, displayTimezone);
    const anchor = new Date(Date.UTC(parts.year, parts.month - 1, 1, 12, 0, 0));
    return anchor.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: displayTimezone });
  }, [monthCursor, displayTimezone]);

  const visibleRange = useMemo(() => {
    const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const end = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    start.setDate(start.getDate() - 7);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }, [monthCursor]);

  const monthDays = useMemo(() => {
    const parts = getZonedParts(monthCursor, displayTimezone);
    const firstUtc = new Date(Date.UTC(parts.year, parts.month - 1, 1, 12, 0, 0));
    const firstZoned = toZonedDate(firstUtc, displayTimezone);
    const shift = (firstZoned.getDay() + 6) % 7; // Monday
    const gridStartUtc = new Date(firstUtc);
    gridStartUtc.setUTCDate(gridStartUtc.getUTCDate() - shift);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const dUtc = new Date(gridStartUtc);
      dUtc.setUTCDate(gridStartUtc.getUTCDate() + i);
      days.push(toZonedDate(dUtc, displayTimezone));
    }
    return days;
  }, [monthCursor, displayTimezone]);

  const hourStart = 6;
  const hourEnd = 20;
  const hourSlots = useMemo(() => Array.from({ length: hourEnd - hourStart + 1 }, (_, idx) => hourStart + idx), []);
  const hourRowHeight = 64;
  const dayHeight = (hourEnd - hourStart) * hourRowHeight;

  const isCalendarSetupComplete = company?.calendar_setup_completed !== false;

  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const startBoundary = rangeStart ? new Date(`${rangeStart}T00:00:00`).getTime() : null;
    const endBoundary = rangeEnd ? new Date(`${rangeEnd}T23:59:59`).getTime() : null;
    const timeStartMinutes = timeToMinutes(timeStart);
    const timeEndMinutes = timeToMinutes(timeEnd);
    return (appointments || [])
      .filter((a) => !a?.is_series_master)
      .filter((a) => {
        if (statusFilter === 'ALL') return true;
        return String(a?.status || '').toUpperCase() === statusFilter;
      })
      .filter((a) => {
        if (serviceFilter === 'ALL') return true;
        return String(a?.service_type || '').toLowerCase() === String(serviceFilter).toLowerCase();
      })
      .filter((a) => {
        if (!startBoundary && !endBoundary && timeStartMinutes === null && timeEndMinutes === null) return true;
        const ms = typeof a?.scheduled_start === 'number' ? a.scheduled_start : Date.parse(a?.scheduled_start);
        if (!Number.isFinite(ms)) return false;
        if (startBoundary && ms < startBoundary) return false;
        if (endBoundary && ms > endBoundary) return false;
        if (timeStartMinutes !== null || timeEndMinutes !== null) {
          const d = toZonedDate(ms, displayTimezone);
          const minutes = d.getHours() * 60 + d.getMinutes();
          if (timeStartMinutes !== null && minutes < timeStartMinutes) return false;
          if (timeEndMinutes !== null && minutes > timeEndMinutes) return false;
        }
        return true;
      })
      .filter((a) => {
        if (!q) return true;
        const text = [
          a?.contact_name,
          a?.contact_email,
          a?.contact_phone,
          a?.service_type,
          a?.notes,
          a?.address?.street,
          a?.address?.city,
          a?.address?.state,
          a?.address?.zip,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return text.includes(q);
      })
      .sort((a, b) => (a?.scheduled_start ?? 0) - (b?.scheduled_start ?? 0));
  }, [appointments, searchQuery, statusFilter, rangeStart, rangeEnd, timeStart, timeEnd, serviceFilter, displayTimezone]);

  const apptsByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of filteredAppointments) {
      const ms = typeof a?.scheduled_start === 'number' ? a.scheduled_start : Date.parse(a?.scheduled_start);
      if (!Number.isFinite(ms)) continue;
      const key = ymd(toZonedDate(ms, displayTimezone));
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [filteredAppointments, displayTimezone]);

  const serviceOptions = useMemo(() => {
    const set = new Set<string>();
    for (const apt of appointments || []) {
      if (apt?.service_type) set.add(String(apt.service_type));
    }
    return Array.from(set.values());
  }, [appointments]);

  const focusKey = useMemo(() => ymd(toZonedDate(focusDate, displayTimezone)), [focusDate, displayTimezone]);
  const focusAppointments = useMemo(() => apptsByDay.get(focusKey) ?? [], [apptsByDay, focusKey]);

  const listGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const apt of filteredAppointments) {
      const ms = typeof apt?.scheduled_start === 'number' ? apt.scheduled_start : Date.parse(apt?.scheduled_start);
      if (!Number.isFinite(ms)) continue;
      const key = ymd(toZonedDate(ms, displayTimezone));
      const current = groups.get(key) ?? [];
      current.push(apt);
      groups.set(key, current);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredAppointments, displayTimezone]);

  const weekDays = useMemo(() => {
    const base = new Date(focusDate);
    const start = new Date(base);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      return d;
    });
  }, [focusDate]);

  const viewLabel = useMemo(() => {
    if (calendarView === 'month') return monthLabel;
    if (calendarView === 'week') {
      const start = weekDays[0];
      const end = weekDays[6];
      return `${formatShortDate(start, displayTimezone)} - ${formatShortDate(end, displayTimezone)}`;
    }
    if (calendarView === 'day') {
      return focusDate.toLocaleDateString('en-US', {
        timeZone: displayTimezone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    }
    return 'Agenda';
  }, [calendarView, monthLabel, focusDate, weekDays, displayTimezone]);

  const router = useRouter();
  const basePath = usePortalBasePath();
  const searchParams = useSearchParams();
  const shiftMonthCursor = (delta: number) => {
    setMonthCursor((prev) => {
      const year = prev.getUTCFullYear();
      const month = prev.getUTCMonth();
      return new Date(Date.UTC(year, month + delta, 1, 12, 0, 0));
    });
  };

  // Handle calendar connection redirect
  useEffect(() => {
    const calendarStatus = searchParams?.get('calendar');
    const provider = searchParams?.get('provider');
    const errorMessage = searchParams?.get('message');
    const openSettings = searchParams?.get('calendarSettings');
    const appointmentId = searchParams?.get('appointmentId');

    if (calendarStatus === 'connected') {
      void loadData();
      const providerName = provider === 'google' ? 'Google Calendar' :
                          provider === 'microsoft' ? 'Microsoft Calendar' :
                          'Calendar';
      setError(null);
      router.replace(`${basePath}/appointments`);
    } else if (calendarStatus === 'error') {
      setError(errorMessage || 'Failed to connect calendar');
      router.replace(`${basePath}/appointments`);
    }

    if (openSettings === '1') {
      setPendingCalendarSettingsOpen(true);
      router.replace(`${basePath}/appointments`);
    }
    if (appointmentId) {
      setPendingAppointmentId(appointmentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  useEffect(() => {
    if (!pendingAppointmentId) return;
    if (!appointments || appointments.length === 0) return;
    const match = appointments.find((a: any) => a?.appointment_id === pendingAppointmentId);
    if (!match) return;
    handleViewAppointment(pendingAppointmentId);
    setPendingAppointmentId(null);
    router.replace(`${basePath}/appointments`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAppointmentId, appointments]);

  useEffect(() => {
    if (!pendingCalendarSettingsOpen || !company) return;
    setCalendarTimezone(company?.calendar_connection?.timezone || company?.calendar_connection?.timeZone || company?.timezone || '');
    setBusinessHoursDraft(normalizeBusinessHours(company?.business_hours));
    setDateOverridesDraft(normalizeOverrides(company?.schedule_overrides));
    setIsCalendarSettingsOpen(true);
    setPendingCalendarSettingsOpen(false);
  }, [pendingCalendarSettingsOpen, company]);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthCursor]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      try {
        await apiClient.getCalendarConnectionStatus();
      } catch (err: any) {
        console.warn('Calendar connection check failed:', err);
      }
      const [c, a] = await Promise.all([
        apiClient.getMyCompany(),
        apiClient.getAppointmentsRange(visibleRange.start.toISOString(), visibleRange.end.toISOString()),
      ]);
      setCompany(c);
      setCompanyInStore(c);
      setCalendarTimezone(c?.calendar_connection?.timezone || c?.calendar_connection?.timeZone || c?.timezone || '');
      setBusinessHoursDraft(normalizeBusinessHours(c?.business_hours));
      setDateOverridesDraft(normalizeOverrides(c?.schedule_overrides));
      setSetupTimezone(c?.calendar_connection?.timezone || c?.calendar_connection?.timeZone || c?.timezone || DEFAULT_TIMEZONE);
      setAppointments(a.appointments || []);
    } catch (err: any) {
      console.error('Error loading appointments:', err);
      setError(err?.message || 'Failed to load appointments');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToday = () => {
    const now = toZonedDate(new Date(), displayTimezone);
    setFocusDate(now);
    setMonthCursor(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 12, 0, 0)));
  };

  const shiftFocusDays = (days: number) => {
    setFocusDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + days);
      setMonthCursor(new Date(Date.UTC(next.getFullYear(), next.getMonth(), 1, 12, 0, 0)));
      return next;
    });
  };

  const handlePrevRange = () => {
    if (calendarView === 'month') { shiftMonthCursor(-1); return; }
    if (calendarView === 'week') { shiftFocusDays(-7); return; }
    if (calendarView === 'day') { shiftFocusDays(-1); }
  };

  const handleNextRange = () => {
    if (calendarView === 'month') { shiftMonthCursor(1); return; }
    if (calendarView === 'week') { shiftFocusDays(7); return; }
    if (calendarView === 'day') { shiftFocusDays(1); }
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setServiceFilter('ALL');
    setRangeStart('');
    setRangeEnd('');
    setTimeStart('');
    setTimeEnd('');
  };

  const handleStartSetup = () => {
    setSetupChoice(null);
    setSetupTimezone(company?.timezone || DEFAULT_TIMEZONE);
    setIsSetupOpen(true);
  };

  const handleCompleteSetup = async () => {
    if (!setupChoice) return;
    if (setupChoice === 'INTERNAL' && !setupTimezone) {
      setError('Please set your timezone first');
      return;
    }

    if (setupChoice === 'INTERNAL') {
      await apiClient.updateMyCompany({
        timezone: setupTimezone,
        calendar_mode: setupChoice,
        calendar_setup_completed: true,
        calendar_provider: 'NONE',
      });
      setIsSetupOpen(false);
      await loadData();
      toast({
        title: 'Calendar setup saved',
        description: 'Your internal calendar preferences were saved.',
      });
    } else {
      setIsSetupOpen(false);
      setIsCalendarProviderDialogOpen(true);
    }
  };

  const handleViewAppointment = async (appointmentId: string) => {
    try {
      const appt = await apiClient.getAppointmentById(appointmentId);
      setSelectedAppointment(appt);
      setIsDetailsOpen(true);
    } catch (err: any) {
      console.error('Error loading appointment:', err);
      setError(err?.message || 'Failed to load appointment');
    }
  };

  const handleCreate = async () => {
    try {
      setError(null);
      const date = String(createDraft.date || '').trim();
      const start = String(createDraft.start_time || '').trim();
      if (!date || !start) {
        setError('Please choose a date and start time');
        return;
      }

      const duration = Math.max(10, Number(createDraft.duration_minutes) || 60);
      const startLocal = new Date(`${date}T${start}:00`);
      const startMs = startLocal.getTime();
      const endMs = startMs + duration * 60_000;

      const payload: any = {
        scheduled_start: startMs,
        scheduled_end: endMs,
        contact_name: createDraft.contact_name || undefined,
        contact_email: createDraft.contact_email || undefined,
        contact_phone: createDraft.contact_phone || undefined,
        service_type: createDraft.service_type || company?.service_type || 'Service',
        notes: createDraft.notes || undefined,
        address:
          createDraft.address_street || createDraft.address_city || createDraft.address_state || createDraft.address_zip
            ? {
                street: createDraft.address_street || undefined,
                city: createDraft.address_city || undefined,
                state: createDraft.address_state || undefined,
                zip: createDraft.address_zip || undefined,
              }
            : undefined,
        price_cents: createDraft.price ? Math.round(Number(createDraft.price) * 100) : undefined,
        currency: createDraft.price ? 'USD' : undefined,
        created_by: 'USER',
      };

      if (createDraft.recurrence_enabled) {
        payload.recurrence = {
          frequency: createDraft.recurrence_frequency,
          interval: Number(createDraft.recurrence_interval) || 1,
          count: Number(createDraft.recurrence_count) || 1,
        };
      }

      await apiClient.createAppointment(payload);

      setIsCreateOpen(false);
      setCreateDraft((p: any) => ({
        ...p,
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        notes: '',
        address_street: '',
        address_city: '',
        address_state: '',
        address_zip: '',
        price: '',
        recurrence_enabled: false,
      }));
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to create appointment');
    }
  };

  const [appleEmail, setAppleEmail] = useState('');
  const [applePassword, setApplePassword] = useState('');
  const [showAppleForm, setShowAppleForm] = useState(false);

  const handleConnectExternalCalendar = async () => {
    if (!selectedProvider) {
      setError('Please select a calendar provider');
      return;
    }
    try {
      setError(null);
      let response: any;
      if (selectedProvider === 'GOOGLE') {
        response = await apiClient.getGoogleCalendarAuthUrl();
        if (response?.url) window.location.href = response.url;
      } else if (selectedProvider === 'MICROSOFT') {
        response = await apiClient.getMicrosoftCalendarAuthUrl();
        if (response?.url) window.location.href = response.url;
      } else if (selectedProvider === 'APPLE') {
        setShowAppleForm(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to connect calendar');
    }
  };

  const handleConnectApple = async () => {
    if (!appleEmail || !applePassword) {
      setError('Please enter your Apple ID email and app-specific password');
      return;
    }
    try {
      setError(null);
      await apiClient.connectAppleCalendar(appleEmail, applePassword);
      setIsCalendarProviderDialogOpen(false);
      setShowAppleForm(false);
      setAppleEmail('');
      setApplePassword('');
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to connect Apple Calendar');
    }
  };

  const isExternalCalendarConnected = company?.calendar_mode === 'EXTERNAL' && company?.calendar_provider && company?.calendar_provider !== 'NONE';

  const handleEditAppointment = (appointment: any) => {
    const startDate = new Date(appointment.scheduled_start);
    const endDate = new Date(appointment.scheduled_end);
    const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

    setEditDraft({
      appointment_id: appointment.appointment_id,
      contact_name: appointment.contact_name || '',
      contact_email: appointment.contact_email || '',
      contact_phone: appointment.contact_phone || '',
      service_type: appointment.service_type || '',
      selected_service_id: appointment.selected_service_id || '',
      date: ymd(startDate),
      start_time: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
      duration_minutes: durationMinutes,
      notes: appointment.notes || '',
      address_street: appointment.address?.street || '',
      address_city: appointment.address?.city || '',
      address_state: appointment.address?.state || '',
      address_zip: appointment.address?.zip || '',
      price: appointment.price_cents ? (appointment.price_cents / 100).toString() : '',
      status: appointment.status || 'SCHEDULED',
    });
    setIsEditOpen(true);
    setIsDetailsOpen(false);
  };

  const handleUpdateAppointment = async () => {
    try {
      setError(null);
      const date = String(editDraft.date || '').trim();
      const start = String(editDraft.start_time || '').trim();
      if (!date || !start) {
        setError('Please choose a date and start time');
        return;
      }

      const duration = Math.max(10, Number(editDraft.duration_minutes) || 60);
      const startLocal = new Date(`${date}T${start}:00`);
      const startMs = startLocal.getTime();
      const endMs = startMs + duration * 60_000;

      const payload: any = {
        scheduled_start: startMs,
        scheduled_end: endMs,
        contact_name: editDraft.contact_name || undefined,
        contact_email: editDraft.contact_email || undefined,
        contact_phone: editDraft.contact_phone || undefined,
        service_type: editDraft.service_type || company?.service_type || 'Service',
        selected_service_id: editDraft.selected_service_id || undefined,
        notes: editDraft.notes || undefined,
        address:
          editDraft.address_street || editDraft.address_city || editDraft.address_state || editDraft.address_zip
            ? {
                street: editDraft.address_street || undefined,
                city: editDraft.address_city || undefined,
                state: editDraft.address_state || undefined,
                zip: editDraft.address_zip || undefined,
              }
            : undefined,
        price_cents: editDraft.price ? Math.round(Number(editDraft.price) * 100) : undefined,
        status: editDraft.status,
      };

      await apiClient.updateAppointment(editDraft.appointment_id, payload);
      setIsEditOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to update appointment');
    }
  };

  const handleDeleteClick = (appointment: any) => {
    setAppointmentToDelete(appointment);
    setIsDeleteConfirmOpen(true);
    setIsDetailsOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!appointmentToDelete) return;
    try {
      setIsDeleting(true);
      setError(null);
      await apiClient.deleteAppointment(appointmentToDelete.appointment_id);
      setIsDeleteConfirmOpen(false);
      setAppointmentToDelete(null);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete appointment');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenCalendarSettings = () => {
    setCalendarTimezone(company?.calendar_connection?.timezone || company?.calendar_connection?.timeZone || company?.timezone || '');
    setBusinessHoursDraft(normalizeBusinessHours(company?.business_hours));
    setDateOverridesDraft(normalizeOverrides(company?.schedule_overrides));
    setIsCalendarSettingsOpen(true);
  };

  const handleSaveCalendarSettings = async () => {
    try {
      setError(null);

      const cleanedHours: any = {};
      for (const { key } of WEEKDAYS) {
        const day = businessHoursDraft[key] || {};
        const segs = Array.isArray(day.segments)
          ? day.segments.filter((s) => s?.open && s?.close)
          : [];
        cleanedHours[key] = segs.length ? { closed: false, segments: segs } : { closed: true };
      }

      const cleanedOverrides = (dateOverridesDraft || [])
        .map((o: any) => {
          if (typeof o === 'string') return { date: o, closed: true, segments: [] as TimeSegment[] };
          if (o instanceof Date) return { date: ymd(o), closed: true, segments: [] as TimeSegment[] };
          const date = typeof o?.date === 'string' ? o.date : '';
          const segments = Array.isArray(o?.segments) ? o.segments.filter((s: any) => s?.open && s?.close) : [];
          const closed = typeof o?.closed === 'boolean' ? o.closed : segments.length === 0;
          return { date, closed, segments };
        })
        .filter((o) => o && typeof o === 'object' && typeof o.date === 'string' && o.date)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));

      const hasHours = Object.values(cleanedHours).some((day: any) => {
        const segs = Array.isArray(day?.segments) ? day.segments : [];
        return segs.length > 0;
      });
      const hasTimezone = isExternalCalendarConnected ? Boolean(company?.timezone) : Boolean(calendarTimezone);
      const scheduleComplete = hasHours && hasTimezone;

      const updates: any = {
        business_hours: cleanedHours,
        schedule_overrides: cleanedOverrides,
        schedule_setup_completed: scheduleComplete,
      };

      if (!isExternalCalendarConnected && calendarTimezone) {
        updates.timezone = calendarTimezone;
      }

      await apiClient.updateMyCompany(updates);
      setIsCalendarSettingsOpen(false);
      await loadData();
      toast({
        title: 'Calendar settings saved',
        description: 'Your timezone and availability were updated.',
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to update settings');
    }
  };

  const handleDisconnectCalendar = async () => {
    try {
      setIsDisconnecting(true);
      setError(null);
      await apiClient.disconnectCalendar();
      setIsDeleteCalendarConfirmOpen(false);
      setIsCalendarSettingsOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to disconnect calendar');
    } finally {
      setIsDisconnecting(false);
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={loadData} className="mt-2 text-sm text-red-600 hover:text-red-800 underline">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        eyebrow="Appointments"
        title="Appointments and availability"
        subtitle="Manage bookings, calendars, and availability in one place."
        actions={
          <>
            {isCalendarSetupComplete ? (
              <button className={outlineBtnCls} onClick={handleOpenCalendarSettings}>
                <IconSettings stroke={1.5} className="h-4 w-4 mr-2 inline-block" />
                Calendar Settings
              </button>
            ) : null}
            {!isExternalCalendarConnected ? (
              <button className={outlineBtnCls} onClick={() => setIsCalendarProviderDialogOpen(true)}>
                <IconExternalLink stroke={1.5} className="h-4 w-4 mr-2 inline-block" />
                Connect Calendar
              </button>
            ) : null}
            <button
              className={primaryBtnCls}
              onClick={() => setIsCreateOpen(true)}
              disabled={!isCalendarSetupComplete}
            >
              <IconPlus stroke={1.5} className="h-4 w-4 mr-2 inline-block" />
              New appointment
            </button>
          </>
        }
      />

      {!isCalendarSetupComplete ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-slate-900">Set up your appointments calendar</div>
              <div className="text-sm text-slate-500 mt-1">
                Choose your timezone and how you want to manage scheduling before taking bookings.
              </div>
            </div>
            <button className={primaryBtnCls} onClick={handleStartSetup}>Set up</button>
          </div>
        </div>
      ) : null}

      {isCalendarSetupComplete ? (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Left sidebar */}
          <div className="space-y-6">
            {/* Mini calendar card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900 mb-3">Calendar</div>
              <div className="flex flex-wrap gap-2 mb-4">
                <button className={outlineBtnCls + ' text-xs px-3 py-1.5'} onClick={handleToday}>
                  Today
                </button>
                <button
                  className={outlineBtnCls + ' text-xs px-3 py-1.5'}
                  onClick={() => setIsCreateOpen(true)}
                  disabled={!isCalendarSetupComplete}
                >
                  <IconPlus stroke={1.5} className="h-3 w-3 mr-1 inline-block" />
                  New
                </button>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-slate-900">{monthLabel}</div>
                  <div className="flex items-center gap-1">
                    <button className={iconBtnCls + ' p-1'} onClick={() => shiftMonthCursor(-1)}>
                      <IconChevronLeft stroke={1.5} className="h-4 w-4" />
                    </button>
                    <button className={iconBtnCls + ' p-1'} onClick={() => shiftMonthCursor(1)}>
                      <IconChevronRight stroke={1.5} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 text-[11px] text-slate-500 mb-2">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <div key={i} className="text-center">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {monthDays.map((d) => {
                    const dParts = getZonedParts(d, displayTimezone);
                    const key = ymdFromParts(dParts);
                    const hasItems = (apptsByDay.get(key) ?? []).length > 0;
                    const monthParts = getZonedParts(monthCursor, displayTimezone);
                    const isInMonth = dParts.month === monthParts.month && dParts.year === monthParts.year;
                    const isSelected = key === focusKey;
                    const todayParts = getZonedParts(new Date(), displayTimezone);
                    const isToday = key === ymdFromParts(todayParts);
                    return (
                      <button
                        key={key}
                        className={`flex flex-col items-center justify-center rounded-md py-1 text-xs transition ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : isToday
                              ? 'border border-emerald-300 text-emerald-700'
                              : isInMonth
                                ? 'text-slate-800 hover:bg-slate-100'
                                : 'text-slate-400 hover:bg-slate-100'
                        }`}
                        onClick={() => {
                          const parts = getZonedParts(d, displayTimezone);
                          setFocusDate(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0)));
                          setMonthCursor(new Date(Date.UTC(parts.year, parts.month - 1, 1, 12, 0, 0)));
                          setCalendarView('day');
                        }}
                      >
                        <span>{dParts.day}</span>
                        {hasItems ? <span className="mt-0.5 h-1 w-1 rounded-full bg-emerald-500" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-3">Timezone: {calendarTimezone || 'Not set'}</div>
            </div>

            {/* Filters card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900 mb-4">Filters</div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500">Search</div>
                  <input
                    className={inputCls}
                    placeholder="Search appointments"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500">Status</div>
                  <select
                    className={inputCls}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                  >
                    <option value="ALL">All statuses</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500">Service type</div>
                  <select
                    className={inputCls}
                    value={serviceFilter}
                    onChange={(e) => setServiceFilter(e.target.value)}
                  >
                    <option value="ALL">All services</option>
                    {serviceOptions.map((service) => (
                      <option key={service} value={service}>{service}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500">Date range</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className={inputCls} value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
                    <input type="date" className={inputCls} value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-500">Time range</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="time" className={inputCls} value={timeStart} onChange={(e) => setTimeStart(e.target.value)} />
                    <input type="time" className={inputCls} value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="text-xs text-slate-500">{isLoading ? 'Loading...' : `${filteredAppointments.length} appointments`}</div>
                  <button className={outlineBtnCls + ' text-xs px-3 py-1.5'} onClick={handleClearFilters}>
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Main calendar area */}
          <div className="min-w-0 space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Calendar header */}
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <IconCalendar stroke={1.5} className="h-5 w-5 text-emerald-600" />
                      <span className="text-base font-semibold text-slate-900">{viewLabel}</span>
                    </div>
                    <span className="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {filteredAppointments.length} total
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
                      <button className={iconBtnCls + ' border-0 p-1.5'} onClick={handlePrevRange}>
                        <IconChevronLeft stroke={1.5} className="h-4 w-4" />
                      </button>
                      <button className={outlineBtnCls + ' text-xs px-2 py-1 border-0'} onClick={handleToday}>
                        Today
                      </button>
                      <button className={iconBtnCls + ' border-0 p-1.5'} onClick={handleNextRange}>
                        <IconChevronRight stroke={1.5} className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
                      {(['day', 'week', 'month', 'list'] as const).map((view) => (
                        <button
                          key={view}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                            calendarView === view
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                          onClick={() => {
                            if (view === 'month') {
                              setMonthCursor(new Date(Date.UTC(focusDate.getFullYear(), focusDate.getMonth(), 1, 12, 0, 0)));
                            }
                            setCalendarView(view);
                          }}
                        >
                          {view.charAt(0).toUpperCase() + view.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Calendar body */}
              {isLoading ? (
                <div className="p-8 text-sm text-slate-500">Loading appointments...</div>
              ) : calendarView === 'month' ? (
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-7 min-w-[560px] text-xs font-semibold text-slate-500 border-b border-slate-100 bg-slate-50">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                      <div key={d} className="px-3 py-3 text-center">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 min-w-[560px] divide-x divide-y divide-slate-100">
                    {monthDays.map((d) => {
                      const dayParts = getZonedParts(d, displayTimezone);
                      const key = ymdFromParts(dayParts);
                      const items = apptsByDay.get(key) ?? [];
                      const monthParts = getZonedParts(monthCursor, displayTimezone);
                      const inMonth = dayParts.month === monthParts.month && dayParts.year === monthParts.year;
                      const todayParts = getZonedParts(new Date(), displayTimezone);
                      const isToday = key === ymdFromParts(todayParts);
                      return (
                        <button
                          key={key}
                          className={`min-h-[110px] p-2 text-left hover:bg-slate-50 transition relative ${
                            inMonth ? 'bg-white' : 'bg-slate-50/50'
                          } ${isToday ? 'ring-2 ring-inset ring-emerald-300' : ''}`}
                          onClick={() => {
                            if (!isCalendarSetupComplete) return;
                            setFocusDate(new Date(Date.UTC(dayParts.year, dayParts.month - 1, dayParts.day, 12, 0, 0)));
                            setMonthCursor(new Date(Date.UTC(dayParts.year, dayParts.month - 1, 1, 12, 0, 0)));
                            setCalendarView('day');
                          }}
                          disabled={!isCalendarSetupComplete}
                        >
                          <div className={`text-sm font-medium mb-1 ${isToday ? 'text-emerald-600' : inMonth ? 'text-slate-900' : 'text-slate-400'}`}>
                            {dayParts.day}
                          </div>
                          <div className="space-y-1">
                            {items.slice(0, 2).map((a) => (
                              <div
                                key={a.appointment_id}
                                className={`text-xs truncate rounded px-1.5 py-0.5 ${eventTone(a.status)}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewAppointment(a.appointment_id);
                                }}
                              >
                                {a.contact_name || a.service_type || 'Appointment'}
                              </div>
                            ))}
                            {items.length > 2 && (
                              <div className="text-xs text-slate-500 font-medium">+{items.length - 2} more</div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : calendarView === 'list' ? (
                <div className="divide-y divide-slate-100">
                  {listGroups.length === 0 ? (
                    <div className="p-8 text-center">
                      <IconCalendar stroke={1.5} className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-base font-semibold text-slate-900 mb-2">No appointments scheduled</h3>
                      <p className="text-sm text-slate-500">New bookings will show up here as soon as they are confirmed.</p>
                    </div>
                  ) : (
                    listGroups.map(([key, items]) => {
                      const headerDate = new Date(`${key}T12:00:00`);
                      return (
                        <div key={key} className="p-4">
                          <div className="text-sm font-semibold text-slate-900">
                            {headerDate.toLocaleDateString('en-US', {
                              timeZone: displayTimezone,
                              weekday: 'long',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                          <div className="mt-3 space-y-3">
                            {items.map((apt) => {
                              const s = statusBadge(apt.status);
                              return (
                                <button
                                  key={apt.appointment_id}
                                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-emerald-300 hover:shadow-sm transition"
                                  onClick={() => handleViewAppointment(apt.appointment_id)}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <div className="font-semibold text-slate-900">
                                        {apt.contact_name || apt.contact_email || apt.contact_phone || 'Appointment'}
                                      </div>
                                      <div className="text-sm text-slate-500 mt-1">
                                        {formatDateTime(apt.scheduled_start, displayTimezone)} - {apt.service_type || 'Service'}
                                      </div>
                                    </div>
                                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${s.className}`}>
                                      {s.label}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="flex">
                  <div className="w-16 flex-shrink-0 border-r border-slate-100 bg-slate-50">
                    {hourSlots.slice(0, -1).map((hour) => (
                      <div
                        key={hour}
                        className="h-[64px] text-[11px] text-slate-400 flex items-start justify-end pr-2 pt-2"
                      >
                        {formatHourLabel(hour)}
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1 overflow-x-auto">
                    <div className={`grid ${calendarView === 'week' ? 'grid-cols-7 min-w-[700px]' : 'grid-cols-1'} bg-white`}>
                      {(calendarView === 'week' ? weekDays : [focusDate]).map((day) => {
                        const zonedDay = toZonedDate(day, displayTimezone);
                        const key = ymd(zonedDay);
                        const dayAppointments = apptsByDay.get(key) ?? [];
                        return (
                          <div key={key} className="border-r border-slate-100 last:border-r-0">
                            <div className="sticky top-0 z-10 bg-white px-3 py-2 border-b border-slate-100">
                              <div className="text-xs text-slate-500">
                                {zonedDay.toLocaleDateString('en-US', { timeZone: displayTimezone, weekday: 'short' })}
                              </div>
                              <div className="text-sm font-medium text-slate-900">
                                {zonedDay.toLocaleDateString('en-US', { timeZone: displayTimezone, month: 'short', day: 'numeric' })}
                              </div>
                            </div>
                            <div className="relative" style={{ height: `${dayHeight}px` }}>
                              <div className="absolute inset-0">
                                {hourSlots.slice(0, -1).map((hour) => (
                                  <div key={hour} className="border-b border-slate-100" style={{ height: `${hourRowHeight}px` }} />
                                ))}
                              </div>
                              {dayAppointments.map((apt) => {
                                const startMs = typeof apt.scheduled_start === 'number' ? apt.scheduled_start : Date.parse(apt.scheduled_start);
                                if (!Number.isFinite(startMs)) return null;
                                const endMs = typeof apt.scheduled_end === 'number' ? apt.scheduled_end : Date.parse(apt.scheduled_end) || startMs + 60 * 60 * 1000;
                                const startDate = toZonedDate(startMs, displayTimezone);
                                const endDate = toZonedDate(endMs, displayTimezone);
                                const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
                                const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
                                const clampStart = Math.max(startMinutes, hourStart * 60);
                                const clampEnd = Math.min(endMinutes, hourEnd * 60);
                                if (clampEnd <= clampStart) return null;
                                const top = ((clampStart - hourStart * 60) / 60) * hourRowHeight;
                                const height = Math.max(26, ((clampEnd - clampStart) / 60) * hourRowHeight);
                                const tone = eventTone(apt.status);
                                return (
                                  <button
                                    key={apt.appointment_id}
                                    className={`absolute left-2 right-2 rounded-lg px-2 py-1 text-xs text-left ${tone} hover:shadow-sm transition-shadow`}
                                    style={{ top: `${top}px`, height: `${height}px` }}
                                    onClick={() => handleViewAppointment(apt.appointment_id)}
                                  >
                                    <div className="font-semibold truncate">{apt.contact_name || apt.service_type || 'Appointment'}</div>
                                    <div className="text-[11px] opacity-80">
                                      {formatTime(startMs, displayTimezone)}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Appointment Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Appointment Details</DialogTitle>
          </DialogHeader>
          {selectedAppointment ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Customer</div>
                  <div className="font-medium text-slate-900">{selectedAppointment.contact_name || '-'}</div>
                  <div className="text-sm text-slate-500">{selectedAppointment.contact_email || selectedAppointment.contact_phone || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Status</div>
                  {(() => {
                    const s = statusBadge(selectedAppointment.status);
                    return (
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${s.className}`}>
                        {s.label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Start</div>
                  <div className="font-medium text-slate-900">{formatDateTime(selectedAppointment.scheduled_start, displayTimezone)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">End</div>
                  <div className="font-medium text-slate-900">{formatDateTime(selectedAppointment.scheduled_end, displayTimezone)}</div>
                </div>
              </div>

              {selectedAppointment.address?.street || selectedAppointment.address?.city ? (
                <div>
                  <div className="text-xs text-slate-500 mb-1">Address</div>
                  {(() => {
                    const line = [selectedAppointment.address?.street, selectedAppointment.address?.city, selectedAppointment.address?.state, selectedAppointment.address?.zip]
                      .filter(Boolean)
                      .join(', ');
                    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(line)}`;
                    return (
                      <a className="text-sm text-emerald-600 hover:text-emerald-700 underline" href={mapUrl} target="_blank" rel="noreferrer">
                        {line}
                      </a>
                    );
                  })()}
                </div>
              ) : null}

              <div>
                <div className="text-xs text-slate-500 mb-1">Confirmation link</div>
                {selectedAppointment.booking_link ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <a
                      className="text-emerald-600 hover:text-emerald-700 underline"
                      href={selectedAppointment.booking_link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open link
                    </a>
                    <button
                      className={outlineBtnCls + ' text-xs px-2 py-1'}
                      onClick={() => navigator.clipboard?.writeText?.(selectedAppointment.booking_link)}
                    >
                      Copy
                    </button>
                    {typeof selectedAppointment.booking_link_expires_at === 'number' && selectedAppointment.booking_link_expires_at < Date.now() ? (
                      <span className="text-xs text-slate-400">Expired</span>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Not sent yet</div>
                )}
              </div>

              {selectedAppointment.notes ? (
                <div>
                  <div className="text-xs text-slate-500 mb-1">Notes</div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{selectedAppointment.notes}</div>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button className={outlineBtnCls} onClick={() => handleEditAppointment(selectedAppointment)}>
                  <IconEdit stroke={1.5} className="h-4 w-4 mr-2 inline-block" />
                  Edit
                </button>
                <button className={destructiveBtnCls} onClick={() => handleDeleteClick(selectedAppointment)}>
                  <IconTrash stroke={1.5} className="h-4 w-4 mr-2 inline-block" />
                  Delete
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Create Appointment Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New Appointment</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Customer name</div>
              <input className={inputCls} value={createDraft.contact_name} onChange={(e) => setCreateDraft((p: any) => ({ ...p, contact_name: e.target.value }))} placeholder="e.g., John Doe" />
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Customer email (optional)</div>
              <input className={inputCls} value={createDraft.contact_email} onChange={(e) => setCreateDraft((p: any) => ({ ...p, contact_email: e.target.value }))} placeholder="e.g., john@email.com" />
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Customer phone (optional)</div>
              <input className={inputCls} value={createDraft.contact_phone} onChange={(e) => setCreateDraft((p: any) => ({ ...p, contact_phone: e.target.value }))} placeholder="e.g., +18324041336" />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Date</div>
              <input type="date" className={inputCls} value={createDraft.date} onChange={(e) => setCreateDraft((p: any) => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Start time</div>
              <input type="time" className={inputCls} value={createDraft.start_time} onChange={(e) => setCreateDraft((p: any) => ({ ...p, start_time: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Duration (minutes)</div>
              <input type="number" className={inputCls} value={createDraft.duration_minutes} onChange={(e) => setCreateDraft((p: any) => ({ ...p, duration_minutes: e.target.value }))} min={10} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Service</div>
              <input className={inputCls} value={createDraft.service_type} onChange={(e) => setCreateDraft((p: any) => ({ ...p, service_type: e.target.value }))} placeholder={company?.service_type || 'Service'} />
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Notes (optional)</div>
              <input className={inputCls} value={createDraft.notes} onChange={(e) => setCreateDraft((p: any) => ({ ...p, notes: e.target.value }))} placeholder="Add details for your team..." />
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Address (optional)</div>
              <input className={inputCls} value={createDraft.address_street} onChange={(e) => setCreateDraft((p: any) => ({ ...p, address_street: e.target.value }))} placeholder="Street" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                <input className={inputCls} value={createDraft.address_city} onChange={(e) => setCreateDraft((p: any) => ({ ...p, address_city: e.target.value }))} placeholder="City" />
                <input className={inputCls} value={createDraft.address_state} onChange={(e) => setCreateDraft((p: any) => ({ ...p, address_state: e.target.value }))} placeholder="State" />
                <input className={inputCls} value={createDraft.address_zip} onChange={(e) => setCreateDraft((p: any) => ({ ...p, address_zip: e.target.value }))} placeholder="Zip" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Price (optional)</div>
              <input className={inputCls} value={createDraft.price} onChange={(e) => setCreateDraft((p: any) => ({ ...p, price: e.target.value }))} placeholder="e.g., 149.00" />
            </div>

            <div className="sm:col-span-2 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Recurring appointment</label>
                <input
                  type="checkbox"
                  checked={!!createDraft.recurrence_enabled}
                  onChange={(e) => setCreateDraft((p: any) => ({ ...p, recurrence_enabled: e.target.checked }))}
                />
              </div>
              {createDraft.recurrence_enabled ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                  <select
                    className={inputCls}
                    value={createDraft.recurrence_frequency}
                    onChange={(e) => setCreateDraft((p: any) => ({ ...p, recurrence_frequency: e.target.value }))}
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                  <input
                    type="number"
                    className={inputCls}
                    value={createDraft.recurrence_interval}
                    onChange={(e) => setCreateDraft((p: any) => ({ ...p, recurrence_interval: e.target.value }))}
                    placeholder="Interval"
                    min={1}
                  />
                  <input
                    type="number"
                    className={inputCls}
                    value={createDraft.recurrence_count}
                    onChange={(e) => setCreateDraft((p: any) => ({ ...p, recurrence_count: e.target.value }))}
                    placeholder="Occurrences"
                    min={1}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button className={outlineBtnCls} onClick={() => setIsCreateOpen(false)}>Cancel</button>
            <button className={primaryBtnCls} onClick={handleCreate}>Create</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Calendar Provider Dialog */}
      <Dialog open={isCalendarProviderDialogOpen} onOpenChange={setIsCalendarProviderDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose Calendar Provider</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {[
              { id: 'GOOGLE' as const, title: 'Google Calendar', desc: 'Connect your Google/Gmail calendar' },
              { id: 'MICROSOFT' as const, title: 'Outlook / Microsoft 365', desc: 'Connect your Outlook or Microsoft calendar' },
              { id: 'APPLE' as const, title: 'Apple iCloud Calendar', desc: 'Connect your iCloud calendar using app-specific password' },
            ].map(({ id, title, desc }) => (
              <button
                key={id}
                className={`w-full border rounded-lg p-4 text-left transition ${
                  selectedProvider === id
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => setSelectedProvider(id)}
              >
                <div className="font-semibold text-slate-900">{title}</div>
                <div className="text-sm text-slate-500 mt-1">{desc}</div>
              </button>
            ))}
          </div>

          {showAppleForm ? (
            <div className="space-y-4 mt-4 border-t border-slate-100 pt-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="text-sm font-semibold text-slate-900 mb-2">How to create an app-specific password:</div>
                <ol className="text-sm text-slate-700 space-y-1 list-decimal list-inside">
                  <li>Go to <a href="https://appleid.apple.com" target="_blank" rel="noopener noreferrer" className="underline text-emerald-600">appleid.apple.com</a></li>
                  <li>Sign in with your Apple ID</li>
                  <li>Go to "Sign-In and Security" &rarr; "App-Specific Passwords"</li>
                  <li>Click "Generate an app-specific password"</li>
                  <li>Enter a label (e.g., "HandyCall Calendar")</li>
                  <li>Copy the generated password (format: xxxx-xxxx-xxxx-xxxx)</li>
                </ol>
              </div>
              <div className="space-y-3">
                <div>
                  <label htmlFor="apple-email" className="text-xs text-slate-500 block mb-1">Apple ID Email</label>
                  <input
                    id="apple-email"
                    type="email"
                    className={inputCls}
                    value={appleEmail}
                    onChange={(e) => setAppleEmail(e.target.value)}
                    placeholder="your.email@icloud.com"
                  />
                </div>
                <div>
                  <label htmlFor="apple-password" className="text-xs text-slate-500 block mb-1">App-Specific Password</label>
                  <input
                    id="apple-password"
                    type="password"
                    className={inputCls}
                    value={applePassword}
                    onChange={(e) => setApplePassword(e.target.value)}
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                  />
                  <div className="text-xs text-slate-500 mt-1">This password is stored securely and only used for calendar access</div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className={outlineBtnCls} onClick={() => { setShowAppleForm(false); setAppleEmail(''); setApplePassword(''); }}>
                  Back
                </button>
                <button className={primaryBtnCls} onClick={handleConnectApple} disabled={!appleEmail || !applePassword}>
                  Connect
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2 mt-4">
              <button className={outlineBtnCls} onClick={() => setIsCalendarProviderDialogOpen(false)}>Cancel</button>
              <button className={primaryBtnCls} onClick={handleConnectExternalCalendar} disabled={!selectedProvider}>Connect</button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Setup Dialog */}
      <Dialog open={isSetupOpen} onOpenChange={setIsSetupOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Set up your calendar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                className={`border rounded-lg p-4 text-left transition ${
                  setupChoice === 'INTERNAL' ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => setSetupChoice('INTERNAL')}
              >
                <div className="font-semibold text-slate-900">Create new calendar</div>
                <div className="text-sm text-slate-500 mt-1">Manage appointments inside HandyCall. Best option to start.</div>
              </button>
              <button
                className={`border rounded-lg p-4 text-left transition ${
                  setupChoice === 'EXTERNAL' ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => setSetupChoice('EXTERNAL')}
              >
                <div className="font-semibold text-slate-900">Connect existing calendar</div>
                <div className="text-sm text-slate-500 mt-1">Google / Outlook / Apple sync (UI now; sync wiring next).</div>
              </button>
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1">Timezone</div>
              <Select value={setupTimezone} onValueChange={setSetupTimezone}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {!hasTimezoneOption(setupTimezone) && setupTimezone ? (
                    <SelectItem value={setupTimezone}>{setupTimezone}</SelectItem>
                  ) : null}
                  {TIMEZONE_OPTIONS.map((timezone) => (
                    <SelectItem key={timezone.value} value={timezone.value}>
                      {timezone.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className={outlineBtnCls} onClick={() => setIsSetupOpen(false)}>Cancel</button>
              <button className={primaryBtnCls} onClick={handleCompleteSetup} disabled={!setupChoice}>Save</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Appointment Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Appointment</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Customer name</div>
              <input className={inputCls} value={editDraft.contact_name || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, contact_name: e.target.value }))} placeholder="e.g., John Doe" />
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Customer email</div>
              <input className={inputCls} value={editDraft.contact_email || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, contact_email: e.target.value }))} placeholder="e.g., john@email.com" />
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Customer phone</div>
              <input className={inputCls} value={editDraft.contact_phone || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, contact_phone: e.target.value }))} placeholder="e.g., +18324041336" />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Date</div>
              <input type="date" className={inputCls} value={editDraft.date || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Start time</div>
              <input type="time" className={inputCls} value={editDraft.start_time || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, start_time: e.target.value }))} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Duration (minutes)</div>
              <input type="number" className={inputCls} value={editDraft.duration_minutes || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, duration_minutes: e.target.value }))} min={10} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Service</div>
              {Array.isArray(company?.booking_services) && company.booking_services.filter((s: any) => s?.active !== false).length > 0 ? (
                <select
                  className={inputCls}
                  value={editDraft.selected_service_id || ''}
                  onChange={(e) => {
                    const svc = (company.booking_services as any[]).find((s: any) => s.service_id === e.target.value);
                    setEditDraft((p: any) => ({
                      ...p,
                      selected_service_id: svc?.service_id || '',
                      service_type: svc?.name || p.service_type,
                      price: svc ? String((svc.amount_cents / 100).toFixed(2)) : p.price,
                    }));
                  }}
                >
                  <option value="">— Pick a service —</option>
                  {(company.booking_services as any[])
                    .filter((s: any) => s?.active !== false)
                    .map((s: any) => (
                      <option key={s.service_id} value={s.service_id}>
                        {s.name}
                        {s.amount_cents ? ` · $${(s.amount_cents / 100).toFixed(2)}` : ''}
                      </option>
                    ))}
                </select>
              ) : (
                <input className={inputCls} value={editDraft.service_type || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, service_type: e.target.value }))} placeholder={company?.service_type || 'Service'} />
              )}
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Status</div>
              <select
                className={inputCls}
                value={editDraft.status || 'SCHEDULED'}
                onChange={(e) => setEditDraft((p: any) => ({ ...p, status: e.target.value }))}
              >
                <option value="SCHEDULED">Scheduled</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Notes</div>
              <input className={inputCls} value={editDraft.notes || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, notes: e.target.value }))} placeholder="Add details..." />
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Address</div>
              <input className={inputCls} value={editDraft.address_street || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, address_street: e.target.value }))} placeholder="Street" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                <input className={inputCls} value={editDraft.address_city || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, address_city: e.target.value }))} placeholder="City" />
                <input className={inputCls} value={editDraft.address_state || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, address_state: e.target.value }))} placeholder="State" />
                <input className={inputCls} value={editDraft.address_zip || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, address_zip: e.target.value }))} placeholder="Zip" />
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Price</div>
              <input className={inputCls} value={editDraft.price || ''} onChange={(e) => setEditDraft((p: any) => ({ ...p, price: e.target.value }))} placeholder="e.g., 149.00" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button className={outlineBtnCls} onClick={() => setIsEditOpen(false)}>Cancel</button>
            <button className={primaryBtnCls} onClick={handleUpdateAppointment}>Save Changes</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Appointment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Are you sure you want to delete this appointment? This action cannot be undone.
            </p>
            {appointmentToDelete && (
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="font-medium text-slate-900">
                  {appointmentToDelete.contact_name || appointmentToDelete.service_type || 'Appointment'}
                </div>
                <div className="text-sm text-slate-500 mt-1">
                  {formatDateTime(appointmentToDelete.scheduled_start, displayTimezone)}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button className={outlineBtnCls} onClick={() => setIsDeleteConfirmOpen(false)} disabled={isDeleting}>Cancel</button>
              <button className={destructiveBtnCls} onClick={handleConfirmDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Calendar Settings Dialog */}
      <Dialog open={isCalendarSettingsOpen} onOpenChange={setIsCalendarSettingsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Calendar Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isExternalCalendarConnected && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-emerald-700">
                    Connected to {
                      company?.calendar_provider === 'GOOGLE' ? 'Google Calendar' :
                      company?.calendar_provider === 'MICROSOFT' ? 'Microsoft Outlook' :
                      company?.calendar_provider === 'APPLE' ? 'Apple Calendar' :
                      'External Calendar'
                    }
                  </span>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-900">Timezone</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {calendarTimezone || 'Not set yet'}
                    {isExternalCalendarConnected ? ' (from connected calendar)' : ''}
                  </div>
                </div>
                {!isExternalCalendarConnected && (
                  <div className="w-full max-w-xs">
                    <Select value={calendarTimezone} onValueChange={setCalendarTimezone}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {!hasTimezoneOption(calendarTimezone) && calendarTimezone ? (
                          <SelectItem value={calendarTimezone}>{calendarTimezone}</SelectItem>
                        ) : null}
                        {TIMEZONE_OPTIONS.map((timezone) => (
                          <SelectItem key={timezone.value} value={timezone.value}>
                            {timezone.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-900">Weekly working hours</div>
              <div className="text-xs text-slate-500 mt-1">Set one or more available time windows per day.</div>

              <div className="mt-4 space-y-3">
                {WEEKDAYS.map(({ key, label }) => {
                  const day = businessHoursDraft[key] || {};
                  const segments = Array.isArray(day.segments) ? day.segments : [];
                  const closed = !!day.closed || segments.length === 0;
                  return (
                    <div key={key} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">{label}</div>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={closed}
                            onChange={(e) => {
                              const nextClosed = e.target.checked;
                              setBusinessHoursDraft((prev) => ({
                                ...prev,
                                [key]: nextClosed
                                  ? { closed: true, segments: [] }
                                  : { closed: false, segments: [{ open: '09:00', close: '17:00' }] },
                              }));
                            }}
                          />
                          Closed
                        </label>
                      </div>

                      {!closed && (
                        <div className="mt-3 space-y-2">
                          {segments.map((seg, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                type="time"
                                className={inputCls}
                                value={seg.open}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setBusinessHoursDraft((prev) => {
                                    const cur = prev[key] || {};
                                    const nextSegs = (Array.isArray(cur.segments) ? [...cur.segments] : []).map((s, i) =>
                                      i === idx ? { ...s, open: v } : s
                                    );
                                    return { ...prev, [key]: { ...cur, closed: false, segments: nextSegs } };
                                  });
                                }}
                              />
                              <span className="text-sm text-slate-500">to</span>
                              <input
                                type="time"
                                className={inputCls}
                                value={seg.close}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setBusinessHoursDraft((prev) => {
                                    const cur = prev[key] || {};
                                    const nextSegs = (Array.isArray(cur.segments) ? [...cur.segments] : []).map((s, i) =>
                                      i === idx ? { ...s, close: v } : s
                                    );
                                    return { ...prev, [key]: { ...cur, closed: false, segments: nextSegs } };
                                  });
                                }}
                              />
                              <button
                                className={iconBtnCls}
                                onClick={() => {
                                  setBusinessHoursDraft((prev) => {
                                    const cur = prev[key] || {};
                                    const nextSegs = (Array.isArray(cur.segments) ? [...cur.segments] : []).filter((_, i) => i !== idx);
                                    return { ...prev, [key]: nextSegs.length ? { ...cur, closed: false, segments: nextSegs } : { closed: true, segments: [] } };
                                  });
                                }}
                              >
                                <IconX stroke={1.5} className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            className={outlineBtnCls + ' text-xs px-3 py-1.5'}
                            onClick={() => {
                              setBusinessHoursDraft((prev) => {
                                const cur = prev[key] || {};
                                const nextSegs = Array.isArray(cur.segments) ? [...cur.segments] : [];
                                nextSegs.push({ open: '09:00', close: '17:00' });
                                return { ...prev, [key]: { ...cur, closed: false, segments: nextSegs } };
                              });
                            }}
                          >
                            <IconPlus stroke={1.5} className="h-3 w-3 mr-1 inline-block" />
                            Add timeframe
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-900">Date exceptions</div>
              <div className="text-xs text-slate-500 mt-1">Override availability for a specific date (vacation, holidays, partial day).</div>

              <div className="mt-4 space-y-3">
                {(dateOverridesDraft || []).map((o, idx) => {
                  const segments = Array.isArray(o.segments) ? o.segments : [];
                  const closed = !!o.closed || segments.length === 0;
                  return (
                    <div key={`${o.date}-${idx}`} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            className={inputCls}
                            value={o.date}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDateOverridesDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, date: v } : x)));
                            }}
                          />
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={closed}
                              onChange={(e) => {
                                const nextClosed = e.target.checked;
                                setDateOverridesDraft((prev) =>
                                  prev.map((x, i) =>
                                    i === idx
                                      ? nextClosed
                                        ? { ...x, closed: true, segments: [] }
                                        : { ...x, closed: false, segments: [{ open: '09:00', close: '17:00' }] }
                                      : x
                                  )
                                );
                              }}
                            />
                            Closed
                          </label>
                        </div>
                        <button
                          className={iconBtnCls}
                          onClick={() => setDateOverridesDraft((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <IconTrash stroke={1.5} className="h-4 w-4" />
                        </button>
                      </div>

                      {!closed && (
                        <div className="mt-3 space-y-2">
                          {segments.map((seg, sIdx) => (
                            <div key={sIdx} className="flex items-center gap-2">
                              <input
                                type="time"
                                className={inputCls}
                                value={seg.open}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDateOverridesDraft((prev) =>
                                    prev.map((x, i) => {
                                      if (i !== idx) return x;
                                      const nextSegs = (Array.isArray(x.segments) ? [...x.segments] : []).map((s, j) =>
                                        j === sIdx ? { ...s, open: v } : s
                                      );
                                      return { ...x, segments: nextSegs, closed: false };
                                    })
                                  );
                                }}
                              />
                              <span className="text-sm text-slate-500">to</span>
                              <input
                                type="time"
                                className={inputCls}
                                value={seg.close}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setDateOverridesDraft((prev) =>
                                    prev.map((x, i) => {
                                      if (i !== idx) return x;
                                      const nextSegs = (Array.isArray(x.segments) ? [...x.segments] : []).map((s, j) =>
                                        j === sIdx ? { ...s, close: v } : s
                                      );
                                      return { ...x, segments: nextSegs, closed: false };
                                    })
                                  );
                                }}
                              />
                              <button
                                className={iconBtnCls}
                                onClick={() => {
                                  setDateOverridesDraft((prev) =>
                                    prev.map((x, i) => {
                                      if (i !== idx) return x;
                                      const nextSegs = (Array.isArray(x.segments) ? [...x.segments] : []).filter((_, j) => j !== sIdx);
                                      return nextSegs.length ? { ...x, segments: nextSegs, closed: false } : { ...x, segments: [], closed: true };
                                    })
                                  );
                                }}
                              >
                                <IconX stroke={1.5} className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            className={outlineBtnCls + ' text-xs px-3 py-1.5'}
                            onClick={() => {
                              setDateOverridesDraft((prev) =>
                                prev.map((x, i) => {
                                  if (i !== idx) return x;
                                  const nextSegs = Array.isArray(x.segments) ? [...x.segments] : [];
                                  nextSegs.push({ open: '09:00', close: '17:00' });
                                  return { ...x, segments: nextSegs, closed: false };
                                })
                              );
                            }}
                          >
                            <IconPlus stroke={1.5} className="h-3 w-3 mr-1 inline-block" />
                            Add timeframe
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  className={outlineBtnCls + ' text-xs px-3 py-1.5'}
                  onClick={() =>
                    setDateOverridesDraft((prev) => [
                      ...prev,
                      { date: ymd(new Date()), closed: true, segments: [] },
                    ])
                  }
                >
                  <IconPlus stroke={1.5} className="h-3 w-3 mr-1 inline-block" />
                  Add date exception
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              {isExternalCalendarConnected ? (
                <button
                  className="border border-red-200 text-red-600 hover:bg-red-50 rounded-lg px-4 py-2 text-sm transition-colors"
                  onClick={() => setIsDeleteCalendarConfirmOpen(true)}
                >
                  <IconTrash stroke={1.5} className="h-4 w-4 mr-2 inline-block" />
                  Disconnect Calendar
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <button className={outlineBtnCls} onClick={() => setIsCalendarSettingsOpen(false)}>Cancel</button>
                <button className={primaryBtnCls} onClick={handleSaveCalendarSettings}>Save</button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Calendar Confirmation Dialog */}
      <Dialog open={isDeleteCalendarConfirmOpen} onOpenChange={setIsDeleteCalendarConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect Calendar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Are you sure you want to disconnect your calendar? Your appointments will remain, but new events won&apos;t sync with your external calendar.
            </p>
            <div className="flex justify-end gap-2">
              <button className={outlineBtnCls} onClick={() => setIsDeleteCalendarConfirmOpen(false)} disabled={isDisconnecting}>Cancel</button>
              <button className={destructiveBtnCls} onClick={handleDisconnectCalendar} disabled={isDisconnecting}>
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
