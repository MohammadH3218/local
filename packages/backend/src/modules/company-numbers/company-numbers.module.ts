import { Module } from '@nestjs/common';
import { CompanyNumbersService } from './company-numbers.service';

@Module({
  providers: [CompanyNumbersService],
  exports: [CompanyNumbersService],
})
export class CompanyNumbersModule {}

