import { Module } from '@nestjs/common';
import { FlaggedQuestionsController } from './flagged-questions.controller';
import { FlaggedQuestionsService } from './flagged-questions.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [KnowledgeModule],
  controllers: [FlaggedQuestionsController],
  providers: [FlaggedQuestionsService],
})
export class FlaggedQuestionsModule {}
