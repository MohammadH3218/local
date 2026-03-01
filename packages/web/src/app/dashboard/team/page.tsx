'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/portal/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, X, Trash2, Mail } from 'lucide-react';

type TeamMember = {
  member_id: string;
  email: string;
  first_name: string;
  last_name?: string;
  role: string;
  status: string;
  created_at: number;
};

const ROLES = [
  { value: 'DISPATCHER', label: 'Dispatcher', description: 'Can manage leads, schedule, and customers' },
  { value: 'TECHNICIAN', label: 'Technician', description: 'Can view schedule and customers' },
];

const ROLE_STYLES: Record<string, string> = {
  OWNER: 'bg-violet-100 text-violet-700',
  DISPATCHER: 'bg-blue-100 text-blue-700',
  TECHNICIAN: 'bg-slate-100 text-slate-700',
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  INVITED: 'bg-amber-100 text-amber-700',
  REMOVED: 'bg-red-100 text-red-700',
};

export default function TeamPage() {
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', role: 'DISPATCHER' });

  const load = async () => {
    setLoading(true);
    try {
      const data = await (apiClient as any).get('/team');
      setMembers(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const handleInvite = async () => {
    if (!form.email || !form.first_name) return;
    setSaving(true);
    try {
      await (apiClient as any).post('/team/invite', form);
      toast({ title: 'Invitation sent', description: `Invited ${form.email}` });
      setShowForm(false);
      setForm({ email: '', first_name: '', last_name: '', role: 'DISPATCHER' });
      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to send invite', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from your team?`)) return;
    try {
      await (apiClient as any).delete(`/team/${memberId}`);
      toast({ title: 'Team member removed' });
      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
        {[1,2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Team Management"
        subtitle="Invite team members and manage their roles and access."
        actions={
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" /> Invite member
          </Button>
        }
      />

      {showForm && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Invite team member</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-slate-400" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Email *</label>
              <Input type="email" placeholder="jane@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">First name *</label>
              <Input placeholder="Jane" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Last name</label>
              <Input placeholder="Smith" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Role</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.description}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleInvite} disabled={saving || !form.email || !form.first_name} size="sm">
              <Mail className="mr-1 h-4 w-4" />
              {saving ? 'Sending...' : 'Send invite'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6 text-slate-400" />}
          title="No team members yet"
          description="Invite dispatchers and technicians to your team."
        />
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100">
          {members.map((m) => (
            <div key={m.member_id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                {m.first_name[0]}{m.last_name?.[0] || ''}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{m.first_name} {m.last_name}</p>
                <p className="text-xs text-slate-500">{m.email}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_STYLES[m.role] || 'bg-slate-100 text-slate-600'}`}>{m.role}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[m.status] || 'bg-slate-100 text-slate-600'}`}>{m.status}</span>
              {m.role !== 'OWNER' && (
                <button onClick={() => handleRemove(m.member_id, m.first_name)} className="text-slate-400 hover:text-red-600 transition">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
