import type { Metadata } from 'next';
import { Suspense } from 'react';

import {
  GoogleTagManagerHead,
  GoogleTagManagerBody,
} from '@/components/analytics/GoogleTagManager';
import { FacebookPixel } from '@/components/analytics/FacebookPixel';
import { Toaster } from '@/components/ui/sonner';
import { analyticsConfig } from '@/lib/analytics/config';

import './globals.css';

export const metadata: Metadata = {
  title: 'WhatsApp AI Assistant Admin',
  description: 'Manage the WhatsApp AI assistant knowledge base and integration.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <GoogleTagManagerHead gtmId={analyticsConfig.gtmId} />
      </head>
      <body>
        <GoogleTagManagerBody gtmId={analyticsConfig.gtmId} />
        <Suspense fallback={null}>
          <FacebookPixel pixelId={analyticsConfig.fbPixelId} />
        </Suspense>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
