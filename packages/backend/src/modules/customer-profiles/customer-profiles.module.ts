import { Module } from '@nestjs/common';
import { CustomerProfilesService } from './customer-profiles.service';

@Module({
  imports: [],
  providers: [CustomerProfilesService],
  exports: [CustomerProfilesService],
})
export class CustomerProfilesModule {}
