-- AI-written, research-backed short descriptions for map hover/click previews.
--
-- Keep this separate from parks.description: that column remains the raw
-- operator/source description from metadata ingest. These generated blurbs are
-- editorial copy for UI previews and can be regenerated without losing source
-- text.

ALTER TABLE parks ADD COLUMN IF NOT EXISTS ai_description TEXT;
ALTER TABLE parks ADD COLUMN IF NOT EXISTS ai_long_description TEXT;
ALTER TABLE parks ADD COLUMN IF NOT EXISTS ai_description_sources JSONB NOT NULL DEFAULT '[]'::jsonb;
