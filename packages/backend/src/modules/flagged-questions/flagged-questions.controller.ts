import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { FlaggedQuestionsService, CreateFlaggedQuestionDto, ResolveQuestionDto } from './flagged-questions.service';
import { CompanyId, UserId } from '../../common/decorators/auth.decorator';

@Controller('flagged-questions')
export class FlaggedQuestionsController {
  constructor(private flaggedQuestionsService: FlaggedQuestionsService) {}

  @Get()
  async listFlaggedQuestions(
    @CompanyId() companyId: string,
    @Query('status') status?: 'OPEN' | 'RESOLVED' | 'DISMISSED',
    @Query('call_id') callId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.flaggedQuestionsService.listFlaggedQuestions(companyId, {
      status,
      call_id: callId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('count/open')
  async getOpenQuestionsCount(@CompanyId() companyId: string) {
    const count = await this.flaggedQuestionsService.getOpenQuestionsCount(companyId);
    return { count };
  }

  @Get(':flaggedId')
  async getFlaggedQuestion(
    @CompanyId() companyId: string,
    @Param('flaggedId') flaggedId: string,
  ) {
    return this.flaggedQuestionsService.getFlaggedQuestion(companyId, flaggedId);
  }

  @Post()
  async createFlaggedQuestion(
    @CompanyId() companyId: string,
    @Body() data: CreateFlaggedQuestionDto,
  ) {
    return this.flaggedQuestionsService.createFlaggedQuestion(companyId, data);
  }

  @Post('bulk-resolve')
  async bulkResolve(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Body() data: { flagged_ids: string[] } & ResolveQuestionDto,
  ) {
    const { flagged_ids, ...resolveData } = data;
    return this.flaggedQuestionsService.bulkResolve(
      companyId,
      flagged_ids,
      userId,
      resolveData,
    );
  }

  @Put(':flaggedId/resolve')
  async resolveFlaggedQuestion(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param('flaggedId') flaggedId: string,
    @Body() data: ResolveQuestionDto,
  ) {
    return this.flaggedQuestionsService.resolveFlaggedQuestion(
      companyId,
      flaggedId,
      userId,
      data,
    );
  }

  @Put(':flaggedId/dismiss')
  async dismissFlaggedQuestion(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Param('flaggedId') flaggedId: string,
  ) {
    return this.flaggedQuestionsService.dismissFlaggedQuestion(
      companyId,
      flaggedId,
      userId,
    );
  }
}
