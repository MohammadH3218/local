import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { ConfirmSignUpDto } from './dto/confirm-signup.dto';
import { ResendConfirmationDto } from './dto/resend-confirmation.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ConfirmForgotPasswordDto } from './dto/confirm-forgot-password.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { RegisterResponse } from '@handycall/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyId, UserId } from '../../common/decorators/auth.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<RegisterResponse> {
    if (dto.pool_type === 'customer') {
      return this.authService.registerCustomer(
        dto.email,
        dto.password,
        dto.phone_number,
        dto.first_name,
        dto.last_name,
      );
    }

    return this.authService.register(
      dto.company_name,
      dto.service_type,
      dto.email,
      dto.password,
      dto.phone_number,
      dto.first_name,
      dto.last_name,
      dto.timezone
    );
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.loginWithCognito(dto.email, dto.password, dto.pool_type || 'auto');
  }

  @Public()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(
      dto.email,
      dto.new_password,
      dto.session,
      dto.pool_type || 'users',
      dto.first_name,
      dto.last_name
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshWithCognito(dto.refresh_token, dto.email, dto.pool_type || 'auto');
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('confirm-forgot-password')
  @HttpCode(HttpStatus.OK)
  async confirmForgotPassword(@Body() dto: ConfirmForgotPasswordDto) {
    return this.authService.confirmPasswordReset(dto.email, dto.token, dto.new_password);
  }

  @Public()
  @Post('confirm-signup')
  @HttpCode(HttpStatus.OK)
  async confirmSignUp(@Body() dto: ConfirmSignUpDto) {
    return this.authService.confirmSignUp(dto.email, dto.code, dto.pool_type || 'users');
  }

  @Public()
  @Post('resend-confirmation')
  @HttpCode(HttpStatus.OK)
  async resendConfirmation(@Body() dto: ResendConfirmationDto) {
    return this.authService.resendSignUpCode(dto.email, dto.pool_type || 'users');
  }

  @UseGuards(JwtAuthGuard)
  @Post('update-password')
  @HttpCode(HttpStatus.OK)
  async updatePassword(
    @CompanyId() companyId: string,
    @UserId() userId: string,
    @Body() dto: UpdatePasswordDto
  ) {
    return this.authService.updatePassword(companyId, userId, dto.current_password, dto.new_password);
  }
}
