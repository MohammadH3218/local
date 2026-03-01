import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { CompaniesModule } from '../companies/companies.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [CompaniesModule, KnowledgeModule, WebhooksModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
