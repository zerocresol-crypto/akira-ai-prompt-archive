-- Threads API media URLs expire; restore the original text artwork for affected series.
UPDATE series
SET cover_url = NULL, updated_at = CURRENT_TIMESTAMP
WHERE cover_url LIKE 'https://%.fbcdn.net/%'
   OR cover_url LIKE 'https://%.cdninstagram.com/%';
