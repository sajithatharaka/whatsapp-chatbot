import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { chunkText } from './chunk.ts';

const CHUNK_OVERLAP = 150;
const MAX_OVERLAP_WITH_GRAPHEME_ROUNDING = CHUNK_OVERLAP + 10;

// Every code-unit offset in `text` where a grapheme cluster starts (as
// Intl.Segmenter — the same mechanism chunk.ts uses — sees it), plus the
// end-of-string offset. A chunk boundary that isn't one of these offsets
// necessarily landed inside a grapheme the segmenter would keep together.
function graphemeBoundaries(text: string): Set<number> {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const boundaries = new Set<number>([0]);
  let offset = 0;
  for (const { segment } of segmenter.segment(text)) {
    offset += segment.length;
    boundaries.add(offset);
  }
  return boundaries;
}

// Locates each chunk's start offset in the original text, in order. Chunks
// are literal substrings of the source (chunkText only cuts and trims
// whitespace, never rewrites characters), and — since CHUNK_SIZE >
// CHUNK_OVERLAP guarantees forward progress each hard-split iteration —
// each chunk starts strictly after the previous one, so searching forward
// from just past the previous match locates the right occurrence. This is
// only unambiguous if the source text isn't perfectly periodic (see
// longSinhalaParagraph's per-repetition marker) — a periodic source can put
// an identical, but wrong, occurrence of a chunk's content earlier in the
// text than its true cut point.

function findChunkStarts(original: string, chunks: string[]): number[] {
  const starts: number[] = [];
  let searchFrom = 0;
  for (const chunk of chunks) {
    const idx = original.indexOf(chunk, searchFrom);
    assert(
      idx !== -1,
      `chunk not found as a substring of the original text at/after ${searchFrom}`
    );
    starts.push(idx);
    searchFrom = idx + 1;
  }
  return starts;
}

// A sentence rich in the constructs that make raw code-unit slicing unsafe
// for Sinhala: base consonant + dependent vowel sign (e.g. "ලං", "වේ"),
// and virama + ZWJ conjuncts (e.g. "ශ්‍රී", "ව්‍යාපාරය") — multi-code-unit
// grapheme clusters that a naive `.slice()` can split apart.
const SINHALA_SENTENCE =
  'ශ්‍රී ලංකාවේ අප ව්‍යාපාරය සඳුදා සිට සිකුරාදා දක්වා උදේ නවයේ සිට සවස පහ දක්වා විවෘතව පවතී. ' +
  'ඔබගේ ගිණුම් තොරතුරු සුරක්ෂිතව තබා ගනු ලැබේ. ';

// Repeated with a distinguishing "(n)" marker per repetition rather than
// verbatim — findChunkStarts locates each returned chunk by literal
// position in the source text, which is ambiguous if the source is
// perfectly periodic (a chunk's true cut point can coincide, character for
// character, with an earlier repetition).
function longSinhalaParagraph(repetitions: number): string {
  return Array.from({ length: repetitions }, (_, i) => `${SINHALA_SENTENCE}(${i + 1}) `)
    .join('')
    .trim();
}

Deno.test(
  'chunkText hard-splits a long Sinhala paragraph without breaking a grapheme cluster',
  () => {
    // One paragraph (no blank line), repeated well past CHUNK_SIZE * 1.5 so
    // the hard-split branch runs more than once.
    const longParagraph = longSinhalaParagraph(20);
    assert(longParagraph.length > 1500, 'test text must be long enough to force a hard split');

    const chunks = chunkText(longParagraph);
    assert(chunks.length > 1, 'expected the long paragraph to be split into multiple chunks');

    const boundaries = graphemeBoundaries(longParagraph);
    const starts = findChunkStarts(longParagraph, chunks);

    starts.forEach((start, i) => {
      assert(
        boundaries.has(start),
        `chunk ${i} starts at offset ${start}, inside a grapheme cluster`
      );
      const end = start + chunks[i].length;
      assert(boundaries.has(end), `chunk ${i} ends at offset ${end}, inside a grapheme cluster`);
    });
  }
);

Deno.test('chunkText preserves character overlap across a grapheme-aware hard split', () => {
  const longParagraph = longSinhalaParagraph(20);
  const chunks = chunkText(longParagraph);
  const starts = findChunkStarts(longParagraph, chunks);

  for (let i = 0; i + 1 < chunks.length; i++) {
    const end = starts[i] + chunks[i].length;
    const overlap = end - starts[i + 1];
    assert(
      overlap > 0,
      `expected chunk ${i} and ${i + 1} to overlap, got gap of ${-overlap} chars`
    );
    assert(
      overlap <= MAX_OVERLAP_WITH_GRAPHEME_ROUNDING,
      `overlap between chunk ${i} and ${i + 1} was ${overlap}, expected roughly CHUNK_OVERLAP (${CHUNK_OVERLAP})`
    );
  }
});

Deno.test(
  'chunkText packs short English paragraphs greedily and carries overlap at paragraph splits',
  () => {
    const paragraphA = 'A'.repeat(600);
    const paragraphB = 'B'.repeat(600);
    const paragraphC = 'C'.repeat(600);
    const text = [paragraphA, paragraphB, paragraphC].join('\n\n');

    const chunks = chunkText(text);

    assertEquals(chunks.length, 3);
    assertEquals(chunks[0], paragraphA);
    assert(chunks[1].endsWith(paragraphB));
    assert(chunks[1].startsWith(paragraphA.slice(-CHUNK_OVERLAP)));
    assert(chunks[2].endsWith(paragraphC));
    assert(chunks[2].startsWith(paragraphB.slice(-CHUNK_OVERLAP)));
  }
);

Deno.test('chunkText leaves a paragraph shorter than CHUNK_SIZE as a single chunk', () => {
  const chunks = chunkText('Just one short paragraph.');
  assertEquals(chunks, ['Just one short paragraph.']);
});
