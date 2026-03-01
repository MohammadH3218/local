'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

type AppointmentInfo = {
  appointment_id: string;
  scheduled_start: number;
  scheduled_end: number;
  status: string;
  service_type?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: { street?: string; city?: string; state?: string; zip?: string };
  notes?: string;
};

type BookingInfo = {
  mode?: 'book' | 'manage';
  company_name: string;
  service_type?: string;
  timezone?: string;
  phone_number?: string;
  email?: string;
  appointment?: AppointmentInfo;
  collected_info?: Record<string, any>;
  intake_schema?: {
    required?: string[];
    optional?: string[];
    labels?: Record<string, string>;
  };
};

type BookingPaymentInfo = {
  enabled: boolean;
  payment_mode?: 'HANDYCALL_MANAGED' | 'SELF_MANAGED';
  disabled_reason?: string;
  paid: boolean;
  process_note?: string;
  preselected_service_id?: string;
  preselected_service_name?: string;
  preselected_billing_type?: 'ONE_TIME' | 'SUBSCRIPTION';
  services?: Array<{
    service_id: string;
    name: string;
    description?: string;
    amount_cents: number;
    currency?: string;
    billing_type?: 'ONE_TIME' | 'SUBSCRIPTION';
    billing_interval?: 'day' | 'week' | 'month' | 'year';
    billing_interval_count?: number;
  }>;
  default_currency?: string;
  recommended_amount_cents?: number;
  security_note?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const KNOWN_FIELDS = new Set([
  'full_name',
  'name',
  'email',
  'phone',
  'phone_number',
  'phone_number_verification',
  'address',
  'service_address',
  'location_address',
  'pickup_location',
  'dropoff_location',
  'zip',
  'zipcode',
  'preferred_time',
]);

function titleize(input: string) {
  return String(input || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatSlotLabel(slotIso: string, timeZone?: string) {
  const date = new Date(slotIso);
  if (!Number.isFinite(date.getTime())) return slotIso;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
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

function formatDateInputValue(timestamp: number, timeZone?: string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function formatTimeInputValue(timestamp: number, timeZone?: string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = parts.find((p) => p.type === 'hour')?.value || '00';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    return `${hour}:${minute}`;
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

function formatTimeRange(startMs: number, endMs: number, timeZone?: string) {
  const start = new Date(startMs);
  const end = new Date(endMs);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '';
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  } catch {
    return `${start.toLocaleTimeString()} - ${end.toLocaleTimeString()}`;
  }
}

function formatMoney(cents?: number, currency = 'usd') {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export default function BookingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [linkClosed, setLinkClosed] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState('');
  const [availabilityDays, setAvailabilityDays] = useState<Record<string, { slots: string[]; readable_slots: string[]; available: boolean }>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [daySlots, setDaySlots] = useState<string[]>([]);
  const [paymentInfo, setPaymentInfo] = useState<BookingPaymentInfo | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [paymentIntentSecret, setPaymentIntentSecret] = useState<string | null>(null);
  const [paymentPublishableKey, setPaymentPublishableKey] = useState<string | null>(null);
  const [creatingPaymentIntent, setCreatingPaymentIntent] = useState(false);
  const stripePromise = useMemo(
    () => (paymentPublishableKey ? loadStripe(paymentPublishableKey) : null),
    [paymentPublishableKey],
  );

  const refreshInfo = useCallback(async () => {
    if (!token || !API_BASE) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/public/booking/${token}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || 'Failed to load booking details');
      }
      setInfo(data);
      setLinkClosed(false);
      setPaymentIntentSecret(null);

      const appointment = data?.appointment as AppointmentInfo | undefined;
      const collected = data?.collected_info || {};

      setFullName(
        appointment?.contact_name ||
          collected?.full_name ||
          collected?.name ||
          ''
      );
      setEmail(appointment?.contact_email || data?.email || '');
      setPhone(appointment?.contact_phone || data?.phone_number || '');

      const address = appointment?.address || {};
      const fallbackAddress = typeof collected?.address === 'string' ? collected.address : '';
      setStreet(address.street || fallbackAddress || '');
      setCity(address.city || '');
      setState(address.state || '');
      setZip(address.zip || collected?.zip || '');

      if (appointment?.scheduled_start) {
        setDate(formatDateInputValue(appointment.scheduled_start, data?.timezone));
        setTime(formatTimeInputValue(appointment.scheduled_start, data?.timezone));
        setCalendarMonth(new Date(appointment.scheduled_start));
      }

      const required = data?.intake_schema?.required || [];
      const optional = data?.intake_schema?.optional || [];
      const all = Array.from(new Set([...(required || []), ...(optional || [])]));
      const customKeys = all.filter((field: string) => !KNOWN_FIELDS.has(String(field).toLowerCase()));
      const nextCustom: Record<string, string> = {};
      for (const key of customKeys) {
        const value = collected?.[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          nextCustom[key] = String(value);
        }
      }
      setCustomFields(nextCustom);

      try {
        setPaymentLoading(true);
        setPaymentError(null);
        const paymentRes = await fetch(`${API_BASE}/public/booking/${token}/payment-info`);
        const paymentData = await paymentRes.json();
        if (paymentRes.ok) {
          setPaymentInfo(paymentData as BookingPaymentInfo);
          const services = paymentData?.services || [];
          const preferredServiceId =
            paymentData?.preselected_service_id ||
            (services[0] ? services[0].service_id : '');
          setSelectedServiceId((current) =>
            current && services.some((service: any) => service.service_id === current)
              ? current
              : preferredServiceId,
          );
        } else {
          setPaymentInfo(null);
        }
      } catch {
        setPaymentInfo(null);
      } finally {
        setPaymentLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load booking info');
      setInfo(null);
    } finally {
      setLoading(false);
    };
  }, [token]);

  useEffect(() => {
    void refreshInfo();
  }, [refreshInfo]);

  useEffect(() => {
    const checkoutStatus = searchParams?.get('checkout');
    const checkoutSessionId = searchParams?.get('session_id');
    if (checkoutStatus === 'success') {
      setNotice('Payment checkout completed. We are syncing your payment status.');
      if (checkoutSessionId) {
        void (async () => {
          try {
            await fetch(`${API_BASE}/public/booking/${token}/checkout-confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: checkoutSessionId }),
            });
          } catch {
            // Best effort reconciliation. Refresh will still re-read current state.
          } finally {
            await refreshInfo();
          }
        })();
      } else {
        void refreshInfo();
      }
    } else if (checkoutStatus === 'cancel') {
      setPaymentError('Checkout was canceled. You can try again when ready.');
    }
  }, [searchParams, refreshInfo, token]);

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(calendarMonth);
  }, [calendarMonth]);

  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const todayMonthMs = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }, []);

  const maxCalendarMonthMs = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 2, 1).getTime();
  }, []);

  const canGoPrev = calendarMonth.getTime() > todayMonthMs;
  const canGoNext = calendarMonth.getTime() < maxCalendarMonthMs;

  const monthRange = useMemo(() => {
    const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    return {
      start,
      end,
      startKey: start.toISOString().slice(0, 10),
      endKey: end.toISOString().slice(0, 10),
    };
  }, [calendarMonth]);

  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const startDow = new Date(year, month, 1).getDay();
    const totalDays = monthRange.end.getDate();
    const days: Array<{ dateKey: string; day: number; muted: boolean }> = [];
    for (let i = 0; i < startDow; i += 1) {
      days.push({ dateKey: `blank-${i}`, day: 0, muted: true });
    }
    for (let day = 1; day <= totalDays; day += 1) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ dateKey, day, muted: false });
    }
    return days;
  }, [calendarMonth, monthRange.end]);

  const loadAvailability = useCallback(async () => {
    if (!token || !API_BASE) return;
    try {
      setAvailabilityLoading(true);
      setAvailabilityDays({});
      const res = await fetch(`${API_BASE}/public/booking/${token}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: monthRange.startKey, end_date: monthRange.endKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || 'Failed to load availability');
      }
      const next: Record<string, { slots: string[]; readable_slots: string[]; available: boolean }> = {};
      for (const day of data?.days || []) {
        if (day?.date) {
          const slots = Array.isArray(day.slots) ? day.slots : [];
          const readableSlots = Array.isArray(day.readable_slots) ? day.readable_slots : [];
          const hasSlots = slots.length > 0 || readableSlots.length > 0;
          next[day.date] = {
            slots,
            readable_slots: readableSlots,
            available: Boolean(day.available) && hasSlots,
          };
        }
      }
      setAvailabilityDays(next);
    } catch (err: any) {
      console.error('[booking] availability load failed', err);
    } finally {
      setAvailabilityLoading(false);
    }
  }, [token, monthRange.startKey, monthRange.endKey]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  useEffect(() => {
    if (!date) {
      setDaySlots([]);
      return;
    }
    const day = availabilityDays[date];
    setDaySlots(day?.slots || []);
    setTime('');
  }, [date, availabilityDays]);

  const slotsForSelectedDay = useMemo(() => {
    if (!date) return [];
    return daySlots.filter((slot) => formatDateInputValue(Date.parse(slot), info?.timezone) === date);
  }, [daySlots, date, info?.timezone]);

  const fields = useMemo(() => {
    const required = info?.intake_schema?.required || [];
    const optional = info?.intake_schema?.optional || [];
    const all = Array.from(new Set([...required, ...optional]));
    return { required, optional, all };
  }, [info]);

  const labels = info?.intake_schema?.labels || {};
  const labelFor = (key: string) => labels[key] || titleize(key);

  const customKeys = fields.all.filter((f) => !KNOWN_FIELDS.has(String(f).toLowerCase()));

  const isRequired = (key: string) =>
    fields.required.some((f) => String(f).toLowerCase() === String(key).toLowerCase());

  const requiresAddress = fields.all.some((f) =>
    ['address', 'service_address', 'location_address', 'pickup_location', 'dropoff_location'].includes(
      String(f).toLowerCase()
    )
  );
  const requiresZip = fields.all.some((f) => ['zip', 'zipcode'].includes(String(f).toLowerCase()));
  const requiresEmail = fields.all.some((f) => String(f).toLowerCase() === 'email');
  const requiresName = fields.all.some((f) => ['full_name', 'name'].includes(String(f).toLowerCase()));
  const requiresTime = fields.all.some((f) => String(f).toLowerCase() === 'preferred_time');

  const handleCustomChange = (key: string, value: string) => {
    setCustomFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      setNotice(null);
      const payload = {
        full_name: fullName || undefined,
        email: email || undefined,
        phone_number: phone || undefined,
        preferred_date: date || undefined,
        preferred_time: time || undefined,
        address: {
          street: street || undefined,
          city: city || undefined,
          state: state || undefined,
          zip: zip || undefined,
        },
        zip: zip || undefined,
        custom_fields: customFields,
      };
      const res = await fetch(`${API_BASE}/public/booking/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || 'Unable to book appointment');
      }
      setNotice('Booking confirmed. Check your email for your confirmation link.');
      await refreshInfo();
    } catch (err: any) {
      setError(err?.message || 'Unable to book appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    try {
      setUpdating(true);
      setError(null);
      setNotice(null);
      const payload = {
        full_name: fullName || undefined,
        email: email || undefined,
        phone_number: phone || undefined,
        address: {
          street: street || undefined,
          city: city || undefined,
          state: state || undefined,
          zip: zip || undefined,
        },
        custom_fields: customFields,
      };
      const res = await fetch(`${API_BASE}/public/booking/${token}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || 'Unable to update appointment');
      }
      setNotice('Details updated.');
      if (data?.appointment) {
        setInfo((prev) => (prev ? { ...prev, appointment: data.appointment } : prev));
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to update appointment');
    } finally {
      setUpdating(false);
    }
  };

  const handleReschedule = async () => {
    try {
      if (!date || !time) {
        setError('Please select a new date and time.');
        return;
      }
      setRescheduling(true);
      setError(null);
      setNotice(null);
      const payload = {
        preferred_date: date || undefined,
        preferred_time: time || undefined,
      };
      const res = await fetch(`${API_BASE}/public/booking/${token}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || 'Unable to reschedule appointment');
      }
      setNotice('Appointment rescheduled.');
      if (data?.appointment) {
        setInfo((prev) => (prev ? { ...prev, appointment: data.appointment } : prev));
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to reschedule appointment');
    } finally {
      setRescheduling(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Cancel this appointment?')) return;
    try {
      setCancelling(true);
      setError(null);
      setNotice(null);
      const payload = {
        reason: cancelReason || undefined,
      };
      const res = await fetch(`${API_BASE}/public/booking/${token}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || 'Unable to cancel appointment');
      }
      setNotice('Appointment cancelled. This link is now closed.');
      setLinkClosed(true);
    } catch (err: any) {
      setError(err?.message || 'Unable to cancel appointment');
    } finally {
      setCancelling(false);
    }
  };

  const createPaymentIntent = async () => {
    try {
      setCreatingPaymentIntent(true);
      setPaymentError(null);
      const res = await fetch(`${API_BASE}/public/booking/${token}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: selectedServiceId || undefined,
          customer_name: fullName || undefined,
          customer_email: email || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error?.message || 'Unable to initialize payment');
      }
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setPaymentIntentSecret(data?.client_secret || null);
      setPaymentPublishableKey(data?.publishable_key || null);
    } catch (err: any) {
      setPaymentError(err?.message || 'Unable to initialize payment');
    } finally {
      setCreatingPaymentIntent(false);
    }
  };

  const handlePaymentSuccess = async () => {
    setNotice('Payment received successfully.');
    setPaymentIntentSecret(null);
    await refreshInfo();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Loading booking form...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Booking Link Unavailable</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700">{error}</p>
              <p className="text-gray-600 mt-2">
                If you still need help, please call the business directly.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const mode = info?.mode === 'manage' ? 'manage' : 'book';
  const appointment = info?.appointment;
  const appointmentLabel = appointment
    ? formatSlotLabel(new Date(appointment.scheduled_start).toISOString(), info?.timezone)
    : '';
  const appointmentStartMs = appointment?.scheduled_start;
  const appointmentEndMs =
    appointment?.scheduled_end ??
    (appointmentStartMs ? appointmentStartMs + 60 * 60 * 1000 : undefined);
  const appointmentTimeRange =
    appointmentStartMs && appointmentEndMs
      ? formatTimeRange(appointmentStartMs, appointmentEndMs, info?.timezone)
      : '';
  const addressLine = [street, city, state, zip].filter(Boolean).join(', ');
  const mapQuery = addressLine ? encodeURIComponent(addressLine) : '';
  const mapEmbedUrl = mapQuery ? `https://maps.google.com/maps?output=embed&q=${mapQuery}` : '';
  const mapLink = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${mapQuery}` : '';
  const selectedPaymentService = (paymentInfo?.services || []).find((service) => service.service_id === selectedServiceId)
    || (paymentInfo?.services || [])[0]
    || null;
  const selectedServiceBillingLabel =
    selectedPaymentService?.billing_type === 'SUBSCRIPTION'
      ? `Subscription${selectedPaymentService?.billing_interval ? ` · every ${selectedPaymentService.billing_interval_count || 1} ${selectedPaymentService.billing_interval}${(selectedPaymentService.billing_interval_count || 1) > 1 ? 's' : ''}` : ''}`
      : 'One-time';

  if (mode === 'manage') {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold">Appointment details</span>
            <h1 className="text-3xl font-bold text-gray-900">{info?.company_name}</h1>
            <p className="text-gray-600">Review or adjust your appointment with our team.</p>
          </div>

          {notice ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded">
              {notice}
            </div>
          ) : null}

          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              {linkClosed ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Link Closed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700">This booking link is no longer active.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Update your details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Full Name</Label>
                          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Street</Label>
                          <Input value={street} onChange={(e) => setStreet(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>City</Label>
                          <Input value={city} onChange={(e) => setCity(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>State</Label>
                          <Input value={state} onChange={(e) => setState(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Zip</Label>
                          <Input value={zip} onChange={(e) => setZip(e.target.value)} />
                        </div>
                      </div>

                      {customKeys.length ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          {customKeys.map((key) => (
                            <div className="space-y-2" key={key}>
                              <Label>
                                {labelFor(key)}
                                {isRequired(key) ? ' *' : ''}
                              </Label>
                              <Input
                                value={customFields[key] || ''}
                                onChange={(e) => handleCustomChange(key, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <Button onClick={handleUpdate} disabled={updating}>
                        {updating ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Reschedule</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-700">{monthLabel}</div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canGoPrev}
                            onClick={() => canGoPrev && setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                          >
                            Prev
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canGoNext}
                            onClick={() => canGoNext && setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-2 text-xs text-gray-500">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                          <div key={day} className="text-center">{day}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-2">
                        {calendarDays.map((day) => {
                          if (day.muted) {
                            return <div key={day.dateKey} className="h-9" />;
                          }
                          const isPast = day.dateKey < todayKey;
                          const availability = availabilityDays[day.dateKey];
                          const isAvailable = !isPast && availability?.available;
                          const isSelected = date === day.dateKey;
                          return (
                            <button
                              key={day.dateKey}
                              type="button"
                              className={`h-9 rounded-md text-sm font-semibold transition ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : isAvailable
                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                              }`}
                              onClick={() => {
                                if (!isAvailable) return;
                                setDate(day.dateKey);
                              }}
                              disabled={!isAvailable}
                            >
                              {day.day}
                            </button>
                          );
                        })}
                      </div>
                      <div className="space-y-2">
                        <Label>Available times</Label>
                        {availabilityLoading ? (
                          <div className="text-sm text-gray-500">Loading availability…</div>
                        ) : slotsForSelectedDay.length ? (
                          <div className="flex flex-wrap gap-2">
                            {slotsForSelectedDay.map((slot) => {
                              const label = formatSlotLabel(slot, info?.timezone);
                              const slotTime = formatTimeInputValue(new Date(slot).getTime(), info?.timezone);
                              const isSelected = time === slotTime;
                              return (
                                <button
                                  type="button"
                                  key={slot}
                                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                    isSelected
                                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                                      : 'border-gray-200 text-gray-600 hover:border-emerald-300'
                                  }`}
                                  onClick={() => setTime(slotTime)}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">Select a day to see available times.</div>
                        )}
                      </div>
                      <Button onClick={handleReschedule} disabled={rescheduling}>
                        {rescheduling ? 'Rescheduling...' : 'Reschedule Appointment'}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Cancel Appointment</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Reason (optional)</Label>
                        <Textarea
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Let us know why you're cancelling"
                        />
                      </div>
                      <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
                        {cancelling ? 'Cancelling...' : 'Cancel Appointment'}
                      </Button>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{appointment?.status === 'COMPLETED' ? 'Appointment passed' : 'Appointment confirmed'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm text-gray-500">{appointmentLabel || 'Time to be confirmed'}</div>
                    {appointmentTimeRange ? (
                      <div className="text-sm text-gray-600 mt-1">{appointmentTimeRange}{info?.timezone ? ` (${info?.timezone})` : ''}</div>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="font-medium text-gray-900">
                      {appointment?.service_type || info?.service_type || 'Service appointment'}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {appointment?.contact_name || fullName || 'Customer'}
                    </div>
                    {appointment?.status ? (
                      <div className="mt-2 inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {appointment.status}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Location</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {addressLine ? (
                    <>
                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <iframe
                          title="Service location"
                          src={mapEmbedUrl}
                          className="h-48 w-full"
                          loading="lazy"
                        />
                      </div>
                      <div className="text-sm text-gray-600">{addressLine}</div>
                      <Button variant="outline" size="sm" onClick={() => window.open(mapLink, '_blank')}>Open in Maps</Button>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">Location details will appear once the address is confirmed.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {paymentLoading ? (
                    <div className="text-sm text-gray-500">Loading payment options…</div>
                  ) : paymentInfo?.enabled ? (
                    <>
                      {paymentInfo.paid ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                          Payment received. Thank you.
                        </div>
                      ) : (
                        <>
                          {selectedPaymentService ? (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{selectedPaymentService.name}</p>
                                  {selectedPaymentService.description && (
                                    <p className="text-xs text-slate-500 mt-0.5">{selectedPaymentService.description}</p>
                                  )}
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-sm font-bold text-slate-900">
                                    {formatMoney(selectedPaymentService.amount_cents, selectedPaymentService.currency || paymentInfo.default_currency || 'usd')}
                                  </p>
                                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                                    {selectedServiceBillingLabel}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (paymentInfo.services || []).length > 0 ? (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                              {paymentInfo.services![0].name} · {formatMoney(paymentInfo.services![0].amount_cents, paymentInfo.services![0].currency || paymentInfo.default_currency || 'usd')}
                            </div>
                          ) : null}
                          {!paymentIntentSecret ? (
                            <Button onClick={createPaymentIntent} disabled={creatingPaymentIntent}>
                              {creatingPaymentIntent
                                ? 'Preparing secure payment…'
                                : selectedPaymentService?.billing_type === 'SUBSCRIPTION'
                                  ? 'Start subscription checkout'
                                  : 'Pay now'}
                            </Button>
                          ) : stripePromise ? (
                            <Elements stripe={stripePromise} options={{ clientSecret: paymentIntentSecret }}>
                              <BookingPaymentForm
                                onSuccess={handlePaymentSuccess}
                                onError={(message) => setPaymentError(message)}
                              />
                            </Elements>
                          ) : (
                            <div className="text-sm text-amber-700">Payment is configured, but Stripe key is unavailable.</div>
                          )}
                          {paymentError ? <div className="text-sm text-red-600">{paymentError}</div> : null}
                          {paymentInfo.security_note ? (
                            <div className="text-xs text-gray-500">{paymentInfo.security_note}</div>
                          ) : null}
                          {paymentInfo.process_note ? (
                            <div className="text-xs text-slate-500">{paymentInfo.process_note}</div>
                          ) : null}
                        </>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-gray-600">
                      {paymentInfo?.disabled_reason || 'Payment is due at your appointment.'}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cancellation policy</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-gray-600">Need to make a change? Reschedule or cancel using this link before your appointment.</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.2em] text-emerald-600 font-semibold">Confirm your appointment</span>
          <h1 className="text-3xl font-bold text-gray-900">{info?.company_name}</h1>
          <p className="text-gray-600">Complete your details to lock in a service time.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardHeader>
              <CardTitle>Booking details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {notice ? (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded">
                  {notice}
                </div>
              ) : null}
              {error ? (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              ) : null}

              {requiresName || fields.required.length === 0 ? (
                <div className="space-y-2">
                  <Label>Full Name {requiresName ? '*' : ''}</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
              ) : null}

              {requiresEmail || fields.required.length === 0 ? (
                <div className="space-y-2">
                  <Label>Email {requiresEmail ? '*' : ''}</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

              {requiresAddress ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Street</Label>
                    <Input value={street} onChange={(e) => setStreet(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input value={state} onChange={(e) => setState(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Zip</Label>
                    <Input value={zip} onChange={(e) => setZip(e.target.value)} />
                  </div>
                </div>
              ) : requiresZip ? (
                <div className="space-y-2">
                  <Label>Zip Code</Label>
                  <Input value={zip} onChange={(e) => setZip(e.target.value)} />
                </div>
              ) : null}

              {customKeys.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {customKeys.map((key) => (
                    <div className="space-y-2" key={key}>
                      <Label>
                        {labelFor(key)}
                        {isRequired(key) ? ' *' : ''}
                      </Label>
                      <Input
                        value={customFields[key] || ''}
                        onChange={(e) => handleCustomChange(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {requiresTime || fields.required.length === 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </div>
              ) : null}

              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    id="sms-consent"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-emerald-600"
                  />
                  <span className="text-xs text-slate-600 leading-relaxed">
                    I agree to receive appointment-related text messages from{' '}
                    <strong>HandyCall</strong> (confirmations, reminders, and updates).
                    Message frequency varies. Msg &amp; data rates may apply. Reply{' '}
                    <strong>STOP</strong> to opt out, <strong>HELP</strong> for help.
                    Consent is not a condition of purchase.{' '}
                    <a href="https://handycall.org/privacy-policy" className="underline text-emerald-700" target="_blank" rel="noopener noreferrer">
                      Privacy Policy
                    </a>{' '}
                    |{' '}
                    <a href="https://handycall.org/terms" className="underline text-emerald-700" target="_blank" rel="noopener noreferrer">
                      Terms
                    </a>
                  </span>
                </label>
              </div>

              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Booking...' : 'Confirm Appointment'}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Appointment summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-gray-600">{info?.service_type || 'Service appointment'}</div>
                <div className="text-sm text-gray-500">
                  {date && time ? `Preferred time: ${date} at ${time}` : 'Choose a date and time to reserve your slot.'}
                </div>
                {info?.timezone ? (
                  <div className="text-xs text-gray-500">Timezone: {info.timezone}</div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Location</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {addressLine ? (
                  <>
                    <div className="overflow-hidden rounded-lg border border-gray-200">
                      <iframe
                        title="Service location"
                        src={mapEmbedUrl}
                        className="h-48 w-full"
                        loading="lazy"
                      />
                    </div>
                    <div className="text-sm text-gray-600">{addressLine}</div>
                    <Button variant="outline" size="sm" onClick={() => window.open(mapLink, '_blank')}>Open in Maps</Button>
                  </>
                ) : (
                  <div className="text-sm text-gray-500">Location details will appear after the appointment is confirmed.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {paymentLoading ? (
                  <div className="text-sm text-gray-500">Loading payment options…</div>
                ) : paymentInfo?.enabled ? (
                  <>
                    {paymentInfo.paid ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        Payment received. Thank you.
                      </div>
                    ) : (
                      <>
                        {selectedPaymentService ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{selectedPaymentService.name}</p>
                                {selectedPaymentService.description && (
                                  <p className="text-xs text-slate-500 mt-0.5">{selectedPaymentService.description}</p>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold text-slate-900">
                                  {formatMoney(selectedPaymentService.amount_cents, selectedPaymentService.currency || paymentInfo.default_currency || 'usd')}
                                </p>
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-500">
                                  {selectedServiceBillingLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (paymentInfo.services || []).length > 0 ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            {paymentInfo.services![0].name} · {formatMoney(paymentInfo.services![0].amount_cents, paymentInfo.services![0].currency || paymentInfo.default_currency || 'usd')}
                          </div>
                        ) : null}
                        {!paymentIntentSecret ? (
                          <Button onClick={createPaymentIntent} disabled={creatingPaymentIntent}>
                            {creatingPaymentIntent
                              ? 'Preparing secure payment…'
                              : selectedPaymentService?.billing_type === 'SUBSCRIPTION'
                                ? 'Start subscription checkout'
                                : 'Pay now'}
                          </Button>
                        ) : stripePromise ? (
                          <Elements stripe={stripePromise} options={{ clientSecret: paymentIntentSecret }}>
                            <BookingPaymentForm
                              onSuccess={handlePaymentSuccess}
                              onError={(message) => setPaymentError(message)}
                            />
                          </Elements>
                        ) : (
                          <div className="text-sm text-amber-700">Payment is configured, but Stripe key is unavailable.</div>
                        )}
                        {paymentError ? <div className="text-sm text-red-600">{paymentError}</div> : null}
                        {paymentInfo.security_note ? (
                          <div className="text-xs text-gray-500">{paymentInfo.security_note}</div>
                        ) : null}
                        {paymentInfo.process_note ? (
                          <div className="text-xs text-slate-500">{paymentInfo.process_note}</div>
                        ) : null}
                      </>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-gray-600">
                    {paymentInfo?.disabled_reason || 'Payment is due at your appointment.'}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cancellation policy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-600">Need to make a change? Contact the business to adjust or cancel.</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingPaymentForm({
  onSuccess,
  onError,
}: {
  onSuccess: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;
    try {
      setSubmitting(true);
      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });
      if (result.error) {
        onError(result.error.message || 'Payment failed. Please try again.');
        return;
      }
      if (result.paymentIntent?.status === 'succeeded') {
        await onSuccess();
      } else if (result.paymentIntent?.status) {
        onError(`Payment status: ${result.paymentIntent.status}`);
      }
    } catch (error: any) {
      onError(error?.message || 'Payment failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <PaymentElement />
      <Button onClick={handleSubmit} disabled={submitting || !stripe || !elements}>
        {submitting ? 'Processing payment…' : 'Submit payment'}
      </Button>
    </div>
  );
}
