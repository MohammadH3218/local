import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ParameterStoreService } from './parameter-store.service';

@Global()
@Module({
  imports: [NestConfigModule],
  providers: [ParameterStoreService],
  exports: [ParameterStoreService],
})
export class ParameterStoreModule {}
