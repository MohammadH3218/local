import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

type SendEmailInput = {
  region: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string[];
};

export async function sendSesEmail(input: SendEmailInput) {
  const emailProvider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  if (emailProvider === 'console' || process.env.DISABLE_EMAIL_DELIVERY === 'true') {
    console.log('[email] local delivery disabled; message captured', {
      to: input.to,
      subject: input.subject,
      replyTo: input.replyTo || [],
    });
    return { MessageId: `local-${Date.now()}` };
  }

  const endpoint =
    process.env.SES_ENDPOINT || process.env.AWS_ENDPOINT_URL_SES || process.env.AWS_LOCALSTACK_ENDPOINT;
  const client = new SESv2Client({
    region: input.region,
    ...(endpoint ? { endpoint } : {}),
  });
  const command = new SendEmailCommand({
    FromEmailAddress: input.from,
    Destination: {
      ToAddresses: input.to,
    },
    ReplyToAddresses: input.replyTo,
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: input.text, Charset: 'UTF-8' },
          ...(input.html ? { Html: { Data: input.html, Charset: 'UTF-8' } } : {}),
        },
      },
    },
  });

  return client.send(command);
}
