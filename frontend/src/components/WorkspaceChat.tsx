import { useRef, useState, useEffect, useCallback } from "react";
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
  Play,
  FileText,
  Upload,
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
  const [mentionCursorIndex, setMentionCursorIndex] = useState(-1);
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [videoDialog, setVideoDialog] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

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

  // Reset mention cursor when filtered list changes
  useEffect(() => {
    setMentionCursorIndex(0);
  }, [mentionSearch]);

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
    if (showMentions) return; // Don't submit while mention picker is open
    if (!newMessage.trim() && !attachment) return;

    setSubmitting(true);
    setUploadProgress(0);
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
      setUploadProgress(0);

      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
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

  // Get the current word being typed at cursor position
  const getMentionContext = useCallback(
    (value: string, cursorPos: number) => {
      // Walk backwards from cursor to find the @ trigger
      const textBeforeCursor = value.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex === -1) return null;

      // Make sure the @ is at start of a word (preceded by space, newline, or start of string)
      if (lastAtIndex > 0) {
        const charBefore = textBeforeCursor[lastAtIndex - 1];
        if (charBefore !== " " && charBefore !== "\n") return null;
      }

      const searchText = textBeforeCursor.slice(lastAtIndex + 1);

      // Don't trigger if there's a space in the search (mention is "complete")
      // But allow spaces in names for multi-word search
      if (searchText.length > 40) return null;

      return { atIndex: lastAtIndex, searchText };
    },
    [],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setNewMessage(value);

    const mentionCtx = getMentionContext(value, cursorPos);
    if (mentionCtx) {
      setMentionSearch(mentionCtx.searchText.toLowerCase());
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const handleMentionSelect = (member: WorkspaceMember) => {
    const cursorPos = inputRef.current?.selectionStart || newMessage.length;
    const mentionCtx = getMentionContext(newMessage, cursorPos);

    if (mentionCtx) {
      const before = newMessage.slice(0, mentionCtx.atIndex);
      const after = newMessage.slice(cursorPos);
      const newValue = `${before}@${member.name} ${after}`;
      setNewMessage(newValue);

      if (!selectedMentions.includes(member.id)) {
        setSelectedMentions((prev) => [...prev, member.id]);
      }

      // Set cursor after the inserted mention
      const newCursorPos = mentionCtx.atIndex + member.name.length + 2;
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = newCursorPos;
          inputRef.current.selectionEnd = newCursorPos;
        }
      }, 0);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredMembers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionCursorIndex((prev) =>
          prev < filteredMembers.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionCursorIndex((prev) =>
          prev > 0 ? prev - 1 : filteredMembers.length - 1,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const idx = Math.min(mentionCursorIndex, filteredMembers.length - 1);
        if (idx >= 0) {
          handleMentionSelect(filteredMembers[idx]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

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
  const isDocFile = (contentType: string) => {
    if (!contentType) return false;
    return (
      contentType.includes("pdf") ||
      contentType.includes("word") ||
      contentType.includes("document") ||
      contentType.includes("text/") ||
      contentType.includes("spreadsheet") ||
      contentType.includes("excel") ||
      contentType.includes("presentation") ||
      contentType.includes("powerpoint") ||
      contentType.includes("csv") ||
      contentType.includes("rtf")
    );
  };

  const getFileIcon = (contentType: string) => {
    if (isImageFile(contentType)) return Image;
    if (isVideoFile(contentType)) return FileVideo;
    if (isDocFile(contentType)) return FileText;
    return File;
  };

  const getAttachmentUrl = (url: string) => {
    const token = localStorage.getItem("token");
    const baseUrl = url.startsWith("http")
      ? url
      : `https://video.celiyo.com${url}`;
    return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}token=${token}`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachment(file);
    }
    // Reset so same file can be selected again
    e.target.value = "";
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const getFileTypeLabel = (type: string) => {
    if (!type) return "File";
    if (type.startsWith("image/")) return "Photo";
    if (type.startsWith("video/")) return "Video";
    if (type.startsWith("audio/")) return "Audio";
    if (type.includes("pdf")) return "PDF";
    if (type.includes("word") || type.includes("document")) return "Word";
    if (type.includes("excel") || type.includes("spreadsheet")) return "Excel";
    if (type.includes("powerpoint") || type.includes("presentation"))
      return "PowerPoint";
    if (type.includes("text/")) return "Text";
    if (type.includes("zip") || type.includes("rar") || type.includes("7z"))
      return "Archive";
    return "File";
  };

  return (
    <>
      <div
        className="flex flex-col bg-white rounded-xl overflow-hidden border border-gray-200"
        style={{ height: "calc(100vh - 220px)", minHeight: "500px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
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
          className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth"
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
                className={`group flex items-start gap-2.5 ${message.user_id === currentUserId ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${
                    message.user_id === currentUserId
                      ? "bg-blue-600"
                      : "bg-gray-400"
                  }`}
                >
                  {getInitials(message.user_name)}
                </div>

                <div
                  className={`flex flex-col max-w-[80%] ${message.user_id === currentUserId ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
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
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-gray-100 text-gray-800 rounded-tl-sm"
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

                    {/* Message content */}
                    {message.content && (
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {message.content
                          .split(/(@\w[\w\s]*)/g)
                          .map((part, i) =>
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
                    )}

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
                                className="max-w-[260px] max-h-[200px] rounded-lg object-cover border border-white/20 cursor-pointer hover:opacity-90 transition-opacity"
                              />
                            </a>
                          ) : isVideoFile(att.content_type) ? (
                            <div
                              className="relative cursor-pointer group/video max-w-[260px] rounded-lg overflow-hidden"
                              onClick={() =>
                                setVideoDialog({
                                  url: getAttachmentUrl(att.url),
                                  filename: att.filename,
                                })
                              }
                            >
                              {/* Video thumbnail */}
                              <div className="bg-gray-900 aspect-video flex items-center justify-center">
                                <div className="flex flex-col items-center gap-2">
                                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover/video:bg-white/40 transition-all group-hover/video:scale-110">
                                    <Play className="h-6 w-6 text-white ml-0.5" />
                                  </div>
                                  <span className="text-white/70 text-[10px] font-medium truncate max-w-[200px] px-2">
                                    {att.filename}
                                  </span>
                                </div>
                              </div>
                              <div
                                className={`absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] font-medium flex items-center gap-1 ${
                                  message.user_id === currentUserId
                                    ? "bg-blue-700/80 text-blue-100"
                                    : "bg-gray-800/80 text-gray-200"
                                }`}
                              >
                                <FileVideo className="h-3 w-3" />
                                <span>Tap to play</span>
                                {att.size > 0 && (
                                  <span className="ml-auto opacity-70">
                                    {formatFileSize(att.size)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <a
                              href={getAttachmentUrl(att.url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all border ${
                                message.user_id === currentUserId
                                  ? "bg-blue-700/50 hover:bg-blue-700 text-blue-50 border-blue-400/30"
                                  : "bg-white hover:bg-blue-50 text-gray-700 border-gray-200"
                              }`}
                            >
                              {(() => {
                                const IconComp = getFileIcon(att.content_type);
                                return <IconComp className="h-5 w-5 flex-shrink-0" />;
                              })()}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium truncate">
                                  {att.filename}
                                </p>
                                <p
                                  className={`text-[10px] ${
                                    message.user_id === currentUserId
                                      ? "text-blue-200"
                                      : "text-gray-400"
                                  }`}
                                >
                                  {getFileTypeLabel(att.content_type)}
                                  {att.size > 0 &&
                                    ` · ${formatFileSize(att.size)}`}
                                </p>
                              </div>
                            </a>
                          )}
                        </div>
                      ))}
                  </div>

                  {/* Actions */}
                  <div
                    className={`mt-0.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                      message.user_id === currentUserId
                        ? "flex-row-reverse"
                        : ""
                    }`}
                  >
                    <button
                      onClick={() => handleReply(message)}
                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                    >
                      <Reply className="h-3 w-3" />
                    </button>
                    {message.user_id === currentUserId && (
                      <button
                        onClick={() => handleDelete(message.id)}
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input Area */}
        <div className="p-3 bg-white border-t border-gray-100 flex-shrink-0">
          <form onSubmit={handleSubmit} className="space-y-2">
            {replyTo && (
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1 h-5 bg-blue-400 rounded-full" />
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
                  className="text-blue-400 hover:text-blue-600 p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {attachment && (
              <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl">
                {(() => {
                  const IconComp = getFileIcon(attachment.type);
                  return <IconComp className="h-4 w-4 text-indigo-500 flex-shrink-0" />;
                })()}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-indigo-700 truncate font-medium">
                    {attachment.name}
                  </p>
                  <p className="text-[10px] text-indigo-400">
                    {getFileTypeLabel(attachment.type)} ·{" "}
                    {formatFileSize(attachment.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="text-indigo-400 hover:text-indigo-600 p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Upload progress */}
            {submitting && attachment && (
              <div className="px-3">
                <div className="flex items-center gap-2 text-xs text-blue-600">
                  <Upload className="h-3 w-3 animate-pulse" />
                  <span>Uploading {getFileTypeLabel(attachment.type)}...</span>
                </div>
                <div className="mt-1 w-full bg-blue-100 rounded-full h-1">
                  <div
                    className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress || 10}%` }}
                  />
                </div>
              </div>
            )}

            {/* Mention dropdown — positioned above input */}
            {showMentions && filteredMembers.length > 0 && (
              <div
                ref={mentionListRef}
                className="bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto"
              >
                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <AtSign className="h-3 w-3 inline mr-1" />
                  Mention a member
                </div>
                {filteredMembers.map((member, idx) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => handleMentionSelect(member)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                      idx === mentionCursorIndex
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                      {getInitials(member.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900 truncate">
                        {member.name}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {member.email} · {member.role}
                      </p>
                    </div>
                    {idx === mentionCursorIndex && (
                      <span className="text-[9px] text-blue-400 font-medium px-1.5 py-0.5 bg-blue-100 rounded whitespace-nowrap">
                        Enter ↵
                      </span>
                    )}
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
                className="flex-1 min-h-[36px] max-h-24 py-1.5 px-2 text-sm bg-transparent outline-none resize-none placeholder:text-gray-400 scrollbar-hide"
                rows={1}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${target.scrollHeight}px`;
                }}
                onKeyDown={handleKeyDown}
              />

              <div className="flex items-center gap-0.5 mb-0.5">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
                  title="Attach file (photos, videos, documents, any file)"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const cursorPos =
                      inputRef.current?.selectionStart || newMessage.length;
                    const before = newMessage.slice(0, cursorPos);
                    const after = newMessage.slice(cursorPos);
                    const needsSpace =
                      before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n");
                    const newVal = before + (needsSpace ? " @" : "@") + after;
                    setNewMessage(newVal);
                    setShowMentions(true);
                    setMentionSearch("");
                    inputRef.current?.focus();
                    // Set cursor after @
                    const newCursorPos =
                      cursorPos + (needsSpace ? 2 : 1);
                    setTimeout(() => {
                      if (inputRef.current) {
                        inputRef.current.selectionStart = newCursorPos;
                        inputRef.current.selectionEnd = newCursorPos;
                      }
                    }, 0);
                  }}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
                  title="Mention someone"
                >
                  <AtSign className="h-4 w-4" />
                </button>
                <Button
                  type="submit"
                  disabled={submitting || (!newMessage.trim() && !attachment)}
                  className="h-8 w-8 rounded-xl shadow-lg shadow-blue-200 p-0"
                >
                  <Send className="h-3.5 w-3.5 translate-x-0.5 -translate-y-0.5" />
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Video Player Dialog */}
      {videoDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setVideoDialog(null)}
          />
          <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl max-w-3xl w-full mx-4">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
              <div className="flex items-center gap-2">
                <FileVideo className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium text-white truncate">
                  {videoDialog.filename}
                </span>
              </div>
              <button
                onClick={() => setVideoDialog(null)}
                className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <video
              src={videoDialog.url}
              controls
              autoPlay
              className="w-full max-h-[70vh]"
            />
          </div>
        </div>
      )}
    </>
  );
}
