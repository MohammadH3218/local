import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/database/dynamodb.service';
import { CompaniesService } from '../companies/companies.service';
import { InviteTeamMemberDto, UpdateTeamMemberDto, TeamRole, ROLE_PERMISSIONS } from './dto/team.dto';

@Injectable()
export class TeamService {
  constructor(
    private readonly dynamodb: DynamoDBService,
    private readonly companies: CompaniesService,
  ) {}

  async listMembers(companyId: string) {
    const result = await this.dynamodb.scan('team_members', {
      filterExpression: '#company_id = :company_id',
      expressionAttributeNames: { '#company_id': 'company_id' },
      expressionAttributeValues: { ':company_id': companyId },
      limit: 100,
    });
    return (result.items || []).sort((a: any, b: any) => (a.created_at || 0) - (b.created_at || 0));
  }

  async getMember(companyId: string, memberId: string) {
    const result = await this.dynamodb.scan('team_members', {
      filterExpression: '#company_id = :company_id AND #member_id = :member_id',
      expressionAttributeNames: { '#company_id': 'company_id', '#member_id': 'member_id' },
      expressionAttributeValues: { ':company_id': companyId, ':member_id': memberId },
      limit: 1,
    });
    if (!result.items?.length) throw new NotFoundException('Team member not found');
    return result.items[0];
  }

  async inviteMember(companyId: string, invitedBy: string, dto: InviteTeamMemberDto) {
    const company = await this.companies.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');

    // Check for duplicate email
    const existing = await this.dynamodb.scan('team_members', {
      filterExpression: '#company_id = :company_id AND #email = :email',
      expressionAttributeNames: { '#company_id': 'company_id', '#email': 'email' },
      expressionAttributeValues: { ':company_id': companyId, ':email': dto.email.toLowerCase() },
      limit: 1,
    });

    if (existing.items?.length) {
      throw new BadRequestException('A team member with this email already exists');
    }

    const now = Date.now();
    const memberId = uuidv4();
    const inviteToken = uuidv4();

    const member = {
      company_id: companyId,
      member_id: memberId,
      email: dto.email.toLowerCase(),
      first_name: dto.first_name,
      last_name: dto.last_name,
      role: dto.role,
      permissions: ROLE_PERMISSIONS[dto.role],
      status: 'INVITED',
      invite_token: inviteToken,
      invited_by: invitedBy,
      created_at: now,
      updated_at: now,
    };

    await this.dynamodb.put('team_members', member);

    // TODO: Send invite email via SES
    // For now, return the invite token so it can be used in testing
    return { ...member, invite_url: `/accept-invite?token=${inviteToken}` };
  }

  async updateMember(companyId: string, memberId: string, dto: UpdateTeamMemberDto) {
    await this.getMember(companyId, memberId);
    const updates: Record<string, any> = { updated_at: Date.now() };

    if (dto.role) {
      updates.role = dto.role;
      updates.permissions = dto.custom_permissions || ROLE_PERMISSIONS[dto.role];
    }
    if (dto.custom_permissions) updates.permissions = dto.custom_permissions;
    if (dto.first_name !== undefined) updates.first_name = dto.first_name;
    if (dto.last_name !== undefined) updates.last_name = dto.last_name;

    await this.dynamodb.update(
      'team_members',
      { company_id: companyId, member_id: memberId },
      updates,
    );
    return this.getMember(companyId, memberId);
  }

  async removeMember(companyId: string, memberId: string) {
    const member = await this.getMember(companyId, memberId) as any;
    if (member.role === TeamRole.OWNER) {
      throw new BadRequestException('Cannot remove the owner');
    }
    await this.dynamodb.update(
      'team_members',
      { company_id: companyId, member_id: memberId },
      { status: 'REMOVED', updated_at: Date.now() },
    );
    return { removed: true };
  }

  async acceptInvite(token: string, userData: { password: string; phone?: string }) {
    // Find the team member by invite token
    const result = await this.dynamodb.scan('team_members', {
      filterExpression: '#invite_token = :token AND #status = :status',
      expressionAttributeNames: { '#invite_token': 'invite_token', '#status': 'status' },
      expressionAttributeValues: { ':token': token, ':status': 'INVITED' },
      limit: 1,
    });

    if (!result.items?.length) throw new NotFoundException('Invalid or expired invite token');
    const member = result.items[0] as any;

    await this.dynamodb.update(
      'team_members',
      { company_id: member.company_id, member_id: member.member_id },
      { status: 'ACTIVE', accepted_at: Date.now(), updated_at: Date.now(), invite_token: null },
    );

    return { email: member.email, company_id: member.company_id, role: member.role };
  }
}
