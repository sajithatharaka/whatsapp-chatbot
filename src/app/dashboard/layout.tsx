import { redirect } from 'next/navigation';

import { SidebarNav } from '@/components/navigation/SidebarNav';
import { SignOutButton } from '@/components/navigation/SignOutButton';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  // Defense in depth: middleware already redirects unauthenticated visitors,
  // but this layout re-checks independently rather than trusting that alone.
  // `getClaims()` verifies the JWT locally (no Auth-server round trip) when the
  // project uses asymmetric signing keys; it falls back to a network check for
  // legacy HS256 secrets.
  if (!claims) {
    redirect('/login');
  }

  const userEmail = typeof claims.email === 'string' ? claims.email : '';

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-64 shrink-0 flex-col border-r">
        <div className="border-b p-4">
          <p className="font-semibold">WhatsApp AI Assistant</p>
          <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
        </div>
        <div className="flex-1">
          <SidebarNav />
        </div>
        <div className="border-t p-3">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-6">{children}</main>
    </div>
  );
}
