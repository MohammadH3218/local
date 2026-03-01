'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { usePortalBasePath } from '@/lib/portal';
import { PageHeader } from '@/components/portal/page-header';
import { IconPhone, IconSearch, IconChevronRight, IconChevronLeft } from '@tabler/icons-react';

interface Call {
  call_id: string;
  company_id: string;
  contact_id?: string;
  caller_phone: string;
  caller_name?: string;
  from_number?: string;
  to_number?: string;
  direction?: string;
  created_at: string;
  duration?: number;
  status: string;
  summary?: string;
  transcript?: string;
  recording_url?: string;
  sentiment?: string;
  lead_captured?: boolean;
  appointment_created?: boolean;
  appointment_id?: string;
  outcome?: string;
  lead_quality?: string;
  collected_info?: any;
}

export default function CallsPage() {
  const router = useRouter();
  const basePath = usePortalBasePath();
  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactFilter, setContactFilter] = useState<string | null>(null);
  const [pageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageKeys, setPageKeys] = useState<(string | null)[]>([null]);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [isPaging, setIsPaging] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const contact = params.get('contact');
    setContactFilter(contact);
  }, []);

  useEffect(() => {
    void loadCallsPage(1, true);
    void loadTotalCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactFilter]);

  const loadTotalCount = async () => {
    if (contactFilter) return;
    try {
      const res = await apiClient.getCallsCount();
      const total = Number(res?.total || 0);
      setTotalPages(Math.max(1, Math.ceil(total / pageSize)));
    } catch {
      setTotalPages(null);
    }
  };

  const loadCallsPage = async (page: number, reset = false) => {
    try {
      if (reset) {
        setIsLoading(true);
        setCalls([]);
        setCurrentPage(1);
        setPageKeys([null]);
        setTotalPages(null);
      } else {
        setIsPaging(true);
      }
      setError(null);

      const previousKey = pageKeys[page - 1] ?? null;
      const response = contactFilter
        ? await apiClient.getContactCalls(contactFilter, pageSize, previousKey || undefined)
        : await apiClient.getCalls(pageSize, previousKey || undefined);

      setCalls(response.calls || []);
      const nextKey = response.lastEvaluatedKey ? JSON.stringify(response.lastEvaluatedKey) : null;
      setPageKeys((prev) => {
        const next = [...prev];
        next[page] = nextKey;
        return next;
      });

      if (contactFilter && typeof response.total === 'number') {
        setTotalPages(Math.max(1, Math.ceil(response.total / pageSize)));
      }

      setCurrentPage(page);
    } catch (err: any) {
      console.error('Error loading calls:', err);
      setError(err.message || 'Failed to load calls');
    } finally {
      setIsLoading(false);
      setIsPaging(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      void loadCallsPage(1, true);
      return;
    }
    try {
      setIsLoading(true);
      const results = await apiClient.searchCalls(searchQuery, pageSize);
      setCalls(results || []);
      setTotalPages(1);
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Error searching calls:', err);
      setError(err.message || 'Search failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewCall = (callId: string) => {
    router.push(`${basePath}/calls/${callId}`);
  };

  const normalizePhone = (value?: string) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
    return digits;
  };

  const formatPhone = (value?: string) => {
    const normalized = normalizePhone(value);
    if (normalized.length === 10) {
      return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
    }
    return String(value || 'Unknown');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getInitials = (name?: string) => {
    if (!name?.trim()) return '#';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return name[0].toUpperCase();
  };

  const getCallTag = (call: Call) => {
    const status = String(call.status || '').toUpperCase();
    if (status === 'IN_PROGRESS' || status === 'RINGING') {
      return {
        label: 'In Progress',
        badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      };
    }
    const outcome = String(call.outcome || '').toUpperCase();
    if (outcome === 'APPOINTMENT_BOOKED' || call.appointment_created || call.appointment_id) {
      return {
        label: 'Booked',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    }
    if (outcome === 'LEAD' || call.lead_captured) {
      return {
        label: 'Lead',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    }
    return {
      label: 'No Lead',
      badgeClass: 'bg-slate-50 text-slate-600 border-slate-200',
    };
  };

  const canGoPrev = currentPage > 1;
  const canGoNext = totalPages ? currentPage < totalPages : Boolean(pageKeys[currentPage]);

  const visiblePages = useMemo(() => {
    if (!totalPages) return [currentPage];
    const pages: number[] = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [currentPage, totalPages]);

  const handlePageChange = async (page: number) => {
    if (page === currentPage) return;
    if (!pageKeys[page - 1] && page > 1) {
      let nextPage = currentPage;
      while (nextPage < page && pageKeys[nextPage]) {
        nextPage += 1;
        await loadCallsPage(nextPage);
      }
      return;
    }
    await loadCallsPage(page);
  };

  const PaginationBar = (
    <div className="flex items-center justify-between">
      <p className="text-sm text-slate-500">
        Page {currentPage}{totalPages ? ` of ${totalPages}` : ''}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => void handlePageChange(currentPage - 1)}
          disabled={!canGoPrev || isPaging}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconChevronLeft className="h-4 w-4" stroke={1.5} />
        </button>
        {visiblePages.map((page) => (
          <button
            key={page}
            onClick={() => void handlePageChange(page)}
            disabled={isPaging}
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
          onClick={() => void handlePageChange(currentPage + 1)}
          disabled={!canGoNext || isPaging}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <IconChevronRight className="h-4 w-4" stroke={1.5} />
        </button>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="text-sm text-red-800">{error}</p>
          <button
            onClick={() => void loadCallsPage(1, true)}
            className="mt-2 text-sm font-medium text-red-600 underline hover:text-red-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Calls"
        title="Every conversation in one place."
        subtitle="Search recent calls, review outcomes, and follow up on leads."
      />

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" stroke={1.5} />
          <input
            type="text"
            placeholder="Search by name, phone, or summary…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleSearch()}
          className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Search
        </button>
      </div>

      {/* Pagination — top */}
      {!isLoading && calls.length > 0 && PaginationBar}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : calls.length > 0 ? (
        <div className="space-y-2">
          {calls.map((call) => {
            const tag = getCallTag(call);
            const displayName = call.caller_name?.trim() || formatPhone(call.caller_phone);
            const showPhone = Boolean(call.caller_name?.trim());
            const duration = formatDuration(call.duration);

            return (
              <div
                key={call.call_id}
                onClick={() => handleViewCall(call.call_id)}
                className="group flex cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300"
              >
                {/* Avatar */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-bold text-slate-700">
                  {getInitials(call.caller_name)}
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-slate-900">{displayName}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tag.badgeClass}`}>
                      {tag.label}
                    </span>
                  </div>
                  {showPhone && (
                    <p className="mt-0.5 text-sm text-slate-500">{formatPhone(call.caller_phone)}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDate(call.created_at)} · {formatTime(call.created_at)}
                    {duration ? ` · ${duration}` : ''}
                  </p>
                </div>

                {/* Arrow */}
                <IconChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" stroke={1.5} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <IconPhone className="mx-auto h-10 w-10 text-slate-300" stroke={1.5} />
          <p className="mt-3 text-sm font-semibold text-slate-900">No calls yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Your AI receptionist will handle calls automatically when your business is unavailable.
          </p>
        </div>
      )}

      {/* Pagination — bottom */}
      {!isLoading && calls.length > 0 && PaginationBar}
    </div>
  );
}
