export type SourceType =
  | 'text'
  | 'markdown'
  | 'csv'
  | 'website'
  | 'pdf'
  | 'docx'
  | 'google_docs'
  | 'notion'
  | 'youtube_transcript';

export interface ExtractInput {
  sourceType: SourceType;
  content?: string; // text/markdown/csv: raw content
  contentBase64?: string; // pdf/docx: base64-encoded file bytes
  source?: string; // website: URL to fetch
}

export class UnsupportedSourceTypeError extends Error {
  constructor(public sourceType: string) {
    super(
      `sourceType "${sourceType}" requires an external integration (OAuth/API credentials) ` +
        "that hasn't been wired up yet — see docs/whatsapp-ai-assistant.md. " +
        'Extract the text yourself and submit it as sourceType "text" in the meantime.'
    );
  }
}

export async function extractText(input: ExtractInput): Promise<string> {
  switch (input.sourceType) {
    case 'text':
    case 'markdown':
    case 'csv':
      if (!input.content) {
        throw new Error(`"content" is required for sourceType "${input.sourceType}"`);
      }
      return input.content;
    case 'website':
      return await extractWebsite(input);
    case 'pdf':
      return await extractPdf(input);
    case 'docx':
      return await extractDocx(input);
    case 'google_docs':
    case 'notion':
    case 'youtube_transcript':
      throw new UnsupportedSourceTypeError(input.sourceType);
    default:
      throw new Error(`Unknown sourceType: ${input.sourceType}`);
  }
}

async function extractWebsite(input: ExtractInput): Promise<string> {
  if (!input.source) {
    throw new Error('"source" (a URL) is required for sourceType "website"');
  }
  const res = await fetch(input.source);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${input.source}: ${res.status}`);
  }
  const html = await res.text();

  const { parseHTML } = await import('npm:linkedom@0.18.4');
  const { document } = parseHTML(html);
  document
    .querySelectorAll('script, style, noscript, template')
    .forEach((el: { remove: () => void }) => el.remove());
  return document.body?.textContent ?? '';
}

async function extractPdf(input: ExtractInput): Promise<string> {
  if (!input.contentBase64) {
    throw new Error('"contentBase64" is required for sourceType "pdf"');
  }
  const bytes = base64ToBytes(input.contentBase64);
  // Import the lib entrypoint directly, not the package root — pdf-parse's
  // root index.js has a debug-mode branch that tries to read a bundled test
  // PDF off disk on require(), which throws under a sandboxed Edge Runtime
  // with no filesystem access to its own package directory.
  const pdfParseModule = await import('npm:pdf-parse@1.1.1/lib/pdf-parse.js');
  const pdfParse = pdfParseModule.default ?? pdfParseModule;
  const data = await pdfParse(bytes);
  return data.text;
}

async function extractDocx(input: ExtractInput): Promise<string> {
  if (!input.contentBase64) {
    throw new Error('"contentBase64" is required for sourceType "docx"');
  }
  const bytes = base64ToBytes(input.contentBase64);
  const mammoth = await import('npm:mammoth@1.8.0');
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
