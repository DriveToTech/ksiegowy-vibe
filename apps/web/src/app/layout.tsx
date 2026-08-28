import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Script from 'next/script';
import { Sora, IBM_Plex_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import brandLogo from '../components/brand/assets/logo.png';
import { ACTIVE_MODE_COOKIE_NAME, normalizeAppMode } from '../lib/mode';
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
  // Unlike theme (localStorage, invisible server-side, hence the bootstrap
  // script below), active_mode is a cookie — server-visible, so data-mode is
  // rendered directly here. No bootstrap script needed for it.
  const cookieStore = await cookies();
  const activeMode = normalizeAppMode(cookieStore.get(ACTIVE_MODE_COOKIE_NAME)?.value);

  return (
    <html lang="pl" data-theme="light" data-mode={activeMode} suppressHydrationWarning>
      <body className={`${sora.variable} ${ibmPlexMono.variable} app-frame flex h-dvh min-h-screen flex-col text-foreground antialiased`}>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
