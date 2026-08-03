import { redirect } from 'next/navigation';

import { SidebarNav } from '@/components/navigation/SidebarNav';
import { SignOutButton } from '@/components/navigation/SignOutButton';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth: middleware already redirects unauthenticated visitors,
  // but this layout re-checks independently rather than trusting that alone.
  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-64 shrink-0 flex-col border-r">
        <div className="border-b p-4">
          <p className="font-semibold">WhatsApp AI Assistant</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
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
