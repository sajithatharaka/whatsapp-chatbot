import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { KnowledgeRowActions } from '@/components/knowledge/KnowledgeRowActions';
import { listKnowledgeDocuments } from '@/lib/supabase/admin-api';

export async function KnowledgeListSection() {
  const documents = await listKnowledgeDocuments();

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="knowledge-list-empty-state">
        No knowledge documents yet. Add one to get started.
      </p>
    );
  }

  return (
    <Table data-testid="knowledge-list-table">
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Source type</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((document) => (
          <TableRow key={document.id} data-testid={`knowledge-row-${document.id}`}>
            <TableCell className="font-medium">
              {document.title ?? document.source ?? document.id}
            </TableCell>
            <TableCell>{document.source_type ?? '—'}</TableCell>
            <TableCell>{document.version}</TableCell>
            <TableCell>
              {document.updated_at ? new Date(document.updated_at).toLocaleString() : '—'}
            </TableCell>
            <TableCell>
              <KnowledgeRowActions document={document} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
