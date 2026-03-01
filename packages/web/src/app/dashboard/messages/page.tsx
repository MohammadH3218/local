'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/portal/page-header';
import { apiClient } from '@/lib/api-client';
import { usePortalBasePath } from '@/lib/portal';
import { IconMessage, IconSearch, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

type MessageThread = {
  id: string;
  contact_name: string;
  contact_phone: string;
  last_message: string;
  last_at: number;
  lead_status?: string;
};

const leadBadge = (status?: string) => {
  if (status === 'CONVERTED') {
    return { label: 'Scheduled', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (status === 'QUALIFIED' || status === 'CONTACTED') {
    return { label: 'Lead', className: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  return { label: 'No Lead', className: 'bg-slate-50 text-slate-600 border-slate-200' };
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name[0]?.toUpperCase() || '?';
};

const getAvatarColor = (name: string) => {
  const colors = [
    'bg-slate-700', 'bg-slate-600', 'bg-slate-500', 'bg-slate-800',
    'bg-slate-700', 'bg-slate-600', 'bg-slate-500', 'bg-slate-800',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const relativeTime = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function MessagesPage() {
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();
  const basePath = usePortalBasePath();

  useEffect(() => {
    let isActive = true;
    const loadThreads = async () => {
      try {
        const result = await apiClient.getMessageThreads(200);
        if (!isActive) return;
        setThreads(Array.isArray(result?.threads) ? result.threads : []);
        setError(null);
      } catch (err) {
        if (!isActive) return;
        setError(err instanceof Error ? err.message : 'Failed to load messages');
        setThreads([]);
      } finally {
        if (!isActive) return;
        setLoading(false);
      }
    };
    loadThreads();
    return () => { isActive = false; };
  }, []);

  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) =>
      `${t.contact_name} ${t.contact_phone} ${t.last_message}`.toLowerCase().includes(q)
    );
  }, [threads, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredThreads.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const pageThreads = filteredThreads.slice(pageStart, pageStart + pageSize);

  const handleSearchSubmit = () => {
    setCurrentPage(1);
    if (filteredThreads.length > 0) {
      router.push(`${basePath}/messages/${filteredThreads[0].id}`);
    }
  };

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const visiblePages = useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [currentPage, totalPages]);

  const PaginationBar = (
    <div className="flex items-center justify-between">
      <p className="text-sm text-slate-500">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={!canGoPrev}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconChevronLeft className="h-4 w-4" stroke={1.5} />
        </button>
        {visiblePages.map((page) => (
          <button
            key={page}
            onClick={() => setCurrentPage(page)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
              page === currentPage
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {page}
          </button>
        ))}
        <button
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={!canGoNext}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconChevronRight className="h-4 w-4" stroke={1.5} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Messages"
        title="AI SMS conversations"
        subtitle="Your AI handles text conversations, checks availability, and books jobs automatically."
      />

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" stroke={1.5} />
          <input
            type="text"
            placeholder="Search by name, phone, or message…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <button
          type="button"
          onClick={handleSearchSubmit}
          className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Search
        </button>
      </div>

      {/* Pagination — top */}
      {!loading && filteredThreads.length > pageSize && PaginationBar}

      {/* Thread list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4">
              <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : pageThreads.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-center">
          <IconMessage className="h-10 w-10 text-slate-300" stroke={1.5} />
          <p className="mt-3 text-sm font-semibold text-slate-700">No messages yet</p>
          <p className="mt-1 text-sm text-slate-500">SMS conversations will appear here once your AI starts texting.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pageThreads.map((thread) => {
            const lead = leadBadge(thread.lead_status);
            const initials = getInitials(thread.contact_name);
            const avatarColor = getAvatarColor(thread.contact_name);

            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => router.push(`${basePath}/messages/${thread.id}`)}
                className="group w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300"
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor}`}
                  >
                    {initials}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold text-slate-900">{thread.contact_name}</span>
                        <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${lead.className}`}>
                          {lead.label}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">{relativeTime(thread.last_at)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">{thread.contact_phone}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{thread.last_message}</p>
                  </div>

                  {/* Arrow */}
                  <IconChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" stroke={1.5} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination — bottom */}
      {!loading && filteredThreads.length > pageSize && PaginationBar}
    </div>
  );
}
