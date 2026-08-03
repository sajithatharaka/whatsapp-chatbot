import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { KnowledgeFormDialog } from '@/components/knowledge/KnowledgeFormDialog';
import { KnowledgeListSection } from '@/components/knowledge/KnowledgeListSection';

export default function KnowledgePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">
            Documents the WhatsApp assistant draws answers from.
          </p>
        </div>
        <KnowledgeFormDialog
          mode="create"
          trigger={
            <Button data-testid="knowledge-add-document-button">
              <Plus className="size-4" />
              Add document
            </Button>
          }
        />
      </div>
      <KnowledgeListSection />
    </div>
  );
}
