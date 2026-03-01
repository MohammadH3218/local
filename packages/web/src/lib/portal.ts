import { usePathname } from 'next/navigation';

export function getPortalBasePath(pathname?: string | null) {
  if (!pathname) return '/dashboard';
  return pathname.startsWith('/admin') ? '/admin' : '/dashboard';
}

export function usePortalBasePath() {
  const pathname = usePathname();
  return getPortalBasePath(pathname);
}
