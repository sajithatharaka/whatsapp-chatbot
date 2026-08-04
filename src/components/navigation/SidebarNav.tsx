'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Database, FileCode } from 'lucide-react';

import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard/knowledge', label: 'Knowledge Base', icon: Database },
  { href: '/dashboard/api-docs', label: 'API Docs', icon: FileCode },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground">
        WORKSPACE
      </p>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            data-testid={`sidebar-nav-${label.toLowerCase().replace(/\s+/g, '-')}-link`}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
