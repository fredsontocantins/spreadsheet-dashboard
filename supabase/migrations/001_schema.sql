-- ============================================================
-- Schema: pdf_snapshots
-- Purpose: Store PDF snapshot metadata and track processing
-- ============================================================

-- Tabela principal de snapshots
CREATE TABLE IF NOT EXISTS pdf_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_name TEXT NOT NULL,
  pdf_hash TEXT NOT NULL,
  scale INTEGER NOT NULL DEFAULT 2,
  page_number INTEGER NOT NULL,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_pdf_page_scale UNIQUE (pdf_hash, scale, page_number)
);

-- Índice para buscar snapshots de um PDF rapidamente
CREATE INDEX IF NOT EXISTS idx_snapshots_hash ON pdf_snapshots(pdf_hash);
-- Índice para filtrar por status (dashboard)
CREATE INDEX IF NOT EXISTS idx_snapshots_status ON pdf_snapshots(status);
-- Índice para ordenação cronológica
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON pdf_snapshots(created_at DESC);

-- Auto-update da coluna updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_pdf_snapshots_updated_at ON pdf_snapshots;
CREATE TRIGGER set_pdf_snapshots_updated_at
  BEFORE UPDATE ON pdf_snapshots FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Funções utilitárias
-- ============================================================

-- Verifica se todas as páginas de um PDF estão prontas
CREATE OR REPLACE FUNCTION pdf_all_done(p_hash TEXT, p_scale INTEGER)
RETURNS BOOLEAN AS $$
  SELECT BOOL_AND(status = 'done')
  FROM pdf_snapshots
  WHERE pdf_hash = p_hash AND scale = p_scale;
$$ LANGUAGE sql STABLE;

-- Busca resumo de snapshots por PDF
CREATE OR REPLACE FUNCTION pdf_snapshot_summary(p_hash TEXT)
RETURNS TABLE(
  total_pages BIGINT,
  done_count BIGINT,
  pending_count BIGINT,
  error_count BIGINT,
  all_done BOOLEAN
) AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE status = 'done')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'error')::BIGINT,
    COUNT(*) FILTER (WHERE status = 'done') = COUNT(*)::BIGINT
  FROM pdf_snapshots
  WHERE pdf_hash = p_hash;
$$ LANGUAGE sql STABLE;
