'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useEscalationListRefresh } from '@/components/escalations/EscalationListRefreshContext';
import type { EscalationStatus } from '@/lib/escalations/types';

export function EscalationStatusActions({
  escalationId,
  status,
}: {
  escalationId: string;
  status: EscalationStatus;
}) {
  const router = useRouter();
  const { bump } = useEscalationListRefresh();
  const [isUpdating, setIsUpdating] = useState(false);

  async function updateStatus(nextStatus: EscalationStatus) {
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/escalations/${escalationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Failed to update status');
      toast.success(nextStatus === 'responded' ? 'Marked as responded' : 'Marked in progress');
      router.refresh();
      bump();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="flex gap-2">
      {status === 'needs_attention' ? (
        <Button
          variant="outline"
          disabled={isUpdating}
          onClick={() => updateStatus('in_progress')}
          data-testid="escalation-mark-in-progress-button"
        >
          Mark in progress
        </Button>
      ) : null}
      {status !== 'responded' ? (
        <Button
          disabled={isUpdating}
          onClick={() => updateStatus('responded')}
          data-testid="escalation-mark-responded-button"
        >
          Mark as responded
        </Button>
      ) : null}
    </div>
  );
}
