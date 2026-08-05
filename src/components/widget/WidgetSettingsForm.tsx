'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CopyCodeButton } from '@/components/api-docs/CopyCodeButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { UpdateWidgetConfigPayload, WidgetConfig, WidgetPosition } from '@/lib/widget/types';

const POSITION_OPTIONS: { value: WidgetPosition; label: string }[] = [
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
];

function originsToText(origins: string[]): string {
  return origins.join('\n');
}

function textToOrigins(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function WidgetSettingsForm({ initialConfig }: { initialConfig: WidgetConfig }) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [originsText, setOriginsText] = useState(originsToText(initialConfig.allowed_origins));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const embedSnippet =
    typeof window !== 'undefined'
      ? `<script src="${window.location.origin}/widget.js" async></script>`
      : '<script src="https://<your-app-domain>/widget.js" async></script>';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const allowedOrigins = textToOrigins(originsText);
      if (config.enabled && allowedOrigins.length === 0) {
        throw new Error('Add at least one allowed domain before enabling the widget.');
      }

      const payload: UpdateWidgetConfigPayload = {
        enabled: config.enabled,
        title: config.title,
        welcomeMessage: config.welcome_message,
        primaryColor: config.primary_color,
        position: config.position,
        allowedOrigins,
      };

      const response = await fetch('/api/widget-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'Failed to save widget settings');
      }

      setConfig(body.config as WidgetConfig);
      setOriginsText(originsToText((body.config as WidgetConfig).allowed_origins));
      toast.success('Widget settings saved');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save widget settings');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <input
          id="widget-enabled-checkbox"
          data-testid="widget-enabled-checkbox"
          type="checkbox"
          checked={config.enabled}
          onChange={(event) => setConfig((prev) => ({ ...prev, enabled: event.target.checked }))}
          className="size-4"
        />
        <Label htmlFor="widget-enabled-checkbox">Enable the website widget</Label>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="widget-title-input">Title</Label>
        <Input
          id="widget-title-input"
          data-testid="widget-title-input"
          value={config.title}
          onChange={(event) => setConfig((prev) => ({ ...prev, title: event.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="widget-welcome-message-textarea">Welcome message</Label>
        <Textarea
          id="widget-welcome-message-textarea"
          data-testid="widget-welcome-message-textarea"
          rows={3}
          value={config.welcome_message}
          onChange={(event) =>
            setConfig((prev) => ({ ...prev, welcome_message: event.target.value }))
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="widget-primary-color-input">Primary color</Label>
        <Input
          id="widget-primary-color-input"
          data-testid="widget-primary-color-input"
          type="color"
          className="h-9 w-16 p-1"
          value={config.primary_color}
          onChange={(event) =>
            setConfig((prev) => ({ ...prev, primary_color: event.target.value }))
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="widget-position-select">Position</Label>
        <Select
          value={config.position}
          onValueChange={(value) =>
            setConfig((prev) => ({ ...prev, position: value as WidgetPosition }))
          }
        >
          <SelectTrigger id="widget-position-select" data-testid="widget-position-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POSITION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="widget-allowed-origins-textarea">
          Allowed domains (one per line, e.g. https://example.com)
        </Label>
        <Textarea
          id="widget-allowed-origins-textarea"
          data-testid="widget-allowed-origins-textarea"
          rows={4}
          placeholder="https://example.com"
          value={originsText}
          onChange={(event) => setOriginsText(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Only messages sent from these exact origins are accepted — include both{' '}
          <code>https://example.com</code> and <code>https://www.example.com</code> if you use both.
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Embed this on your website</p>
          <CopyCodeButton text={embedSnippet} endpointId="widget-embed" />
        </div>
        <pre
          className="overflow-x-auto rounded-md bg-muted p-3 text-xs"
          data-testid="widget-embed-snippet"
        >
          <code>{embedSnippet}</code>
        </pre>
      </div>

      <div>
        <Button type="submit" disabled={isSubmitting} data-testid="widget-settings-save-button">
          {isSubmitting ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  );
}
