-- Migration v7: Change default video status to "Draft"
-- Also update any existing "Pending" videos to "Draft" if desired

ALTER TABLE videos ALTER COLUMN status SET DEFAULT 'Draft';

-- Optionally convert existing Pending videos to Draft
-- UPDATE videos SET status = 'Draft' WHERE status = 'Pending';
