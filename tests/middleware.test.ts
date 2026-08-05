import { describe, expect, it } from 'vitest';

import { config } from '../src/middleware';

// The matcher is a Next.js middleware config export, not a runtime function —
// exercised here by rebuilding the same regex Next.js compiles it into and
// checking specific paths against it. Regression test for a real bug: an
// earlier version of this matcher ran the Supabase auth check against
// /widget.js, redirecting every unauthenticated third-party page that embeds
// the chat widget to /login instead of serving the script.
const matcherRegex = new RegExp(`^${config.matcher[0]}$`);

describe('middleware matcher', () => {
  it('excludes /widget.js so the public embed script skips the auth check', () => {
    expect(matcherRegex.test('/widget.js')).toBe(false);
  });

  it('excludes Next.js static/image internals and common image extensions', () => {
    expect(matcherRegex.test('/_next/static/chunk.js')).toBe(false);
    expect(matcherRegex.test('/_next/image')).toBe(false);
    expect(matcherRegex.test('/favicon.ico')).toBe(false);
    expect(matcherRegex.test('/logo.png')).toBe(false);
  });

  it('still matches dashboard and login routes so auth keeps running there', () => {
    expect(matcherRegex.test('/dashboard/knowledge')).toBe(true);
    expect(matcherRegex.test('/login')).toBe(true);
  });
});
