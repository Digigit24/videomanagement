import {
  createMessage,
  getWorkspaceMessages,
  createMessageAttachment,
  deleteMessage,
} from "../services/chatMessage.js";
import { uploadToS3 } from "../services/upload.js";
import { MAIN_BUCKET } from "../services/storage.js";
import { notifyWorkspaceMembers, createNotification } from "../services/notification.js";
import { getWorkspaceById } from "../services/workspace.js";
import { apiError } from "../utils/logger.js";
import multer from "multer";

const messageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
}).single("attachment");

export async function sendMessage(req, res) {
  messageUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const { workspaceId } = req.params;
      const { content, replyTo, mentions } = req.body;

      if (!content && !req.file) {
        return res
          .status(400)
          .json({ error: "Content or attachment is required" });
      }

      const parsedMentions = mentions ? JSON.parse(mentions) : [];

      const message = await createMessage(
        workspaceId,
        req.user.id,
        content || "",
        replyTo || null,
        parsedMentions,
      );

      // Handle file attachment
      if (req.file) {
        const objectKey = `chat-files/${workspaceId}/${Date.now()}-${req.file.originalname}`;
        await uploadToS3(
          MAIN_BUCKET,
          objectKey,
          req.file.buffer,
          req.file.mimetype,
        );

        const attachment = await createMessageAttachment(
          message.id,
          req.file.originalname,
          objectKey,
          req.file.size,
          req.file.mimetype,
        );

        message.attachments = [
          {
            id: attachment.id,
            filename: attachment.filename,
            object_key: attachment.object_key,
            size: attachment.size,
            content_type: attachment.content_type,
            url: `/api/stream-chat-attachment/${objectKey}`,
          },
        ];
      } else {
        message.attachments = [];
      }

      // Notify workspace members about new message
      try {
        const workspace = await getWorkspaceById(workspaceId);
        if (workspace) {
          const userName = req.user.name || req.user.email;
          const truncatedContent = (content || "Sent an attachment").substring(0, 60);
          await notifyWorkspaceMembers(
            workspaceId,
            req.user.id,
            "chat_message",
            `New Message — ${workspace.client_name}`,
            `${userName}: ${truncatedContent}`,
            "workspace",
            workspaceId,
          );

          // Send separate notifications for mentioned users
          if (parsedMentions.length > 0) {
            for (const mentionedUserId of parsedMentions) {
              if (mentionedUserId !== req.user.id) {
                await createNotification(
                  mentionedUserId,
                  "mention",
                  `Mentioned — ${workspace.client_name}`,
                  `${userName} mentioned you: "${truncatedContent}"`,
                  workspaceId,
                  "workspace",
                  workspaceId,
                );
              }
            }
          }
        }
      } catch (e) {
        console.error("Notification error:", e);
      }

      res.status(201).json({ message });
    } catch (error) {
      apiError(req, error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });
}

export async function getMessages(req, res) {
  try {
    const { workspaceId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const before = req.query.before || null;

    const messages = await getWorkspaceMessages(workspaceId, limit, before);
    res.json({ messages });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to get messages" });
  }
}

export async function removeMessage(req, res) {
  try {
    const { messageId } = req.params;
    const message = await deleteMessage(messageId, req.user.id);

    if (!message) {
      return res
        .status(404)
        .json({ error: "Message not found or unauthorized" });
    }

    res.json({ message: "Message deleted successfully" });
  } catch (error) {
    apiError(req, error);
    res.status(500).json({ error: "Failed to delete message" });
  }
}
