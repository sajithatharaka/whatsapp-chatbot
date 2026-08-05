/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EscalationChatView } from '../../../src/components/escalations/EscalationChatView';
import type { ConversationMessageRecord } from '../../../src/lib/escalations/types';

const messages: ConversationMessageRecord[] = [
  {
    id: 'm1',
    role: 'user',
    message: 'Where is my order?',
    confidence: null,
    created_at: '2026-08-05T10:00:00Z',
  },
  {
    id: 'm2',
    role: 'assistant',
    message: "I'm not sure, let me find out.",
    confidence: 0.4,
    created_at: '2026-08-05T10:01:00Z',
  },
  {
    id: 'm3',
    role: 'system',
    message: 'Escalated to a human.',
    confidence: null,
    created_at: '2026-08-05T10:02:00Z',
  },
];

describe('EscalationChatView', () => {
  it('shows an empty state when there are no messages', () => {
    render(<EscalationChatView messages={[]} />);
    expect(screen.getByText('No messages recorded yet.')).toBeInTheDocument();
  });

  it('aligns customer messages left and assistant replies right, WhatsApp-style', () => {
    render(<EscalationChatView messages={messages} />);

    const userBubble = screen.getByTestId('escalation-message-bubble-m1');
    const assistantBubble = screen.getByTestId('escalation-message-bubble-m2');

    expect(userBubble.parentElement).toHaveClass('justify-start');
    expect(assistantBubble.parentElement).toHaveClass('justify-end');
    expect(assistantBubble).toHaveClass('bg-primary', 'text-primary-foreground');
  });

  it('renders system messages as centered notes, not bubbles', () => {
    render(<EscalationChatView messages={messages} />);

    expect(screen.getByText('Escalated to a human.')).toHaveClass('text-center');
    expect(screen.queryByTestId('escalation-message-bubble-m3')).not.toBeInTheDocument();
  });
});
