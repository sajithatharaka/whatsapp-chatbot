import { Badge } from '@/components/ui/badge';
import type { EscalationStatus } from '@/lib/escalations/types';

const STATUS_CONFIG: Record<
  EscalationStatus,
  { label: string; variant: 'destructive' | 'secondary' | 'outline' }
> = {
  needs_attention: { label: 'Needs attention', variant: 'destructive' },
  in_progress: { label: 'In progress', variant: 'secondary' },
  responded: { label: 'Responded', variant: 'outline' },
};

export function EscalationStatusBadge({ status }: { status: EscalationStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant={config.variant} data-testid={`escalation-status-badge-${status}`}>
      {config.label}
    </Badge>
  );
}
