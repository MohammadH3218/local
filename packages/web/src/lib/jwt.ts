/**
 * JWT token decoding utilities
 */

import { UserRole } from '@handycall/shared';

interface JWTPayload {
  sub?: string;
  email?: string;
  'custom:role'?: string;
  'custom:company_id'?: string;
  'cognito:groups'?: string[];
  [key: string]: any;
}

/**
 * Decode a JWT token without verification (client-side only)
 * Note: This does NOT verify the signature. Verification should be done server-side.
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

/**
 * Extract user role from JWT token
 * Checks for role in custom:role attribute or cognito:groups
 * Note: This is a fallback - the backend should always provide userRole in the login response
 *
 * IMPORTANT: Do NOT use company_id presence to determine role, as customer users
 * may not have company_id set yet. The poolType (admin vs users) is the source of truth,
 * which is determined server-side during login.
 */
export function extractUserRole(token: string): UserRole | null {
  const payload = decodeJWT(token);
  if (!payload) return null;

  // Check custom:role attribute
  if (payload['custom:role']) {
    const role = payload['custom:role'].toUpperCase();
    if (role === 'ADMIN') return UserRole.ADMIN;
    if (role === 'OWNER') return UserRole.OWNER;
    if (role === 'STAFF') return UserRole.STAFF;
  }

  // Check cognito:groups
  if (payload['cognito:groups'] && Array.isArray(payload['cognito:groups'])) {
    if (payload['cognito:groups'].some((group: string) => group.toLowerCase().includes('admin'))) {
      return UserRole.ADMIN;
    }
  }

  // Cannot reliably determine role from token alone without poolType information
  // The backend should always provide userRole, so this should rarely be called
  // Default to OWNER as a safe fallback (prevents unauthorized admin access)
  return UserRole.OWNER;
}





