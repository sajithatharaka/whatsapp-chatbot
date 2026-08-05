'use client';

import { useState } from 'react';

import { EscalationFilters } from '@/components/escalations/EscalationFilters';
import { EscalationList } from '@/components/escalations/EscalationList';
import { EscalationListRefreshProvider } from '@/components/escalations/EscalationListRefreshContext';

export default function EscalationsLayout({ children }: { children: React.ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <EscalationListRefreshProvider value={{ bump: () => setRefreshKey((key) => key + 1) }}>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold">Needs Attention</h1>
          <p className="text-xs text-muted-foreground">
            Escalated conversations needing a human reply.
          </p>
        </div>
        {/* Shared by both panes below, so filtering doesn't require picking a
            conversation first and stays visible no matter which is open. */}
        <EscalationFilters />
        <div className="flex gap-6">
          <div className="flex w-80 shrink-0 flex-col border-r pr-4 md:w-96">
            <div className="max-h-[70vh] overflow-y-auto">
              <EscalationList refreshKey={refreshKey} />
            </div>
          </div>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </EscalationListRefreshProvider>
  );
}
