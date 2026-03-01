'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/portal/page-header';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

type PriceType = 'ONE_TIME' | 'SUBSCRIPTION';
type BillingInterval = 'day' | 'week' | 'month' | 'year';

interface ServiceProduct {
  product_id: string;
  name: string;
  description?: string;
  price_type: PriceType;
  amount_cents: number;
  currency: string;
  billing_interval?: BillingInterval;
  billing_interval_count?: number;
  trial_period_days?: number;
  active: boolean;
  created_at: number;
}

const BLANK_FORM = {
  name: '',
  description: '',
  price_type: 'ONE_TIME' as PriceType,
  amount_dollars: '',
  currency: 'usd',
  billing_interval: 'month' as BillingInterval,
  billing_interval_count: 1,
  trial_period_days: 0,
};

function formatMoney(cents: number, currency = 'usd') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function intervalLabel(p: ServiceProduct) {
  if (p.price_type === 'ONE_TIME') return 'One-time';
  const count = p.billing_interval_count || 1;
  const interval = p.billing_interval || 'month';
  return count === 1 ? `/${interval}` : `every ${count} ${interval}s`;
}

export default function ServiceProductsPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<ServiceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<ServiceProduct | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Checkout link modal
  const [checkoutTarget, setCheckoutTarget] = useState<ServiceProduct | null>(null);
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [checkoutClientSecret, setCheckoutClientSecret] = useState('');
  const [checkoutError, setCheckoutError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiClient.listServiceProducts(showInactive);
      setProducts(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [showInactive]);

  const resetForm = () => {
    setForm({ ...BLANK_FORM });
    setEditingId(null);
    setError('');
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (product: ServiceProduct) => {
    setForm({
      name: product.name,
      description: product.description || '',
      price_type: product.price_type,
      amount_dollars: (product.amount_cents / 100).toFixed(2),
      currency: product.currency || 'usd',
      billing_interval: (product.billing_interval as BillingInterval) || 'month',
      billing_interval_count: product.billing_interval_count ?? 1,
      trial_period_days: product.trial_period_days ?? 0,
    });
    setEditingId(product.product_id);
    setShowForm(true);
    setError('');
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const save = async () => {
    setError('');
    const amountCents = Math.round(parseFloat(form.amount_dollars || '0') * 100);
    if (!form.name.trim()) { setError('Product name is required.'); return; }
    if (!amountCents || amountCents < 50) { setError('Amount must be at least $0.50.'); return; }
    if (form.price_type === 'SUBSCRIPTION' && !form.billing_interval) {
      setError('Billing interval is required for subscriptions.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        price_type: form.price_type,
        amount_cents: amountCents,
        currency: form.currency,
        billing_interval: form.price_type === 'SUBSCRIPTION' ? form.billing_interval : undefined,
        billing_interval_count: form.price_type === 'SUBSCRIPTION' ? form.billing_interval_count : undefined,
        trial_period_days: form.price_type === 'SUBSCRIPTION' ? form.trial_period_days : undefined,
      };

      if (editingId) {
        await apiClient.updateServiceProduct(editingId, payload);
        toast({ title: 'Product updated', description: `"${form.name.trim()}" has been saved.` });
      } else {
        await apiClient.createServiceProduct(payload as any);
        toast({ title: 'Product created', description: `"${form.name.trim()}" is now active.` });
      }

      closeForm();
      void load();
    } catch (err: any) {
      setError(err?.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient.deleteServiceProduct(deleteTarget.product_id);
      toast({ title: 'Product archived', description: `"${deleteTarget.name}" has been archived.` });
      setDeleteTarget(null);
      void load();
    } catch (err: any) {
      toast({ title: 'Archive failed', description: err?.message || 'Failed to archive product.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const restore = async (product: ServiceProduct) => {
    try {
      await apiClient.updateServiceProduct(product.product_id, { active: true });
      toast({ title: 'Product restored', description: `"${product.name}" is active again.` });
      void load();
    } catch (err: any) {
      toast({ title: 'Restore failed', description: err?.message || 'Failed to restore product.', variant: 'destructive' });
    }
  };

  const openCheckout = (product: ServiceProduct) => {
    setCheckoutTarget(product);
    setCheckoutEmail('');
    setCheckoutUrl('');
    setCheckoutClientSecret('');
    setCheckoutError('');
  };

  const generateCheckoutLink = async () => {
    if (!checkoutTarget) return;
    setCheckoutLoading(true);
    setCheckoutError('');
    setCheckoutUrl('');
    setCheckoutClientSecret('');
    try {
      const result = await apiClient.createProductCheckout(checkoutTarget.product_id, {
        customer_email: checkoutEmail || undefined,
      });
      if (result?.checkout_url) {
        setCheckoutUrl(result.checkout_url);
      } else if (result?.client_secret) {
        setCheckoutClientSecret(result.client_secret);
      }
    } catch (err: any) {
      setCheckoutError(err?.message || 'Failed to generate checkout link.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Service products & pricing"
        subtitle="Define what you offer and how you charge — subscriptions, one-time payments, and more."
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Show archived
            </label>
            <Button onClick={openCreate}>New product</Button>
          </div>
        }
      />

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-slate-400 shadow-sm">
          Loading products…
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-700 mb-2">No products yet</p>
          <p className="text-sm text-slate-400 mb-6">
            Create your first service product — a subscription plan or one-time charge — to start collecting payments.
          </p>
          <Button onClick={openCreate}>Create first product</Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <div
              key={product.product_id}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition ${
                product.active
                  ? 'border-slate-100 hover:border-emerald-200 hover:shadow-md'
                  : 'border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-slate-900">{product.name}</p>
                  {product.description && (
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{product.description}</p>
                  )}
                </div>
                <span
                  className={`ml-2 flex-shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    product.price_type === 'SUBSCRIPTION'
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {product.price_type === 'SUBSCRIPTION' ? 'Subscription' : 'One-time'}
                </span>
              </div>

              <p className="mt-3 text-2xl font-extrabold text-slate-900">
                {formatMoney(product.amount_cents, product.currency)}
                <span className="text-sm font-normal text-slate-400 ml-1">{intervalLabel(product)}</span>
              </p>

              {product.price_type === 'SUBSCRIPTION' && product.trial_period_days ? (
                <p className="mt-1 text-xs text-slate-400">{product.trial_period_days}-day free trial</p>
              ) : null}

              {!product.active && (
                <p className="mt-2 text-xs font-semibold text-slate-400">Archived</p>
              )}

              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {product.active && (
                  <button
                    type="button"
                    onClick={() => openCheckout(product)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Get payment link
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openEdit(product)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
                {product.active ? (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(product)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void restore(product)}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl my-auto">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {editingId ? 'Edit product' : 'New service product'}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Product name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Monthly Lawn Care"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe what's included…"
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Charge type *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['ONE_TIME', 'SUBSCRIPTION'] as PriceType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, price_type: type }))}
                      className={`rounded-xl border py-2.5 text-sm font-semibold transition ${
                        form.price_type === type
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {type === 'ONE_TIME' ? 'One-time payment' : 'Recurring subscription'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Amount ($) *</label>
                  <Input
                    type="number"
                    min="0.50"
                    step="0.01"
                    value={form.amount_dollars}
                    onChange={(e) => setForm((f) => ({ ...f, amount_dollars: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  >
                    <option value="usd">USD ($)</option>
                    <option value="cad">CAD (C$)</option>
                    <option value="eur">EUR (€)</option>
                    <option value="gbp">GBP (£)</option>
                  </select>
                </div>
              </div>

              {form.price_type === 'SUBSCRIPTION' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">Billing interval *</label>
                      <select
                        value={form.billing_interval}
                        onChange={(e) => setForm((f) => ({ ...f, billing_interval: e.target.value as BillingInterval }))}
                        className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                      >
                        <option value="day">Daily</option>
                        <option value="week">Weekly</option>
                        <option value="month">Monthly</option>
                        <option value="year">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">Every N intervals</label>
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        value={form.billing_interval_count}
                        onChange={(e) => setForm((f) => ({ ...f, billing_interval_count: parseInt(e.target.value) || 1 }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Free trial (days)</label>
                    <Input
                      type="number"
                      min={0}
                      value={form.trial_period_days}
                      onChange={(e) => setForm((f) => ({ ...f, trial_period_days: parseInt(e.target.value) || 0 }))}
                      placeholder="0 = no trial"
                    />
                  </div>
                </>
              )}

              {error && (
                <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <Button
                onClick={() => void save()}
                disabled={saving}
                className="w-full"
              >
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create product'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive product</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive &quot;{deleteTarget?.name}&quot;? It will no longer be shown to customers. You can restore it anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmArchive()} disabled={isDeleting}>
              {isDeleting ? 'Archiving…' : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout Link Modal */}
      {checkoutTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Payment link</h3>
              <button
                type="button"
                onClick={() => setCheckoutTarget(null)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold">{checkoutTarget.name}</p>
              <p className="text-slate-400">
                {formatMoney(checkoutTarget.amount_cents, checkoutTarget.currency)} {intervalLabel(checkoutTarget)}
              </p>
            </div>

            {!checkoutUrl && !checkoutClientSecret && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Customer email (optional)
                  </label>
                  <Input
                    type="email"
                    value={checkoutEmail}
                    onChange={(e) => setCheckoutEmail(e.target.value)}
                    placeholder="customer@example.com"
                  />
                  <p className="mt-1 text-xs text-slate-400">Pre-fill the customer&apos;s email on the checkout page.</p>
                </div>
                {checkoutError && (
                  <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    {checkoutError}
                  </p>
                )}
                <Button
                  onClick={() => void generateCheckoutLink()}
                  disabled={checkoutLoading}
                  className="w-full"
                >
                  {checkoutLoading ? 'Generating…' : 'Generate payment link'}
                </Button>
              </div>
            )}

            {checkoutUrl && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Share this link with your customer. They&apos;ll be taken to a secure Stripe checkout page.
                </p>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-xs font-mono break-all text-emerald-800">{checkoutUrl}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(checkoutUrl);
                      toast({ title: 'Copied!', description: 'Payment link copied to clipboard.' });
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Copy link
                  </Button>
                  <a
                    href={checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Open link
                  </a>
                </div>
              </div>
            )}

            {checkoutClientSecret && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Payment intent created. Use the client secret to render a Stripe Elements form on your site.
                </p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-mono break-all text-slate-600">{checkoutClientSecret}</p>
                </div>
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(checkoutClientSecret);
                    toast({ title: 'Copied!', description: 'Client secret copied to clipboard.' });
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Copy client secret
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
