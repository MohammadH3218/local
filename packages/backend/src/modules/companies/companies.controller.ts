import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  BadRequestException
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyId, UserRoleParam } from '../../common/decorators/auth.decorator';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { AdminUpdateCompanyDto } from './dto/admin-update-company.dto';
import { Company, UserRole, CompanyStatus, SubscriptionPlan, SubscriptionStatus } from '@handycall/shared';
import { CompanyStats } from './companies.service';
import { UsageService } from '../billing/usage.service';

@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(
    private companiesService: CompaniesService,
    private usersService: UsersService,
    private usageService: UsageService
  ) {}

  @Get('me')
  async getMyCompany(@CompanyId() companyId: string): Promise<Company> {
    console.log('[CompaniesController] getMyCompany called with companyId:', companyId);

    // Handle case where user doesn't have a company yet (newly created user)
    if (companyId === 'no-company' || !companyId) {
      console.log('[CompaniesController] User has no company yet (temp account)');
      throw new NotFoundException('User has not completed company setup');
    }

    try {
      const company = await this.companiesService.findById(companyId);
      console.log('[CompaniesController] Company found:', company ? 'yes' : 'no');
      if (!company) {
        throw new NotFoundException('Company not found');
      }
      return company;
    } catch (error) {
      console.error('[CompaniesController] Error in getMyCompany:', error);
      throw error;
    }
  }

  @Put('me')
  async updateMyCompany(
    @CompanyId() companyId: string,
    @Body() dto: UpdateCompanyDto
  ): Promise<Company> {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    await this.validateServiceEnable(company, dto);
    return this.companiesService.updateCompany(companyId, dto);
  }

  // ============================================================================
  // ADMIN ENDPOINTS - Require admin role
  // ============================================================================

  /**
   * List all companies (admin only)
   */
  @Get()
  async listCompanies(
    @UserRoleParam() role: UserRole,
    @Query('limit') limit?: string,
    @Query('search') search?: string
  ): Promise<Company[]> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    if (search) {
      return this.companiesService.searchCompanies(search);
    }

    const limitNum = limit ? parseInt(limit, 10) : 100;
    return this.companiesService.listAll(limitNum);
  }

  /**
   * Get company by ID (admin only)
   */
  @Get(':id')
  async getCompanyById(
    @UserRoleParam() role: UserRole,
    @Param('id') id: string
  ): Promise<Company> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    const company = await this.companiesService.findById(id);
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  /**
   * Get company statistics (admin only)
   */
  @Get(':id/stats')
  async getCompanyStats(
    @UserRoleParam() role: UserRole,
    @Param('id') id: string
  ): Promise<CompanyStats> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    return this.companiesService.getCompanyStats(id);
  }

  /**
   * Create a new company (admin only)
   */
  @Post()
  async createCompany(
    @UserRoleParam() role: UserRole,
    @Body() dto: CreateCompanyDto
  ): Promise<Company> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    const company = await this.companiesService.createCompany(
      dto.company_name,
      dto.service_type,
      dto.email,
      dto.phone_number,
      dto.timezone
    );

    // Create initial admin user if provided
    if (dto.initial_admin_email && dto.initial_admin_password) {
      const [firstName, ...lastNameParts] = (dto.initial_admin_name || 'Admin User').split(' ');
      const lastName = lastNameParts.join(' ') || 'User';

      await this.usersService.createUser(
        company.company_id,
        undefined, // companyName - already have company_id
        dto.initial_admin_email,
        dto.initial_admin_password,
        firstName,
        lastName,
        UserRole.OWNER,
        'users'
      );
    }

    return company;
  }

  /**
   * Update a company (admin only)
   */
  @Put(':id')
  async updateCompanyById(
    @UserRoleParam() role: UserRole,
    @Param('id') id: string,
    @Body() dto: AdminUpdateCompanyDto
  ): Promise<Company> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    const company = await this.companiesService.findById(id);
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    await this.validateServiceEnable(company, dto);
    return this.companiesService.updateCompany(id, dto);
  }

  /**
   * Delete a company (admin only)
   * WARNING: This will delete all associated data
   */
  @Delete(':id')
  async deleteCompany(
    @UserRoleParam() role: UserRole,
    @Param('id') id: string
  ): Promise<{ message: string }> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    await this.companiesService.deleteCompany(id);
    return { message: 'Company deleted successfully' };
  }

  /**
   * Get all users for a company (admin only)
   */
  @Get(':companyId/users')
  async getCompanyUsers(
    @UserRoleParam() role: UserRole,
    @Param('companyId') companyId: string
  ) {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    return this.usersService.listCompanyUsers(companyId);
  }

  private async validateServiceEnable(
    company: Company,
    updates: { calls_enabled?: boolean; sms_enabled?: boolean }
  ) {
    const enablingCalls = updates.calls_enabled === true;
    const enablingSms = updates.sms_enabled === true;
    if (!enablingCalls && !enablingSms) {
      return;
    }

    if (company.status === CompanyStatus.INACTIVE || company.status === CompanyStatus.SUSPENDED) {
      throw new BadRequestException('Account is inactive or suspended.');
    }

    // Check if user has an active subscription plan
    const hasActivePlan = Boolean(company.subscription_plan || company.stripe_subscription_id);
    const plan = company.subscription_plan as SubscriptionPlan | undefined;
    
    // Check subscription status
    const status = company.subscription_status as SubscriptionStatus | undefined;
    const hasActiveStatus = status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING;
    
    // Check if user has an active trial (trial_ends_at is in the future)
    const hasActiveTrial = company.trial_ends_at !== null && 
                           company.trial_ends_at !== undefined && 
                           company.trial_ends_at > Date.now();
    
    // Check if subscription is canceling but still active until period end
    const isCancelingButActive =
      company.cancel_at_period_end &&
      company.current_period_end &&
      company.current_period_end > Date.now();

    // User must have either:
    // 1. An active subscription plan with active status, OR
    // 2. An active trial (trial_ends_at in the future), OR
    // 3. A subscription that's canceling but still active
    const hasSubscription = (hasActivePlan && hasActiveStatus) || hasActiveTrial || isCancelingButActive;

    if (!hasSubscription) {
      throw new BadRequestException('You must have an active subscription or trial to enable this service.');
    }

    // If we have a plan, check usage limits
    if (plan) {
      const periodStart = company.current_period_start || Date.now();
      const limits = await this.usageService.checkLimitsExceeded(company.company_id, plan, periodStart);
      // Product behavior: allow enabling services even when limits are exceeded.
      // Overages are tracked and can be billed later; callers should not be hard-blocked.
    }
  }
}
