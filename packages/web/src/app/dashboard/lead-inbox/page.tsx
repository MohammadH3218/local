'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/portal/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, Phone, MessageSquare, Search, Flame, Thermometer, Snowflake } from 'lucide-react';

type LeadScore = {
  contact_id: string;
  score: number;
  label: 'hot' | 'warm' | 'cold';
};

type Contact = {
  contact_id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  phone?: string;
  email?: string;
  lead_status?: string;
  last_contact_at?: number;
  created_at?: number;
};

const SCORE_STYLES = {
  hot: { bg: 'bg-red-100 text-red-700 border-red-200', icon: <Flame className="h-3 w-3" />, bar: 'bg-red-500' },
  warm: { bg: 'bg-amber-100 text-amber-700 border-amber-200', icon: <Thermometer className="h-3 w-3" />, bar: 'bg-amber-500' },
  cold: { bg: 'bg-blue-100 text-blue-700 border-blue-200', icon: <Snowflake className="h-3 w-3" />, bar: 'bg-blue-400' },
};

export default function LeadInboxPage() {
  const [scores, setScores] = useState<LeadScore[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [scoreData, contactData] = await Promise.all([
        (apiClient as any).get('/leads/scores').catch(() => []),
        apiClient.getContacts(500).catch(() => ({ items: [] })),
      ]);

      const scoreList: LeadScore[] = Array.isArray(scoreData) ? scoreData : [];
      setScores(scoreList);

      const contactMap: Record<string, Contact> = {};
      const items = (contactData as any)?.items || (Array.isArray(contactData) ? contactData : []);
      for (const c of items) {
        contactMap[c.contact_id] = c;
      }
      setContacts(contactMap);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const enriched = useMemo(() => {
    return scores
      .map((s) => ({ ...s, contact: contacts[s.contact_id] }))
      .filter((s) => s.contact)
      .filter((s) => filter === 'all' || s.label === filter)
      .filter((s) => {
        if (!search) return true;
        const c = s.contact!;
        const name = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
        const phone = c.phone_number || c.phone || '';
        return name.toLowerCase().includes(search.toLowerCase()) || phone.includes(search);
      });
  }, [scores, contacts, filter, search]);

  const counts = useMemo(() => ({
    hot: scores.filter((s) => s.label === 'hot').length,
    warm: scores.filter((s) => s.label === 'warm').length,
    cold: scores.filter((s) => s.label === 'cold').length,
  }), [scores]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
        {[1,2,3,4].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Lead Inbox"
        subtitle="Leads ranked by conversion probability. Focus on the hot ones first."
        actions={<Button onClick={() => void load()} size="sm" variant="outline">Refresh scores</Button>}
      />

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {([
          ['all', 'All leads', scores.length, 'bg-slate-100 text-slate-700'],
          ['hot', 'Hot', counts.hot, 'bg-red-100 text-red-700'],
          ['warm', 'Warm', counts.warm, 'bg-amber-100 text-amber-700'],
          ['cold', 'Cold', counts.cold, 'bg-blue-100 text-blue-700'],
        ] as const).map(([val, label, count, style]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === val ? style + ' ring-2 ring-offset-1 ring-current' : style + ' opacity-70 hover:opacity-100'
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {enriched.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6 text-slate-400" />}
          title="No leads found"
          description="Leads will appear here as customers call in."
        />
      ) : (
        <div className="space-y-2">
          {enriched.map(({ contact_id, score, label, contact }) => {
            if (!contact) return null;
            const name = contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';
            const phone = contact.phone_number || contact.phone || '';
            const scoreStyle = SCORE_STYLES[label];
            return (
              <div key={contact_id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm hover:border-slate-200 transition">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-700">
                    {name[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Link href={`/dashboard/customers?contact=${contact_id}`} className="text-sm font-semibold text-slate-900 hover:text-emerald-600 transition">
                        {name}
                      </Link>
                      <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreStyle.bg}`}>
                        {scoreStyle.icon} {label}
                      </span>
                      {contact.lead_status && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{contact.lead_status}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{phone}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right mr-2">
                      <p className="text-lg font-bold text-slate-900">{score}</p>
                      <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${scoreStyle.bar}`} style={{ width: `${score}%` }} />
                      </div>
                    </div>
                    {phone && (
                      <Link
                        href="/dashboard/outbound-calls"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-emerald-200 hover:text-emerald-600 transition"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {phone && (
                      <Link
                        href="/dashboard/messages"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-emerald-200 hover:text-emerald-600 transition"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
