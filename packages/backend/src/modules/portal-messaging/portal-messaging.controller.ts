import { Controller, Post, Get, Body, Param, UseGuards, Query } from '@nestjs/common';
import { PortalMessagingService } from './portal-messaging.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('portal-messaging')
@UseGuards(JwtAuthGuard)
export class PortalMessagingController {
  constructor(private readonly service: PortalMessagingService) {}

  // Pro: get their message threads
  @Get('pro/threads')
  async getProThreads(@CompanyId() companyId: string) {
    return { threads: await this.service.getProThreads(companyId) };
  }

  // Pro: get messages in a thread
  @Get('pro/threads/:threadId')
  async getThreadMessages(
    @CompanyId() companyId: string,
    @Param('threadId') threadId: string,
  ) {
    return { messages: await this.service.getThreadMessages(companyId, threadId) };
  }

  // Pro: send a message
  @Post('pro/threads/:threadId/send')
  async sendProMessage(
    @CompanyId() companyId: string,
    @Param('threadId') threadId: string,
    @Body() body: { message: string; customer_email?: string },
  ) {
    return this.service.sendProMessage(companyId, threadId, body.message, body.customer_email);
  }

  // Public/Customer: send message to a provider (by companyId)
  @Public()
  @Post('customer/send/:companyId')
  async sendCustomerMessage(
    @Param('companyId') companyId: string,
    @Body() body: { message: string; customer_name?: string; customer_email?: string },
  ) {
    const threadId = body.customer_email
      ? this.service.getThreadId(companyId, body.customer_email)
      : `anon-${Date.now()}`;
    return this.service.sendCustomerMessage(
      companyId,
      threadId,
      body.message,
      body.customer_name,
      body.customer_email,
    );
  }

  // Customer: get their threads (requires email param for now, before full auth)
  @Public()
  @Get('customer/threads')
  async getCustomerThreads(@Query('email') email: string) {
    if (!email) return { threads: [] };
    return { threads: await this.service.getCustomerThreads(email) };
  }

  // Customer: get thread messages
  @Public()
  @Get('customer/threads/:threadId')
  async getCustomerThread(
    @Param('threadId') threadId: string,
    @Query('company_id') companyId: string,
  ) {
    if (!companyId) return { messages: [] };
    return { messages: await this.service.getThreadMessages(companyId, threadId) };
  }
}
