import { Controller, Get, Param, Query } from '@nestjs/common';
import { CallsService } from './calls.service';
import { CompanyId } from '../../common/decorators/auth.decorator';

@Controller('calls')
export class CallsController {
  constructor(private callsService: CallsService) {}

  @Get()
  async getCalls(
    @CompanyId() companyId: string,
    @Query('limit') limit?: string,
    @Query('lastEvaluatedKey') lastEvaluatedKey?: string,
  ) {
    return this.callsService.getCalls(companyId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      lastEvaluatedKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
    });
  }

  @Get('count')
  async getCallsCount(@CompanyId() companyId: string) {
    const total = await this.callsService.getCallsCount(companyId);
    return { total };
  }

  @Get('search')
  async searchCalls(
    @CompanyId() companyId: string,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    return this.callsService.searchCalls(companyId, query, {
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':callId')
  async getCallById(
    @CompanyId() companyId: string,
    @Param('callId') callId: string,
  ) {
    return this.callsService.getCallById(companyId, callId);
  }

  @Get(':callId/recording')
  async getRecordingUrl(
    @CompanyId() companyId: string,
    @Param('callId') callId: string,
  ) {
    const url = await this.callsService.getRecordingUrl(companyId, callId);
    return { url };
  }
}
