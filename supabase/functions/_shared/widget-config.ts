import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { WebWidgetConfig } from './types.ts';

const WIDGET_CONFIG_COLUMNS =
  'id, enabled, title, welcome_message, primary_color, position, allowed_origins';

// Mirrors config.ts's loadActiveConfig: no caching, single active row, reads
// fresh so a dashboard change (enable/disable, allowed_origins, branding)
// takes effect on the very next widget request.
export async function loadActiveWidgetConfig(supabase: SupabaseClient): Promise<WebWidgetConfig> {
  const { data, error } = await supabase
    .from('web_widget_config')
    .select(WIDGET_CONFIG_COLUMNS)
    .eq('is_active', true)
    .single();

  if (error) throw error;
  return data as WebWidgetConfig;
}

export interface UpdateWidgetConfigInput {
  enabled?: boolean;
  title?: string;
  welcomeMessage?: string;
  primaryColor?: string;
  position?: 'bottom-right' | 'bottom-left';
  allowedOrigins?: string[];
}

export async function updateWidgetConfig(
  supabase: SupabaseClient,
  input: UpdateWidgetConfigInput
): Promise<WebWidgetConfig> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.title !== undefined) patch.title = input.title;
  if (input.welcomeMessage !== undefined) patch.welcome_message = input.welcomeMessage;
  if (input.primaryColor !== undefined) patch.primary_color = input.primaryColor;
  if (input.position !== undefined) patch.position = input.position;
  if (input.allowedOrigins !== undefined) patch.allowed_origins = input.allowedOrigins;

  const { data, error } = await supabase
    .from('web_widget_config')
    .update(patch)
    .eq('is_active', true)
    .select(WIDGET_CONFIG_COLUMNS)
    .single();

  if (error) throw error;
  return data as WebWidgetConfig;
}

// Origin header comparison is exact-match, not a wildcard/subdomain match —
// admins list every domain the widget is embedded on explicitly (e.g. both
// "https://example.com" and "https://www.example.com" if both are used).
export function isOriginAllowed(config: WebWidgetConfig, origin: string | null): boolean {
  if (!config.enabled) return false;
  if (!origin) return false;
  return config.allowed_origins.includes(origin);
}
