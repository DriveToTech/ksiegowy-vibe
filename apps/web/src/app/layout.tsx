import type { Metadata } from 'next';
import Script from 'next/script';
import { Sora, IBM_Plex_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import brandLogo from '../components/brand/assets/logo.png';
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

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pl" data-theme="light" suppressHydrationWarning>
      <body className={`${sora.variable} ${ibmPlexMono.variable} app-frame flex h-dvh min-h-screen flex-col text-foreground antialiased`}>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
