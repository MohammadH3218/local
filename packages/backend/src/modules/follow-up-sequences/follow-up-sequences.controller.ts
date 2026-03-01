import { Body, Controller, Get, NotFoundException, Post, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@handycall/shared';
import { UserRoleParam } from '../../common/decorators/auth.decorator';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { FollowUpSequencesService } from './follow-up-sequences.service';
import { PlanFeature, PlanFeatureGuard } from '../../common/guards/plan-feature.guard';

@Controller('follow-up-sequences')
export class FollowUpSequencesController {
  constructor(private readonly followUps: FollowUpSequencesService) {}

  @Get()
  @UseGuards(PlanFeatureGuard)
  @PlanFeature('follow_up_sequences')
  listSequences(@CompanyId() companyId: string) {
    return this.followUps.listSequences(companyId);
  }

  @Get('settings')
  @UseGuards(PlanFeatureGuard)
  @PlanFeature('follow_up_sequences')
  getSettings(@CompanyId() companyId: string) {
    return this.followUps.getSettings(companyId);
  }

  @Put('settings')
  @UseGuards(PlanFeatureGuard)
  @PlanFeature('follow_up_sequences')
  updateSettings(
    @CompanyId() companyId: string,
    @Body() body: {
      follow_up_sequences_enabled?: boolean;
      follow_up_initial_delay_minutes?: number;
      follow_up_second_delay_minutes?: number;
      follow_up_final_delay_minutes?: number;
      follow_up_initial_template?: string;
      follow_up_second_template?: string;
      follow_up_final_template?: string;
      review_request_enabled?: boolean;
      review_request_delay_minutes?: number;
      review_platform_url?: string;
      review_request_template?: string;
    },
  ) {
    return this.followUps.updateSettings(companyId, body);
  }

  @Post('process-due')
  async processDue(@UserRoleParam() role: UserRole) {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }
    return this.followUps.processDueMessages();
  }
}
