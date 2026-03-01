/**
 * Shared validation utilities
 */

import { PHONE_REGEX } from './constants';

// ============================================================================
// Phone Number Validation
// ============================================================================

export function isValidPhoneNumber(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

export function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');

  // Add + prefix for E.164 format
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  if (cleaned.length === 10) {
    return `+1${cleaned}`; // Assume US/Canada
  }

  return `+${cleaned}`;
}

// ============================================================================
// Email Validation
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// ============================================================================
// UUID Validation
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(uuid: string): boolean {
  return UUID_REGEX.test(uuid);
}

// ============================================================================
// Business Hours Validation
// ============================================================================

const TIME_REGEX = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

export function isValidTimeFormat(time: string): boolean {
  return TIME_REGEX.test(time);
}

export function isValidTimeRange(open: string, close: string): boolean {
  if (!isValidTimeFormat(open) || !isValidTimeFormat(close)) {
    return false;
  }

  const [openHour, openMin] = open.split(':').map(Number);
  const [closeHour, closeMin] = close.split(':').map(Number);

  const openMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;

  return closeMinutes > openMinutes;
}

// ============================================================================
// Timezone Validation
// ============================================================================

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// String Sanitization
// ============================================================================

export function sanitizeString(input: string, maxLength?: number): string {
  let sanitized = input.trim();

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

// ============================================================================
// Pagination Validation
// ============================================================================

export function validatePaginationParams(page?: number, pageSize?: number): {
  page: number;
  pageSize: number;
} {
  const validPage = Math.max(1, page || 1);
  const validPageSize = Math.min(100, Math.max(1, pageSize || 20));

  return { page: validPage, pageSize: validPageSize };
}
