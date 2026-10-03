CREATE TABLE slot_threads (
  day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK(slot IN ('morning','evening','recap')),
  threads_url TEXT NOT NULL,
  PRIMARY KEY (day_id, slot)
);
