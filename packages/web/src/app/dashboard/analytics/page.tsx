'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/portal/page-header';
import { Button } from '@/components/ui/button';
import { usePlanFeatures } from '@/hooks/use-plan-features';
import {
  IconPhone,
  IconTrendingUp,
  IconUsers,
  IconCalendar,
  IconMessage,
  IconClock,
} from '@tabler/icons-react';

type CallMetrics = {
  period_days: number;
  total_calls: number;
  completed_calls: number;
  completion_rate: number;
  lead_capture_rate: number;
  booking_conversion_rate: number;
  inbound_calls: number;
  outbound_calls: number;
  avg_duration_seconds: number;
  sentiment: { positive: number; neutral: number; negative: number; unknown: number };
  lead_quality: Record<string, number>;
  daily_breakdown: Array<{ date: string; calls: number; leads: number; bookings: number }>;
};

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function MetricCard({ label, value, detail, icon }: {
  label: string; value: string; detail: string; icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const { hasFeature } = usePlanFeatures();
  const [metrics, setMetrics] = useState<CallMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await (apiClient as any).get(`/analytics/calls?days=${days}`);
      setMetrics(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [days]);

  const maxCalls = Math.max(...(metrics?.daily_breakdown || []).map((d) => d.calls), 1);

  if (!hasFeature('follow_up_sequences')) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-900">Analytics is available on Pro and Max</h2>
        <p className="mt-1 text-sm text-amber-800">
          Upgrade your plan to access automation analytics and performance dashboards.
        </p>
        <Button className="mt-4" onClick={() => (window.location.href = '/dashboard/billing/plans')}>
          Upgrade to Pro
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1,2,3,4,5,6].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Call Quality Dashboard"
        subtitle="AI performance metrics, lead conversion, and call volume trends."
        actions={
          <div className="flex items-center gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  days === d
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Total calls"
          value={String(metrics?.total_calls || 0)}
          detail={`${metrics?.inbound_calls || 0} inbound · ${metrics?.outbound_calls || 0} outbound`}
          icon={<IconPhone stroke={1.5} className="h-4 w-4 text-slate-500" />}
        />
        <MetricCard
          label="Completion rate"
          value={`${metrics?.completion_rate || 0}%`}
          detail={`${metrics?.completed_calls || 0} of ${metrics?.total_calls || 0} calls completed`}
          icon={<IconTrendingUp stroke={1.5} className="h-4 w-4 text-slate-500" />}
        />
        <MetricCard
          label="Lead capture rate"
          value={`${metrics?.lead_capture_rate || 0}%`}
          detail="Calls that generated a lead"
          icon={<IconUsers stroke={1.5} className="h-4 w-4 text-slate-500" />}
        />
        <MetricCard
          label="Booking conversion"
          value={`${metrics?.booking_conversion_rate || 0}%`}
          detail="Calls that resulted in a booking"
          icon={<IconCalendar stroke={1.5} className="h-4 w-4 text-slate-500" />}
        />
        <MetricCard
          label="Avg call duration"
          value={formatDuration(metrics?.avg_duration_seconds || 0)}
          detail="Per completed call"
          icon={<IconClock stroke={1.5} className="h-4 w-4 text-slate-500" />}
        />
        <MetricCard
          label="Positive sentiment"
          value={`${Math.round(((metrics?.sentiment.positive || 0) / Math.max(metrics?.total_calls || 1, 1)) * 100)}%`}
          detail={`${metrics?.sentiment.negative || 0} negative · ${metrics?.sentiment.neutral || 0} neutral`}
          icon={<IconMessage stroke={1.5} className="h-4 w-4 text-slate-500" />}
        />
      </div>

      {/* Sentiment breakdown */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Sentiment distribution</h2>
        </div>
        <div className="flex gap-6 p-5">
          {[
            { key: 'positive', label: 'Positive', color: 'bg-emerald-500' },
            { key: 'neutral', label: 'Neutral', color: 'bg-slate-400' },
            { key: 'negative', label: 'Negative', color: 'bg-red-500' },
            { key: 'unknown', label: 'Unknown', color: 'bg-slate-200' },
          ].map((item) => {
            const count = (metrics?.sentiment as any)?.[item.key] || 0;
            const pct = metrics?.total_calls ? Math.round((count / metrics.total_calls) * 100) : 0;
            return (
              <div key={item.key} className="flex-1 text-center">
                <div className="mx-auto mb-2 flex h-16 w-16 items-end justify-center overflow-hidden rounded-full bg-slate-100">
                  <div className={`w-full ${item.color}`} style={{ height: `${pct}%`, minHeight: count > 0 ? 4 : 0 }} />
                </div>
                <p className="text-lg font-bold text-slate-900">{pct}%</p>
                <p className="text-xs text-slate-500">{item.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily trend */}
      {(metrics?.daily_breakdown || []).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Daily call volume</h2>
            <p className="text-xs text-slate-500">Last {days} days</p>
          </div>
          <div className="p-5">
            <div className="flex h-32 items-end gap-1 overflow-x-auto">
              {(metrics?.daily_breakdown || []).slice(-30).map((d) => {
                const height = Math.max(4, Math.round((d.calls / maxCalls) * 100));
                return (
                  <div
                    key={d.date}
                    className="flex min-w-[20px] flex-1 flex-col items-center gap-1"
                    title={`${d.date}: ${d.calls} calls, ${d.leads} leads, ${d.bookings} bookings`}
                  >
                    <div className="w-full rounded-t bg-emerald-500" style={{ height: `${height}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Calls
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
