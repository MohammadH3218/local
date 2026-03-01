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
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyId, UserId, UserRoleParam } from '../../common/decorators/auth.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User, UserRole } from '@handycall/shared';

type UserWithCompany = User & { company_name?: string };

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private usersService: UsersService
  ) {}

  /**
   * Update the current user's profile
   */
  @Put('me')
  async updateMyProfile(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Body() dto: UpdateProfileDto
  ): Promise<User> {
    if (!companyId || !userId) {
      throw new BadRequestException('Invalid user context');
    }

    return this.usersService.updateMyProfile(companyId, userId, dto);
  }

  /**
   * Get the current user's profile
   */
  @Get('me')
  async getMyProfile(
    @CompanyId() companyId: string,
    @UserId() userId: string
  ): Promise<User> {
    if (!companyId || !userId) {
      throw new BadRequestException('Invalid user context');
    }

    const user = await this.usersService.findById(companyId, userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  

  /**
   * List all users (admin only, optionally filter by company)
   */
  @Get()
  async listUsers(
    @UserRoleParam() role: UserRole,
    @Query('company_id') companyId?: string
  ): Promise<UserWithCompany[]> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    if (companyId) {
      return this.usersService.listCompanyUsers(companyId);
    }

    return this.usersService.listAllUsers();
  }

  /**
   * Get user by ID (admin only)
   */
  @Get(':id')
  async getUserById(
    @UserRoleParam() role: UserRole,
    @Param('id') id: string,
    @Query('company_id') companyId?: string
  ): Promise<UserWithCompany> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    if (!companyId) {
      throw new BadRequestException('company_id query parameter is required');
    }

    const user = await this.usersService.findById(companyId, id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Create a new user (admin only)
   */
  @Post()
  async createUser(
    @UserRoleParam() role: UserRole,
    @Body() dto: CreateUserDto
  ): Promise<{ user: User }> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    return this.usersService.createUser(
      dto.company_id,
      dto.company_name,
      dto.email,
      dto.password,
      dto.first_name,
      dto.last_name,
      dto.role,
      (dto.pool_type as any) || 'users',
      dto.company_service_type,
      dto.company_email,
      dto.company_phone,
      dto.company_timezone
    );
  }

  /**
   * Update a user (admin only)
   */
  @Put(':id')
  async updateUser(
    @UserRoleParam() role: UserRole,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Query('company_id') companyId?: string
  ): Promise<User> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    if (!companyId) {
      throw new BadRequestException('company_id query parameter is required');
    }

    return this.usersService.updateUser(companyId, id, dto);
  }

  /**
   * Delete a user (admin only)
   */
  @Delete(':id')
  async deleteUser(
    @UserRoleParam() role: UserRole,
    @Param('id') id: string,
    @Query('company_id') companyId?: string,
    @Query('email') email?: string
  ): Promise<{ message: string }> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    if (!companyId || !email) {
      throw new BadRequestException('company_id and email query parameters are required');
    }

    await this.usersService.deleteUser(companyId, id, email);
    return { message: 'User deleted successfully' };
  }

  /**
   * Disable a user (admin only)
   */
  @Put(':id/disable')
  async disableUser(
    @UserRoleParam() role: UserRole,
    @Param('id') id: string,
    @Query('company_id') companyId?: string,
    @Query('email') email?: string
  ): Promise<User> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    if (!companyId || !email) {
      throw new BadRequestException('company_id and email query parameters are required');
    }

    return this.usersService.disableUser(companyId, id, email);
  }

  /**
   * Enable a user (admin only)
   */
  @Put(':id/enable')
  async enableUser(
    @UserRoleParam() role: UserRole,
    @Param('id') id: string,
    @Query('company_id') companyId?: string,
    @Query('email') email?: string
  ): Promise<User> {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    if (!companyId || !email) {
      throw new BadRequestException('company_id and email query parameters are required');
    }

    return this.usersService.enableUser(companyId, id, email);
  }
}
