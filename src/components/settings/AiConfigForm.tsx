'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FieldHint } from '@/components/settings/FieldHint';
import type { AiConfig, UpdateAiConfigPayload } from '@/lib/ai-config/types';

const FIELD_HINTS = {
  similarity_threshold:
    'Minimum similarity score (0–1) a knowledge-base chunk must reach to count as a match for the question. Chunks below it are ignored; if nothing clears the bar the assistant sends the fallback message. Raise it for stricter matching, lower it if correct answers are being missed.',
  temperature:
    'Controls randomness in the wording of replies. Low (e.g. 0.2) makes answers focused and repeatable; high (e.g. 0.9) makes them more varied and creative. Keep it low for grounded support answers.',
  top_k:
    'How many knowledge-base chunks are retrieved and passed to the model as context for each question. Higher gives the model more to work with but adds cost and noise; lower keeps the context tight.',
} as const;

type FormState = {
  chat_model: string;
  embedding_model: string;
  fallback_model: string;
  similarity_threshold: string;
  temperature: string;
  max_tokens: string;
  top_k: string;
  system_prompt: string;
  business_rules_prompt: string;
  fallback_message: string;
  timezone: string;
};

function toFormState(config: AiConfig): FormState {
  return {
    chat_model: config.chat_model,
    embedding_model: config.embedding_model,
    fallback_model: config.fallback_model ?? '',
    similarity_threshold: String(config.similarity_threshold),
    temperature: String(config.temperature),
    max_tokens: String(config.max_tokens),
    top_k: String(config.top_k),
    system_prompt: config.system_prompt,
    business_rules_prompt: config.business_rules_prompt ?? '',
    fallback_message: config.fallback_message,
    timezone: config.timezone,
  };
}

function parseBoundedNumber(raw: string, label: string, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${label} must be a number.`);
  if (value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function parsePositiveInteger(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return value;
}

function buildPayload(form: FormState): UpdateAiConfigPayload {
  const chatModel = form.chat_model.trim();
  const embeddingModel = form.embedding_model.trim();
  const systemPrompt = form.system_prompt.trim();
  const fallbackMessage = form.fallback_message.trim();
  const timezone = form.timezone.trim();

  if (!chatModel) throw new Error('Chat model is required.');
  if (!embeddingModel) throw new Error('Embedding model is required.');
  if (!systemPrompt) throw new Error('System prompt is required.');
  if (!fallbackMessage) throw new Error('Fallback message is required.');
  if (!timezone) throw new Error('Timezone is required.');

  return {
    chatModel,
    embeddingModel,
    fallbackModel: form.fallback_model.trim() || null,
    similarityThreshold: parseBoundedNumber(
      form.similarity_threshold,
      'Similarity threshold',
      0,
      1
    ),
    temperature: parseBoundedNumber(form.temperature, 'Temperature', 0, 2),
    maxTokens: parsePositiveInteger(form.max_tokens, 'Max tokens'),
    topK: parsePositiveInteger(form.top_k, 'Top K'),
    systemPrompt,
    businessRulesPrompt: form.business_rules_prompt.trim() || null,
    fallbackMessage,
    timezone,
  };
}

export function AiConfigForm({ initialConfig }: { initialConfig: AiConfig }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(initialConfig));
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = buildPayload(form);

      const response = await fetch('/api/ai-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'Failed to save AI settings');
      }

      setForm(toFormState(body.config as AiConfig));
      toast.success('AI settings saved');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save AI settings');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-config-chat-model-input">Chat model</Label>
        <Input
          id="ai-config-chat-model-input"
          data-testid="ai-config-chat-model-input"
          value={form.chat_model}
          onChange={(event) => setField('chat_model', event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-config-embedding-model-input">Embedding model</Label>
        <Input
          id="ai-config-embedding-model-input"
          data-testid="ai-config-embedding-model-input"
          value={form.embedding_model}
          onChange={(event) => setField('embedding_model', event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Changing this does not re-embed existing knowledge chunks — run a reindex afterwards so
          stored vectors match the new model.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-config-fallback-model-input">Fallback model (optional)</Label>
        <Input
          id="ai-config-fallback-model-input"
          data-testid="ai-config-fallback-model-input"
          value={form.fallback_model}
          onChange={(event) => setField('fallback_model', event.target.value)}
          placeholder="Leave blank to disable"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="ai-config-similarity-threshold-input">Similarity threshold</Label>
            <FieldHint
              field="similarity-threshold"
              label="similarity threshold"
              text={FIELD_HINTS.similarity_threshold}
            />
          </div>
          <Input
            id="ai-config-similarity-threshold-input"
            data-testid="ai-config-similarity-threshold-input"
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={form.similarity_threshold}
            onChange={(event) => setField('similarity_threshold', event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="ai-config-temperature-input">Temperature</Label>
            <FieldHint field="temperature" label="temperature" text={FIELD_HINTS.temperature} />
          </div>
          <Input
            id="ai-config-temperature-input"
            data-testid="ai-config-temperature-input"
            type="number"
            step="0.01"
            min="0"
            max="2"
            value={form.temperature}
            onChange={(event) => setField('temperature', event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ai-config-max-tokens-input">Max tokens</Label>
          <Input
            id="ai-config-max-tokens-input"
            data-testid="ai-config-max-tokens-input"
            type="number"
            step="1"
            min="1"
            value={form.max_tokens}
            onChange={(event) => setField('max_tokens', event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="ai-config-top-k-input">Top K</Label>
            <FieldHint field="top-k" label="Top K" text={FIELD_HINTS.top_k} />
          </div>
          <Input
            id="ai-config-top-k-input"
            data-testid="ai-config-top-k-input"
            type="number"
            step="1"
            min="1"
            value={form.top_k}
            onChange={(event) => setField('top_k', event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-config-timezone-input">Timezone</Label>
        <Input
          id="ai-config-timezone-input"
          data-testid="ai-config-timezone-input"
          value={form.timezone}
          onChange={(event) => setField('timezone', event.target.value)}
          placeholder="UTC"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-config-system-prompt-textarea">System prompt</Label>
        <Textarea
          id="ai-config-system-prompt-textarea"
          data-testid="ai-config-system-prompt-textarea"
          rows={6}
          value={form.system_prompt}
          onChange={(event) => setField('system_prompt', event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-config-business-rules-prompt-textarea">
          Business rules prompt (optional)
        </Label>
        <Textarea
          id="ai-config-business-rules-prompt-textarea"
          data-testid="ai-config-business-rules-prompt-textarea"
          rows={4}
          value={form.business_rules_prompt}
          onChange={(event) => setField('business_rules_prompt', event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-config-fallback-message-textarea">Fallback message</Label>
        <Textarea
          id="ai-config-fallback-message-textarea"
          data-testid="ai-config-fallback-message-textarea"
          rows={3}
          value={form.fallback_message}
          onChange={(event) => setField('fallback_message', event.target.value)}
        />
      </div>

      <div>
        <Button type="submit" disabled={isSubmitting} data-testid="ai-config-save-button">
          {isSubmitting ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}
