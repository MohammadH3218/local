'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type NotificationItem = {
  notification_id: string;
  title: string;
  body: string;
  created_at: number;
  is_read: boolean;
  action_url?: string;
};

function formatRelative(ts?: number) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const unreadLabel = useMemo(() => (unreadCount > 99 ? '99+' : String(unreadCount)), [unreadCount]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [list, unread] = await Promise.all([
        apiClient.listNotifications(5, false),
        apiClient.getUnreadNotificationCount(),
      ]);
      setItems((list?.notifications || []) as NotificationItem[]);
      setUnreadCount(Number(unread?.unread || 0));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [load]);

  const markAllRead = async () => {
    await apiClient.markAllNotificationsRead();
    await load();
  };

  const markRead = async (notificationId: string) => {
    await apiClient.markNotificationRead(notificationId);
    await load();
  };

  return (
    <DropdownMenu open={open} onOpenChange={(next) => {
      setOpen(next);
      if (next) void load();
    }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold text-white">
              {unreadLabel}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">Notifications</DropdownMenuLabel>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={markAllRead}>
            Mark all read
          </Button>
        </div>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="px-3 py-4 text-sm text-slate-500">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-3 py-4 text-sm text-slate-500">No notifications yet.</div>
        ) : (
          <div className="max-h-[320px] overflow-auto">
            {items.map((item) => (
              <DropdownMenuItem
                key={item.notification_id}
                className="flex cursor-pointer flex-col items-start gap-1 rounded-none px-3 py-2"
                onClick={() => {
                  if (!item.is_read) {
                    void markRead(item.notification_id);
                  }
                }}
                asChild={Boolean(item.action_url)}
              >
                {item.action_url ? (
                  <Link href={item.action_url}>
                    <div className="flex w-full items-start justify-between gap-2">
                      <p className={`text-sm ${item.is_read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{item.title}</p>
                      <span className="text-xs text-slate-400">{formatRelative(item.created_at)}</span>
                    </div>
                    <p className="line-clamp-2 text-xs text-slate-500">{item.body}</p>
                  </Link>
                ) : (
                  <>
                    <div className="flex w-full items-start justify-between gap-2">
                      <p className={`text-sm ${item.is_read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{item.title}</p>
                      <span className="text-xs text-slate-400">{formatRelative(item.created_at)}</span>
                    </div>
                    <p className="line-clamp-2 text-xs text-slate-500">{item.body}</p>
                  </>
                )}
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <div className="p-2">
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard/notifications">View all</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

