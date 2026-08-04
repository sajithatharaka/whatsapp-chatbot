/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { KnowledgeFormDialog } from '../../../src/components/knowledge/KnowledgeFormDialog';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('KnowledgeFormDialog', () => {
  it('shows the content textarea (not source/file inputs) for the default text sourceType', async () => {
    const user = userEvent.setup();
    render(<KnowledgeFormDialog mode="create" trigger={<button>Add document</button>} />);

    await user.click(screen.getByText('Add document'));

    expect(screen.getByTestId('knowledge-form-content-textarea')).toBeInTheDocument();
    expect(screen.queryByTestId('knowledge-form-source-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('knowledge-form-file-input')).not.toBeInTheDocument();
  });

  it('shows the source URL input (not the content textarea) when editing a website document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ chunks: [] }) })
    );
    const user = userEvent.setup();
    render(
      <KnowledgeFormDialog
        mode="edit"
        trigger={<button>Edit</button>}
        initialValues={{
          documentId: 'doc_1',
          title: 'FAQ',
          sourceType: 'website',
          source: 'https://example.com',
        }}
      />
    );

    await user.click(screen.getByText('Edit'));

    expect(screen.getByTestId('knowledge-form-source-input')).toBeInTheDocument();
    expect(screen.queryByTestId('knowledge-form-content-textarea')).not.toBeInTheDocument();
  });

  it('shows the file input (not the content textarea) when editing a pdf document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ chunks: [] }) })
    );
    const user = userEvent.setup();
    render(
      <KnowledgeFormDialog
        mode="edit"
        trigger={<button>Edit</button>}
        initialValues={{ documentId: 'doc_1', title: 'Manual', sourceType: 'pdf', source: '' }}
      />
    );

    await user.click(screen.getByText('Edit'));

    expect(screen.getByTestId('knowledge-form-file-input')).toBeInTheDocument();
    expect(screen.queryByTestId('knowledge-form-content-textarea')).not.toBeInTheDocument();
  });

  it('fetches and displays the previously ingested content when opening the edit dialog', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        document: { id: 'doc_1' },
        chunks: [
          {
            id: 'chunk_1',
            chunk_text: 'First chunk.',
            metadata: {},
            created_at: '2026-08-01T00:00:00Z',
          },
          {
            id: 'chunk_2',
            chunk_text: 'Second chunk.',
            metadata: {},
            created_at: '2026-08-01T00:00:01Z',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <KnowledgeFormDialog
        mode="edit"
        trigger={<button>Edit</button>}
        initialValues={{ documentId: 'doc_1', title: 'FAQ', sourceType: 'text', source: '' }}
      />
    );

    await user.click(screen.getByText('Edit'));

    expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/doc_1');
    await waitFor(() =>
      expect(screen.getByTestId('knowledge-form-previous-content-textarea')).toHaveValue(
        'First chunk.\n\nSecond chunk.'
      )
    );
    expect(screen.getByTestId('knowledge-form-previous-content-textarea')).toHaveAttribute(
      'readonly'
    );
  });

  it('does not fetch or show previous content when creating a document', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<KnowledgeFormDialog mode="create" trigger={<button>Add document</button>} />);

    await user.click(screen.getByText('Add document'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId('knowledge-form-previous-content-textarea')
    ).not.toBeInTheDocument();
  });

  it('submits the mapped payload to /api/knowledge', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ documentId: 'doc_1', status: 'created', version: 1, chunksCreated: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<KnowledgeFormDialog mode="create" trigger={<button>Add document</button>} />);

    await user.click(screen.getByText('Add document'));
    await user.type(screen.getByTestId('knowledge-form-title-input'), 'FAQ');
    await user.type(screen.getByTestId('knowledge-form-content-textarea'), 'Some content');
    await user.click(screen.getByTestId('knowledge-form-submit-button'));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/knowledge', expect.any(Object))
    );

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      sourceType: 'text',
      title: 'FAQ',
      content: 'Some content',
    });
  });
});
