import { useMemo } from 'react';
import {
  PLAN_FEATURES,
  PlanFeatures,
  SubscriptionPlan,
} from '@handycall/shared';
import { normalizePlan } from '@/constants/plans';
import { useAuthStore } from '@/stores/auth-store';

type PlanBooleanFeature = {
  [K in keyof PlanFeatures]: PlanFeatures[K] extends boolean ? K : never;
}[keyof PlanFeatures];

export function resolvePlanFeatures(plan?: SubscriptionPlan | string | null): PlanFeatures {
  const normalizedPlan = normalizePlan(plan) ?? SubscriptionPlan.STARTER;
  return PLAN_FEATURES[normalizedPlan];
}

export function usePlanFeatures(planOverride?: SubscriptionPlan | string | null) {
  const companyPlan = useAuthStore((state) => state.company?.subscription_plan);
  const activePlan = normalizePlan(planOverride ?? companyPlan) ?? SubscriptionPlan.STARTER;
  const features = useMemo(() => PLAN_FEATURES[activePlan], [activePlan]);

  const hasFeature = (feature: PlanBooleanFeature) => features[feature] === true;

  return {
    plan: activePlan,
    features,
    hasFeature,
  };
}
