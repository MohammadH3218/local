'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { usePortalBasePath } from '@/lib/portal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/portal/page-header';
import { CalendarCheck, ChevronRight, MessageCircle, PhoneCall, RefreshCw, Search, Users } from 'lucide-react';

type Contact = {
  contact_id: string;
  company_id: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  address?: string;
  zipcode?: string;
  name?: string;
  phone?: string;
  email?: string;
  source?: string;
  lead_status?: string;
  updated_at?: number | string;
  created_at?: number | string;
  last_contact_at?: number | string;
};

function formatDate(ts?: number | string) {
  if (!ts) return '-';
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoney(cents?: number) {
  if (typeof cents !== 'number') return '-';
  return `$${(cents / 100).toFixed(2)}`;
}

type LeadStatusLabel = 'Scheduled' | 'Lead' | 'No Lead';
type AppointmentStatusLabel = 'Upcoming' | 'Ongoing' | 'Completed' | 'Scheduled';

const leadBadge = (status: LeadStatusLabel) => {
  if (status === 'Scheduled') return { label: 'Scheduled', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (status === 'Lead') return { label: 'Lead', className: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { label: 'No Lead', className: 'bg-slate-50 text-slate-600 border-slate-200' };
};

const appointmentBadge = (status: AppointmentStatusLabel) => {
  if (status === 'Upcoming') return { label: 'Upcoming', className: 'bg-blue-50 text-blue-700 border-blue-200' };
  if (status === 'Ongoing') return { label: 'Ongoing', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (status === 'Completed') return { label: 'Completed', className: 'bg-slate-50 text-slate-600 border-slate-200' };
  return { label: 'Scheduled', className: 'bg-amber-50 text-amber-800 border-amber-200' };
};

const contactDisplayName = (contact?: Contact | null) => {
  if (!contact) return 'Unknown';
  return (
    String(contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()).trim() ||
    String(contact.phone_number || contact.phone || '').trim() ||
    'Unknown'
  );
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name[0]?.toUpperCase() || '?';
};

const getAvatarColor = (name: string) => {
  const colors = [
    'bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-rose-500',
    'bg-amber-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

export default function CustomersPage() {
  const router = useRouter();
  const basePath = usePortalBasePath();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedContactAppointments, setSelectedContactAppointments] = useState<any[]>([]);
  const [selectedContactPayments, setSelectedContactPayments] = useState<any[]>([]);
  const [selectedContactCallsTotal, setSelectedContactCallsTotal] = useState<number | null>(null);
  const [selectedContactCallsLoading, setSelectedContactCallsLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 365);
      const end = new Date(now);
      end.setDate(end.getDate() + 365);
      const [contactsResp, apptsResp] = await Promise.all([
        apiClient.getContacts(200),
        apiClient.getAppointmentsRange(start.toISOString(), end.toISOString()),
      ]);
      setContacts((contactsResp.contacts || []) as Contact[]);
      setUpcomingAppointments(apptsResp.appointments || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load customers');
    } finally {
      setIsLoading(false);
    }
  };

  const derivedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const appts = (upcomingAppointments || []).filter((a) => !a?.is_series_master);
    const byPhone = new Map<string, any[]>();
    for (const a of appts) {
      const phone = String(a?.contact_phone || '').trim();
      if (!phone) continue;
      const arr = byPhone.get(phone) ?? [];
      arr.push(a);
      byPhone.set(phone, arr);
    }
    for (const [, arr] of byPhone) arr.sort((a, b) => (a?.scheduled_start ?? 0) - (b?.scheduled_start ?? 0));

    return (contacts || [])
      .filter((c) => {
        if (!q) return true;
        const phone = String(c.phone_number || c.phone || '').trim();
        const name = contactDisplayName(c);
        const text = [name, phone, c.email].filter(Boolean).join(' ').toLowerCase();
        return text.includes(q);
      })
      .map((c) => {
        const phone = String(c.phone_number || c.phone || '').trim();
        const upcoming = (byPhone.get(phone) ?? []).filter(
          (a) => String(a?.status || '').toUpperCase() !== 'CANCELLED'
        );
        const next = upcoming[0];
        const totalSpend = upcoming.reduce((sum, a) => sum + (typeof a?.price_cents === 'number' ? a.price_cents : 0), 0);
        const recurring = upcoming.some((a) => !!a?.series_id);
        const now = Date.now();
        let appointmentStatus: AppointmentStatusLabel | null = null;
        if (upcoming.length > 0) {
          const ongoing = upcoming.find((a) => {
            const s = Number(a?.scheduled_start || 0);
            const e = Number(a?.scheduled_end || 0);
            return s && e && s <= now && e >= now;
          });
          if (ongoing) {
            appointmentStatus = 'Ongoing';
          } else {
            const future = upcoming.find((a) => Number(a?.scheduled_start || 0) > now);
            if (future) {
              appointmentStatus = (Number(future.scheduled_start) - now) <= 86400000 ? 'Upcoming' : 'Scheduled';
            } else {
              const past = upcoming.find((a) => Number(a?.scheduled_end || a?.scheduled_start || 0) < now);
              if (past) appointmentStatus = 'Completed';
            }
          }
        }
        const displayName = contactDisplayName(c);
        const leadStatusRaw = String(c.lead_status || '').toUpperCase();
        const isLead = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED'].includes(leadStatusRaw);
        const leadStatus: LeadStatusLabel = upcoming.length > 0 ? 'Scheduled' : isLead ? 'Lead' : 'No Lead';
        const lastActivity = Number(c.last_contact_at ?? c.updated_at ?? c.created_at ?? 0);
        return { contact: c, displayName, displayPhone: phone, upcomingCount: upcoming.length, nextStart: next?.scheduled_start, recurring, totalSpend, leadStatus, appointmentStatus, lastActivity };
      })
      .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  }, [contacts, upcomingAppointments, searchQuery]);

  const selectedLeadStatus = useMemo<LeadStatusLabel>(() => {
    if (!selectedContact) return 'No Lead';
    const appts = (selectedContactAppointments || []).filter((a) => !a?.is_series_master);
    const hasScheduled = appts.some((a) => String(a?.status || '').toUpperCase() !== 'CANCELLED');
    if (hasScheduled) return 'Scheduled';
    const leadStatusRaw = String(selectedContact.lead_status || '').toUpperCase();
    const hasLeadStatus = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED'].includes(leadStatusRaw);
    return hasLeadStatus || (selectedContactCallsTotal || 0) > 0 ? 'Lead' : 'No Lead';
  }, [selectedContact, selectedContactAppointments, selectedContactCallsTotal]);

  const openDetails = async (contact: Contact) => {
    try {
      setSelectedContact(contact);
      setDetailsOpen(true);
      setSelectedContactCallsTotal(null);
      setSelectedContactCallsLoading(true);
      const [apptsResp, callsResp, paymentsResp] = await Promise.all([
        apiClient.getContactAppointments(contact.contact_id),
        apiClient.getContactCalls(contact.contact_id, 1),
        apiClient.getCustomerPayments({ contact_id: contact.contact_id, limit: 25 }).catch(() => ({ payments: [] })),
      ]);
      setSelectedContactAppointments(apptsResp.appointments || []);
      setSelectedContactPayments(paymentsResp?.payments || []);
      setSelectedContactCallsTotal(typeof callsResp.total === 'number' ? callsResp.total : (callsResp.calls || []).length);
      setSelectedContactCallsLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load customer details');
      setSelectedContactCallsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Customers"
        title="Customers and leads"
        subtitle="Track every lead, booking, and conversation in one place."
        actions={
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        }
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}{' '}
          <button onClick={() => void load()} className="font-semibold underline">Try again</button>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="Search by name, phone, or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 pl-10"
          />
        </div>
        <Button className="h-10 px-5">Search</Button>
      </div>

      {/* Header count */}
      {!isLoading && (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-900">{derivedRows.length}</span> customer{derivedRows.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4">
              <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : derivedRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-16 text-center">
          <Users className="h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">No customers yet</p>
          <p className="mt-1 text-sm text-slate-500">Contacts appear after a call, SMS, or booking.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {derivedRows.map((row) => {
            const initials = getInitials(row.displayName);
            const avatarColor = getAvatarColor(row.displayName);
            const lbadge = leadBadge(row.leadStatus);
            return (
              <button
                key={row.contact.contact_id}
                type="button"
                onClick={() => void openDetails(row.contact)}
                className="group w-full rounded-2xl border border-slate-100 bg-white p-4 text-left transition-all hover:border-emerald-100 hover:shadow-sm"
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor}`}>
                    {initials}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2 flex-wrap">
                        <span className="truncate font-semibold text-slate-900">{row.displayName}</span>
                        <Badge variant="outline" className={`${lbadge.className} shrink-0 text-xs`}>
                          {lbadge.label}
                        </Badge>
                        {row.appointmentStatus && (
                          <Badge variant="outline" className={`${appointmentBadge(row.appointmentStatus).className} shrink-0 text-xs`}>
                            {appointmentBadge(row.appointmentStatus).label}
                          </Badge>
                        )}
                        {row.recurring && (
                          <Badge variant="outline" className="shrink-0 text-xs bg-violet-50 text-violet-700 border-violet-200">
                            Recurring
                          </Badge>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">{row.lastActivity ? formatDate(row.lastActivity) : ''}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{row.displayPhone}</p>
                    {row.contact.email && <p className="text-xs text-slate-400">{row.contact.email}</p>}
                    {(row.nextStart || row.upcomingCount > 0) && (
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                        {row.nextStart && <span>Next: {formatDate(row.nextStart)}</span>}
                        {row.upcomingCount > 0 && <span>Value: {formatMoney(row.totalSpend)}</span>}
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-300 transition-colors group-hover:text-emerald-500" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer profile</DialogTitle>
          </DialogHeader>

          {selectedContact && (
            <div className="space-y-5">
              {/* Contact info */}
              <div className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ${getAvatarColor(contactDisplayName(selectedContact))}`}>
                  {getInitials(contactDisplayName(selectedContact))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{contactDisplayName(selectedContact)}</p>
                  <p className="text-sm text-slate-500">{String(selectedContact.phone_number || selectedContact.phone || '').trim()}</p>
                  {selectedContact.email && <p className="text-sm text-slate-500">{selectedContact.email}</p>}
                  {selectedContact.address && <p className="text-sm text-slate-500">{selectedContact.address}</p>}
                  {!selectedContact.address && selectedContact.zipcode && (
                    <p className="text-sm text-slate-500">ZIP {selectedContact.zipcode}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-400">
                    <span>Added {formatDate(selectedContact.created_at)}</span>
                    {selectedContact.last_contact_at && <span>Last contact {formatDate(selectedContact.last_contact_at)}</span>}
                    {selectedContact.source && <span>Source: {selectedContact.source}</span>}
                  </div>
                </div>
                <Badge variant="outline" className={leadBadge(selectedLeadStatus).className}>
                  {leadBadge(selectedLeadStatus).label}
                </Badge>
              </div>

              {/* Quick action tiles */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left transition-all hover:border-emerald-100 hover:shadow-sm"
                  onClick={() => { setDetailsOpen(false); router.push(`${basePath}/calls?contact=${selectedContact.contact_id}`); }}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50">
                    <PhoneCall className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Calls</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {selectedContactCallsLoading ? '…' : `${selectedContactCallsTotal ?? 0} total`}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left transition-all hover:border-emerald-100 hover:shadow-sm"
                  onClick={() => { setDetailsOpen(false); router.push(`${basePath}/messages/${selectedContact.contact_id}`); }}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50">
                    <MessageCircle className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Messages</p>
                    <p className="text-sm font-semibold text-slate-900">View thread</p>
                  </div>
                </button>
              </div>

              {/* Appointments */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-emerald-600" />
                  <p className="text-sm font-semibold text-slate-900">Appointments</p>
                </div>
                {selectedContactAppointments.filter((a) => !a?.is_series_master).length > 0 ? (
                  <div className="space-y-2">
                    {selectedContactAppointments
                      .filter((a) => !a?.is_series_master)
                      .map((a) => (
                        <button
                          key={a.appointment_id}
                          type="button"
                          className="w-full rounded-xl border border-slate-100 bg-white p-3 text-left transition-all hover:border-emerald-100 hover:shadow-sm"
                          onClick={() => { setDetailsOpen(false); router.push(`${basePath}/appointments?appointmentId=${a.appointment_id}`); }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-slate-900">{a.service_type || 'Service'}</span>
                            <span className="text-xs text-slate-400">{formatDate(a.scheduled_start)}</span>
                          </div>
                          <div className="mt-0.5 flex gap-3 text-xs text-slate-500">
                            <span>{a.status || '-'}</span>
                            {typeof a.price_cents === 'number' && <span>{formatMoney(a.price_cents)}</span>}
                          </div>
                        </button>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">No appointments found.</p>
                )}
              </div>

              {/* Payments */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">Payment history</p>
                </div>
                {selectedContactPayments.length > 0 ? (
                  <div className="space-y-2">
                    {selectedContactPayments.map((payment) => (
                      <div key={payment.payment_id} className="rounded-xl border border-slate-100 bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-900">
                            {payment.service_name || 'Service payment'}
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {formatMoney(payment.amount_cents)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                          <span>{formatDate(payment.created_at)}</span>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                              {payment.payment_type || 'BOOKING'}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                              {payment.payment_status || 'UNKNOWN'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-sm text-slate-500">
                    No payments on file for this customer yet.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
