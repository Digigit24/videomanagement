import { useRef, useState, useEffect, useCallback } from "react";
import { ChatMessage, WorkspaceMember } from "@/types";
import { chatService, workspaceService } from "@/services/api.service";
import { Button } from "./ui/button";
import {
  MessageCircle,
  Send,
  Reply,
  X,
  Paperclip,
  Image,
  FileVideo,
  File,
  FileText,
  MoreVertical,
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
      alert(
        "Failed to send message. Please checking file size (max 5GB) and network connection.",
      );
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
      <div className="flex flex-col w-full h-[calc(100vh-80px)] lg:h-[calc(100vh-90px)] bg-[#f3f4f6] dark:bg-gray-950 rounded-xl overflow-hidden shadow-sm border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <MessageCircle className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 leading-none mb-1">
                Workspace Chat
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                {members.length} members
              </p>
            </div>
          </div>
          <button className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>

        {/* Messages List - Background pattern for WhatsApp feel */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-4 scroll-smooth bg-[#efeae2]/40 relative"
          style={{
             backgroundImage: "url('https://site-assets.fontawesome.com/releases/v6.4.2/svgs/solid/message-lines.svg')",
             backgroundSize: "400px",
             backgroundRepeat: "repeat",
             backgroundBlendMode: "soft-light",
             backgroundPosition: "center"
          }}
        >
          {/* Overlay to fade the pattern */}
          <div className="absolute inset-0 bg-gray-50/95" style={{ pointerEvents: 'none' }} />
          
          <div className="relative z-0 space-y-4 pb-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                  <MessageCircle className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-900">
                  No messages yet
                </p>
                <p className="text-xs text-gray-500 max-w-[200px] mx-auto mt-1">
                  Start the conversation!
                </p>
              </div>
            ) : (
              messages.map((message) => {
                const isMe = message.user_id === currentUserId;
                return (
                  <div
                    key={message.id}
                    className={`group flex items-end gap-2 ${isMe ? "flex-row-reverse" : ""}`}
                  >
                    {!isMe && (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 shadow-sm mb-1">
                        {getInitials(message.user_name)}
                      </div>
                    )}

                    <div
                      className={`flex flex-col max-w-[85%] sm:max-w-[70%] ${isMe ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`relative px-3 py-2 sm:px-4 sm:py-2.5 shadow-sm text-sm ${
                          isMe
                            ? "bg-blue-600 text-white rounded-2xl rounded-tr-none"
                            : "bg-white text-gray-800 rounded-2xl rounded-tl-none border border-gray-100"
                        }`}
                      >
                        {/* Sender Name in Group Chat (only for others) */}
                        {!isMe && (
                          <div className="text-[10px] font-bold text-blue-600 mb-1 leading-none">
                            {message.user_name}
                          </div>
                        )}

                        {/* Reply reference */}
                        {message.reply_to && (
                          <div
                            className={`text-[10px] mb-2 p-1.5 rounded bg-black/5 border-l-2 ${
                              isMe ? "border-white/50 text-white/90" : "border-blue-500 text-gray-600"
                            }`}
                          >
                            <div className="font-bold flex items-center gap-1">
                              <Reply className="h-2.5 w-2.5" />
                              {message.reply_user_name}
                            </div>
                            {message.reply_content && (
                              <p className="truncate mt-0.5 opacity-80 line-clamp-1">
                                {message.reply_content}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Message content */}
                        {message.content && (
                          <p className={`whitespace-pre-wrap leading-relaxed break-words ${isMe ? "text-white" : "text-gray-800"}`}>
                            {message.content
                              .split(/(@\w[\w\s]*)/g)
                              .map((part, i) =>
                                part.startsWith("@") ? (
                                  <span
                                    key={i}
                                    className={`font-bold ${isMe ? "text-blue-100" : "text-blue-600"}`}
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
                            <div key={att.id} className="mt-2 text-left">
                              {isImageFile(att.content_type) ? (
                                <a
                                  href={getAttachmentUrl(att.url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block"
                                >
                                  <img
                                    src={getAttachmentUrl(att.url)}
                                    alt={att.filename}
                                    className="max-w-full sm:max-w-[280px] rounded-lg object-cover border border-white/10"
                                    style={{ maxHeight: '200px' }}
                                  />
                                </a>
                              ) : isVideoFile(att.content_type) ? (
                                <div className="relative max-w-full sm:max-w-[280px] rounded-lg overflow-hidden bg-black aspect-video border border-white/10">
                                  <video
                                    src={getAttachmentUrl(att.url)}
                                    controls
                                    preload="metadata"
                                    playsInline
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                              ) : (
                                <a
                                  href={getAttachmentUrl(att.url)}
                                  download={att.filename}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all border mt-1 ${
                                    isMe
                                      ? "bg-white/10 hover:bg-white/20 text-white border-white/20"
                                      : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"
                                  }`}
                                >
                                  {(() => {
                                    const IconComp = getFileIcon(att.content_type);
                                    return <IconComp className="h-5 w-5 flex-shrink-0" />;
                                  })()}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold truncate leading-tight">
                                      {att.filename}
                                    </p>
                                    <p
                                      className={`text-[10px] mt-0.5 ${
                                        isMe ? "text-blue-100" : "text-gray-400"
                                      }`}
                                    >
                                      {getFileTypeLabel(att.content_type)} • {formatFileSize(att.size)}
                                    </p>
                                  </div>
                                </a>
                              )}
                            </div>
                          ))}

                        {/* Timestamp */}
                        <div className={`text-[9px] mt-1 text-right tabular-nums ${
                          isMe ? "text-blue-100/80" : "text-gray-400"
                        }`}>
                          {formatDistanceToNow(new Date(message.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                      </div>

                      {/* Actions (visible on hover) */}
                      {isMe && (
                        <div className="flex gap-2 mt-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button
                            onClick={() => handleDelete(message.id)}
                            className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      {!isMe && (
                         <div className="flex gap-2 mt-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                               onClick={() => handleReply(message)}
                               className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors"
                             >
                               Reply
                             </button>
                         </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="p-2 sm:p-3 bg-white border-t border-gray-100 flex-shrink-0">
          <form onSubmit={handleSubmit} className="space-y-2">
            {replyTo && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-l-4 border-blue-500 rounded-r-lg mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0 text-xs">
                    <span className="font-bold text-blue-600 block mb-0.5">
                      Replying to {replyTo.user_name}
                    </span>
                    <p className="text-gray-500 truncate max-w-[200px]">{replyTo.content}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {attachment && (
              <div className="flex items-center gap-3 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg mb-2">
                {(() => {
                  const IconComp = getFileIcon(attachment.type);
                  return <IconComp className="h-5 w-5 text-indigo-600 flex-shrink-0" />;
                })()}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-indigo-900 truncate font-medium">
                    {attachment.name}
                  </p>
                  <p className="text-[10px] text-indigo-500">
                    {getFileTypeLabel(attachment.type)} • {formatFileSize(attachment.size)}
                  </p>
                </div>
                {submitting ? (
                    <div className="w-16">
                         <div className="h-1 w-full bg-indigo-200 rounded-full overflow-hidden">
                             <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                         </div>
                    </div>
                ) : (
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="text-indigo-400 hover:text-indigo-600 p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                )}
              </div>
            )}

            {/* Mention dropdown */}
            {showMentions && filteredMembers.length > 0 && (
              <div
                ref={mentionListRef}
                className="absolute bottom-16 left-4 right-4 sm:left-auto sm:w-64 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-50 ring-1 ring-black/5"
              >
                <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                  Mention Member
                </div>
                {filteredMembers.map((member, idx) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => handleMentionSelect(member)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      idx === mentionCursorIndex
                        ? "bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                      {getInitials(member.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {member.name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
                <div className="flex-1 bg-gray-100 focus-within:bg-white border border-transparent focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 rounded-2xl transition-all">
                  <textarea
                    ref={inputRef}
                    value={newMessage}
                    onChange={handleInputChange}
                    placeholder="Type a message..."
                    disabled={submitting}
                    className="w-full max-h-32 min-h-[44px] py-3 px-4 text-sm bg-transparent outline-none resize-none placeholder:text-gray-500"
                    rows={1}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = `${target.scrollHeight}px`;
                    }}
                    onKeyDown={handleKeyDown}
                  />
                </div>

                <div className="flex items-center gap-1 mb-1">
                     <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                     <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all flex-shrink-0"
                        title="Attach file"
                      >
                        <Paperclip className="h-5 w-5" />
                      </button>
                      
                    <Button
                        type="submit"
                        disabled={submitting || (!newMessage.trim() && !attachment)}
                        className="h-11 w-11 rounded-full shadow-md bg-blue-600 hover:bg-blue-700 p-0 flex-shrink-0"
                    >
                        <Send className="h-5 w-5 text-white" />
                    </Button>
                </div>
            </div>
          </form>
        </div>
      </div>

      {/* Video Player Dialog */}
      {videoDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            onClick={() => setVideoDialog(null)}
          />
          <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl max-w-4xl w-full border border-gray-800">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900/50 backdrop-blur absolute top-0 left-0 right-0 z-10">
              <span className="text-sm font-medium text-white truncate px-2">
                {videoDialog.filename}
              </span>
              <button
                onClick={() => setVideoDialog(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/80"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <video
              src={videoDialog.url}
              controls
              autoPlay
              className="w-full max-h-[80vh] aspect-video object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
