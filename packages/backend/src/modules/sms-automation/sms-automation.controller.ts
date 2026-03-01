import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SmsAutomationService } from './sms-automation.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/create-template.dto';
import { SendCampaignDto, SendSingleSmsDto } from './dto/send-campaign.dto';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { PlanFeature, PlanFeatureGuard } from '../../common/guards/plan-feature.guard';

@Controller('sms-automation')
@UseGuards(PlanFeatureGuard)
@PlanFeature('follow_up_sequences')
export class SmsAutomationController {
  constructor(private readonly service: SmsAutomationService) {}

  // Templates
  @Post('templates')
  createTemplate(@CompanyId() companyId: string, @Body() dto: CreateTemplateDto) {
    return this.service.createTemplate(companyId, dto);
  }

  @Get('templates')
  listTemplates(@CompanyId() companyId: string) {
    return this.service.listTemplates(companyId);
  }

  @Get('templates/:id')
  getTemplate(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getTemplate(companyId, id);
  }

  @Put('templates/:id')
  updateTemplate(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.service.updateTemplate(companyId, id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.deleteTemplate(companyId, id);
  }

  // Campaign
  @Post('campaign')
  sendCampaign(@CompanyId() companyId: string, @Body() dto: SendCampaignDto) {
    return this.service.sendCampaign(companyId, dto);
  }

  @Post('send')
  sendSingle(@CompanyId() companyId: string, @Body() dto: SendSingleSmsDto) {
    return this.service.sendSingle(companyId, dto);
  }

  // Scheduled messages
  @Get('scheduled')
  listScheduled(
    @CompanyId() companyId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listScheduledMessages(companyId, {
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Delete('scheduled/:messageId')
  cancelScheduled(
    @CompanyId() companyId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.service.cancelScheduledMessage(companyId, messageId);
  }
}
