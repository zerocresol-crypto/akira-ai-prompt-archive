ALTER TABLE series ADD COLUMN publish_at TEXT;
ALTER TABLE prompts ADD COLUMN publish_at TEXT;
CREATE INDEX idx_series_publish_at ON series(status,publish_at);
CREATE INDEX idx_prompts_publish_at ON prompts(status,publish_at);
