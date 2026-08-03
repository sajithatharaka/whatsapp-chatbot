'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { mapFormToIngestPayload } from '@/lib/knowledge/mapFormToIngestPayload';
import type { KnowledgeFormValues, KnowledgeSourceType } from '@/lib/knowledge/types';

const SOURCE_TYPE_OPTIONS: { value: KnowledgeSourceType; label: string }[] = [
  { value: 'text', label: 'Plain text' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'csv', label: 'CSV' },
  { value: 'website', label: 'Website URL' },
  { value: 'pdf', label: 'PDF file' },
  { value: 'docx', label: 'Word document (.docx)' },
];

const TEXT_LIKE_TYPES = new Set<KnowledgeSourceType>(['text', 'markdown', 'csv']);
const FILE_TYPES = new Set<KnowledgeSourceType>(['pdf', 'docx']);

interface KnowledgeFormDialogProps {
  mode: 'create' | 'edit';
  trigger: React.ReactNode;
  initialValues?: {
    documentId: string;
    title: string;
    sourceType: KnowledgeSourceType;
    source: string;
  };
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the `data:<mime>;base64,` prefix — the Edge Function wants raw base64.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function KnowledgeFormDialog({ mode, trigger, initialValues }: KnowledgeFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [values, setValues] = useState<KnowledgeFormValues>({
    documentId: initialValues?.documentId,
    title: initialValues?.title ?? '',
    sourceType: initialValues?.sourceType ?? 'text',
    source: initialValues?.source ?? '',
    content: '',
    contentBase64: '',
  });
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const base64 = await readFileAsBase64(file);
    setValues((prev) => ({ ...prev, contentBase64: base64 }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapFormToIngestPayload(values)),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'Failed to save knowledge document');
      }
      toast.success(mode === 'create' ? 'Knowledge document added' : 'Knowledge document updated');
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save knowledge document');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent data-testid="knowledge-form-dialog">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Add knowledge document' : 'Update knowledge document'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Add a new document to the assistant’s knowledge base.'
                : 'Provide the updated content — this replaces the current version. The previously ingested content isn’t editable in place, only re-ingested.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="knowledge-form-title">Title</Label>
            <Input
              id="knowledge-form-title"
              data-testid="knowledge-form-title-input"
              value={values.title}
              onChange={(event) => setValues((prev) => ({ ...prev, title: event.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="knowledge-form-source-type">Source type</Label>
            <Select
              value={values.sourceType}
              onValueChange={(value) =>
                setValues((prev) => ({ ...prev, sourceType: value as KnowledgeSourceType }))
              }
            >
              <SelectTrigger
                id="knowledge-form-source-type"
                data-testid="knowledge-form-source-type-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {TEXT_LIKE_TYPES.has(values.sourceType) ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="knowledge-form-content">Content</Label>
              <Textarea
                id="knowledge-form-content"
                data-testid="knowledge-form-content-textarea"
                required
                rows={8}
                value={values.content}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, content: event.target.value }))
                }
              />
            </div>
          ) : null}

          {values.sourceType === 'website' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="knowledge-form-source">Source URL</Label>
              <Input
                id="knowledge-form-source"
                data-testid="knowledge-form-source-input"
                type="url"
                required
                placeholder="https://example.com/faq"
                value={values.source}
                onChange={(event) => setValues((prev) => ({ ...prev, source: event.target.value }))}
              />
            </div>
          ) : null}

          {FILE_TYPES.has(values.sourceType) ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="knowledge-form-file">File</Label>
              <Input
                id="knowledge-form-file"
                data-testid="knowledge-form-file-input"
                type="file"
                accept={values.sourceType === 'pdf' ? '.pdf' : '.docx'}
                required={!fileName}
                onChange={handleFileChange}
              />
              {fileName ? (
                <p className="text-xs text-muted-foreground">Selected: {fileName}</p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="submit"
              disabled={isSubmitting}
              data-testid="knowledge-form-submit-button"
            >
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
