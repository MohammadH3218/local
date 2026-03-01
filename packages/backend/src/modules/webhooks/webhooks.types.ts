export const WEBHOOK_PUBLIC_EVENTS = [
  'contact.created',
  'contact.updated',
  'appointment.created',
  'appointment.updated',
  'appointment.cancelled',
  'appointment.completed',
  'call.completed',
] as const;

export const WEBHOOK_EVENTS = [...WEBHOOK_PUBLIC_EVENTS, 'test.ping'] as const;

export type PublicWebhookEventType = (typeof WEBHOOK_PUBLIC_EVENTS)[number];
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];
