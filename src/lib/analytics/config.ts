export const analyticsConfig = {
  gtmId: process.env.NEXT_PUBLIC_GTM_ID ?? '',
  fbPixelId: process.env.NEXT_PUBLIC_FB_PIXEL_ID ?? '',
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '',
} as const;

export type AnalyticsConfig = typeof analyticsConfig;
