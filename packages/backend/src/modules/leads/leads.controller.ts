import { Controller, Get, Param } from '@nestjs/common';
import { LeadScoringService } from './lead-scoring.service';
import { CompanyId } from '../../common/decorators/auth.decorator';

@Controller('leads')
export class LeadsController {
  constructor(private readonly scoring: LeadScoringService) {}

  @Get('scores')
  scoreAll(@CompanyId() companyId: string) {
    return this.scoring.scoreAllContacts(companyId);
  }

  @Get(':contactId/score')
  scoreOne(
    @CompanyId() companyId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.scoring.scoreContact(companyId, contactId);
  }
}
