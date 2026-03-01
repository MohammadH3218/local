import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PLAN_FEATURES,
  PlanFeatures,
  SubscriptionPlan,
  UserRole,
} from '@handycall/shared';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';

type PlanBooleanFeature = {
  [K in keyof PlanFeatures]: PlanFeatures[K] extends boolean ? K : never;
}[keyof PlanFeatures];

export const PLAN_FEATURE_KEY = 'plan_feature';
export const PlanFeature = (feature: PlanBooleanFeature) => SetMetadata(PLAN_FEATURE_KEY, feature);

@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dynamodb: DynamoDBService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<PlanBooleanFeature>(PLAN_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { company_id?: string; role?: UserRole };
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const user = request.user;
    const headerCompanyId = request.headers?.['x-company-id'];
    const overrideCompanyId = Array.isArray(headerCompanyId) ? headerCompanyId[0] : headerCompanyId;
    const canOverrideCompany = user?.role === UserRole.ADMIN || user?.company_id === 'platform-admin';
    const companyId =
      canOverrideCompany && overrideCompanyId ? String(overrideCompanyId) : user?.company_id;

    if (!companyId) {
      throw new ForbiddenException('Company context is required');
    }

    const company = await this.dynamodb.get('companies', { company_id: companyId });
    if (!company) {
      throw new ForbiddenException('Company not found');
    }

    const rawPlan = company.subscription_plan;
    const plan: SubscriptionPlan = Object.values(SubscriptionPlan).includes(rawPlan)
      ? (rawPlan as SubscriptionPlan)
      : SubscriptionPlan.STARTER;
    const isEnabled = PLAN_FEATURES[plan]?.[requiredFeature] === true;

    if (!isEnabled) {
      throw new ForbiddenException(`Feature "${requiredFeature}" is not available on your current plan`);
    }

    return true;
  }
}
