-- Persist operator rules, CAMIS attribute dictionaries, and per-site source
-- details. The UI uses normalized rule_summary, while source_detail keeps the
-- original operator payload available for future parsers and audits.

ALTER TABLE sites ADD COLUMN IF NOT EXISTS min_party_size INTEGER;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS max_stay_nights INTEGER;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS defined_attributes JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS allowed_equipment JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS rule_summary JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS source_detail JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS source_detail_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sites_rule_summary_gin_idx
  ON sites USING gin (rule_summary);

CREATE INDEX IF NOT EXISTS sites_defined_attributes_gin_idx
  ON sites USING gin (defined_attributes);

CREATE TABLE IF NOT EXISTS operator_attribute_definitions (
  operator_id             TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  attribute_definition_id INTEGER NOT NULL,
  display_name            TEXT NOT NULL,
  order_index             INTEGER NOT NULL DEFAULT 9999,
  attribute_type          INTEGER NOT NULL DEFAULT 0,
  is_filterable           BOOLEAN NOT NULL DEFAULT FALSE,
  is_disabled             BOOLEAN NOT NULL DEFAULT FALSE,
  is_multi_select         BOOLEAN NOT NULL DEFAULT FALSE,
  min_value               NUMERIC,
  max_value               NUMERIC,
  values                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_raw              JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, attribute_definition_id)
);

CREATE INDEX IF NOT EXISTS operator_attribute_definitions_name_idx
  ON operator_attribute_definitions(operator_id, display_name);

CREATE TABLE IF NOT EXISTS operator_rule_sources (
  operator_id   TEXT PRIMARY KEY REFERENCES operators(id) ON DELETE CASCADE,
  source_label  TEXT NOT NULL,
  source_url    TEXT NOT NULL,
  alerts_url    TEXT,
  rules         JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE operator_attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_rule_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON operator_attribute_definitions;
CREATE POLICY "public read" ON operator_attribute_definitions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public read" ON operator_rule_sources;
CREATE POLICY "public read" ON operator_rule_sources
  FOR SELECT USING (true);

GRANT SELECT ON operator_attribute_definitions TO anon, authenticated;
GRANT SELECT ON operator_rule_sources TO anon, authenticated;
