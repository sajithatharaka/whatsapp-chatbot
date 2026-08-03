-- Enables upsert-by-source semantics in /ingest: re-ingesting the same
-- source (a URL, filename, or other stable identifier the caller chooses)
-- updates the existing document + its chunks instead of creating a
-- duplicate. Rows with a NULL source (ad hoc content with no stable
-- identifier) are exempt and can accumulate freely.
create unique index knowledge_documents_source_key
  on public.knowledge_documents (source)
  where source is not null;
