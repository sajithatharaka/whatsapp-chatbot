import { EscalationFilters } from '@/components/escalations/EscalationFilters';
import { EscalationsWorkspace } from '@/components/escalations/EscalationsWorkspace';
import { DEFAULT_STATUSES } from '@/lib/escalations/constants';
import { listEscalations } from '@/lib/supabase/admin-api';

export default async function EscalationsLayout({ children }: { children: React.ReactNode }) {
  // First paint of the list is server-rendered for the default (unfiltered)
  // view. If the URL carries filter params, EscalationList re-fetches on the
  // client; otherwise it renders these rows straight away.
  const initialEscalations = await listEscalations({ statuses: [...DEFAULT_STATUSES] });

  return (
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
      <EscalationsWorkspace initialEscalations={initialEscalations}>
        {children}
      </EscalationsWorkspace>
    </div>
  );
}
