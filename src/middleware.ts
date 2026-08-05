import { type NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // widget.js is excluded (not just added to PUBLIC_PATHS) so it skips the
  // Supabase auth round trip entirely — it's fetched on every page load of
  // every third-party site that embeds the chat widget, unauthenticated by
  // design (see src/app/widget.js/route.ts).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|widget\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
