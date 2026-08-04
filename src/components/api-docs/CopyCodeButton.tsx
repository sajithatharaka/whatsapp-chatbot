'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function CopyCodeButton({ text, endpointId }: { text: string; endpointId: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      data-testid={`api-docs-copy-${endpointId}-button`}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}
