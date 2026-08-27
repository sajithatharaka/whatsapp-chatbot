'use client';

import { useState } from 'react';

import { EscalationList } from '@/components/escalations/EscalationList';
import { EscalationListRefreshProvider } from '@/components/escalations/EscalationListRefreshContext';
import type { EscalationListItem } from '@/lib/escalations/types';

/**
 * Client shell for the escalations page: owns the `refreshKey` that the detail
 * pane bumps (via `useEscalationListRefresh`) after a status change or answer,
 * and lays out the list next to the routed detail `children`.
 *
 * The list is server-rendered on first paint — `initialEscalations` is fetched
 * in the (server) layout and handed straight to `EscalationList`, so the list
 * is visible without waiting for hydration + a client fetch.
 */
export function EscalationsWorkspace({
  initialEscalations,
  children,
}: {
  initialEscalations: EscalationListItem[];
  children: React.ReactNode;
}) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <EscalationListRefreshProvider value={{ bump: () => setRefreshKey((key) => key + 1) }}>
      <div className="flex gap-6">
        <div className="flex w-80 shrink-0 flex-col border-r pr-4 md:w-96">
          <div className="max-h-[70vh] overflow-y-auto">
            <EscalationList refreshKey={refreshKey} initialEscalations={initialEscalations} />
          </div>
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </EscalationListRefreshProvider>
  );
}
