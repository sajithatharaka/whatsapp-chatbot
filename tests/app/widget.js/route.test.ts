import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET } from '../../../src/app/widget.js/route';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe('GET /widget.js', () => {
  it('serves the widget script with the Supabase env vars interpolated', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-key';

    const response = await GET();
    const body = await response.text();

    expect(response.headers.get('Content-Type')).toContain('text/javascript');
    expect(body).toContain('https://project-ref.supabase.co');
    expect(body).toContain('public-anon-key');
  });

  it('returns a 500 placeholder script when Supabase env vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
