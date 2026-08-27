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

import { AiConfigForm } from '../../../src/components/settings/AiConfigForm';
import type { AiConfig } from '../../../src/lib/ai-config/types';

const BASE_CONFIG: AiConfig = {
  id: 'config_1',
  chat_model: 'google/gemini-2.5-flash',
  embedding_model: 'qwen/qwen3-embedding-8b',
  fallback_model: 'openai/gpt-4o-mini',
  similarity_threshold: 0.5,
  temperature: 0.3,
  max_tokens: 512,
  top_k: 5,
  system_prompt: 'You are helpful.',
  business_rules_prompt: 'Answer in the customer language.',
  fallback_message: 'I could not find that.',
  timezone: 'UTC',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('AiConfigForm', () => {
  it('renders the current config in the form fields', () => {
    render(<AiConfigForm initialConfig={BASE_CONFIG} />);

    expect(screen.getByTestId('ai-config-chat-model-input')).toHaveValue('google/gemini-2.5-flash');
    expect(screen.getByTestId('ai-config-embedding-model-input')).toHaveValue(
      'qwen/qwen3-embedding-8b'
    );
    expect(screen.getByTestId('ai-config-similarity-threshold-input')).toHaveValue(0.5);
    expect(screen.getByTestId('ai-config-max-tokens-input')).toHaveValue(512);
    expect(screen.getByTestId('ai-config-system-prompt-textarea')).toHaveValue('You are helpful.');
  });

  it('reveals an explanation tooltip for temperature, top k and similarity threshold on focus', async () => {
    const user = userEvent.setup();
    render(<AiConfigForm initialConfig={BASE_CONFIG} />);

    for (const field of ['temperature', 'top-k', 'similarity-threshold']) {
      const trigger = screen.getByTestId(`ai-config-${field}-hint`);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

      await user.click(trigger);
      const tooltip = await screen.findByRole('tooltip');
      expect(tooltip.textContent).toBeTruthy();
      expect(trigger).toHaveAttribute('aria-describedby', tooltip.getAttribute('id'));

      await user.tab();
    }
  });

  it('saves settings and shows a success toast', async () => {
    const updated: AiConfig = { ...BASE_CONFIG, temperature: 0.4 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ config: updated }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<AiConfigForm initialConfig={BASE_CONFIG} />);

    const temperature = screen.getByTestId('ai-config-temperature-input');
    await user.clear(temperature);
    await user.type(temperature, '0.4');
    await user.click(screen.getByTestId('ai-config-save-button'));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai-config',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          chatModel: BASE_CONFIG.chat_model,
          embeddingModel: BASE_CONFIG.embedding_model,
          fallbackModel: BASE_CONFIG.fallback_model,
          similarityThreshold: 0.5,
          temperature: 0.4,
          maxTokens: 512,
          topK: 5,
          systemPrompt: BASE_CONFIG.system_prompt,
          businessRulesPrompt: BASE_CONFIG.business_rules_prompt,
          fallbackMessage: BASE_CONFIG.fallback_message,
          timezone: 'UTC',
        }),
      })
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  it('keeps the numeric inputs bounded to their valid ranges', () => {
    render(<AiConfigForm initialConfig={BASE_CONFIG} />);

    const threshold = screen.getByTestId('ai-config-similarity-threshold-input');
    expect(threshold).toHaveAttribute('min', '0');
    expect(threshold).toHaveAttribute('max', '1');
    expect(screen.getByTestId('ai-config-temperature-input')).toHaveAttribute('max', '2');
    expect(screen.getByTestId('ai-config-max-tokens-input')).toHaveAttribute('min', '1');
  });

  it('blocks the request and toasts an error when a required prompt is cleared', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<AiConfigForm initialConfig={BASE_CONFIG} />);

    await user.clear(screen.getByTestId('ai-config-system-prompt-textarea'));
    await user.click(screen.getByTestId('ai-config-save-button'));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('System prompt is required.'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends null when the optional fallback model is cleared', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ config: { ...BASE_CONFIG, fallback_model: null } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<AiConfigForm initialConfig={BASE_CONFIG} />);

    await user.clear(screen.getByTestId('ai-config-fallback-model-input'));
    await user.click(screen.getByTestId('ai-config-save-button'));

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.fallbackModel).toBeNull();
  });

  it('shows an error toast when the save request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Something went wrong' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<AiConfigForm initialConfig={BASE_CONFIG} />);

    await user.click(screen.getByTestId('ai-config-save-button'));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Something went wrong'));
  });
});
