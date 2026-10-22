-- Speed at a real school's size (gap list G37). The attendance lock runs every
-- 15 minutes and looks for marks not yet locked: without this index it read every
-- mark of the school each time (about 1 second at 900,000 marks). A partial index,
-- so it holds only the few marks still open. Index only: no data changes.
CREATE INDEX IF NOT EXISTS "attendance_mark_not_locked" ON "attendance_mark" ("school_id", "date") WHERE "locked" = false;
