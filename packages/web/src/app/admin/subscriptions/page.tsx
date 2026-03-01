'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SubscriptionPlan, SubscriptionStatus } from '@handycall/shared';
import { PageHeader } from '@/components/portal/page-header';
import { EmptyState } from '@/components/portal/empty-state';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface Subscription {
  company_id: string;
  company_name: string;
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus | null;
  current_period_start: number | null;
  current_period_end: number | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  cancel_at_period_end: boolean;
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [rowPlanDrafts, setRowPlanDrafts] = useState<Record<string, SubscriptionPlan>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [subs, revenue] = await Promise.all([
        apiClient.getAdminSubscriptions(),
        apiClient.getAdminRevenueMetrics(),
      ]);
      setSubscriptions(subs);
      setMetrics(revenue);
      const nextDrafts: Record<string, SubscriptionPlan> = {};
      for (const sub of subs as Subscription[]) {
        nextDrafts[sub.company_id] = (sub.plan || SubscriptionPlan.STARTER) as SubscriptionPlan;
      }
      setRowPlanDrafts(nextDrafts);
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const withRowBusy = async (companyId: string, fn: () => Promise<void>) => {
    setRowBusy((prev) => ({ ...prev, [companyId]: true }));
    try {
      await fn();
    } finally {
      setRowBusy((prev) => ({ ...prev, [companyId]: false }));
    }
  };

  const getStatusBadge = (status: SubscriptionStatus | null | undefined) => {
    if (!status) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Unknown
        </span>
      );
    }

    const colors: Record<SubscriptionStatus, string> = {
      [SubscriptionStatus.TRIALING]: 'bg-blue-100 text-blue-800',
      [SubscriptionStatus.ACTIVE]: 'bg-green-100 text-green-800',
      [SubscriptionStatus.PAST_DUE]: 'bg-yellow-100 text-yellow-800',
      [SubscriptionStatus.CANCELED]: 'bg-red-100 text-red-800',
      [SubscriptionStatus.UNPAID]: 'bg-orange-100 text-orange-800',
      [SubscriptionStatus.INCOMPLETE]: 'bg-gray-100 text-gray-800',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status]}`}>
        {status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ')}
      </span>
    );
  };

  const formatDate = (timestamp?: number | null) => {
    if (!timestamp) return '-';
    const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
    return new Date(ms).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getPlanColor = (plan: SubscriptionPlan | null) => {
    const colors = {
      [SubscriptionPlan.STARTER]: '#3b82f6',
      [SubscriptionPlan.PRO]: '#8b5cf6',
      [SubscriptionPlan.MAX]: '#10b981',
    };
    if (!plan) return '#6b7280';
    return colors[plan];
  };

  const syncCompanyFromStripe = async (companyId: string) => {
    await withRowBusy(companyId, async () => {
      await apiClient.getAdminCompanyBilling(companyId);
      await loadData();
      alert('Company billing synced from Stripe.');
    });
  };

  const updateCompanyPlan = async (sub: Subscription) => {
    const plan = rowPlanDrafts[sub.company_id];
    await withRowBusy(sub.company_id, async () => {
      await apiClient.updateAdminCompanySubscription(sub.company_id, plan);
      await loadData();
      alert(`Plan updated to ${plan}.`);
    });
  };

  const cancelCompanySubscription = async (sub: Subscription, immediate: boolean) => {
    const confirmText = immediate
      ? 'Cancel immediately now? This will remove the subscription right away.'
      : 'Cancel at period end? The user keeps access until the current period ends.';
    if (!window.confirm(confirmText)) return;

    await withRowBusy(sub.company_id, async () => {
      await apiClient.cancelAdminCompanySubscription(sub.company_id, immediate);
      await loadData();
      alert(immediate ? 'Subscription canceled immediately.' : 'Subscription set to cancel at period end.');
    });
  };

  const reactivateCompanySubscription = async (sub: Subscription) => {
    await withRowBusy(sub.company_id, async () => {
      await apiClient.reactivateAdminCompanySubscription(sub.company_id);
      await loadData();
      alert('Subscription reactivated.');
    });
  };

  // Calculate metrics from subscriptions
  const calculateMetrics = () => {
    if (!subscriptions.length) return null;

    const planCounts = {
      [SubscriptionPlan.STARTER]: 0,
      [SubscriptionPlan.PRO]: 0,
      [SubscriptionPlan.MAX]: 0,
    };

    const statusCounts: Record<SubscriptionStatus, number> = {
      [SubscriptionStatus.TRIALING]: 0,
      [SubscriptionStatus.ACTIVE]: 0,
      [SubscriptionStatus.PAST_DUE]: 0,
      [SubscriptionStatus.CANCELED]: 0,
      [SubscriptionStatus.UNPAID]: 0,
      [SubscriptionStatus.INCOMPLETE]: 0,
    };

    subscriptions.forEach((sub) => {
      if (sub.plan) {
        planCounts[sub.plan]++;
      }
      if (sub.status) {
        statusCounts[sub.status]++;
      }
    });

    const planData = [
      { name: 'Starter', value: planCounts[SubscriptionPlan.STARTER], color: '#3b82f6' },
      { name: 'Pro', value: planCounts[SubscriptionPlan.PRO], color: '#8b5cf6' },
      { name: 'Max', value: planCounts[SubscriptionPlan.MAX], color: '#10b981' },
    ];

    return {
      total: subscriptions.length,
      active: statusCounts[SubscriptionStatus.ACTIVE],
      trialing: statusCounts[SubscriptionStatus.TRIALING],
      canceled: statusCounts[SubscriptionStatus.CANCELED],
      planData,
    };
  };

  const stats = calculateMetrics();

  if (loading) {
    return (
      <div className="p-8 max-w-7xl">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="grid gap-6 md:grid-cols-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        eyebrow="Admin"
        title="Subscription management"
        subtitle="Monitor subscriptions, revenue, and customer metrics."
      />

      {/* Stats Overview */}
      {stats && (
        <div className="grid gap-6 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Subscriptions</CardDescription>
              <CardTitle className="text-3xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-3xl text-green-600">{stats.active}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Trialing</CardDescription>
              <CardTitle className="text-3xl text-blue-600">{stats.trialing}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Canceled</CardDescription>
              <CardTitle className="text-3xl text-red-600">{stats.canceled}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Revenue Metrics */}
      {metrics && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Recurring Revenue</CardTitle>
              <CardDescription>MRR breakdown by plan</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total MRR</span>
                  <span className="text-2xl font-bold">${metrics.total_mrr?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Starter</span>
                    <span className="font-medium">${metrics.starter_mrr?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Pro</span>
                    <span className="font-medium">${metrics.pro_mrr?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Max</span>
                    <span className="font-medium">${metrics.max_mrr?.toFixed(2) || '0.00'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan Distribution</CardTitle>
              <CardDescription>Subscriptions by plan type</CardDescription>
            </CardHeader>
            <CardContent>
              {stats && stats.planData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={stats.planData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {stats.planData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-gray-500">
                  No subscription data
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Subscriptions Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Subscriptions</CardTitle>
          <CardDescription>Complete list of customer subscriptions</CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <EmptyState
              title="No subscriptions found"
              description="Subscription activity will appear here once customers start plans."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-sm text-gray-600">
                    <th className="pb-3 font-medium">Company</th>
                    <th className="pb-3 font-medium">Plan</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Current Period</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Subscription ID</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {subscriptions.map((sub) => (
                    <tr key={sub.company_id} className="text-sm">
                      <td className="py-4">
                        <div>
                          <p className="font-medium text-gray-900">{sub.company_name}</p>
                          <p className="text-xs text-gray-500">{sub.company_id}</p>
                        </div>
                      </td>
                      <td className="py-4">
                        <span
                          className="px-2 py-1 rounded-md text-xs font-medium text-white"
                          style={{ backgroundColor: getPlanColor(sub.plan) }}
                        >
                          {sub.plan || 'N/A'}
                        </span>
                      </td>
                      <td className="py-4">
                        <div className="space-y-1">
                          {getStatusBadge(sub.status)}
                          {sub.cancel_at_period_end && (
                            <p className="text-xs text-red-600">Cancels at period end</p>
                          )}
                        </div>
                      </td>
                      <td className="py-4 text-gray-600">
                        {formatDate(sub.current_period_start)} - {formatDate(sub.current_period_end)}
                      </td>
                      <td className="py-4">
                        {sub.stripe_customer_id ? (
                          <a
                            className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100"
                            href={`https://dashboard.stripe.com/test/customers/${sub.stripe_customer_id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {sub.stripe_customer_id}
                          </a>
                        ) : (
                          <span className="text-xs text-gray-500">-</span>
                        )}
                      </td>
                      <td className="py-4">
                        {sub.stripe_subscription_id ? (
                          <a
                            className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100"
                            href={`https://dashboard.stripe.com/test/subscriptions/${sub.stripe_subscription_id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {sub.stripe_subscription_id}
                          </a>
                        ) : (
                          <span className="text-xs text-gray-500">-</span>
                        )}
                      </td>
                      <td className="py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className="h-8 rounded border border-gray-300 bg-white px-2 text-xs"
                            value={rowPlanDrafts[sub.company_id] || SubscriptionPlan.STARTER}
                            onChange={(e) =>
                              setRowPlanDrafts((prev) => ({
                                ...prev,
                                [sub.company_id]: e.target.value as SubscriptionPlan,
                              }))
                            }
                            disabled={rowBusy[sub.company_id]}
                          >
                            <option value={SubscriptionPlan.STARTER}>STARTER</option>
                            <option value={SubscriptionPlan.PRO}>PRO</option>
                            <option value={SubscriptionPlan.MAX}>MAX</option>
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateCompanyPlan(sub)}
                            disabled={rowBusy[sub.company_id]}
                          >
                            Change plan
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => syncCompanyFromStripe(sub.company_id)}
                            disabled={rowBusy[sub.company_id]}
                          >
                            Sync Stripe
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelCompanySubscription(sub, false)}
                            disabled={rowBusy[sub.company_id]}
                          >
                            Cancel EOP
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => cancelCompanySubscription(sub, true)}
                            disabled={rowBusy[sub.company_id]}
                          >
                            Cancel now
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => reactivateCompanySubscription(sub)}
                            disabled={rowBusy[sub.company_id]}
                          >
                            Reactivate
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
