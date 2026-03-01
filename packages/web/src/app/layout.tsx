import type { Metadata } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/components/providers/session-provider';
import { Toaster } from '@/components/ui/toaster';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://handycall.ai';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'HandyCall — Find & Book Trusted Home Service Pros',
    template: '%s | HandyCall',
  },
  description:
    'Book local plumbers, electricians, HVAC techs, cleaners, and more in your area. Compare providers, schedule quickly, and pay securely.',
  keywords: [
    'home services',
    'book a plumber',
    'local handyman',
    'HVAC repair',
    'find electricians near me',
    'house cleaning service',
    'handycall',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: BASE_URL,
    siteName: 'HandyCall',
    title: 'HandyCall — Find & Book Trusted Home Service Pros',
    description:
      'Browse local providers, compare service details, and book home services in minutes.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'HandyCall — Home Services Marketplace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HandyCall — Find & Book Trusted Home Service Pros',
    description:
      'Browse local providers and book home services in minutes.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <SessionProvider>
          {children}
          <Toaster />
        </SessionProvider>
      </body>
    </html>
  );
}
