import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyTurnstileToken } from '../../src/lib/analytics/turnstileVerify';

describe('verifyTurnstileToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, TURNSTILE_SECRET_KEY: 'test-secret-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns success true when Cloudflare verifies the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ success: true }),
      }),
    );

    const result = await verifyTurnstileToken('valid-token');
    expect(result.success).toBe(true);
  });

  it('returns success false with error codes on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
      }),
    );

    const result = await verifyTurnstileToken('bad-token');
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('invalid-input-response');
  });

  it('throws when TURNSTILE_SECRET_KEY is not set', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    await expect(verifyTurnstileToken('any-token')).rejects.toThrow('TURNSTILE_SECRET_KEY is not set');
  });

  it('sends the token and secret to the Cloudflare endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await verifyTurnstileToken('my-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('analyticsConfig', () => {
  it('reads GTM_ID from environment', async () => {
    process.env.NEXT_PUBLIC_GTM_ID = 'GTM-TEST123';
    const mod = await import('../../src/lib/analytics/config');
    expect(mod.analyticsConfig.gtmId).toBe('GTM-TEST123');
  });
});
