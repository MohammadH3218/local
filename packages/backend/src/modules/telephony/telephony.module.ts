import { Module } from '@nestjs/common';
import { TelephonyService } from './telephony.service';
import { TelephonyController } from './telephony.controller';
import { TelephonyAdminController } from './telephony.admin.controller';
import { CompaniesModule } from '../companies/companies.module';
import { CompanyNumbersModule } from '../company-numbers/company-numbers.module';

@Module({
  imports: [CompaniesModule, CompanyNumbersModule],
  controllers: [TelephonyController, TelephonyAdminController],
  providers: [TelephonyService],
  exports: [TelephonyService],
})
export class TelephonyModule {}
