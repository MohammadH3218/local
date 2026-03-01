import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { OutboundCallsService } from './outbound-calls.service';
import { CreateOutboundCallDto } from './dto/create-outbound-call.dto';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PlanFeature, PlanFeatureGuard } from '../../common/guards/plan-feature.guard';

@Controller('outbound-calls')
export class OutboundCallsController {
  constructor(private readonly service: OutboundCallsService) {}

  @Post()
  @UseGuards(PlanFeatureGuard)
  @PlanFeature('follow_up_sequences')
  createOutboundCall(
    @CompanyId() companyId: string,
    @Body() dto: CreateOutboundCallDto,
  ) {
    return this.service.createOutboundCall(companyId, dto);
  }

  @Get()
  @UseGuards(PlanFeatureGuard)
  @PlanFeature('follow_up_sequences')
  listOutboundCalls(
    @CompanyId() companyId: string,
    @Query('limit') limit?: string,
    @Query('lastKey') lastKey?: string,
  ) {
    return this.service.listOutboundCalls(companyId, {
      limit: limit ? Number(limit) : undefined,
      lastKey,
    });
  }

  @Post('status')
  @Public()
  async handleStatusCallback(@Body() body: any) {
    const sid = body?.CallSid;
    const status = body?.CallStatus;
    if (sid && status) {
      await this.service.updateCallStatus(sid, status);
    }
    return { ok: true };
  }
}
