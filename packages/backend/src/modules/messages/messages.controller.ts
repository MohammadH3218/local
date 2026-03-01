import { Controller, Get, Param, Query } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { CompanyId } from '../../common/decorators/auth.decorator';

@Controller('messages')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get('threads')
  async getThreads(
    @CompanyId() companyId: string,
    @Query('limit') limit?: string,
    @Query('lastEvaluatedKey') lastEvaluatedKey?: string,
  ) {
    return this.messagesService.listThreads(companyId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      lastEvaluatedKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
    });
  }

  @Get('threads/:contactId')
  async getThreadMessages(
    @CompanyId() companyId: string,
    @Param('contactId') contactId: string,
    @Query('limit') limit?: string,
    @Query('lastEvaluatedKey') lastEvaluatedKey?: string,
  ) {
    return this.messagesService.getThreadMessages(companyId, contactId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      lastEvaluatedKey: lastEvaluatedKey ? JSON.parse(lastEvaluatedKey) : undefined,
    });
  }
}
