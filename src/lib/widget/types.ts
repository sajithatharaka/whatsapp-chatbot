// Mirrors supabase/functions/_shared/widget-config.ts's WebWidgetConfig.
// Duplicated deliberately: the Edge Functions run on Deno and can't be
// imported into the Next.js build — these are two separate deployables
// sharing a wire format.

export type WidgetPosition = 'bottom-right' | 'bottom-left';

export interface WidgetConfig {
  id: string;
  enabled: boolean;
  title: string;
  welcome_message: string;
  primary_color: string;
  position: WidgetPosition;
  allowed_origins: string[];
}

export interface UpdateWidgetConfigPayload {
  enabled?: boolean;
  title?: string;
  welcomeMessage?: string;
  primaryColor?: string;
  position?: WidgetPosition;
  allowedOrigins?: string[];
}
