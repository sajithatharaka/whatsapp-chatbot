/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CopyCodeButton } from '../../../src/components/api-docs/CopyCodeButton';

describe('CopyCodeButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copies text via navigator.clipboard when available and shows the copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyCodeButton text="curl https://example.com" endpointId="chat" />);

    fireEvent.click(screen.getByTestId('api-docs-copy-chat-button'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('curl https://example.com'));
    expect(screen.getByText('Copied')).toBeInTheDocument();
  });

  it('falls back to execCommand when navigator.clipboard is undefined (insecure context)', async () => {
    Object.assign(navigator, { clipboard: undefined });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    render(<CopyCodeButton text="curl https://example.com" endpointId="search" />);

    fireEvent.click(screen.getByTestId('api-docs-copy-search-button'));

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith('copy'));
    expect(screen.getByText('Copied')).toBeInTheDocument();
  });
});
