/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { EscalationAnswerSection } from '../../../src/components/escalations/EscalationAnswerSection';
import type { ChatEscalationRecord } from '../../../src/lib/escalations/types';

const escalation: ChatEscalationRecord = {
  id: 'escalation_1',
  customer_id: 'customer_1',
  trigger_message_id: 'message_1',
  question: 'Where is my order?',
  status: 'needs_attention',
  ai_summary: 'Customer wants an order status update.',
  admin_answer: null,
  knowledge_document_id: null,
  responded_at: null,
  responded_by: null,
  created_at: '2026-08-05T00:00:00Z',
  updated_at: '2026-08-05T00:00:00Z',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function mockFetchRouter(handlers: Record<string, (init?: RequestInit) => unknown>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const key = `${method} ${url}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unhandled fetch: ${key}`);
    return { ok: true, json: async () => handler(init) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('EscalationAnswerSection', () => {
  it('saves the answer then shows the update-knowledge prompt', async () => {
    const fetchMock = mockFetchRouter({
      'PATCH /api/escalations/escalation_1': () => ({ escalation }),
    });

    const user = userEvent.setup();
    render(<EscalationAnswerSection escalation={escalation} />);

    await user.type(screen.getByTestId('escalation-answer-textarea'), 'Your order ships tomorrow.');
    await user.click(screen.getByTestId('escalation-save-answer-button'));

    await waitFor(() =>
      expect(screen.getByTestId('escalation-update-knowledge-prompt')).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/escalations/escalation_1',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('finds the top match, pre-fills proposed content, and saves on confirm', async () => {
    mockFetchRouter({
      'PATCH /api/escalations/escalation_1': () => ({ escalation }),
      'POST /api/knowledge/search': () => ({
        results: [{ document_id: 'doc_1', similarity: 0.8 }],
      }),
      'GET /api/knowledge/doc_1': () => ({
        document: { id: 'doc_1', title: 'Shipping FAQ' },
        chunks: [
          {
            id: 'c1',
            chunk_text: 'Orders ship within 2 days.',
            metadata: {},
            created_at: '2026-08-01T00:00:00Z',
          },
        ],
      }),
      'POST /api/knowledge': () => ({
        documentId: 'doc_1',
        status: 'updated',
        version: 2,
        chunksCreated: 1,
      }),
    });

    const user = userEvent.setup();
    render(<EscalationAnswerSection escalation={escalation} />);

    await user.type(screen.getByTestId('escalation-answer-textarea'), 'Your order ships tomorrow.');
    await user.click(screen.getByTestId('escalation-save-answer-button'));
    await waitFor(() =>
      expect(screen.getByTestId('escalation-update-knowledge-prompt')).toBeInTheDocument()
    );

    await user.click(screen.getByTestId('escalation-update-knowledge-yes-button'));

    await waitFor(() =>
      expect(screen.getByTestId('escalation-proposed-content-textarea')).toHaveValue(
        'Orders ship within 2 days.\n\nYour order ships tomorrow.'
      )
    );

    await user.click(screen.getByTestId('escalation-confirm-knowledge-save-button'));

    await waitFor(() =>
      expect(screen.queryByTestId('escalation-knowledge-review')).not.toBeInTheDocument()
    );
  });

  it('shows the no-match state when the search returns no results', async () => {
    mockFetchRouter({
      'PATCH /api/escalations/escalation_1': () => ({ escalation }),
      'POST /api/knowledge/search': () => ({ results: [] }),
    });

    const user = userEvent.setup();
    render(<EscalationAnswerSection escalation={escalation} />);

    await user.type(screen.getByTestId('escalation-answer-textarea'), 'Your order ships tomorrow.');
    await user.click(screen.getByTestId('escalation-save-answer-button'));
    await waitFor(() =>
      expect(screen.getByTestId('escalation-update-knowledge-prompt')).toBeInTheDocument()
    );

    await user.click(screen.getByTestId('escalation-update-knowledge-yes-button'));

    await waitFor(() =>
      expect(screen.getByTestId('escalation-no-match-state')).toBeInTheDocument()
    );
  });
});
