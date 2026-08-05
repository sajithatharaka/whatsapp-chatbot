import { buildWidgetScript } from '@/lib/widget/buildWidgetScript';

// Served as a real .js URL (the folder name is the literal route segment)
// so the embed snippet in the dashboard is exactly:
//   <script src="https://<your-app-domain>/widget.js" async></script>
// with no query params or data attributes required — the Supabase URL/anon
// key are interpolated server-side from env vars already used elsewhere in
// this app (see src/lib/supabase/client.ts).
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return new Response('// widget.js is not configured: missing Supabase env vars', {
      status: 500,
      headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
    });
  }

  const script = buildWidgetScript({ supabaseUrl, anonKey });

  return new Response(script, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
