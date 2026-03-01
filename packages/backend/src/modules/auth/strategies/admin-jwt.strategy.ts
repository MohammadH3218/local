import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { AuthContext, UserRole } from '@handycall/shared';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'jwt-admin') {
  private readonly logger = new Logger(AdminJwtStrategy.name);

  constructor(private configService: ConfigService) {
    const adminPoolId = configService.get<string>('AWS_COGNITO_ADMIN_POOL_ID');
    const adminClientId = configService.get<string>('AWS_COGNITO_ADMIN_CLIENT_ID');
    const region = configService.get<string>('AWS_REGION');

    const authority = `https://cognito-idp.${region}.amazonaws.com/${adminPoolId}`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      audience: adminClientId,
      issuer: authority,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${authority}/.well-known/jwks.json`,
      }),
    });
  }

  async validate(payload: any): Promise<AuthContext> {
    const email = payload.email || payload['cognito:username'] || payload.username;
    if (!email) {
      this.logger.error('Admin token missing email/username claim');
      throw new UnauthorizedException('Invalid admin token claims');
    }

    return {
      user_id: payload.sub || email,
      company_id: 'platform-admin',
      role: UserRole.ADMIN,
    };
  }
}
