import { describe, it, expect } from 'vitest';

import { mapFormToIngestPayload } from '../../../src/lib/knowledge/mapFormToIngestPayload';
import type { KnowledgeFormValues } from '../../../src/lib/knowledge/types';

function buildForm(overrides: Partial<KnowledgeFormValues>): KnowledgeFormValues {
  return {
    documentId: undefined,
    title: 'FAQ',
    sourceType: 'text',
    source: '',
    content: '',
    contentBase64: '',
    ...overrides,
  };
}

describe('mapFormToIngestPayload', () => {
  it.each([
    ['text', 'Plain text content'],
    ['markdown', '# Markdown content'],
    ['csv', 'a,b,c\n1,2,3'],
  ] as const)('includes only `content` for sourceType %s', (sourceType, content) => {
    const payload = mapFormToIngestPayload(buildForm({ sourceType, content }));

    expect(payload).toEqual({
      sourceType,
      title: 'FAQ',
      content,
    });
  });

  it('includes only `source` for sourceType website', () => {
    const payload = mapFormToIngestPayload(
      buildForm({ sourceType: 'website', source: 'https://example.com/faq' })
    );

    expect(payload).toEqual({
      sourceType: 'website',
      title: 'FAQ',
      source: 'https://example.com/faq',
    });
  });

  it.each(['pdf', 'docx'] as const)(
    'includes only `contentBase64` for sourceType %s',
    (sourceType) => {
      const payload = mapFormToIngestPayload(
        buildForm({ sourceType, contentBase64: 'base64data' })
      );

      expect(payload).toEqual({
        sourceType,
        title: 'FAQ',
        contentBase64: 'base64data',
      });
    }
  );

  it('includes documentId when updating an existing document', () => {
    const payload = mapFormToIngestPayload(
      buildForm({ documentId: 'doc_123', sourceType: 'text', content: 'updated' })
    );

    expect(payload).toMatchObject({ documentId: 'doc_123' });
  });

  it('omits title when blank', () => {
    const payload = mapFormToIngestPayload(
      buildForm({ title: '', sourceType: 'text', content: 'x' })
    );

    expect(payload).not.toHaveProperty('title');
  });
});
