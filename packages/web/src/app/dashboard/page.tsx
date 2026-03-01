'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendar,
  IconClock,
  IconCurrencyDollar,
  IconUsers,
} from '@tabler/icons-react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { PageHeader } from '@/components/portal/page-header';

type DashboardOverview = {
  metrics: {
    revenue_this_month_cents: number;
    lead_conversion_rate: number;
    total_customers: number;
    active_leads: number;
    appointments_this_week: number;
  };
  usage_summary: {
    period_start: number;
    period_end: number;
    minutes: { used: number; limit: number; percent: number; blocked: boolean };
    sms: { used: number; limit: number; percent: number; blocked: boolean };
    contacts: { used: number; limit: number; percent: number; blocked: boolean };
  };
  quick_insights: {
    unanswered_questions: number;
    hot_leads_needing_follow_up: number;
    appointments_next_24h: number;
    next_appointment_countdown_minutes: number | null;
    quick_actions: Array<{
      id: string;
      title: string;
      description: string;
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
      count: number;
      action_url: string;
    }>;
  };
  activity_feed: Array<{
    id: string;
    type: 'CALL' | 'APPOINTMENT' | 'PAYMENT' | 'LEAD';
    title: string;
    description: string;
    created_at: number;
    action_url?: string;
  }>;
};

function formatMoney(cents = 0) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
}

function formatDate(ts?: number) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function DashboardPage() {
  const { company } = useAuthStore();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [connectStatus, setConnectStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewData, connect] = await Promise.all([
        apiClient.getDashboardStats(),
        apiClient.getConnectStatus().catch(() => ({ connected: false })),
      ]);
      setOverview(overviewData as DashboardOverview);
      setConnectStatus(connect || { connected: false });
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const usageBlocked = useMemo(() => {
    const usage = overview?.usage_summary;
    if (!usage) return false;
    return usage.minutes.blocked || usage.sms.blocked || usage.contacts.blocked;
  }, [overview]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${company?.company_name || 'HandyCall'}`}
        subtitle="Track usage, leads, appointments, revenue, and what needs attention next."
        actions={
          <button
            onClick={() => void load()}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Refresh
          </button>
        }
      />

      {usageBlocked && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <IconAlertTriangle stroke={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-800">Plan limit reached</p>
              <p className="mt-1 text-sm text-red-700">
                AI handling may be paused until your next billing reset. Upgrade to restore full coverage immediately.
              </p>
              <Link
                href="/dashboard/billing/plans"
                className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                Upgrade plan
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Minutes used"
          value={`${Math.round(overview?.usage_summary.minutes.percent || 0)}%`}
          detail={`${Math.round(overview?.usage_summary.minutes.used || 0)} / ${Math.round(overview?.usage_summary.minutes.limit || 0)}`}
          icon={<IconClock stroke={1.5} className="h-4 w-4 text-slate-500" />}
        />
        <StatCard
          label="Active leads"
          value={String(overview?.metrics.active_leads || 0)}
          detail={`${overview?.metrics.total_customers || 0} total customers`}
          icon={<IconUsers stroke={1.5} className="h-4 w-4 text-slate-500" />}
        />
        <StatCard
          label="Appointments this week"
          value={String(overview?.metrics.appointments_this_week || 0)}
          detail={`${overview?.quick_insights.appointments_next_24h || 0} in next 24h`}
          icon={<IconCalendar stroke={1.5} className="h-4 w-4 text-slate-500" />}
        />
        <StatCard
          label="Revenue this month"
          value={connectStatus?.connected ? formatMoney(overview?.metrics.revenue_this_month_cents || 0) : '—'}
          detail={connectStatus?.connected ? 'From customer payments' : 'Connect Stripe to view'}
          icon={<IconCurrencyDollar stroke={1.5} className="h-4 w-4 text-slate-500" />}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Usage summary</h2>
          <p className="text-xs text-slate-500">
            {formatDate(overview?.usage_summary.period_start)} – {formatDate(overview?.usage_summary.period_end)}
          </p>
        </div>
        <div className="space-y-4 p-5">
          {[
            { key: 'minutes', label: 'Call minutes' },
            { key: 'sms', label: 'SMS' },
            { key: 'contacts', label: 'Contacts' },
          ].map((item) => {
            const usage = (overview?.usage_summary as any)?.[item.key] || { used: 0, limit: 0, percent: 0, blocked: false };
            const width = Math.min(100, Math.max(0, usage.percent || 0));
            return (
              <div key={item.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{item.label}</span>
                  <span className="text-slate-500">{usage.used} / {usage.limit}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${usage.blocked ? 'bg-red-500' : width >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Quick actions</h2>
          <p className="text-xs text-slate-500">Prioritized items that need attention right now.</p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          {(overview?.quick_insights.quick_actions || []).length ? (
            overview!.quick_insights.quick_actions.map((action) => (
              <Link
                key={action.id}
                href={action.action_url}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-emerald-200 hover:bg-white"
              >
                <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                <p className="mt-1 text-xs text-slate-600">{action.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {action.count}
                  </span>
                  <IconArrowRight stroke={1.5} className="h-4 w-4 text-slate-400" />
                </div>
              </Link>
            ))
          ) : (
            <p className="text-sm text-slate-500">No urgent actions right now.</p>
          )}
        </div>
      </div>

      <ActivityFeed feed={overview?.activity_feed || []} />
    </div>
  );
}

const ACTIVITY_PREVIEW = 5;

function ActivityFeed({ feed }: { feed: DashboardOverview['activity_feed'] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? feed : feed.slice(0, ACTIVITY_PREVIEW);
  const hasMore = feed.length > ACTIVITY_PREVIEW;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Activity feed</h2>
        <p className="text-xs text-slate-500">Latest events across calls, leads, appointments, and payments.</p>
      </div>
      <div className="divide-y divide-slate-100">
        {visible.map((item) => (
          <Link
            key={item.id}
            href={item.action_url || '/dashboard'}
            className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="truncate text-xs text-slate-600">{item.description}</p>
            </div>
            <span className="shrink-0 text-xs text-slate-400">{formatDate(item.created_at)}</span>
          </Link>
        ))}
        {feed.length === 0 && (
          <p className="px-5 py-5 text-sm text-slate-500">No activity yet.</p>
        )}
      </div>
      {hasMore && (
        <div className="border-t border-slate-100 px-5 py-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 transition hover:text-emerald-700"
          >
            {expanded ? (
              <>Show less</>
            ) : (
              <>
                See all {feed.length} events
                <IconArrowRight stroke={1.5} className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
          {icon}
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
