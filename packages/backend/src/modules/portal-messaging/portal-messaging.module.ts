import { Module } from '@nestjs/common';
import { PortalMessagingService } from './portal-messaging.service';
import { PortalMessagingController } from './portal-messaging.controller';

@Module({
  providers: [PortalMessagingService],
  controllers: [PortalMessagingController],
  exports: [PortalMessagingService],
})
export class PortalMessagingModule {}
