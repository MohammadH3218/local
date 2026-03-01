import { SubscriptionPlan } from '@handycall/shared';
import { PLAN_CATALOG, normalizePlan } from '@/constants/plans';

export type NormalizedUsage = {
  call_minutes: number;
  sms_count: number;
  active_contacts: number;
  period_start?: number;
  period_end?: number;
};

export function normalizeUsageResponse(raw: any, subscription?: any): NormalizedUsage {
  const usage = raw?.usage ?? raw ?? {};
  const period_start =
    subscription?.current_period_start ??
    usage.period_start ??
    usage.current_period_start ??
    undefined;
  const period_end =
    subscription?.current_period_end ?? usage.period_end ?? usage.current_period_end ?? undefined;

  return {
    call_minutes: usage.call_minutes ?? usage.minutes_used ?? 0,
    sms_count: usage.sms_count ?? usage.sms_sent_count ?? 0,
    active_contacts: usage.active_contacts ?? usage.contacts_count ?? 0,
    period_start: period_start ? Number(period_start) : undefined,
    period_end: period_end ? Number(period_end) : undefined,
  };
}

export function resolvePlanLimits(
  plan?: SubscriptionPlan,
  planLimitsFromApi?: { monthly_minutes?: number; sms_limit?: number; contacts_limit?: number }
) {
  if (plan && PLAN_CATALOG[plan]) {
    return PLAN_CATALOG[plan].limits;
  }

  if (planLimitsFromApi) {
    return {
      minutes: planLimitsFromApi.monthly_minutes ?? 0,
      sms: planLimitsFromApi.sms_limit ?? 0,
      contacts: planLimitsFromApi.contacts_limit ?? 0,
    };
  }

  return undefined;
}

export function resolvePlan(plan?: string | SubscriptionPlan | null): SubscriptionPlan | undefined {
  return normalizePlan(plan);
}
