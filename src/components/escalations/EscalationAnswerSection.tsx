'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ChatEscalationRecord } from '@/lib/escalations/types';
import type { KnowledgeSourceType, ViewableChunk } from '@/lib/knowledge/types';

interface MatchedDocument {
  documentId: string;
  title: string | null;
  previousContent: string;
}

type WorkflowStep = 'idle' | 'searching' | 'no_match' | 'reviewing' | 'saving';

export function EscalationAnswerSection({ escalation }: { escalation: ChatEscalationRecord }) {
  const [answer, setAnswer] = useState(escalation.admin_answer ?? '');
  const [isSavingAnswer, setIsSavingAnswer] = useState(false);
  const [hasSavedAnswer, setHasSavedAnswer] = useState(Boolean(escalation.admin_answer));
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [step, setStep] = useState<WorkflowStep>('idle');
  const [match, setMatch] = useState<MatchedDocument | null>(null);
  const [proposedContent, setProposedContent] = useState('');

  async function saveAnswer() {
    setIsSavingAnswer(true);
    try {
      const response = await fetch(`/api/escalations/${escalation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminAnswer: answer }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Failed to save answer');
      toast.success('Answer saved');
      setHasSavedAnswer(true);
      setShowUpdatePrompt(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save answer');
    } finally {
      setIsSavingAnswer(false);
    }
  }

  async function findMatch() {
    setStep('searching');
    try {
      const searchResponse = await fetch('/api/knowledge/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: escalation.question }),
      });
      const searchBody = await searchResponse.json();
      if (!searchResponse.ok) throw new Error(searchBody.error ?? 'Search failed');

      const topMatch = (searchBody.results as { document_id: string }[] | undefined)?.[0];
      if (!topMatch) {
        setStep('no_match');
        return;
      }

      const docResponse = await fetch(`/api/knowledge/${topMatch.document_id}`);
      const docBody = await docResponse.json();
      if (!docResponse.ok) throw new Error(docBody.error ?? 'Failed to load matching document');

      const previousContent = (docBody.chunks as ViewableChunk[])
        .map((chunk) => chunk.chunk_text)
        .join('\n\n');

      setMatch({
        documentId: docBody.document.id as string,
        title: (docBody.document.title as string | null) ?? null,
        previousContent,
      });
      setProposedContent(previousContent ? `${previousContent}\n\n${answer}` : answer);
      setStep('reviewing');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to find a matching document');
      setStep('idle');
    }
  }

  async function confirmSave() {
    if (!match) return;
    setStep('saving');
    try {
      const payload: {
        documentId: string;
        sourceType: KnowledgeSourceType;
        content: string;
        title?: string;
      } = {
        documentId: match.documentId,
        sourceType: 'text',
        content: proposedContent,
      };
      if (match.title) payload.title = match.title;

      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Failed to save knowledge document');

      await fetch(`/api/escalations/${escalation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledgeDocumentId: match.documentId }),
      });

      toast.success('Knowledge base updated');
      setShowUpdatePrompt(false);
      setStep('idle');
      setMatch(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update knowledge base');
      setStep('reviewing');
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="escalation-answer-textarea">Your answer to the customer</Label>
        <Textarea
          id="escalation-answer-textarea"
          data-testid="escalation-answer-textarea"
          rows={4}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="Record how you answered this customer (e.g. via WhatsApp)…"
        />
        <Button
          className="w-fit"
          disabled={isSavingAnswer || answer.trim().length === 0}
          onClick={saveAnswer}
          data-testid="escalation-save-answer-button"
        >
          {isSavingAnswer ? 'Saving…' : 'Save answer'}
        </Button>
      </div>

      {hasSavedAnswer && showUpdatePrompt && step === 'idle' ? (
        <div
          className="flex items-center justify-between rounded-md bg-muted p-3 text-sm"
          data-testid="escalation-update-knowledge-prompt"
        >
          <p>Update the knowledge base with this answer?</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={findMatch}
              data-testid="escalation-update-knowledge-yes-button"
            >
              Yes
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowUpdatePrompt(false)}
              data-testid="escalation-update-knowledge-no-button"
            >
              No
            </Button>
          </div>
        </div>
      ) : null}

      {hasSavedAnswer && !showUpdatePrompt && step === 'idle' ? (
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => setShowUpdatePrompt(true)}
          data-testid="escalation-update-knowledge-reopen-button"
        >
          Update knowledge base with this answer
        </Button>
      ) : null}

      {step === 'searching' ? (
        <p className="text-sm text-muted-foreground">Searching the knowledge base…</p>
      ) : null}

      {step === 'no_match' ? (
        <div
          className="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
          data-testid="escalation-no-match-state"
        >
          No closely matching document was found.{' '}
          <Link href="/dashboard/knowledge" className="underline">
            Create a new knowledge document
          </Link>{' '}
          instead.
        </div>
      ) : null}

      {(step === 'reviewing' || step === 'saving') && match ? (
        <div
          className="flex flex-col gap-3 rounded-md border p-3"
          data-testid="escalation-knowledge-review"
        >
          <p className="text-sm font-medium">
            Most relevant document: {match.title ?? match.documentId}
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="escalation-current-content">Current content</Label>
            <Textarea
              id="escalation-current-content"
              readOnly
              rows={6}
              className="bg-muted"
              value={match.previousContent || 'No previous content ingested yet.'}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="escalation-proposed-content">Proposed updated content</Label>
            <Textarea
              id="escalation-proposed-content"
              data-testid="escalation-proposed-content-textarea"
              rows={8}
              value={proposedContent}
              onChange={(event) => setProposedContent(event.target.value)}
            />
          </div>
          <Button
            className="w-fit"
            disabled={step === 'saving'}
            onClick={confirmSave}
            data-testid="escalation-confirm-knowledge-save-button"
          >
            {step === 'saving' ? 'Saving…' : 'Confirm & save to knowledge base'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
