import { IsEnum, IsNotEmpty } from 'class-validator';
import { SubscriptionPlan } from '@handycall/shared';

export class UpdateSubscriptionDto {
  @IsEnum(SubscriptionPlan)
  @IsNotEmpty()
  plan!: SubscriptionPlan;
}
