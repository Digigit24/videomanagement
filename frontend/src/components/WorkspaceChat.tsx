import { useRef, useState, useEffect } from "react";
import { ChatMessage, WorkspaceMember } from "@/types";
import { chatService, workspaceService } from "@/services/api.service";
import { Button } from "./ui/button";
import {
  MessageCircle,
  Send,
  Trash2,
  Reply,
  X,
  Paperclip,
  Image,
  FileVideo,
  File,
  AtSign,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface WorkspaceChatProps {
  workspaceId: string;
}

export default function WorkspaceChat({ workspaceId }: WorkspaceChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const currentUserId = localStorage.getItem("userId");

  useEffect(() => {
    loadMessages();
    loadMembers();
    const interval = setInterval(loadMessages, 15000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  useEffect(() => {
    if (listRef.current && !loading) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, loading]);

  const loadMessages = async () => {
    try {
      const data = await chatService.getMessages(workspaceId);
      setMessages(data);
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    try {
      const data = await workspaceService.getMembers(workspaceId);
      setMembers(data);
    } catch (error) {
      console.error("Failed to load members:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !attachment) return;

    setSubmitting(true);
    try {
      const message = await chatService.sendMessage(
        workspaceId,
        newMessage,
        replyTo?.id,
        selectedMentions,
        attachment || undefined,
      );

      setMessages((prev) => [...prev, message]);
      setNewMessage("");
      setReplyTo(null);
      setAttachment(null);
      setSelectedMentions([]);
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      await chatService.deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (error) {
      console.error("Failed to delete message:", error);
    }
  };

  const handleReply = (message: ChatMessage) => {
    setReplyTo(message);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewMessage(value);

    // Check for @ mention trigger
    const lastAtIndex = value.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const afterAt = value.slice(lastAtIndex + 1);
      if (!afterAt.includes(" ") && afterAt.length < 30) {
        setMentionSearch(afterAt.toLowerCase());
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const handleMentionSelect = (member: WorkspaceMember) => {
    const lastAtIndex = newMessage.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const before = newMessage.slice(0, lastAtIndex);
      setNewMessage(`${before}@${member.name} `);
      if (!selectedMentions.includes(member.id)) {
        setSelectedMentions((prev) => [...prev, member.id]);
      }
    }
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const filteredMembers = members.filter(
    (m) =>
      m.id !== currentUserId &&
      (m.name.toLowerCase().includes(mentionSearch) ||
        m.email.toLowerCase().includes(mentionSearch)),
  );

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const isImageFile = (contentType: string) =>
    contentType?.startsWith("image/");
  const isVideoFile = (contentType: string) =>
    contentType?.startsWith("video/");

  const getAttachmentUrl = (url: string) => {
    const token = localStorage.getItem("token");
    const baseUrl = url.startsWith('http') ? url : `https://video.celiyo.com${url}`;
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}token=${token}`;
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl overflow-hidden border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            Chat{" "}
            <span className="text-gray-400 font-normal">
              ({messages.length})
            </span>
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span>{members.length} members</span>
        </div>
      </div>

      {/* Messages List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
        style={{ minHeight: "300px", maxHeight: "500px" }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <MessageCircle className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">
              No messages yet
            </p>
            <p className="text-xs text-gray-500 max-w-[200px] mx-auto mt-1">
              Start a conversation with your team!
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`group flex items-start gap-3 ${message.user_id === currentUserId ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 shadow-sm ${
                  message.user_id === currentUserId
                    ? "bg-blue-600"
                    : "bg-gray-400"
                }`}
              >
                {getInitials(message.user_name)}
              </div>

              <div
                className={`flex flex-col max-w-[85%] ${message.user_id === currentUserId ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold text-gray-900">
                    {message.user_id === currentUserId
                      ? "Me"
                      : message.user_name}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {formatDistanceToNow(new Date(message.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>

                <div
                  className={`relative px-3 py-2 rounded-2xl text-sm ${
                    message.user_id === currentUserId
                      ? "bg-blue-600 text-white rounded-tr-none shadow-blue-100 shadow-lg"
                      : "bg-gray-100 text-gray-800 rounded-tl-none"
                  }`}
                >
                  {/* Reply reference */}
                  {message.reply_to && (
                    <div
                      className={`text-[10px] mb-1.5 pb-1.5 border-b ${
                        message.user_id === currentUserId
                          ? "border-blue-400 text-blue-100"
                          : "border-gray-200 text-gray-500"
                      }`}
                    >
                      <Reply className="h-2.5 w-2.5 inline mr-1" />
                      Replying to{" "}
                      <span className="font-bold">
                        {message.reply_user_name}
                      </span>
                      {message.reply_content && (
                        <p className="truncate mt-0.5 opacity-75">
                          {message.reply_content}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Message content with mention highlighting */}
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {message.content.split(/(@\w[\w\s]*)/g).map((part, i) =>
                      part.startsWith("@") ? (
                        <span
                          key={i}
                          className={`font-bold ${message.user_id === currentUserId ? "text-blue-200" : "text-blue-600"}`}
                        >
                          {part}
                        </span>
                      ) : (
                        <span key={i}>{part}</span>
                      ),
                    )}
                  </p>

                  {/* Attachments */}
                  {message.attachments &&
                    message.attachments.length > 0 &&
                    message.attachments.map((att) => (
                      <div key={att.id} className="mt-2">
                        {isImageFile(att.content_type) ? (
                          <a
                            href={getAttachmentUrl(att.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={getAttachmentUrl(att.url)}
                              alt={att.filename}
                              className="max-w-[240px] max-h-[180px] rounded-lg object-cover border border-white/20"
                            />
                          </a>
                        ) : isVideoFile(att.content_type) ? (
                          <video
                            src={getAttachmentUrl(att.url)}
                            controls
                            className="max-w-[280px] max-h-[200px] rounded-lg"
                          />
                        ) : (
                          <a
                            href={getAttachmentUrl(att.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all border ${
                              message.user_id === currentUserId
                                ? "bg-blue-700/50 hover:bg-blue-700 text-blue-50 border-blue-400"
                                : "bg-white hover:bg-blue-50 text-blue-600 border-blue-100"
                            }`}
                          >
                            <File className="h-4 w-4" />
                            <span className="text-[11px] font-medium truncate max-w-[120px]">
                              {att.filename}
                            </span>
                          </a>
                        )}
                      </div>
                    ))}
                </div>

                {/* Actions */}
                <div
                  className={`mt-1 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                    message.user_id === currentUserId ? "flex-row-reverse" : ""
                  }`}
                >
                  <button
                    onClick={() => handleReply(message)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                  >
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                  {message.user_id === currentUserId && (
                    <button
                      onClick={() => handleDelete(message.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-100">
        <form onSubmit={handleSubmit} className="space-y-3">
          {replyTo && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-1 h-6 bg-blue-400 rounded-full" />
                <div className="min-w-0 text-xs">
                  <span className="font-bold text-blue-600 block">
                    Reply to {replyTo.user_name}
                  </span>
                  <p className="text-gray-500 truncate">{replyTo.content}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-blue-400 hover:text-blue-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {attachment && (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl">
              {attachment.type.startsWith("image/") ? (
                <Image className="h-4 w-4 text-indigo-500" />
              ) : attachment.type.startsWith("video/") ? (
                <FileVideo className="h-4 w-4 text-indigo-500" />
              ) : (
                <File className="h-4 w-4 text-indigo-500" />
              )}
              <span className="text-xs text-indigo-700 truncate flex-1 font-medium">
                {attachment.name}
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="text-indigo-400 hover:text-indigo-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Mention dropdown */}
          {showMentions && filteredMembers.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-lg max-h-40 overflow-y-auto">
              {filteredMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => handleMentionSelect(member)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-white text-[9px] font-bold">
                    {getInitials(member.name)}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-900">
                      {member.name}
                    </p>
                    <p className="text-[10px] text-gray-400">{member.role}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={handleInputChange}
              placeholder="Type a message... Use @ to mention"
              disabled={submitting}
              className="flex-1 min-h-[40px] max-h-32 py-2 px-2 text-sm bg-transparent outline-none resize-none placeholder:text-gray-400 scrollbar-hide"
              rows={1}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
            />

            <div className="flex items-center gap-1 mb-0.5">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,video/*,.pdf,.doc,.docx,.zip"
                onChange={(e) =>
                  e.target.files?.[0] && setAttachment(e.target.files[0])
                }
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all"
                title="Attach file (images, videos, documents)"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewMessage((prev) => prev + "@");
                  setShowMentions(true);
                  setMentionSearch("");
                  inputRef.current?.focus();
                }}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all"
                title="Mention someone"
              >
                <AtSign className="h-4 w-4" />
              </button>
              <Button
                type="submit"
                disabled={submitting || (!newMessage.trim() && !attachment)}
                className="h-9 w-9 rounded-xl shadow-lg shadow-blue-200 p-0"
              >
                <Send className="h-4 w-4 translate-x-0.5 -translate-y-0.5" />
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 px-2">
            Tip: Press <kbd className="font-sans font-bold">Enter</kbd> to
            send, <kbd className="font-sans font-bold">@</kbd> to mention
          </p>
        </form>
      </div>
    </div>
  );
}
