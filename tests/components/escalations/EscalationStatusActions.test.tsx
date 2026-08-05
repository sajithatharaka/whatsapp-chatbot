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

import { EscalationListRefreshProvider } from '../../../src/components/escalations/EscalationListRefreshContext';
import { EscalationStatusActions } from '../../../src/components/escalations/EscalationStatusActions';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('EscalationStatusActions', () => {
  it('bumps the list refresh context and refreshes the router after a successful update', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ escalation: { status: 'in_progress' } }),
      }))
    );
    const bumpMock = vi.fn();

    const user = userEvent.setup();
    render(
      <EscalationListRefreshProvider value={{ bump: bumpMock }}>
        <EscalationStatusActions escalationId="escalation_1" status="needs_attention" />
      </EscalationListRefreshProvider>
    );

    await user.click(screen.getByTestId('escalation-mark-in-progress-button'));

    await waitFor(() => expect(bumpMock).toHaveBeenCalledTimes(1));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('does not bump the list when the update fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({ error: 'boom' }) }))
    );
    const bumpMock = vi.fn();

    const user = userEvent.setup();
    render(
      <EscalationListRefreshProvider value={{ bump: bumpMock }}>
        <EscalationStatusActions escalationId="escalation_1" status="needs_attention" />
      </EscalationListRefreshProvider>
    );

    await user.click(screen.getByTestId('escalation-mark-in-progress-button'));

    await waitFor(() =>
      expect(screen.getByTestId('escalation-mark-in-progress-button')).not.toBeDisabled()
    );
    expect(bumpMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
