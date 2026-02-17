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
  Download,
  Play,
  Smile,
  MoreVertical,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getApiUrl } from "@/lib/utils";

interface WorkspaceChatProps {
  workspaceId: string;
}

const EMOJI_LIST = [
  "😊", "😂", "❤️", "👍", "👎", "🔥", "🎉", "👏",
  "😍", "🤔", "😅", "🙌", "💯", "✅", "❌", "⭐",
  "🚀", "💪", "👀", "🎬", "📹", "🎥", "📸", "✨",
];

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
  const [mentionCursorIndex, setMentionCursorIndex] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
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
    if (showMentions) return;
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
        (percent) => setUploadProgress(percent),
      );

      setMessages((prev) => [...prev, message]);
      setNewMessage("");
      setReplyTo(null);
      setAttachment(null);
      setSelectedMentions([]);
      setUploadProgress(0);
      setShowEmojiPicker(false);

      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      alert("Failed to send message. Check file size (max 5GB) and network.");
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

  const getMentionContext = useCallback(
    (value: string, cursorPos: number) => {
      const textBeforeCursor = value.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");
      if (lastAtIndex === -1) return null;
      if (lastAtIndex > 0) {
        const charBefore = textBeforeCursor[lastAtIndex - 1];
        if (charBefore !== " " && charBefore !== "\n") return null;
      }
      const searchText = textBeforeCursor.slice(lastAtIndex + 1);
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
    if (mentionCtx && members.length > 0) {
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
        if (idx >= 0) handleMentionSelect(filteredMembers[idx]);
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

  const insertEmoji = (emoji: string) => {
    const cursorPos = inputRef.current?.selectionStart || newMessage.length;
    const newValue = newMessage.slice(0, cursorPos) + emoji + newMessage.slice(cursorPos);
    setNewMessage(newValue);
    setShowEmojiPicker(false);
    setTimeout(() => {
      if (inputRef.current) {
        const newPos = cursorPos + emoji.length;
        inputRef.current.selectionStart = newPos;
        inputRef.current.selectionEnd = newPos;
        inputRef.current.focus();
      }
    }, 0);
  };

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const isImageFile = (ct: string) => ct?.startsWith("image/");
  const isVideoFile = (ct: string) => ct?.startsWith("video/");

  const getFileIcon = (ct: string) => {
    if (isImageFile(ct)) return Image;
    if (isVideoFile(ct)) return FileVideo;
    if (ct?.includes("pdf") || ct?.includes("word") || ct?.includes("text/") || ct?.includes("spreadsheet") || ct?.includes("excel")) return FileText;
    return File;
  };

  const getAttachmentUrl = (url: string) => {
    const token = localStorage.getItem("token");
    const baseUrl = getApiUrl(url);
    return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}token=${token}`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAttachment(file);
    e.target.value = "";
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
    if (type.includes("powerpoint") || type.includes("presentation")) return "PowerPoint";
    if (type.includes("text/")) return "Text";
    return "File";
  };

  const renderContent = (content: string, isMe: boolean) => {
    return content.split(/(@\w[\w\s]*)/g).map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className={`font-bold ${isMe ? "text-blue-100" : "text-blue-600"}`}>{part}</span>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  };

  return (
    <div className="flex flex-col w-full h-[calc(100vh-80px)] lg:h-[calc(100vh-90px)] bg-[#f3f4f6] rounded-xl overflow-hidden shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 leading-none mb-1">Workspace Chat</h3>
            <p className="text-xs text-gray-500 font-medium">{members.length} members</p>
          </div>
        </div>
        <button className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3 scroll-smooth bg-gray-50/80">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
              <MessageCircle className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">No messages yet</p>
            <p className="text-xs text-gray-500 max-w-[200px] mx-auto mt-1">Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isMe = message.user_id === currentUserId;
            return (
              <div key={message.id} className={`group flex items-end gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                {!isMe && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 shadow-sm mb-1">
                    {getInitials(message.user_name)}
                  </div>
                )}

                <div className={`flex flex-col max-w-[85%] sm:max-w-[70%] ${isMe ? "items-end" : "items-start"}`}>
                  <div className={`relative px-3 py-2 sm:px-4 sm:py-2.5 shadow-sm text-sm ${
                    isMe
                      ? "bg-blue-600 text-white rounded-2xl rounded-tr-none"
                      : "bg-white text-gray-800 rounded-2xl rounded-tl-none border border-gray-100"
                  }`}>
                    {!isMe && (
                      <div className="text-[10px] font-bold text-blue-600 mb-1 leading-none">{message.user_name}</div>
                    )}

                    {message.reply_to && (
                      <div className={`text-[10px] mb-2 p-1.5 rounded bg-black/5 border-l-2 ${
                        isMe ? "border-white/50 text-white/90" : "border-blue-500 text-gray-600"
                      }`}>
                        <div className="font-bold flex items-center gap-1">
                          <Reply className="h-2.5 w-2.5" />
                          {message.reply_user_name}
                        </div>
                        {message.reply_content && (
                          <p className="truncate mt-0.5 opacity-80 line-clamp-1">{message.reply_content}</p>
                        )}
                      </div>
                    )}

                    {message.content && (
                      <p className={`whitespace-pre-wrap leading-relaxed break-words ${isMe ? "text-white" : "text-gray-800"}`}>
                        {renderContent(message.content, isMe)}
                      </p>
                    )}

                    {/* Attachments - WhatsApp style */}
                    {message.attachments?.length > 0 && message.attachments.map((att) => (
                      <div key={att.id} className="mt-2 text-left">
                        {isImageFile(att.content_type) ? (
                          /* Image - Show inline like WhatsApp */
                          <div className="relative">
                            <img
                              src={getAttachmentUrl(att.url)}
                              alt={att.filename}
                              className="max-w-full sm:max-w-[300px] rounded-lg object-cover cursor-pointer"
                              style={{ maxHeight: '280px' }}
                              onClick={() => window.open(getAttachmentUrl(att.url), '_blank')}
                            />
                            <a
                              href={getAttachmentUrl(att.url)}
                              download={att.filename}
                              className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-sm transition-opacity ${
                                isMe ? "bg-black/30 text-white hover:bg-black/50" : "bg-white/80 text-gray-600 hover:bg-white"
                              }`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        ) : isVideoFile(att.content_type) ? (
                          /* Video - Thumbnail with play button, plays inline on click */
                          <div className="relative max-w-full sm:max-w-[300px] rounded-lg overflow-hidden bg-black aspect-video">
                            {playingVideo === att.id ? (
                              <video
                                src={getAttachmentUrl(att.url)}
                                controls
                                autoPlay
                                playsInline
                                className="w-full h-full object-contain"
                                onEnded={() => setPlayingVideo(null)}
                              />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center cursor-pointer bg-gradient-to-br from-gray-800 to-gray-900 relative"
                                onClick={() => setPlayingVideo(att.id)}
                              >
                                <video
                                  src={getAttachmentUrl(att.url)}
                                  preload="metadata"
                                  className="w-full h-full object-contain opacity-60"
                                  muted
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
                                    <Play className="h-7 w-7 text-gray-900 ml-1" />
                                  </div>
                                </div>
                                <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium ${
                                  isMe ? "bg-blue-500/80 text-white" : "bg-black/60 text-white"
                                }`}>
                                  {getFileTypeLabel(att.content_type)} • {formatFileSize(att.size)}
                                </div>
                              </div>
                            )}
                            <a
                              href={getAttachmentUrl(att.url)}
                              download={att.filename}
                              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm z-10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        ) : (
                          /* Documents - Download card like WhatsApp */
                          <a
                            href={getAttachmentUrl(att.url)}
                            download={att.filename}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all border mt-1 ${
                              isMe
                                ? "bg-white/10 hover:bg-white/20 text-white border-white/20"
                                : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"
                            }`}
                          >
                            {(() => {
                              const IconComp = getFileIcon(att.content_type);
                              return (
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  isMe ? "bg-white/15" : "bg-blue-50"
                                }`}>
                                  <IconComp className={`h-5 w-5 ${isMe ? "text-white" : "text-blue-600"}`} />
                                </div>
                              );
                            })()}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold truncate leading-tight">{att.filename}</p>
                              <p className={`text-[10px] mt-0.5 ${isMe ? "text-blue-100" : "text-gray-400"}`}>
                                {getFileTypeLabel(att.content_type)} • {formatFileSize(att.size)}
                              </p>
                            </div>
                            <Download className={`h-4 w-4 flex-shrink-0 ${isMe ? "text-blue-200" : "text-gray-400"}`} />
                          </a>
                        )}
                      </div>
                    ))}

                    {/* Timestamp */}
                    <div className={`text-[9px] mt-1 text-right tabular-nums ${isMe ? "text-blue-100/80" : "text-gray-400"}`}>
                      {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                    </div>
                  </div>

                  {/* Actions - visible on mobile via tap, hover on desktop */}
                  <div className={`flex gap-2 mt-1 ${isMe ? 'mr-1' : 'ml-1'} sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity`}>
                    <button onClick={() => handleReply(message)} className="text-[10px] text-gray-400 hover:text-blue-500 active:text-blue-600 transition-colors p-1">
                      Reply
                    </button>
                    {isMe && (
                      <button onClick={() => handleDelete(message.id)} className="text-[10px] text-gray-400 hover:text-red-500 active:text-red-600 transition-colors p-1">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="p-2 sm:p-3 bg-white border-t border-gray-100 flex-shrink-0 relative">
        {/* Mention dropdown */}
        {showMentions && filteredMembers.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-50 ring-1 ring-black/5">
            <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50 sticky top-0">
              Mention Member
            </div>
            {filteredMembers.map((member, idx) => (
              <button
                key={member.id}
                type="button"
                onClick={() => handleMentionSelect(member)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  idx === mentionCursorIndex ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                  {getInitials(member.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Emoji picker */}
        {showEmojiPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
            <div className="absolute bottom-full left-2 mb-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 p-3 w-72">
              <div className="grid grid-cols-8 gap-1">
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insertEmoji(emoji)}
                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded-lg transition-colors active:bg-gray-200"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-2">
          {replyTo && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-l-4 border-blue-500 rounded-r-lg mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0 text-xs">
                  <span className="font-bold text-blue-600 block mb-0.5">Replying to {replyTo.user_name}</span>
                  <p className="text-gray-500 truncate max-w-[200px]">{replyTo.content || "Attachment"}</p>
                </div>
              </div>
              <button type="button" onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {attachment && (
            <div className="flex items-center gap-3 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg mb-2">
              {attachment.type.startsWith("image/") ? (
                <img src={URL.createObjectURL(attachment)} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
              ) : (
                (() => {
                  const IconComp = getFileIcon(attachment.type);
                  return <IconComp className="h-5 w-5 text-indigo-600 flex-shrink-0" />;
                })()
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-indigo-900 truncate font-medium">{attachment.name}</p>
                <p className="text-[10px] text-indigo-500">{getFileTypeLabel(attachment.type)} • {formatFileSize(attachment.size)}</p>
              </div>
              {submitting ? (
                <div className="w-16">
                  <div className="h-1 w-full bg-indigo-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setAttachment(null)} className="text-indigo-400 hover:text-indigo-600 p-1">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 bg-gray-100 focus-within:bg-white border border-transparent focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 rounded-2xl transition-all">
              <textarea
                ref={inputRef}
                value={newMessage}
                onChange={handleInputChange}
                placeholder="Type a message... Use @ to mention"
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

            <div className="flex items-center gap-0.5 mb-1">
              <button
                type="button"
                onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowMentions(false); }}
                className="p-2.5 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-full transition-all flex-shrink-0 active:bg-yellow-100"
                title="Emoji"
              >
                <Smile className="h-5 w-5" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip,.rar,.7z"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all flex-shrink-0 active:bg-blue-100"
                title="Attach file (photos, videos, docs)"
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
  );
}
