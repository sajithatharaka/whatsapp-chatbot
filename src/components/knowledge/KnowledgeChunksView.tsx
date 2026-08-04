import type { ViewableChunk } from '@/lib/knowledge/types';

export function KnowledgeChunksView({ chunks }: { chunks: ViewableChunk[] }) {
  if (chunks.length === 0) {
    return <p className="text-sm text-muted-foreground">No chunks ingested yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-3" data-testid="knowledge-chunks-list">
      {chunks.map((chunk, index) => (
        <li key={chunk.id} className="rounded-md border p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Chunk {index + 1}</p>
          <p className="whitespace-pre-wrap">{chunk.chunk_text}</p>
        </li>
      ))}
    </ol>
  );
}
