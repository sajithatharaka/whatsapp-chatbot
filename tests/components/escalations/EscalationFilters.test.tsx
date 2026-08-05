/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/dashboard/escalations/escalation_1',
  useSearchParams: () => new URLSearchParams(),
}));

import { EscalationFilters } from '../../../src/components/escalations/EscalationFilters';

describe('EscalationFilters', () => {
  it('renders as a single-line bar with the status trigger summarizing the default selection', () => {
    render(<EscalationFilters />);

    expect(screen.getByTestId('escalation-filters')).toHaveClass('flex-wrap', 'items-center');
    expect(screen.getByTestId('escalation-filter-status-trigger')).toHaveTextContent(
      'Status: Needs attention, In progress'
    );
  });

  it('defaults to needs_attention and in_progress checked, responded unchecked', async () => {
    const user = userEvent.setup();
    render(<EscalationFilters />);

    await user.click(screen.getByTestId('escalation-filter-status-trigger'));

    expect(screen.getByTestId('escalation-filter-status-needs_attention-checkbox')).toBeChecked();
    expect(screen.getByTestId('escalation-filter-status-in_progress-checkbox')).toBeChecked();
    expect(screen.getByTestId('escalation-filter-status-responded-checkbox')).not.toBeChecked();
  });

  it('navigates with the selected statuses and date range on apply', async () => {
    const user = userEvent.setup();
    render(<EscalationFilters />);

    await user.click(screen.getByTestId('escalation-filter-status-trigger'));
    await user.click(screen.getByTestId('escalation-filter-status-responded-checkbox'));
    fireEvent.change(screen.getByTestId('escalation-filter-from-input'), {
      target: { value: '2026-08-01' },
    });
    await user.click(screen.getByTestId('escalation-filter-apply-button'));

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('status=needs_attention%2Cin_progress%2Cresponded')
    );
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('from=2026-08-01T00%3A00%3A00.000Z')
    );
  });

  it('keeps the status menu open across multiple toggles', async () => {
    const user = userEvent.setup();
    render(<EscalationFilters />);

    await user.click(screen.getByTestId('escalation-filter-status-trigger'));
    await user.click(screen.getByTestId('escalation-filter-status-responded-checkbox'));
    await user.click(screen.getByTestId('escalation-filter-status-needs_attention-checkbox'));

    expect(screen.getByTestId('escalation-filter-status-responded-checkbox')).toBeChecked();
    expect(
      screen.getByTestId('escalation-filter-status-needs_attention-checkbox')
    ).not.toBeChecked();
  });

  it('applies filters against the current pathname, not a hardcoded index route', async () => {
    const user = userEvent.setup();
    render(<EscalationFilters />);

    await user.click(screen.getByTestId('escalation-filter-apply-button'));

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/dashboard\/escalations\/escalation_1\?/)
    );
  });
});
