/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { pathnameMock, searchParamsMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => '/dashboard/escalations'),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
  useSearchParams: () => searchParamsMock(),
}));

import { EscalationList } from '../../../src/components/escalations/EscalationList';
import type { EscalationListItem } from '../../../src/lib/escalations/types';

const escalations: EscalationListItem[] = [
  {
    id: 'escalation_1',
    customer_id: 'customer_1',
    customer: { id: 'customer_1', phone: '+94711111111', name: 'Alice', channel: 'whatsapp' },
    trigger_message_id: 'message_1',
    question: 'Where is my order?',
    status: 'needs_attention',
    ai_summary: null,
    admin_answer: null,
    knowledge_document_id: null,
    responded_at: null,
    responded_by: null,
    created_at: '2026-08-05T00:00:00Z',
    updated_at: '2026-08-05T00:00:00Z',
  },
  {
    id: 'escalation_2',
    customer_id: 'customer_2',
    customer: { id: 'customer_2', phone: '+94722222222', name: null, channel: 'web' },
    trigger_message_id: 'message_2',
    question: 'Do you deliver to Kandy?',
    status: 'in_progress',
    ai_summary: null,
    admin_answer: null,
    knowledge_document_id: null,
    responded_at: null,
    responded_by: null,
    created_at: '2026-08-04T00:00:00Z',
    updated_at: '2026-08-04T00:00:00Z',
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  pathnameMock.mockReturnValue('/dashboard/escalations');
  searchParamsMock.mockReturnValue(new URLSearchParams());
});

describe('EscalationList', () => {
  it('shows loading, then renders the fetched rows', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ escalations }) }));
    vi.stubGlobal('fetch', fetchMock);

    render(<EscalationList refreshKey={0} />);

    expect(screen.getByTestId('escalation-list-loading-state')).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId('escalation-list-item-escalation_1')).toBeInTheDocument()
    );
    expect(screen.getByTestId('escalation-list-item-escalation_2')).toBeInTheDocument();
    expect(screen.getByTestId('escalation-channel-badge-escalation_1')).toHaveTextContent(
      'WhatsApp'
    );
    expect(screen.getByTestId('escalation-channel-badge-escalation_2')).toHaveTextContent(
      'Website'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/escalations?'),
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('shows the empty state when no escalations match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ escalations: [] }) }))
    );

    render(<EscalationList refreshKey={0} />);

    await waitFor(() =>
      expect(screen.getByTestId('escalation-list-empty-state')).toBeInTheDocument()
    );
  });

  it('shows an error state with a working retry button', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<EscalationList refreshKey={0} />);

    await waitFor(() =>
      expect(screen.getByTestId('escalation-list-error-state')).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('escalation-list-retry-button'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('highlights the row matching the current route', async () => {
    pathnameMock.mockReturnValue('/dashboard/escalations/escalation_2');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ escalations }) }))
    );

    render(<EscalationList refreshKey={0} />);

    await waitFor(() =>
      expect(screen.getByTestId('escalation-list-item-escalation_2')).toHaveAttribute(
        'aria-current',
        'page'
      )
    );
    expect(screen.getByTestId('escalation-list-item-escalation_1')).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('refetches when refreshKey changes', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ escalations }) }));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(<EscalationList refreshKey={0} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(<EscalationList refreshKey={1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
