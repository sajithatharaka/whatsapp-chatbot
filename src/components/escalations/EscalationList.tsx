'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EscalationStatusBadge } from '@/components/escalations/EscalationStatusBadge';
import { DEFAULT_STATUSES, VALID_STATUSES } from '@/lib/escalations/constants';
import { channelLabel, customerDisplayName } from '@/lib/escalations/customerDisplay';
import type { EscalationListItem, EscalationStatus } from '@/lib/escalations/types';
import { cn } from '@/lib/utils';

const DETAIL_PATH = /^\/dashboard\/escalations\/([^/]+)$/;

type ListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; escalations: EscalationListItem[] };

export function EscalationList({ refreshKey }: { refreshKey: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const statusParam = searchParams.get('status');
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const selectedId = pathname.match(DETAIL_PATH)?.[1];

  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    const statuses = statusParam
      ? statusParam
          .split(',')
          .filter((s): s is EscalationStatus => (VALID_STATUSES as string[]).includes(s))
      : DEFAULT_STATUSES;

    const query = new URLSearchParams();
    if (statuses.length > 0) query.set('status', statuses.join(','));
    if (fromParam) query.set('from', fromParam);
    if (toParam) query.set('to', toParam);

    fetch(`/api/escalations?${query.toString()}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load escalations');
        return response.json();
      })
      .then((body: { escalations: EscalationListItem[] }) => {
        if (cancelled) return;
        setState({ status: 'loaded', escalations: body.escalations });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [statusParam, fromParam, toParam, refreshKey, retryToken]);

  if (state.status === 'loading') {
    return (
      <p className="p-3 text-sm text-muted-foreground" data-testid="escalation-list-loading-state">
        Loading conversations…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col gap-2 p-3" data-testid="escalation-list-error-state">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load conversations.</p>
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          data-testid="escalation-list-retry-button"
          onClick={() => setRetryToken((token) => token + 1)}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (state.escalations.length === 0) {
    return (
      <p className="p-3 text-sm text-muted-foreground" data-testid="escalation-list-empty-state">
        No conversations match the current filters.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-2" data-testid="escalation-list">
      {state.escalations.map((escalation) => {
        const isSelected = escalation.id === selectedId;
        return (
          <li key={escalation.id}>
            <Link
              href={`/dashboard/escalations/${escalation.id}`}
              data-testid={`escalation-list-item-${escalation.id}`}
              aria-current={isSelected ? 'page' : undefined}
              className={cn(
                'block rounded-md border p-3 text-sm transition-colors',
                isSelected ? 'border-accent bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
            >
              <div className="flex items-center gap-2">
                <p className="font-medium">{customerDisplayName(escalation.customer)}</p>
                <Badge variant="outline" data-testid={`escalation-channel-badge-${escalation.id}`}>
                  {channelLabel(escalation.customer.channel)}
                </Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{escalation.question}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <EscalationStatusBadge status={escalation.status} />
                <span className="text-xs text-muted-foreground">
                  {new Date(escalation.created_at).toLocaleDateString()}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
