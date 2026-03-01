'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/portal/page-header';
import { apiClient } from '@/lib/api-client';
import {
  IconCalendarEvent,
  IconPhone,
  IconUser,
  IconShield,
  IconChartBar,
  IconSettings,
  IconArrowUpRight,
  IconCheck,
  IconCircleFilled,
} from '@tabler/icons-react';

type NotificationItem = {
  notification_id: string;
  event_key: string;
  category: 'APPOINTMENTS' | 'CALLS' | 'LEADS' | 'USAGE' | 'ACCOUNT' | 'SYSTEM';
  title: string;
  body: string;
  created_at: number;
  is_read: boolean;
  action_url?: string;
};

const CATEGORY_FILTERS = [
  'ALL',
  'APPOINTMENTS',
  'CALLS',
  'LEADS',
  'ACCOUNT',
  'USAGE',
  'SYSTEM',
] as const;

type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

const CATEGORY_META: Record<string, { icon: React.ElementType; dot: string; pill: string; label: string }> = {
  APPOINTMENTS: { icon: IconCalendarEvent, dot: 'bg-blue-500',   pill: 'bg-blue-50 text-blue-700 ring-blue-100',   label: 'Appointment' },
  CALLS:        { icon: IconPhone,         dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-700 ring-violet-100', label: 'Call' },
  LEADS:        { icon: IconUser,          dot: 'bg-amber-500',  pill: 'bg-amber-50 text-amber-700 ring-amber-100',  label: 'Lead' },
  ACCOUNT:      { icon: IconShield,        dot: 'bg-emerald-500',pill: 'bg-emerald-50 text-emerald-700 ring-emerald-100',label: 'Account' },
  USAGE:        { icon: IconChartBar,      dot: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-700 ring-indigo-100', label: 'Usage' },
  SYSTEM:       { icon: IconSettings,      dot: 'bg-slate-400',  pill: 'bg-slate-50 text-slate-600 ring-slate-100',  label: 'System' },
};

function groupLabel(createdAt: number) {
  const now = new Date();
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = nowStart - 24 * 60 * 60 * 1000;
  const weekStart = nowStart - 7 * 24 * 60 * 60 * 1000;
  const ts = new Date(createdAt).getTime();
  if (ts >= nowStart) return 'Today';
  if (ts >= yesterdayStart) return 'Yesterday';
  if (ts >= weekStart) return 'This Week';
  return 'Earlier';
}

function formatTime(ts?: number) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CategoryFilter>('ALL');

  const load = async () => {
    try {
      setLoading(true);
      let lastKey: any = undefined;
      const next: NotificationItem[] = [];
      for (let i = 0; i < 5; i += 1) {
        const page = await apiClient.listNotifications(100, false, lastKey);
        next.push(...((page?.notifications || []) as NotificationItem[]));
        lastKey = page?.lastEvaluatedKey;
        if (!lastKey) break;
      }
      setItems(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(
    () => items
      .filter((item) => filter === 'ALL' || item.category === filter)
      .sort((a, b) => b.created_at - a.created_at),
    [items, filter],
  );

  const grouped = useMemo(() => {
    const out: Record<string, NotificationItem[]> = {};
    for (const item of filtered) {
      const label = groupLabel(item.created_at);
      if (!out[label]) out[label] = [];
      out[label].push(item);
    }
    return out;
  }, [filtered]);

  const unreadCount = useMemo(() => items.filter((i) => !i.is_read).length, [items]);

  const toggleRead = async (item: NotificationItem) => {
    if (item.is_read) {
      await apiClient.markNotificationUnread(item.notification_id);
    } else {
      await apiClient.markNotificationRead(item.notification_id);
    }
    await load();
  };

  const markAllRead = async () => {
    await apiClient.markAllNotificationsRead();
    await load();
  };

  const markRead = async (item: NotificationItem) => {
    if (!item.is_read) {
      await apiClient.markNotificationRead(item.notification_id);
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notifications"
        title="Notification center"
        subtitle="See all events from calls, leads, appointments, usage, and system updates."
        actions={
          unreadCount > 0 ? (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <IconCheck stroke={2} className="h-4 w-4 text-emerald-600" />
              Mark all read
            </button>
          ) : null
        }
      />

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {CATEGORY_FILTERS.map((cat) => {
          const meta = CATEGORY_META[cat];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                filter === cat
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {meta && filter !== cat && (
                <span className={`inline-block h-2 w-2 rounded-full ${meta.dot} opacity-70`} />
              )}
              {cat === 'ALL' ? 'All' : cat.charAt(0) + cat.slice(1).toLowerCase()}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="rounded-xl border border-slate-100 bg-white px-5 py-8 text-center text-sm text-slate-400">
          Loading notifications…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-100 bg-white px-5 py-12 text-center text-sm text-slate-400">
          No notifications yet.
        </div>
      ) : (
        <div className="space-y-8">
          {['Today', 'Yesterday', 'This Week', 'Earlier']
            .filter((label) => grouped[label]?.length)
            .map((label) => (
              <section key={label}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
                  {grouped[label].map((item) => {
                    const meta = CATEGORY_META[item.category] ?? CATEGORY_META.SYSTEM;
                    const Icon = meta.icon;
                    return (
                      <div
                        key={item.notification_id}
                        className={`group flex items-start gap-4 px-5 py-4 transition hover:bg-slate-50/60 ${
                          !item.is_read ? 'bg-emerald-50/30' : ''
                        }`}
                      >
                        {/* Left: unread indicator + icon */}
                        <div className="relative mt-0.5 flex-shrink-0">
                          {!item.is_read && (
                            <span className="absolute -left-2 top-1/2 -translate-y-1/2 block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          )}
                          <div className={`flex h-9 w-9 items-center justify-center rounded-full ring-1 ${meta.pill}`}>
                            <Icon stroke={1.8} className="h-4 w-4" />
                          </div>
                        </div>

                        {/* Middle: text */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <p className={`text-sm leading-snug ${item.is_read ? 'font-medium text-slate-800' : 'font-semibold text-slate-900'}`}>
                              {item.title}
                            </p>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${meta.pill}`}>
                              {meta.label}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-slate-500 line-clamp-2">{item.body}</p>
                          <p className="mt-1.5 text-[11px] text-slate-400">{formatTime(item.created_at)}</p>
                        </div>

                        {/* Right: actions */}
                        <div className="flex flex-shrink-0 items-center gap-2 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => void toggleRead(item)}
                            title={item.is_read ? 'Mark unread' : 'Mark read'}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                          >
                            <IconCircleFilled
                              className={`h-3.5 w-3.5 ${item.is_read ? 'text-slate-300' : 'text-emerald-500'}`}
                            />
                          </button>
                          {item.action_url && (
                            <Link
                              href={item.action_url}
                              onClick={() => void markRead(item)}
                              className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition"
                            >
                              Open
                              <IconArrowUpRight stroke={2} className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
