const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

export function cleanText(raw: string): string {
  const NULL_BYTE = String.fromCharCode(0);
  return raw
    .split('\r\n')
    .join('\n')
    .split(NULL_BYTE)
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Paragraph-aware greedy packing up to CHUNK_SIZE chars, with a small
// character overlap carried into the next chunk so retrieval doesn't lose
// context at a chunk boundary. Paragraphs longer than CHUNK_SIZE on their
// own are hard-split.
export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (current.length > 0 && current.length + paragraph.length + 2 > CHUNK_SIZE) {
      chunks.push(current.trim());
      current = current.slice(Math.max(0, current.length - CHUNK_OVERLAP));
    }

    current = current ? `${current}\n\n${paragraph}` : paragraph;

    while (current.length > CHUNK_SIZE * 1.5) {
      chunks.push(current.slice(0, CHUNK_SIZE).trim());
      current = current.slice(CHUNK_SIZE - CHUNK_OVERLAP);
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
