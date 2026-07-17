import './globals.css';

import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { Providers } from '@/components/providers';
import { SaaSMakerFeedback } from '@/components/saasmaker-feedback';
import { VitalsReporter } from '@/components/VitalsReporter';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const SITE_URL = 'https://starboard.codevetter.com';
const SITE_DESCRIPTION =
  'Sync, search, and organize your GitHub stars. Filter by language, find similar repos with semantic search, and group everything into collections.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Starboard — Your GitHub stars, organized',
    template: '%s — Starboard',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'Starboard',
  keywords: ['GitHub stars', 'repository organizer', 'semantic search', 'open source discovery'],
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Starboard',
    title: 'Starboard — Your GitHub stars, organized',
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Starboard — Your GitHub stars, organized',
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static first-party JSON-LD
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'Starboard',
              url: SITE_URL,
              applicationCategory: 'DeveloperApplication',
              description: SITE_DESCRIPTION,
            }),
          }}
        />
        <script
          id="starboard-name-shim"
          dangerouslySetInnerHTML={{
            __html: 'globalThis.__name=globalThis.__name||function(t){return t};',
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          {children}
          <SaaSMakerFeedback />
          <VitalsReporter />
        </Providers>
      </body>
    </html>
  );
}
