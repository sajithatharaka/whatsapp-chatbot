'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface DeleteKnowledgeDialogProps {
  documentId: string;
  documentTitle: string;
  trigger: React.ReactNode;
  /** Defaults to refreshing the current route (correct for the list page). */
  onDeleted?: () => void;
}

export function DeleteKnowledgeDialog({
  documentId,
  documentTitle,
  trigger,
  onDeleted,
}: DeleteKnowledgeDialogProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/knowledge/${encodeURIComponent(documentId)}`, {
        method: 'DELETE',
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? 'Failed to delete knowledge document');
      }
      toast.success('Knowledge document deleted');
      if (onDeleted) {
        onDeleted();
      } else {
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete knowledge document');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent data-testid="knowledge-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{documentTitle}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the document and all of its ingested chunks. The assistant will
            no longer be able to draw on this content. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="knowledge-delete-cancel-button">Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="knowledge-delete-confirm-button"
            disabled={isDeleting}
            onClick={handleConfirm}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
