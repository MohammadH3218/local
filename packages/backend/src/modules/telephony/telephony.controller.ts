import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { TelephonyService } from './telephony.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CompanyId } from '../../common/decorators/auth.decorator';
import { GetAvailableNumbersDto } from './dto/get-available-numbers.dto';
import { ClaimPhoneNumberDto } from './dto/claim-phone-number.dto';

@Controller('telephony')
@UseGuards(JwtAuthGuard)
export class TelephonyController {
  constructor(private readonly telephonyService: TelephonyService) {}

  /**
   * GET /telephony/my-number
   * Get the company's current phone number
   */
  @Get('my-number')
  async getMyNumber(@CompanyId() companyId: string) {
    try {
      const phoneNumber = await this.telephonyService.getCompanyPhoneNumber(companyId);

      if (!phoneNumber) {
        return {
          success: true,
          data: null,
          message: 'No phone number claimed',
        };
      }

      return {
        success: true,
        data: phoneNumber,
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to fetch phone number',
          error: error?.message ?? String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /telephony/inbound-numbers
   * List all inbound DIDs routed to this company (Connect/Twilio/etc.)
   */
  @Get('inbound-numbers')
  async listInboundNumbers(@CompanyId() companyId: string) {
    const numbers = await this.telephonyService.listInboundNumbers(companyId);
    return { success: true, data: numbers };
  }

  /**
   * GET /telephony/available-numbers
   * List purchasable phone numbers for this account.
   */
  @Get('available-numbers')
  async getAvailableNumbers(@Query() query: GetAvailableNumbersDto) {
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

  /**
   * POST /telephony/claim-number
   * Purchase and assign a phone number to the current company.
   */
  @Post('claim-number')
  async claimNumber(@CompanyId() companyId: string, @Body() dto: ClaimPhoneNumberDto) {
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

  /**
   * POST /telephony/claim-demo
   * Assign a demo/testing phone number without purchasing a real line.
   */
  @Post('claim-demo')
  async claimDemoNumber(@CompanyId() companyId: string) {
    try {
      const result = await this.telephonyService.assignDemoNumberForCompany(companyId);
      return { success: true, data: result };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: 'Failed to assign demo phone number',
          error: error?.message ?? String(error),
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
