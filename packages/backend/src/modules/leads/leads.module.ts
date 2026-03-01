import { Module } from '@nestjs/common';
import { LeadScoringService } from './lead-scoring.service';
import { LeadsController } from './leads.controller';

@Module({
  imports: [],
  controllers: [LeadsController],
  providers: [LeadScoringService],
  exports: [LeadScoringService],
})
export class LeadsModule {}
