import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CompaniesModule } from '../companies/companies.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { BillingModule } from '../billing/billing.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';

@Module({
  imports: [ConfigModule, CompaniesModule, AppointmentsModule, SchedulingModule, BillingModule, DatabaseModule],
  controllers: [PublicBookingController],
  providers: [PublicBookingService],
})
export class PublicBookingModule {}
