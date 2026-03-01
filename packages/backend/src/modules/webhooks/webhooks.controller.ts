import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { UpdateWebhookConfigDto } from './webhooks.dto';
import { UseGuards } from '@nestjs/common';
import { PlanFeature, PlanFeatureGuard } from '../../common/guards/plan-feature.guard';

@Controller('webhooks')
@UseGuards(PlanFeatureGuard)
@PlanFeature('crm_integrations')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get('events')
  listEvents() {
    return { events: this.webhooks.listEvents() };
  }

  @Get('config')
  async getConfig(@CompanyId() companyId: string) {
    const config = await this.webhooks.getConfig(companyId);
    return { config };
  }

  @Put('config')
  async updateConfig(
    @CompanyId() companyId: string,
    @Body() dto: UpdateWebhookConfigDto,
  ) {
    const config = await this.webhooks.upsertConfig(companyId, dto);
    return { config };
  }

  @Post('test')
  async testWebhook(@CompanyId() companyId: string) {
    const result = await this.webhooks.testWebhook(companyId);
    return { result };
  }

  @Post('rotate-secret')
  async rotateSecret(@CompanyId() companyId: string) {
    const config = await this.webhooks.rotateSecret(companyId);
    return { config };
  }
}
