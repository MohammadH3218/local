import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlanFeatureGuard } from '../../common/guards/plan-feature.guard';

@Module({
  imports: [NotificationsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, PlanFeatureGuard],
  exports: [WebhooksService],
})
export class WebhooksModule {}
