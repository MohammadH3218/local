import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { UserRole } from '@handycall/shared';

/**
 * Middleware for route protection
 * 
 * Note: This middleware runs server-side and can only access cookies.
 * The app uses localStorage for tokens, so client-side redirects in components
 * are the primary protection mechanism. This middleware provides an additional
 * layer for initial requests and SSR scenarios.
 * 
 * Since we're using client-side auth with localStorage, the main protection
 * happens in:
 * - DashboardLayout component (protects /dashboard/* routes)
 * - Admin page component (protects /admin routes)
 * - Login/Register pages (redirect if already authenticated)
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hostHeader = request.headers.get('host') || '';
  const host = hostHeader.split(':')[0]?.toLowerCase();
  const adminHost =
    (process.env.NEXT_PUBLIC_ADMIN_PORTAL_HOST || process.env.ADMIN_PORTAL_HOST || '').toLowerCase();
  const userHost =
    (process.env.NEXT_PUBLIC_USER_PORTAL_HOST || process.env.USER_PORTAL_HOST || '').toLowerCase();

  // Some hosting rewrites can map /login -> /dashboard/login.
  // Rewriting (not redirecting) prevents infinite 307 loops.
  if (pathname === '/dashboard/login') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.search = request.nextUrl.search;
    return NextResponse.rewrite(loginUrl);
  }

  // Host-based routing for user/admin portals.
  if (adminHost && host === adminHost) {
    if (!pathname.startsWith('/admin')) {
      const redirectUrl = new URL(`/admin${pathname === '/' ? '' : pathname}`, request.url);
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (userHost && host === userHost) {
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Only guard dashboard/admin; everything else is public
  const isAdminRoute = pathname.startsWith('/admin');
  const isDashboardRoute = pathname.startsWith('/dashboard');
  if (!isAdminRoute && !isDashboardRoute) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const userRole = (token as any)?.userRole as string | undefined;
  const tokenError = (token as any)?.error as string | undefined;
  const hasBearer = Boolean((token as any)?.idToken || (token as any)?.accessToken);
  const poolType = ((token as any)?.poolType as string | undefined) || '';

  // Not signed in -> send to login with callback
  if (!token || tokenError || !hasBearer) {
    const loginUrl = new URL('/login', request.url);
    if (isDashboardRoute) {
      loginUrl.searchParams.set('audience', 'pro');
    }
    const safeCallback =
      pathname === '/dashboard/login' || pathname === '/dashboard'
        ? '/dashboard'
        : pathname;
    loginUrl.searchParams.set('callbackUrl', safeCallback);
    return NextResponse.redirect(loginUrl);
  }

  // Admin pool must stay in admin portal.
  if (poolType === 'admin' && isDashboardRoute) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  // Dashboard is for pro/users pool only.
  if (isDashboardRoute && poolType !== 'users') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('audience', 'pro');
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes must use admin pool only.
  if (isAdminRoute && poolType !== 'admin' && userRole !== UserRole.ADMIN) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('audience', 'admin');
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - _next (Next.js internals)
     * - static files
     * - images
     * - favicon
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
