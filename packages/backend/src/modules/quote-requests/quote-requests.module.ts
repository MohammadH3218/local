import { Module } from '@nestjs/common';
import { QuoteRequestsService } from './quote-requests.service';
import { QuoteRequestsController } from './quote-requests.controller';

@Module({
  providers: [QuoteRequestsService],
  controllers: [QuoteRequestsController],
  exports: [QuoteRequestsService],
})
export class QuoteRequestsModule {}
