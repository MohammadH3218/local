import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class ToolsAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided = (request.headers['x-handycall-tools-key'] as string | undefined) ?? '';
    const expected = this.configService.get<string>('HANDYCALL_TOOLS_API_KEY') ?? '';

    if (!expected) {
      throw new UnauthorizedException('Tools API is not configured');
    }

    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expected);
    const ok =
      providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);

    if (!ok) {
      throw new UnauthorizedException('Invalid tools API key');
    }

    return true;
  }
}

