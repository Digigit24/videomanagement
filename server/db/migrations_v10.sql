-- Migration v10: Add soft delete support for chat messages
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
