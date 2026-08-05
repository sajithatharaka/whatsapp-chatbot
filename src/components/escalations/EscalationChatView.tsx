import { cn } from '@/lib/utils';
import type { ConversationMessageRecord } from '@/lib/escalations/types';

function formatTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function EscalationChatView({ messages }: { messages: ConversationMessageRecord[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages recorded yet.</p>;
  }

  return (
    <ol
      className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded-md border bg-muted/30 p-3"
      data-testid="escalation-chat-view"
    >
      {messages.map((message) => {
        if (message.role === 'system') {
          return (
            <li key={message.id} className="my-1 text-center text-xs text-muted-foreground">
              {message.message}
            </li>
          );
        }

        const isOutgoing = message.role === 'assistant';
        return (
          <li key={message.id} className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
            <div
              data-testid={`escalation-message-bubble-${message.id}`}
              className={cn(
                'max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm',
                isOutgoing ? 'bg-primary text-primary-foreground' : 'bg-background'
              )}
            >
              <p className="whitespace-pre-wrap">{message.message}</p>
              <p
                className={cn(
                  'mt-1 text-right text-[10px]',
                  isOutgoing ? 'text-primary-foreground/70' : 'text-muted-foreground'
                )}
              >
                {formatTime(message.created_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
