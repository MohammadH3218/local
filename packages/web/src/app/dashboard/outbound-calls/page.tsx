'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/portal/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { usePlanFeatures } from '@/hooks/use-plan-features';
import { Phone, PhoneOutgoing, X } from 'lucide-react';

type OutboundCall = {
  call_id: string;
  twilio_call_sid: string;
  to_number: string;
  from_number: string;
  context: string;
  status: string;
  created_at: number;
};

const CONTEXT_OPTIONS = [
  { value: 'MANUAL', label: 'Manual call' },
  { value: 'APPOINTMENT_REMINDER', label: 'Appointment reminder' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'REVIEW_REQUEST', label: 'Review request' },
];

export default function OutboundCallsPage() {
  const { toast } = useToast();
  const { hasFeature } = usePlanFeatures();
  const [calls, setCalls] = useState<OutboundCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ to_number: '', context: 'MANUAL', custom_message: '' });
  const [calling, setCalling] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await (apiClient as any).get('/outbound-calls');
      setCalls(Array.isArray(data) ? data : data?.items || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  if (!hasFeature('follow_up_sequences')) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-900">Outbound Calls are available on Pro and Max</h2>
        <p className="mt-1 text-sm text-amber-800">
          Upgrade your plan to initiate automation-driven outbound call campaigns.
        </p>
        <Button className="mt-4" onClick={() => (window.location.href = '/dashboard/billing/plans')}>
          Upgrade to Pro
        </Button>
      </div>
    );
  }

  const handleCall = async () => {
    if (!form.to_number) return;
    setCalling(true);
    try {
      await (apiClient as any).post('/outbound-calls', form);
      toast({ title: 'Call initiated', description: `Calling ${form.to_number}` });
      setShowForm(false);
      setForm({ to_number: '', context: 'MANUAL', custom_message: '' });
      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to initiate call', variant: 'destructive' });
    } finally {
      setCalling(false);
    }
  };

  const statusColor = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'completed') return 'bg-emerald-100 text-emerald-700';
    if (s === 'in-progress' || s === 'ringing') return 'bg-blue-100 text-blue-700';
    if (s === 'busy' || s === 'failed' || s === 'no-answer') return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
        {[1,2,3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calls"
        title="Outbound Calls"
        subtitle="Initiate AI-powered outbound calls for reminders, follow-ups, and more."
        actions={
          <Button onClick={() => setShowForm(true)} size="sm">
            <PhoneOutgoing className="mr-1 h-4 w-4" /> New call
          </Button>
        }
      />

      {showForm && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Initiate outbound call</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-slate-400" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Phone number</label>
              <Input
                placeholder="+1 (555) 000-0000"
                value={form.to_number}
                onChange={(e) => setForm({ ...form, to_number: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Call context</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={form.context}
                onChange={(e) => setForm({ ...form, context: e.target.value })}
              >
                {CONTEXT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCall} disabled={calling || !form.to_number} size="sm">
              <Phone className="mr-1 h-4 w-4" />
              {calling ? 'Connecting...' : 'Start call'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {calls.length === 0 ? (
        <EmptyState
          icon={<PhoneOutgoing className="h-6 w-6 text-slate-400" />}
          title="No outbound calls yet"
          description="Initiate AI-powered outbound calls for appointment reminders and follow-ups."
        />
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100">
          {calls.map((c) => (
            <div key={c.call_id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{c.to_number}</p>
                <p className="text-xs text-slate-500">
                  {c.context?.replace(/_/g, ' ')} · {new Date(c.created_at).toLocaleString()}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor(c.status)}`}>
                {c.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
