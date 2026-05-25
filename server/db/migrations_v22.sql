-- v22: Add posted_at column to instagram_posts for tracking actual post date
ALTER TABLE instagram_posts ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP WITH TIME ZONE;
