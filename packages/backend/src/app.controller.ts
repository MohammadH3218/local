import { Body, Controller, Get, Logger, Post, Req, BadRequestException } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { isValidEmail } from '@handycall/shared';
import { ConfigService } from '@nestjs/config';
import { sendSesEmail } from './modules/public-booking/email.util';
import { renderHandycallEmail } from './common/email-templates';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly config: ConfigService
  ) {}
  private readonly logger = new Logger(AppController.name);

  @Public()
  @Get('health')
  healthCheck() {
    return this.appService.getHealth();
  }

  @Public()
  @Get()
  getInfo() {
    return this.appService.getInfo();
  }

  @Public()
  @Post('contact')
  async submitContact(@Body() body: any, @Req() req: any) {
    const name = String(body?.name || '').trim();
    const company = String(body?.company || '').trim();
    const email = String(body?.email || '').trim();
    const phone = String(body?.phone || '').trim();
    const message = String(body?.message || '').trim();

    if (!name || !company || !email) {
      throw new BadRequestException('Name, company, and email are required.');
    }
    if (!isValidEmail(email)) {
      throw new BadRequestException('Please provide a valid email address.');
    }

    const toAddress = this.config.get<string>('CONTACT_EMAIL_TO') || 'hello@handycall.org';
    const fromAddress =
      this.config.get<string>('CONTACT_EMAIL_FROM') ||
      this.config.get<string>('NO_CONTACT_EMAIL') ||
      'hello@handycall.org';
    const region = this.config.get<string>('SES_REGION') || this.config.get<string>('AWS_REGION') || 'us-east-1';

    const ip = String(req?.ip || 'unknown');
    const userAgent = String(req?.headers?.['user-agent'] || 'unknown');
    const safeName = escapeHtml(name);
    const safeCompany = escapeHtml(company);
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone || 'Not provided');
    const safeMessage = escapeHtml(message || 'No message provided.');
    const safeIp = escapeHtml(ip);
    const safeUserAgent = escapeHtml(userAgent);

    const subject = `New HandyCall inquiry from ${name}`;
    const text =
      `New contact request\n\n` +
      `Name: ${name}\n` +
      `Company: ${company}\n` +
      `Email: ${email}\n` +
      `Phone: ${phone || 'Not provided'}\n` +
      `Message:\n${message || 'No message provided.'}\n\n` +
      `IP: ${ip}\n` +
      `User Agent: ${userAgent}`;

    const html = renderHandycallEmail({
      title: 'New contact request',
      preheader: `New inquiry from ${name}`,
      greeting: 'Hello HandyCall team,',
      body: `<p style="margin:0 0 12px;"><strong>Name:</strong> ${safeName}</p>
             <p style="margin:0 0 12px;"><strong>Company:</strong> ${safeCompany}</p>
             <p style="margin:0 0 12px;"><strong>Email:</strong> ${safeEmail}</p>
             <p style="margin:0 0 12px;"><strong>Phone:</strong> ${safePhone}</p>
             <p style="margin:16px 0 12px;"><strong>Message:</strong></p>
             <p style="margin:0 0 12px;white-space:pre-line;">${safeMessage}</p>
             <p style="margin:16px 0 0;color:#64748b;font-size:12px;">IP: ${safeIp} - UA: ${safeUserAgent}</p>`,
    });

    await sendSesEmail({
      region,
      from: `HandyCall <${fromAddress}>`,
      to: [toAddress],
      subject,
      text,
      html,
      replyTo: [email],
    });

    this.logger.log(`[Contact] inquiry from ${email} (${name})`);

    return { ok: true };
  }
}