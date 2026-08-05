import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isOriginAllowed, loadActiveWidgetConfig, updateWidgetConfig } from './widget-config.ts';
import type { WebWidgetConfig } from './types.ts';

const BASE_CONFIG: WebWidgetConfig = {
  id: 'config-1',
  enabled: true,
  title: 'Chat with us',
  welcome_message: 'Hi!',
  primary_color: '#111827',
  position: 'bottom-right',
  allowed_origins: ['https://example.com'],
};

Deno.test('loadActiveWidgetConfig returns the active row', async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: BASE_CONFIG, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  const config = await loadActiveWidgetConfig(supabase);
  assertEquals(config, BASE_CONFIG);
});

Deno.test('loadActiveWidgetConfig throws on a query error', async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: new Error('boom') }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  let threw = false;
  try {
    await loadActiveWidgetConfig(supabase);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test('updateWidgetConfig only patches the fields provided', async () => {
  let capturedPatch: Record<string, unknown> = {};
  const supabase = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        capturedPatch = patch;
        return {
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { ...BASE_CONFIG, enabled: false }, error: null }),
            }),
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;

  const result = await updateWidgetConfig(supabase, { enabled: false });
  assertEquals(result.enabled, false);
  assertEquals(capturedPatch.enabled, false);
  assertEquals(capturedPatch.title, undefined);
});

Deno.test('isOriginAllowed rejects when the widget is disabled', () => {
  assertEquals(isOriginAllowed({ ...BASE_CONFIG, enabled: false }, 'https://example.com'), false);
});

Deno.test('isOriginAllowed rejects a missing Origin header', () => {
  assertEquals(isOriginAllowed(BASE_CONFIG, null), false);
});

Deno.test('isOriginAllowed rejects an origin not on the allowlist', () => {
  assertEquals(isOriginAllowed(BASE_CONFIG, 'https://evil.example'), false);
});

Deno.test('isOriginAllowed accepts an exact allowlisted origin', () => {
  assertEquals(isOriginAllowed(BASE_CONFIG, 'https://example.com'), true);
});
