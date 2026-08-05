import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { EscalationAnswerSection } from '@/components/escalations/EscalationAnswerSection';
import { EscalationChatView } from '@/components/escalations/EscalationChatView';
import { EscalationStatusActions } from '@/components/escalations/EscalationStatusActions';
import { EscalationStatusBadge } from '@/components/escalations/EscalationStatusBadge';
import { channelLabel, customerDisplayName } from '@/lib/escalations/customerDisplay';
import { EdgeFunctionError, getEscalation } from '@/lib/supabase/admin-api';

export default async function EscalationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getEscalation>>;
  try {
    data = await getEscalation(id);
  } catch (error) {
    if (error instanceof EdgeFunctionError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const { escalation, messages } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{customerDisplayName(escalation.customer)}</h1>
            <Badge variant="outline" data-testid="escalation-detail-channel-badge">
              {channelLabel(escalation.customer.channel)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {escalation.customer.phone ?? 'No phone number'} · opened{' '}
            {new Date(escalation.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <EscalationStatusBadge status={escalation.status} />
          <EscalationStatusActions escalationId={escalation.id} status={escalation.status} />
        </div>
      </div>

      <div className="rounded-md border p-4">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Summary</h2>
        <p className="text-sm" data-testid="escalation-ai-summary">
          {escalation.ai_summary}
        </p>
      </div>

      <div className="rounded-md border p-4">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Question asked</h2>
        <p className="whitespace-pre-wrap text-sm">{escalation.question}</p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Complete chat</h2>
        <EscalationChatView messages={messages} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Resolution</h2>
        <EscalationAnswerSection escalation={escalation} />
        {escalation.knowledge_document_id ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Linked knowledge document:{' '}
            <Link
              href={`/dashboard/knowledge/${escalation.knowledge_document_id}`}
              className="underline"
            >
              view document
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
