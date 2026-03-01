'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/portal/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { FileText, Plus, X, DollarSign, CheckCircle, Clock } from 'lucide-react';

type Invoice = {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  customer_email?: string;
  total_cents: number;
  status: string;
  created_at: number;
  due_date?: number;
};

type InvoiceStats = {
  total_invoices: number;
  paid_invoices: number;
  outstanding_invoices: number;
  total_revenue_cents: number;
  outstanding_amount_cents: number;
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SENT: 'bg-blue-100 text-blue-700',
  VIEWED: 'bg-violet-100 text-violet-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

type LineItem = { description: string; quantity: number; unit_price_cents: number };

export default function InvoicesPage() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_name: '',
    customer_email: '',
    notes: '',
    line_items: [{ description: '', quantity: 1, unit_price_cents: 0 }] as LineItem[],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        (apiClient as any).get('/invoices?limit=50'),
        (apiClient as any).get('/invoices/stats'),
      ]);
      setInvoices(Array.isArray(list) ? list : []);
      setStats(s);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const handleCreate = async () => {
    if (!form.customer_name || !form.line_items[0].description) return;
    setSaving(true);
    try {
      await (apiClient as any).post('/invoices', form);
      toast({ title: 'Invoice created' });
      setShowForm(false);
      setForm({ customer_name: '', customer_email: '', notes: '', line_items: [{ description: '', quantity: 1, unit_price_cents: 0 }] });
      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to create invoice', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    try {
      await (apiClient as any).post(`/invoices/${invoiceId}/paid`);
      toast({ title: 'Invoice marked as paid' });
      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to update invoice', variant: 'destructive' });
    }
  };

  const handleSend = async (invoiceId: string) => {
    try {
      await (apiClient as any).post(`/invoices/${invoiceId}/send`);
      toast({ title: 'Invoice marked as sent' });
      await load();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    }
  };

  const addLineItem = () => setForm((f) => ({ ...f, line_items: [...f.line_items, { description: '', quantity: 1, unit_price_cents: 0 }] }));
  const removeLineItem = (i: number) => setForm((f) => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }));
  const updateLineItem = (i: number, field: keyof LineItem, value: any) => setForm((f) => ({
    ...f,
    line_items: f.line_items.map((item, idx) => idx === i ? { ...item, [field]: value } : item),
  }));

  const total = form.line_items.reduce((s, item) => s + (item.quantity || 0) * (item.unit_price_cents || 0), 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1,2,3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        subtitle="Create and manage invoices for your customers."
        actions={
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" /> New invoice
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total revenue</p>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatMoney(stats?.total_revenue_cents || 0)}</p>
          <p className="text-xs text-slate-500 mt-1">{stats?.paid_invoices || 0} paid invoices</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Outstanding</p>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatMoney(stats?.outstanding_amount_cents || 0)}</p>
          <p className="text-xs text-slate-500 mt-1">{stats?.outstanding_invoices || 0} unpaid invoices</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total invoices</p>
            <FileText className="h-4 w-4 text-slate-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats?.total_invoices || 0}</p>
          <p className="text-xs text-slate-500 mt-1">All time</p>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">New invoice</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-slate-400" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Customer name *</label>
              <Input placeholder="John Smith" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Customer email</label>
              <Input type="email" placeholder="john@example.com" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">Line items</label>
              <Button size="sm" variant="outline" onClick={addLineItem}>+ Add item</Button>
            </div>
            <div className="space-y-2">
              {form.line_items.map((item, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-center">
                  <Input placeholder="Description" value={item.description} onChange={(e) => updateLineItem(i, 'description', e.target.value)} />
                  <Input type="number" min={1} placeholder="Qty" value={item.quantity} onChange={(e) => updateLineItem(i, 'quantity', Number(e.target.value))} />
                  <Input type="number" min={0} step={0.01} placeholder="Price ($)" value={item.unit_price_cents / 100} onChange={(e) => updateLineItem(i, 'unit_price_cents', Math.round(parseFloat(e.target.value || '0') * 100))} />
                  {form.line_items.length > 1 && <button onClick={() => removeLineItem(i)} className="text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>}
                </div>
              ))}
            </div>
            <p className="mt-2 text-right text-sm font-semibold text-slate-900">Total: {formatMoney(total)}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Notes</label>
            <textarea rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Payment terms, notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={saving || !form.customer_name} size="sm">
              {saving ? 'Creating...' : 'Create invoice'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6 text-slate-400" />}
          title="No invoices yet"
          description="Create your first invoice to start billing customers."
        />
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm divide-y divide-slate-100">
          {invoices.map((inv) => (
            <div key={inv.invoice_id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{inv.invoice_number}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[inv.status] || STATUS_STYLES.DRAFT}`}>{inv.status}</span>
                </div>
                <p className="text-xs text-slate-600">{inv.customer_name}</p>
                <p className="text-xs text-slate-400">{new Date(inv.created_at).toLocaleDateString()}</p>
              </div>
              <p className="text-sm font-bold text-slate-900">{formatMoney(inv.total_cents)}</p>
              <div className="flex gap-1">
                {inv.status === 'DRAFT' && (
                  <Button size="sm" variant="outline" onClick={() => handleSend(inv.invoice_id)}>Send</Button>
                )}
                {(inv.status === 'SENT' || inv.status === 'VIEWED' || inv.status === 'OVERDUE') && (
                  <Button size="sm" onClick={() => handleMarkPaid(inv.invoice_id)}>
                    <CheckCircle className="mr-1 h-3 w-3" /> Mark paid
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
