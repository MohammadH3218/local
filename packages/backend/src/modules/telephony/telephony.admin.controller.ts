import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@handycall/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserRoleParam } from '../../common/decorators/auth.decorator';
import { TelephonyService } from './telephony.service';
import { GetAvailableNumbersDto } from './dto/get-available-numbers.dto';
import { ClaimPhoneNumberDto } from './dto/claim-phone-number.dto';

@Controller('admin/telephony')
@UseGuards(JwtAuthGuard)
export class TelephonyAdminController {
  constructor(private readonly telephonyService: TelephonyService) {}

  @Get('available-numbers')
  async getAvailableNumbers(
    @UserRoleParam() role: UserRole,
    @Query() query: GetAvailableNumbersDto,
  ) {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    try {
      const numbers = await this.telephonyService.getAvailablePhoneNumbers(
        query.country || 'US',
        query.type || 'DID',
        query.maxResults || 10,
        { areaCode: query.areaCode, contains: query.contains },
      );

      return { success: true, data: numbers };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to fetch available phone numbers',
          error: error?.message ?? String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('companies/:companyId/number')
  async getCompanyNumber(
    @UserRoleParam() role: UserRole,
    @Param('companyId') companyId: string,
  ) {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    const phoneNumber = await this.telephonyService.getCompanyPhoneNumber(companyId);
    return { success: true, data: phoneNumber };
  }

  @Post('companies/:companyId/claim-number')
  async claimNumberForCompany(
    @UserRoleParam() role: UserRole,
    @Param('companyId') companyId: string,
    @Body() dto: ClaimPhoneNumberDto,
  ) {
    if (role !== UserRole.ADMIN) {
      throw new NotFoundException('Not found');
    }

    try {
      const result = await this.telephonyService.claimPhoneNumberForCompany(
        companyId,
        dto.phoneNumber,
        dto.description,
      );
      return { success: true, data: result };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to claim phone number',
          error: error?.message ?? String(error),
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
