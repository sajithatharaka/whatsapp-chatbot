/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getAiConfigMock, getWidgetConfigMock } = vi.hoisted(() => ({
  getAiConfigMock: vi.fn(),
  getWidgetConfigMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-api', () => ({
  getAiConfig: getAiConfigMock,
  getWidgetConfig: getWidgetConfigMock,
}));

// The AiConfigForm is a client component with its own dedicated test; stub it
// here so this test only covers the page's data wiring and composition.
vi.mock('@/components/settings/AiConfigForm', () => ({
  AiConfigForm: ({ initialConfig }: { initialConfig: { chat_model: string } }) => (
    <div data-testid="ai-config-form-stub">{initialConfig.chat_model}</div>
  ),
}));

import SettingsPage from '../../../../src/app/dashboard/settings/page';

const AI_CONFIG = {
  id: 'config_1',
  chat_model: 'google/gemini-2.5-flash',
  embedding_model: 'qwen/qwen3-embedding-8b',
  fallback_model: null,
  similarity_threshold: 0.5,
  temperature: 0.3,
  max_tokens: 512,
  top_k: 5,
  system_prompt: 'You are helpful.',
  business_rules_prompt: null,
  fallback_message: 'I could not find that.',
  timezone: 'UTC',
};

const WIDGET_CONFIG = {
  id: 'widget_1',
  enabled: true,
  title: 'Chat with us',
  welcome_message: 'Hi!',
  primary_color: '#111827',
  position: 'bottom-right' as const,
  allowed_origins: ['https://example.com'],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('SettingsPage', () => {
  it('renders the AI config form and the widget config card from fetched data', async () => {
    getAiConfigMock.mockResolvedValue(AI_CONFIG);
    getWidgetConfigMock.mockResolvedValue(WIDGET_CONFIG);

    render(await SettingsPage());

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByTestId('ai-config-form-stub')).toHaveTextContent('google/gemini-2.5-flash');
    expect(screen.getByTestId('settings-widget-config-link')).toHaveAttribute(
      'href',
      '/dashboard/widget'
    );
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });
});
