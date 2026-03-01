'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/portal/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { usePlanFeatures } from '@/hooks/use-plan-features';
import { MessageSquare, Settings } from 'lucide-react';

type FollowUpSettings = {
  follow_up_sequences_enabled: boolean;
  follow_up_initial_template?: string;
  follow_up_initial_delay_minutes?: number;
  follow_up_second_template?: string;
  follow_up_second_delay_minutes?: number;
  follow_up_final_template?: string;
  follow_up_final_delay_minutes?: number;
  review_request_enabled?: boolean;
  review_request_template?: string;
  review_request_delay_minutes?: number;
  review_platform_url?: string;
};

type Sequence = {
  sequence_id: string;
  to_number: string;
  status: string;
  created_at: number;
  steps: Array<{ step: number; send_at: number; body: string }>;
};

export default function FollowUpsPage() {
  const { toast } = useToast();
  const { hasFeature } = usePlanFeatures();
  const [settings, setSettings] = useState<FollowUpSettings | null>(null);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editSettings, setEditSettings] = useState<FollowUpSettings | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [company, seqData] = await Promise.all([
        (apiClient as any).get('/companies/me'),
        (apiClient as any).get('/follow-up-sequences').catch(() => ({ items: [] })),
      ]);
      const s: FollowUpSettings = {
        follow_up_sequences_enabled: company?.follow_up_sequences_enabled || false,
        follow_up_initial_template: company?.follow_up_initial_template || '',
        follow_up_initial_delay_minutes: company?.follow_up_initial_delay_minutes ?? 0,
        follow_up_second_template: company?.follow_up_second_template || '',
        follow_up_second_delay_minutes: company?.follow_up_second_delay_minutes ?? 1440,
        follow_up_final_template: company?.follow_up_final_template || '',
        follow_up_final_delay_minutes: company?.follow_up_final_delay_minutes ?? 4320,
        review_request_enabled: company?.review_request_enabled || false,
        review_request_template: company?.review_request_template || '',
        review_request_delay_minutes: company?.review_request_delay_minutes ?? 120,
        review_platform_url: company?.review_platform_url || '',
      };
      setSettings(s);
      setEditSettings(s);
      setSequences(Array.isArray(seqData) ? seqData : seqData?.items || []);
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to load follow-up settings', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (!hasFeature('follow_up_sequences')) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-900">Follow-ups are available on Pro and Max</h2>
        <p className="mt-1 text-sm text-amber-800">
          Upgrade your plan to enable automated follow-up sequences and review requests.
        </p>
        <Button className="mt-4" onClick={() => (window.location.href = '/dashboard/billing/plans')}>
          Upgrade to Pro
        </Button>
      </div>
    );
  }

  const handleSave = async () => {
    if (!editSettings) return;
    setSaving(true);
    try {
      await (apiClient as any).put('/companies/me', editSettings);
      setSettings({ ...editSettings });
      toast({ title: 'Settings saved' });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation"
        title="Follow-up Sequences"
        subtitle="Automatically follow up with leads after calls and completed appointments."
        actions={<Button onClick={handleSave} disabled={saving} size="sm">{saving ? 'Saving...' : 'Save settings'}</Button>}
      />

      {/* Settings */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <Settings className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Follow-up settings</h2>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">Enabled</span>
            <button
              onClick={() => setEditSettings((s) => s ? { ...s, follow_up_sequences_enabled: !s.follow_up_sequences_enabled } : s)}
              className={`relative h-5 w-9 rounded-full transition-colors ${editSettings?.follow_up_sequences_enabled ? 'bg-emerald-600' : 'bg-slate-200'}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${editSettings?.follow_up_sequences_enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          {[
            { key: 'follow_up_initial', label: 'First message', defaultDelay: 0, defaultTemplate: "Thanks for calling {{company_name}}! Here's your booking link: {{booking_link}}" },
            { key: 'follow_up_second', label: 'Second message', defaultDelay: 1440, defaultTemplate: "Haven't booked yet? We'd love to help. {{booking_link}}" },
            { key: 'follow_up_final', label: 'Final message', defaultDelay: 4320, defaultTemplate: "Final follow-up from {{company_name}}. Reply if you'd like to reserve a time." },
          ].map((step) => (
            <div key={step.key} className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{step.label}</p>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Delay (minutes after trigger)</label>
                <Input
                  type="number"
                  min={0}
                  value={(editSettings as any)?.[`${step.key}_delay_minutes`] ?? step.defaultDelay}
                  onChange={(e) => setEditSettings((s) => s ? { ...s, [`${step.key}_delay_minutes`]: Number(e.target.value) } : s)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Message template</label>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  placeholder={step.defaultTemplate}
                  value={(editSettings as any)?.[`${step.key}_template`] || ''}
                  onChange={(e) => setEditSettings((s) => s ? { ...s, [`${step.key}_template`]: e.target.value } : s)}
                />
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Review requests</p>
              <button
                onClick={() => setEditSettings((s) => s ? { ...s, review_request_enabled: !s.review_request_enabled } : s)}
                className={`relative h-5 w-9 rounded-full transition-colors ${editSettings?.review_request_enabled ? 'bg-emerald-600' : 'bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${editSettings?.review_request_enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Review platform URL</label>
              <Input
                placeholder="https://g.page/r/your-review-link"
                value={editSettings?.review_platform_url || ''}
                onChange={(e) => setEditSettings((s) => s ? { ...s, review_platform_url: e.target.value } : s)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">Delay (minutes after job completion)</label>
              <Input
                type="number"
                min={0}
                value={editSettings?.review_request_delay_minutes ?? 120}
                onChange={(e) => setEditSettings((s) => s ? { ...s, review_request_delay_minutes: Number(e.target.value) } : s)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Recent sequences */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Recent sequences</h2>
          <p className="text-xs text-slate-500">Follow-up sequences sent to leads</p>
        </div>
        {sequences.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<MessageSquare className="h-5 w-5 text-slate-400" />}
              title="No sequences yet"
              description="Follow-up sequences will appear here after calls with new leads."
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sequences.slice(0, 20).map((seq) => (
              <div key={seq.sequence_id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{seq.to_number}</p>
                  <p className="text-xs text-slate-500">{seq.steps?.length || 0} messages · {new Date(seq.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${seq.status === 'SCHEDULED' ? 'bg-amber-100 text-amber-700' : seq.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                  {seq.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
