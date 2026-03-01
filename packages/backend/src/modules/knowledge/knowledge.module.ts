import { Module, forwardRef } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { RagModule } from '../rag/rag.module';
import { CompaniesModule } from '../companies/companies.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [RagModule, CompaniesModule, forwardRef(() => BillingModule)],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
