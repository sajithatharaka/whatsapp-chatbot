const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

// Grapheme segmentation is used (instead of raw string/UTF-16-index slicing)
// wherever this module cuts text at a size limit rather than a paragraph
// boundary. Sinhala (and other Brahmic scripts) represent a single visual
// character as a base consonant plus one or more combining dependent-vowel
// signs/virama — several UTF-16 code units that must stay together. Slicing
// by raw character/code-unit index can land inside that cluster, corrupting
// the base consonant on one side of the cut and leaving an orphaned
// combining mark on the other. Grapheme granularity is locale-independent
// (Unicode UAX #29), so no locale needs to be passed in.
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function toGraphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
}

// Returns the longest suffix of `graphemes` whose joined length is <=
// maxChars, without splitting a grapheme — the grapheme-safe equivalent of
// `text.slice(text.length - maxChars)`.
function takeOverlapSuffix(graphemes: string[], maxChars: number): string {
  let chars = 0;
  let startIndex = graphemes.length;
  while (startIndex > 0) {
    const nextLen = chars + graphemes[startIndex - 1].length;
    if (nextLen > maxChars) break;
    chars = nextLen;
    startIndex -= 1;
  }
  return graphemes.slice(startIndex).join('');
}

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
// own are hard-split. Every cut this makes lands on a grapheme boundary —
// see the comment on graphemeSegmenter above.
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
      current = takeOverlapSuffix(toGraphemes(current), CHUNK_OVERLAP);
    }

    current = current ? `${current}\n\n${paragraph}` : paragraph;

    while (current.length > CHUNK_SIZE * 1.5) {
      const graphemes = toGraphemes(current);

      let chars = 0;
      let headEnd = 0;
      for (; headEnd < graphemes.length; headEnd += 1) {
        const nextLen = chars + graphemes[headEnd].length;
        if (nextLen > CHUNK_SIZE) break;
        chars = nextLen;
      }
      // Guard against a single grapheme longer than CHUNK_SIZE (pathological
      // input): always consume at least one, so the loop still terminates.
      if (headEnd === 0) headEnd = 1;

      const headGraphemes = graphemes.slice(0, headEnd);
      chunks.push(headGraphemes.join('').trim());
      current = takeOverlapSuffix(headGraphemes, CHUNK_OVERLAP) + graphemes.slice(headEnd).join('');
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
