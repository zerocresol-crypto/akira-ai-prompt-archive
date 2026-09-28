CREATE TABLE series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  concept TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT,
  day_order INTEGER NOT NULL CHECK (day_order BETWEEN 0 AND 6),
  description TEXT NOT NULL DEFAULT '',
  UNIQUE(series_id,slug), UNIQUE(series_id,day_order)
);
CREATE TABLE prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK(slot IN ('morning','evening','recap')),
  cut_number INTEGER NOT NULL CHECK(cut_number BETWEEN 1 AND 3),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  positive_prompt TEXT NOT NULL,
  negative_prompt TEXT NOT NULL DEFAULT '',
  aspect_ratio TEXT CHECK(aspect_ratio IN ('16:9','9:16')),
  image_url TEXT,
  model_name TEXT NOT NULL DEFAULT 'Anima-Base',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(day_id,slot,cut_number)
);
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('season','outfit','hair','background','time','composition','color','genre','motif'))
);
CREATE TABLE prompt_tags (
  prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (prompt_id, tag_id)
);
CREATE INDEX idx_series_status ON series(status,start_date DESC);
CREATE INDEX idx_prompts_status ON prompts(status,created_at DESC);
CREATE INDEX idx_days_series_order ON days(series_id,day_order);
CREATE INDEX idx_prompt_tags_tag ON prompt_tags(tag_id,prompt_id);
