import { getPool } from "../db/index.js";

export async function createMessage(
  workspaceId,
  userId,
  content,
  replyTo = null,
  mentions = [],
) {
  try {
    const result = await getPool().query(
      `INSERT INTO chat_messages (workspace_id, user_id, content, reply_to, mentions)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [workspaceId, userId, content, replyTo, mentions],
    );

    // Fetch with user info and reply info
    const message = await getPool().query(
      `SELECT m.*, u.name as user_name, u.email as user_email, u.avatar_url as user_avatar,
              rm.content as reply_content, rm.user_id as reply_user_id,
              ru.name as reply_user_name
       FROM chat_messages m
       LEFT JOIN users u ON m.user_id = u.id
       LEFT JOIN chat_messages rm ON m.reply_to = rm.id
       LEFT JOIN users ru ON rm.user_id = ru.id
       WHERE m.id = $1`,
      [result.rows[0].id],
    );

    return message.rows[0];
  } catch (error) {
    console.error("Error creating message:", error);
    throw error;
  }
}

export async function getWorkspaceMessages(workspaceId, limit = 100, before = null) {
  try {
    let query = `SELECT m.*, u.name as user_name, u.email as user_email, u.avatar_url as user_avatar,
            rm.content as reply_content, rm.user_id as reply_user_id,
            ru.name as reply_user_name
     FROM chat_messages m
     LEFT JOIN users u ON m.user_id = u.id
     LEFT JOIN chat_messages rm ON m.reply_to = rm.id
     LEFT JOIN users ru ON rm.user_id = ru.id
     WHERE m.workspace_id = $1`;

    const params = [workspaceId];

    if (before) {
      query += ` AND m.created_at < $${params.length + 1}`;
      params.push(before);
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await getPool().query(query, params);

    // Fetch attachments for messages
    const messages = result.rows;
    if (messages.length > 0) {
      const messageIds = messages.map((m) => m.id);
      const attachments = await getPool().query(
        `SELECT * FROM chat_message_attachments WHERE message_id = ANY($1)`,
        [messageIds],
      );

      const attachmentMap = {};
      attachments.rows.forEach((att) => {
        if (!attachmentMap[att.message_id]) {
          attachmentMap[att.message_id] = [];
        }
        attachmentMap[att.message_id].push({
          id: att.id,
          filename: att.filename,
          object_key: att.object_key,
          size: att.size,
          content_type: att.content_type,
          url: `/api/stream-chat-attachment/${att.object_key}`,
        });
      });

      messages.forEach((m) => {
        m.attachments = attachmentMap[m.id] || [];
      });
    }

    // Return in chronological order
    return messages.reverse();
  } catch (error) {
    console.error("Error getting workspace messages:", error);
    throw error;
  }
}

export async function createMessageAttachment(
  messageId,
  filename,
  objectKey,
  size,
  contentType,
) {
  try {
    const result = await getPool().query(
      `INSERT INTO chat_message_attachments (message_id, filename, object_key, size, content_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [messageId, filename, objectKey, size, contentType],
    );
    return result.rows[0];
  } catch (error) {
    console.error("Error creating message attachment:", error);
    throw error;
  }
}

export async function deleteMessage(messageId, userId) {
  try {
    const result = await getPool().query(
      "DELETE FROM chat_messages WHERE id = $1 AND user_id = $2 RETURNING *",
      [messageId, userId],
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error("Error deleting message:", error);
    throw error;
  }
}
