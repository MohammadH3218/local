import * as crypto from 'crypto';

export type BookingTokenPayload = {
  company_id: string;
  call_id: string;
  exp: number; // epoch ms
  selected_service_id?: string;
  selected_service_name?: string;
  selected_billing_type?: 'ONE_TIME' | 'SUBSCRIPTION';
};

function base64url(input: string | Buffer): string {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return raw
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64').toString('utf8');
}

export function signBookingToken(payload: BookingTokenPayload, secret: string): string {
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyBookingToken(token: string, secret: string): BookingTokenPayload {
  const parts = (token || '').split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid booking token');
  }
  const [body, sig] = parts;
  const expected = base64url(crypto.createHmac('sha256', secret).update(body).digest());
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Invalid booking token');
  }
  const decoded = base64urlDecode(body);
  const payload = JSON.parse(decoded) as BookingTokenPayload;
  if (!payload?.company_id || !payload?.call_id || !payload?.exp) {
    throw new Error('Invalid booking token payload');
  }
  if (
    payload.selected_billing_type &&
    payload.selected_billing_type !== 'ONE_TIME' &&
    payload.selected_billing_type !== 'SUBSCRIPTION'
  ) {
    throw new Error('Invalid booking token payload');
  }
  if (Date.now() > payload.exp) {
    throw new Error('Booking link expired');
  }
  return payload;
}
