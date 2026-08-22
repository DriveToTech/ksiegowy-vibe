import type { Metadata } from 'next';
import Script from 'next/script';
import { Sora, IBM_Plex_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import brandLogo from '../components/brand/assets/logo.png';
import { AppHeader } from '../components/organisms/AppHeader';
import { getAuthSession } from '../lib/auth';
import { THEME_BOOTSTRAP_SCRIPT } from '../lib/theme';

import './globals.css';

const sora = Sora({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ksiegowy-vibe.pl',
  description: 'Nowoczesny interfejs księgowy dla faktur, OCR i KSeF',
  icons: {
    icon: [{ url: brandLogo.src, type: 'image/png' }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await getAuthSession().catch(() => null);

  return (
    <html lang="pl" data-theme="light" suppressHydrationWarning>
      <body className={`${sora.variable} ${ibmPlexMono.variable} flex h-dvh min-h-screen flex-col bg-background text-foreground antialiased`}>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <AppHeader
          user={session?.user ?? null}
          companies={session?.companies ?? []}
          activeCompanyId={session?.activeCompanyId ?? null}
          activeKsefEnvironment={session?.activeKsefEnvironment ?? 'TEST'}
        />
        {children}
      </body>
    </html>
  );
}
