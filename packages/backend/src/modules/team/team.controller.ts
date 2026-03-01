import { Body, Controller, Delete, Get, Param, Post, Put, Request } from '@nestjs/common';
import { TeamService } from './team.service';
import { InviteTeamMemberDto, UpdateTeamMemberDto } from './dto/team.dto';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('team')
export class TeamController {
  constructor(private readonly service: TeamService) {}

  @Get()
  listMembers(@CompanyId() companyId: string) {
    return this.service.listMembers(companyId);
  }

  @Get(':id')
  getMember(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.getMember(companyId, id);
  }

  @Post('invite')
  inviteMember(
    @CompanyId() companyId: string,
    @Request() req: any,
    @Body() dto: InviteTeamMemberDto,
  ) {
    const userId = req.user?.sub || req.user?.userId || 'unknown';
    return this.service.inviteMember(companyId, userId, dto);
  }

  @Put(':id')
  updateMember(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.service.updateMember(companyId, id, dto);
  }

  @Delete(':id')
  removeMember(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.removeMember(companyId, id);
  }

  @Post('accept-invite')
  @Public()
  acceptInvite(@Body() body: { token: string; password: string; phone?: string }) {
    return this.service.acceptInvite(body.token, { password: body.password, phone: body.phone });
  }
}
