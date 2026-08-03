'use client';

import Script from 'next/script';
import { useRef, useEffect, useCallback } from 'react';

interface CloudflareTurnstileProps {
  siteKey: string;
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpired?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
  className?: string;
}

declare global {
  interface Window {
    turnstile: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export function CloudflareTurnstile({
  siteKey,
  onSuccess,
  onError,
  onExpired,
  theme = 'auto',
  size = 'normal',
  className,
}: CloudflareTurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) return;

    // Clear any previously rendered widget
    if (widgetIdRef.current) {
      window.turnstile.remove(widgetIdRef.current);
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme,
      size,
      callback: onSuccess,
      'error-callback': onError,
      'expired-callback': onExpired,
    });
  }, [siteKey, theme, size, onSuccess, onError, onExpired]);

  useEffect(() => {
    // Render immediately if the Turnstile script is already loaded
    if (typeof window !== 'undefined' && window.turnstile) {
      renderWidget();
    }
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [renderWidget]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
        onLoad={renderWidget}
      />
      <div
        ref={containerRef}
        data-testid="turnstile-widget"
        className={className}
      />
    </>
  );
}
