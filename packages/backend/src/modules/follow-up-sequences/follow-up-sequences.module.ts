import { Module } from '@nestjs/common';
import { FollowUpSequencesService } from './follow-up-sequences.service';
import { FollowUpSequencesController } from './follow-up-sequences.controller';
import { CompaniesModule } from '../companies/companies.module';
import { TelephonyModule } from '../telephony/telephony.module';
import { PlanFeatureGuard } from '../../common/guards/plan-feature.guard';

@Module({
  imports: [CompaniesModule, TelephonyModule],
  controllers: [FollowUpSequencesController],
  providers: [FollowUpSequencesService, PlanFeatureGuard],
  exports: [FollowUpSequencesService],
})
export class FollowUpSequencesModule {}
