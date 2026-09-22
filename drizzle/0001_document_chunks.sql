ALTER TABLE docutrust_document_chunks
  ADD COLUMN IF NOT EXISTS char_start integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS char_end integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS page_start integer,
  ADD COLUMN IF NOT EXISTS page_end integer,
  ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS docutrust_chunks_search_idx
  ON docutrust_document_chunks USING gin (search_vector);

CREATE INDEX IF NOT EXISTS docutrust_documents_tenant_status_idx
  ON docutrust_documents (tenant_id, status);
