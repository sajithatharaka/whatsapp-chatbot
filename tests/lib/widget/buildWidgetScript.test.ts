import { describe, expect, it } from 'vitest';

import { buildWidgetScript } from '../../../src/lib/widget/buildWidgetScript';

describe('buildWidgetScript', () => {
  it('interpolates the Supabase URL and anon key as JSON-encoded literals', () => {
    const script = buildWidgetScript({
      supabaseUrl: 'https://project-ref.supabase.co',
      anonKey: 'public-anon-key',
    });

    expect(script).toContain('var SUPABASE_URL = "https://project-ref.supabase.co";');
    expect(script).toContain('var ANON_KEY = "public-anon-key";');
    expect(script).toContain('var CHAT_URL = SUPABASE_URL + "/functions/v1/web-chat";');
  });

  it('never embeds anything other than the two supplied public values', () => {
    const script = buildWidgetScript({
      supabaseUrl: 'https://project-ref.supabase.co',
      anonKey: 'public-anon-key',
    });

    // Guards against ever wiring a service-role-only secret (e.g. an admin
    // secret) into this client-distributed script by mistake.
    expect(script.toLowerCase()).not.toContain('service_role');
    expect(script.toLowerCase()).not.toContain('admin_secret');
    expect(script.toLowerCase()).not.toContain('admin-secret');
  });

  it('mounts a Shadow DOM root so widget styles never leak onto the host page', () => {
    const script = buildWidgetScript({
      supabaseUrl: 'https://project-ref.supabase.co',
      anonKey: 'public-anon-key',
    });

    expect(script).toContain('attachShadow({ mode: "open" })');
  });

  it('is syntactically valid JavaScript', () => {
    const script = buildWidgetScript({
      supabaseUrl: 'https://project-ref.supabase.co',
      anonKey: 'public-anon-key',
    });

    expect(() => new Function(script)).not.toThrow();
  });
});
