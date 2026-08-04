'use client';

import Link from 'next/link';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteKnowledgeDialog } from '@/components/knowledge/DeleteKnowledgeDialog';
import { KnowledgeFormDialog } from '@/components/knowledge/KnowledgeFormDialog';
import type { KnowledgeDocumentRecord, KnowledgeSourceType } from '@/lib/knowledge/types';

export function KnowledgeRowActions({ document }: { document: KnowledgeDocumentRecord }) {
  const sourceType = (document.source_type as KnowledgeSourceType | null) ?? 'text';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid={`knowledge-row-${document.id}-actions-trigger`}
        >
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/knowledge/${document.id}`}>
            <Eye className="size-4" />
            View
          </Link>
        </DropdownMenuItem>
        <KnowledgeFormDialog
          mode="edit"
          initialValues={{
            documentId: document.id,
            title: document.title ?? '',
            sourceType,
            source: document.source ?? '',
          }}
          trigger={
            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
          }
        />
        <DropdownMenuSeparator />
        <DeleteKnowledgeDialog
          documentId={document.id}
          documentTitle={document.title ?? document.id}
          trigger={
            <DropdownMenuItem
              variant="destructive"
              onSelect={(event) => event.preventDefault()}
              data-testid={`knowledge-row-${document.id}-delete-trigger`}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
