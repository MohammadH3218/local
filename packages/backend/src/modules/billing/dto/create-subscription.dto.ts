import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { SubscriptionPlan } from '@handycall/shared';

export class CreateSubscriptionDto {
  @IsEnum(SubscriptionPlan)
  @IsNotEmpty()
  plan!: SubscriptionPlan;

  @IsString()
  @IsNotEmpty()
  payment_method_id!: string;
}
