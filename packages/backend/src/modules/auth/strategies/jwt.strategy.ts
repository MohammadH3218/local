import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { AuthContext } from '@handycall/shared';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    const userPoolId = configService.get<string>('AWS_COGNITO_USERS_POOL_ID');
    const region = configService.get<string>('AWS_REGION');
    const authority = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      audience: configService.get<string>('AWS_COGNITO_USERS_CLIENT_ID'),
      issuer: authority,
      algorithms: ['RS256'], // Cognito uses RS256 signature
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${authority}/.well-known/jwks.json`,
      }),
    });
  }

  async validate(payload: any): Promise<AuthContext> {
    // CRITICAL: We need to find the user in YOUR database to get the company_id.
    // We try to find the user by email (from ID Token) or username (from Access Token).
    this.logger.log('[JwtStrategy] validate() called with payload:', JSON.stringify(payload));
    const email = payload.email || payload['cognito:username'] || payload.username;
    const companyIdFromToken =
      payload['custom:company_id'] || payload.company_id || payload['company_id'];

    if (!email) {
      this.logger.error('Token is valid but contains no email/username claim');
      throw new UnauthorizedException('Invalid token claims');
    }

    this.logger.log(`[JwtStrategy] Looking up user by email: ${email}`);

    // Look up user in database (prefer company-scoped query when company_id is present)
    let user = null;
    if (companyIdFromToken) {
      user = await this.usersService.findByEmailForCompany(email, companyIdFromToken);
    }
    if (!user) {
      user = await this.usersService.findByEmail(email);
    }

    if (!user) {
      this.logger.warn(`User with email ${email} not found in database. Attempting auto-provisioning.`);
      try {
        const givenName = payload.given_name || payload['given_name'];
        const familyName = payload.family_name || payload['family_name'];
        user = await this.usersService.provisionUserFromCognito({
          email,
          firstName: givenName,
          lastName: familyName,
        });
      } catch (err: any) {
        this.logger.error(`Failed to auto-provision user for ${email}: ${err?.message || err}`);
        throw new UnauthorizedException('User not found in system');
      }
    }

    this.logger.log(`[JwtStrategy] User found: ${user.email}, company_id: ${user.company_id}, role: ${user.role}`);

    // Attach user context to the Request object
    return {
      user_id: user.user_id,
      company_id: user.company_id,
      role: user.role,
    };
  }
}
