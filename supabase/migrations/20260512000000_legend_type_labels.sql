CREATE TABLE IF NOT EXISTS legend_type_labels (
  operator_id TEXT NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  legend_item_type INTEGER NOT NULL,
  localization_key TEXT NOT NULL,
  label TEXT NOT NULL,
  PRIMARY KEY (operator_id, legend_item_type)
);

ALTER TABLE legend_type_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON legend_type_labels FOR SELECT USING (true);
