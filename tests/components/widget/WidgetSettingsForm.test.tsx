/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { refreshMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));

import { WidgetSettingsForm } from '../../../src/components/widget/WidgetSettingsForm';
import type { WidgetConfig } from '../../../src/lib/widget/types';

const BASE_CONFIG: WidgetConfig = {
  id: 'config_1',
  enabled: false,
  title: 'Chat with us',
  welcome_message: 'Hi! Ask me anything.',
  primary_color: '#111827',
  position: 'bottom-right',
  allowed_origins: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('WidgetSettingsForm', () => {
  it('renders the current config in the form fields and the embed snippet', () => {
    render(<WidgetSettingsForm initialConfig={BASE_CONFIG} />);

    expect(screen.getByTestId('widget-title-input')).toHaveValue('Chat with us');
    expect(screen.getByTestId('widget-welcome-message-textarea')).toHaveValue(
      'Hi! Ask me anything.'
    );
    expect(screen.getByTestId('widget-enabled-checkbox')).not.toBeChecked();
    expect(screen.getByTestId('widget-embed-snippet').textContent).toContain('/widget.js');
  });

  it('blocks enabling the widget with no allowed origins configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<WidgetSettingsForm initialConfig={BASE_CONFIG} />);

    await user.click(screen.getByTestId('widget-enabled-checkbox'));
    await user.click(screen.getByTestId('widget-settings-save-button'));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves settings and shows a success toast', async () => {
    const updated: WidgetConfig = {
      ...BASE_CONFIG,
      enabled: true,
      allowed_origins: ['https://example.com'],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ config: updated }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<WidgetSettingsForm initialConfig={BASE_CONFIG} />);

    await user.click(screen.getByTestId('widget-enabled-checkbox'));
    await user.type(screen.getByTestId('widget-allowed-origins-textarea'), 'https://example.com');
    await user.click(screen.getByTestId('widget-settings-save-button'));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/widget-config',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          enabled: true,
          title: BASE_CONFIG.title,
          welcomeMessage: BASE_CONFIG.welcome_message,
          primaryColor: BASE_CONFIG.primary_color,
          position: BASE_CONFIG.position,
          allowedOrigins: ['https://example.com'],
        }),
      })
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it('shows an error toast when the save request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Something went wrong' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<WidgetSettingsForm initialConfig={BASE_CONFIG} />);

    await user.click(screen.getByTestId('widget-settings-save-button'));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Something went wrong'));
  });
});
