'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/portal/page-header';
import { apiClient } from '@/lib/api-client';

type Payment = {
  payment_id: string;
  contact_id?: string;
  customer_name?: string;
  customer_email?: string;
  service_name?: string;
  amount_cents: number;
  currency: string;
  payment_type: string;
  payment_status: string;
  created_at: number;
  paid_at?: number;
  stripe_payment_intent_id?: string;
  stripe_checkout_session_id?: string;
  stripe_subscription_id?: string;
  stripe_charge_id?: string;
  metadata?: Record<string, any>;
};

function formatMoney(cents: number, currency = 'usd') {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function formatDate(ts?: number) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const canRefund = (status: string) =>
  String(status || '').toUpperCase() === 'SUCCEEDED';

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Receipt modal
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Payment | null>(null);

  // Refund modal
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);
  const [refundAmountDollars, setRefundAmountDollars] = useState('');
  const [refundReason, setRefundReason] = useState<'requested_by_customer' | 'duplicate' | 'fraudulent'>('requested_by_customer');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [refundSuccess, setRefundSuccess] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const start = dateFrom ? new Date(`${dateFrom}T00:00:00Z`).getTime() : undefined;
      const end = dateTo ? new Date(`${dateTo}T23:59:59Z`).getTime() : undefined;
      const [paymentsRes, statsRes] = await Promise.all([
        apiClient.getCustomerPayments({
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          type: typeFilter !== 'ALL' ? typeFilter : undefined,
          start,
          end,
          limit: 200,
        }),
        apiClient.getCustomerPaymentStats({ start, end }),
      ]);
      setPayments((paymentsRes?.payments || []) as Payment[]);
      setStats(statsRes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter, typeFilter]);

  const filtered = useMemo(() => {
    const start = dateFrom ? new Date(`${dateFrom}T00:00:00Z`).getTime() : null;
    const end = dateTo ? new Date(`${dateTo}T23:59:59Z`).getTime() : null;
    return payments.filter((payment) => {
      if (start !== null && payment.created_at < start) return false;
      if (end !== null && payment.created_at > end) return false;
      return true;
    });
  }, [payments, dateFrom, dateTo]);

  const exportCsv = () => {
    const header = ['Date', 'Customer', 'Service', 'Amount', 'Type', 'Status'];
    const rows = filtered.map((payment) => [
      formatDate(payment.created_at),
      payment.customer_name || '',
      payment.service_name || '',
      formatMoney(payment.amount_cents, payment.currency),
      payment.payment_type || '',
      payment.payment_status || '',
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `payments-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const openReceipt = async (paymentId: string) => {
    try {
      setReceiptLoading(true);
      const result = await apiClient.getCustomerPaymentById(paymentId);
      setSelectedReceipt((result?.payment || result) as Payment);
    } finally {
      setReceiptLoading(false);
    }
  };

  const closeReceipt = () => setSelectedReceipt(null);

  const printReceipt = () => {
    if (!selectedReceipt) return;
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=800,height=700');
    if (!popup) return;
    const html = `
      <html>
        <head><title>Payment Receipt</title></head>
        <body style="font-family:Arial,sans-serif;padding:24px;color:#0f172a;">
          <h2>HandyCall Payment Receipt</h2>
          <p><strong>Receipt ID:</strong> ${selectedReceipt.payment_id}</p>
          <p><strong>Date:</strong> ${formatDate(selectedReceipt.paid_at || selectedReceipt.created_at)}</p>
          <p><strong>Customer:</strong> ${selectedReceipt.customer_name || 'Customer'}</p>
          <p><strong>Service:</strong> ${selectedReceipt.service_name || '-'}</p>
          <p><strong>Type:</strong> ${selectedReceipt.payment_type || '-'}</p>
          <p><strong>Status:</strong> ${selectedReceipt.payment_status || '-'}</p>
          <p><strong>Amount:</strong> ${formatMoney(selectedReceipt.amount_cents, selectedReceipt.currency)}</p>
        </body>
      </html>
    `;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const openRefund = (payment: Payment) => {
    setRefundTarget(payment);
    setRefundAmountDollars((payment.amount_cents / 100).toFixed(2));
    setRefundReason('requested_by_customer');
    setRefundError('');
    setRefundSuccess('');
  };

  const closeRefund = () => {
    setRefundTarget(null);
    setRefundError('');
    setRefundSuccess('');
  };

  const submitRefund = async () => {
    if (!refundTarget) return;
    setRefundError('');
    setRefundSuccess('');
    setRefundLoading(true);
    try {
      const amountCents = Math.round(parseFloat(refundAmountDollars) * 100);
      const fullRefundCents = refundTarget.amount_cents;
      await apiClient.refundCustomerPayment(refundTarget.payment_id, {
        amount_cents: amountCents < fullRefundCents ? amountCents : undefined,
        reason: refundReason,
      });
      setRefundSuccess(`Refund of ${formatMoney(amountCents)} issued successfully.`);
      // Refresh payments list
      void load();
    } catch (err: any) {
      setRefundError(err?.message || 'Refund failed. Please try again.');
    } finally {
      setRefundLoading(false);
    }
  };

  const statusBadgeClass = (status: string) => {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'SUCCEEDED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (normalized === 'REFUNDED' || normalized === 'PARTIALLY_REFUNDED') return 'border-purple-200 bg-purple-50 text-purple-700';
    if (normalized === 'FAILED' || normalized === 'CANCELED') return 'border-red-200 bg-red-50 text-red-700';
    if (
      normalized === 'PROCESSING' ||
      normalized === 'REQUIRES_CONFIRMATION' ||
      normalized === 'REQUIRES_PAYMENT_METHOD'
    ) {
      return 'border-amber-200 bg-amber-50 text-amber-700';
    }
    return 'border-slate-200 bg-slate-50 text-slate-700';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Customer payments"
        subtitle="Track revenue, issue refunds, and manage all payment activity."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/payments/products">
              <Button variant="outline">Manage pricing</Button>
            </Link>
            <Button variant="outline" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Total revenue" value={formatMoney(Number(stats?.total_revenue_cents || 0), 'usd')} />
        <StatCard label="This month" value={formatMoney(Number(stats?.this_month_revenue_cents || 0), 'usd')} />
        <StatCard label="Successful" value={String(stats?.successful_payments || 0)} />
        <StatCard label="Avg ticket" value={formatMoney(Number(stats?.average_ticket_cents || 0), 'usd')} />
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="ALL">All statuses</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="PROCESSING">Processing</option>
            <option value="REQUIRES_CONFIRMATION">Requires confirmation</option>
            <option value="REQUIRES_PAYMENT_METHOD">Requires payment method</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELED">Canceled</option>
            <option value="REFUNDED">Refunded</option>
            <option value="PARTIALLY_REFUNDED">Partially refunded</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
          >
            <option value="ALL">All types</option>
            <option value="BOOKING">Booking</option>
            <option value="SUBSCRIPTION">Subscription</option>
            <option value="MANUAL">Manual</option>
            <option value="DEPOSIT">Deposit</option>
          </select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading...' : 'Apply filters'}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={7}>Loading payments…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={7}>No payments found.</td>
                </tr>
              ) : (
                filtered.map((payment) => (
                  <tr key={payment.payment_id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{formatDate(payment.created_at)}</td>
                    <td className="px-4 py-3">
                      {payment.contact_id ? (
                        <Link
                          href={`/dashboard/customers?contact=${payment.contact_id}`}
                          className="font-medium text-emerald-700 hover:text-emerald-600"
                        >
                          {payment.customer_name || 'Customer'}
                        </Link>
                      ) : (
                        payment.customer_name || 'Customer'
                      )}
                    </td>
                    <td className="px-4 py-3">{payment.service_name || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {formatMoney(payment.amount_cents, payment.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {payment.payment_type || 'BOOKING'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(payment.payment_status)}`}
                      >
                        {payment.payment_status || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void openReceipt(payment.payment_id)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Receipt
                        </button>
                        {canRefund(payment.payment_status) && (
                          <button
                            type="button"
                            onClick={() => openRefund(payment)}
                            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Modal */}
      {(selectedReceipt || receiptLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Payment receipt</h3>
              <button
                type="button"
                onClick={closeReceipt}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            {receiptLoading || !selectedReceipt ? (
              <p className="text-sm text-slate-500">Loading receipt…</p>
            ) : (
              <div className="space-y-2 text-sm text-slate-700">
                <p><span className="font-semibold text-slate-900">Receipt ID:</span> {selectedReceipt.payment_id}</p>
                <p><span className="font-semibold text-slate-900">Date:</span> {formatDate(selectedReceipt.paid_at || selectedReceipt.created_at)}</p>
                <p><span className="font-semibold text-slate-900">Customer:</span> {selectedReceipt.customer_name || 'Customer'}</p>
                <p><span className="font-semibold text-slate-900">Email:</span> {selectedReceipt.customer_email || '-'}</p>
                <p><span className="font-semibold text-slate-900">Service:</span> {selectedReceipt.service_name || '-'}</p>
                <p><span className="font-semibold text-slate-900">Type:</span> {selectedReceipt.payment_type || '-'}</p>
                <p><span className="font-semibold text-slate-900">Status:</span> {selectedReceipt.payment_status || '-'}</p>
                <p><span className="font-semibold text-slate-900">Amount:</span> {formatMoney(selectedReceipt.amount_cents, selectedReceipt.currency)}</p>
                {selectedReceipt.stripe_payment_intent_id ? (
                  <p><span className="font-semibold text-slate-900">Stripe Payment Intent:</span> {selectedReceipt.stripe_payment_intent_id}</p>
                ) : null}
                {selectedReceipt.stripe_subscription_id ? (
                  <p><span className="font-semibold text-slate-900">Stripe Subscription:</span> {selectedReceipt.stripe_subscription_id}</p>
                ) : null}
                <div className="flex items-center gap-2 pt-3">
                  <button
                    type="button"
                    onClick={printReceipt}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Print receipt
                  </button>
                  {canRefund(selectedReceipt.payment_status) && (
                    <button
                      type="button"
                      onClick={() => {
                        closeReceipt();
                        openRefund(selectedReceipt);
                      }}
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                    >
                      Issue refund
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Issue refund</h3>
              <button
                type="button"
                onClick={closeRefund}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p><span className="font-semibold">Customer:</span> {refundTarget.customer_name || 'Customer'}</p>
              <p><span className="font-semibold">Service:</span> {refundTarget.service_name || '-'}</p>
              <p><span className="font-semibold">Original amount:</span> {formatMoney(refundTarget.amount_cents, refundTarget.currency)}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Refund amount ($)
                </label>
                <Input
                  type="number"
                  min="0.50"
                  max={(refundTarget.amount_cents / 100).toFixed(2)}
                  step="0.01"
                  value={refundAmountDollars}
                  onChange={(e) => setRefundAmountDollars(e.target.value)}
                  placeholder="0.00"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Enter a partial amount or leave at full amount for a full refund.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Reason
                </label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value as any)}
                  className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm"
                >
                  <option value="requested_by_customer">Requested by customer</option>
                  <option value="duplicate">Duplicate charge</option>
                  <option value="fraudulent">Fraudulent</option>
                </select>
              </div>

              {refundError && (
                <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {refundError}
                </p>
              )}

              {refundSuccess && (
                <p className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
                  {refundSuccess}
                </p>
              )}

              {!refundSuccess && (
                <Button
                  onClick={() => void submitRefund()}
                  disabled={refundLoading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                >
                  {refundLoading
                    ? 'Processing refund…'
                    : `Refund ${formatMoney(Math.round(parseFloat(refundAmountDollars || '0') * 100))}`}
                </Button>
              )}

              {refundSuccess && (
                <Button
                  onClick={closeRefund}
                  variant="outline"
                  className="w-full"
                >
                  Done
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
