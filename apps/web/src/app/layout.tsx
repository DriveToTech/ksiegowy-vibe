import type { Metadata } from 'next';
import { Inter, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import brandLogo from '../components/brand/assets/logo.png';
import { AppHeader } from '../components/organisms/AppHeader';
import { getAuthSession } from '../lib/auth';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
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
    <html lang="pl">
      <body className={`${inter.variable} ${manrope.variable} bg-background text-foreground antialiased`}>
        <AppHeader user={session?.user ?? null} />
        {children}
      </body>
    </html>
  );
}
