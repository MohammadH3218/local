import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ChatService } from './chat.service';
import { CreateChatSessionDto, RequestCallbackDto, SendChatMessageDto } from './dto/chat-widget.dto';

@Controller('chat/widget')
@Public()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('config/:companyId')
  async getWidgetConfig(@Param('companyId') companyId: string) {
    return this.chat.getWidgetConfig(companyId);
  }

  @Post('session')
  async createSession(@Body() dto: CreateChatSessionDto) {
    return this.chat.createSession(dto);
  }

  @Post('message')
  async sendMessage(@Body() dto: SendChatMessageDto) {
    return this.chat.sendMessage(dto);
  }

  @Post('callback')
  async requestCallback(@Body() dto: RequestCallbackDto) {
    return this.chat.requestCallback(dto);
  }
}
