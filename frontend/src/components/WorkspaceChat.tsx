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
  Pause,
  Smile,
  MoreVertical,
  Music,
  FileSpreadsheet,
  Presentation,
  Volume2,
  Camera,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getApiUrl, cn } from "@/lib/utils";

// Fetches authenticated media via Authorization header and returns a blob URL
function useAuthBlobUrl(url: string | null): { blobUrl: string | null; loading: boolean; error: boolean } {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) { setBlobUrl(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);

    const token = localStorage.getItem("token");
    // Build the base URL without any existing token param
    const cleanUrl = url.replace(/[?&]token=[^&]*/g, '').replace(/\?$/, '');

    fetch(cleanUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.blob(); })
      .then(blob => {
        if (!cancelled) {
          setBlobUrl(URL.createObjectURL(blob));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [url]);

  return { blobUrl, loading, error };
}

// Image component that loads via fetch with Authorization header
function AuthImage({ src, alt, className, style, onClick, onError }: {
  src: string; alt: string; className?: string; style?: React.CSSProperties;
  onClick?: () => void; onError?: () => void;
}) {
  const { blobUrl, error } = useAuthBlobUrl(src);

  useEffect(() => {
    if (error && onError) onError();
  }, [error, onError]);

  if (!blobUrl) {
    return (
      <div className={className} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', minHeight: '80px' }}>
        <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return <img src={blobUrl} alt={alt} className={className} style={style} onClick={onClick} loading="lazy" />;
}

// Video component that loads via fetch with Authorization header (blob URL)
function AuthVideo({ src, autoPlay, controls, playsInline, className, onEnded, muted, preload }: {
  src: string; autoPlay?: boolean; controls?: boolean; playsInline?: boolean;
  className?: string; onEnded?: () => void; muted?: boolean; preload?: string;
}) {
  const { blobUrl, loading, error } = useAuthBlobUrl(src);

  if (loading) {
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111827', minHeight: '100px' }}>
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-[10px] text-gray-400">Loading video...</span>
        </div>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111827', minHeight: '100px' }}>
        <span className="text-[10px] text-red-400">Failed to load video</span>
      </div>
    );
  }

  return (
    <video
      src={blobUrl}
      autoPlay={autoPlay}
      controls={controls}
      playsInline={playsInline}
      className={className}
      onEnded={onEnded}
      muted={muted}
      preload={preload}
    />
  );
}

interface WorkspaceChatProps {
  workspaceId: string;
  className?: string;
}

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: ["😊", "😂", "🤣", "😍", "🥰", "😘", "😜", "🤪", "😎", "🤩", "🥳", "😅", "😇", "🙂", "😉", "😋"],
  },
  {
    label: "Gestures",
    emojis: ["👍", "👎", "👏", "🙌", "🤝", "💪", "✌️", "🤞", "👌", "🫡", "👋", "🙏", "💅", "🤙", "👀", "🫶"],
  },
  {
    label: "Hearts",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💯", "💕", "💖", "💗", "💝", "❣️", "💔", "🫀"],
  },
  {
    label: "Work",
    emojis: ["🔥", "⭐", "✨", "🎉", "🚀", "🎬", "📹", "🎥", "📸", "✅", "❌", "⚠️", "📌", "💡", "🎯", "📊"],
  },
  {
    label: "Objects",
    emojis: ["📎", "📁", "📂", "💻", "📱", "🔗", "📝", "✏️", "📅", "⏰", "🔔", "🔒", "🔑", "💬", "📢", "🏆"],
  },
];

// Detect content type from filename extension as fallback
function detectContentType(filename: string, contentType?: string): string {
  if (contentType && contentType !== "application/octet-stream") return contentType;
  const ext = filename?.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", avi: "video/x-msvideo",
    mkv: "video/x-matroska", m4v: "video/mp4", "3gp": "video/3gpp",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", aac: "audio/aac",
    flac: "audio/flac", m4a: "audio/mp4", wma: "audio/x-ms-wma",
    pdf: "application/pdf",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain", csv: "text/csv", rtf: "application/rtf",
    zip: "application/zip", rar: "application/x-rar-compressed",
  };
  return map[ext] || contentType || "application/octet-stream";
}

export default function WorkspaceChat({ workspaceId, className }: WorkspaceChatProps) {
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
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [playingVideo, setPlayingVideo] = useState<string | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastMessageTimeRef = useRef<string | null>(null);
  const isNearBottomRef = useRef(true);

  const currentUserId = localStorage.getItem("userId");

  // Track if user is scrolled near bottom (auto-scroll on new messages)
  const checkNearBottom = useCallback(() => {
    if (listRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listRef.current;
      isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 100;
    }
  }, []);

  // Initial load: fetch all messages
  useEffect(() => {
    lastMessageTimeRef.current = null;
    setMessages([]);
    setLoading(true);
    loadMessages();
    loadMembers();
  }, [workspaceId]);

  // Short polling: every 4 seconds, fetch only new messages since last known
  useEffect(() => {
    const interval = setInterval(pollNewMessages, 4000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  // Auto-scroll when new messages arrive (only if user was near bottom)
  useEffect(() => {
    if (listRef.current && !loading && isNearBottomRef.current) {
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
      if (data.length > 0) {
        lastMessageTimeRef.current = data[data.length - 1].created_at;
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const pollNewMessages = async () => {
    if (!lastMessageTimeRef.current) return;
    try {
      const newMsgs = await chatService.getMessages(
        workspaceId,
        undefined,
        undefined,
        lastMessageTimeRef.current,
      );
      if (newMsgs.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const unique = newMsgs.filter((m) => !existingIds.has(m.id));
          if (unique.length === 0) return prev;
          return [...prev, ...unique];
        });
        lastMessageTimeRef.current = newMsgs[newMsgs.length - 1].created_at;
      }
    } catch (error) {
      // Silently fail on poll errors - will retry in 4s
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
      alert("Failed to send message. Check file size (max 2GB) and network.");
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
  const isAudioFile = (ct: string) => ct?.startsWith("audio/");
  const isPdfFile = (ct: string) => ct?.includes("pdf");
  const isGif = (ct: string) => ct === "image/gif";

  const getFileIcon = (ct: string) => {
    if (isImageFile(ct)) return Image;
    if (isVideoFile(ct)) return FileVideo;
    if (isAudioFile(ct)) return Music;
    if (isPdfFile(ct)) return FileText;
    if (ct?.includes("spreadsheet") || ct?.includes("excel") || ct?.includes("csv")) return FileSpreadsheet;
    if (ct?.includes("presentation") || ct?.includes("powerpoint")) return Presentation;
    if (ct?.includes("word") || ct?.includes("document") || ct?.includes("text/")) return FileText;
    return File;
  };

  const getAttachmentUrl = (url: string) => {
    const token = localStorage.getItem("token") || "";
    const baseUrl = getApiUrl(url);
    return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
  };

  // Get clean API URL (without token) for fetch-based loading
  const getCleanAttachmentUrl = (url: string) => {
    return getApiUrl(url);
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
    if (type.startsWith("image/gif")) return "GIF";
    if (type.startsWith("image/")) return "Photo";
    if (type.startsWith("video/")) return "Video";
    if (type.startsWith("audio/")) return "Audio";
    if (type.includes("pdf")) return "PDF";
    if (type.includes("word") || type.includes("document")) return "Word";
    if (type.includes("excel") || type.includes("spreadsheet")) return "Excel";
    if (type.includes("csv")) return "CSV";
    if (type.includes("powerpoint") || type.includes("presentation")) return "PPT";
    if (type.includes("text/")) return "Text";
    if (type.includes("zip") || type.includes("rar") || type.includes("7z")) return "Archive";
    return "File";
  };

  const renderContent = (content: string, isMe: boolean) => {
    // Split by URLs, @mentions, and emoji-only messages
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(/((?:https?:\/\/[^\s]+)|(?:@\w[\w\s]*))/g);

    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span key={i} className={`font-bold ${isMe ? "text-blue-100" : "text-blue-600"}`}>{part}</span>
        );
      }
      if (urlRegex.test(part)) {
        urlRegex.lastIndex = 0;
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline break-all ${isMe ? "text-blue-100 hover:text-white" : "text-blue-600 hover:text-blue-800"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Check if message is emoji-only (1-3 emojis, no other text)
  const isEmojiOnly = (content: string) => {
    const emojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}(?:\p{Emoji_Modifier})?|\p{Emoji_Component}){1,3}$/u;
    return emojiRegex.test(content.trim());
  };

  const renderAttachment = (att: { id: string; filename: string; content_type: string; size: number; url: string; object_key: string }, isMe: boolean) => {
    const resolvedType = detectContentType(att.filename, att.content_type);
    const url = getAttachmentUrl(att.url);
    const hasImageError = imageErrors.has(att.id);

    // Image - show inline like WhatsApp (uses fetch + blob URL for reliable auth)
    if (isImageFile(resolvedType) && !hasImageError) {
      const cleanUrl = getCleanAttachmentUrl(att.url);
      return (
        <div key={att.id} className="mt-2 text-left">
          <div className="relative group/img">
            <AuthImage
              src={cleanUrl}
              alt={att.filename}
              className="max-w-full sm:max-w-[300px] rounded-lg object-cover cursor-pointer hover:opacity-95 transition-opacity"
              style={{ maxHeight: "280px" }}
              onClick={() => setLightboxImage(url)}
              onError={() => setImageErrors(prev => new Set(prev).add(att.id))}
            />
            {isGif(resolvedType) && (
              <div className={`absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                isMe ? "bg-blue-500/80 text-white" : "bg-black/60 text-white"
              }`}>
                GIF
              </div>
            )}
            <a
              href={url}
              download={att.filename}
              className={`absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-sm transition-opacity opacity-0 group-hover/img:opacity-100 ${
                isMe ? "bg-black/30 text-white hover:bg-black/50" : "bg-white/80 text-gray-600 hover:bg-white"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-3.5 w-3.5" />
            </a>
            <div className={`text-[10px] mt-1 ${isMe ? "text-blue-100/60" : "text-gray-400"}`}>
              {getFileTypeLabel(resolvedType)} {att.size > 0 && `\u2022 ${formatFileSize(att.size)}`}
            </div>
          </div>
        </div>
      );
    }

    // Video - play inline with controls like WhatsApp (uses fetch + blob URL for reliable auth)
    if (isVideoFile(resolvedType)) {
      const cleanUrl = getCleanAttachmentUrl(att.url);
      return (
        <div key={att.id} className="mt-2 text-left">
          <div className="relative max-w-full sm:max-w-[300px] rounded-lg overflow-hidden bg-black aspect-video">
            {playingVideo === att.id ? (
              <AuthVideo
                src={cleanUrl}
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
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-xl hover:scale-110 transition-transform">
                    <Play className="h-7 w-7 text-gray-900 ml-1" />
                  </div>
                </div>
                <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium ${
                  isMe ? "bg-blue-500/80 text-white" : "bg-black/60 text-white"
                }`}>
                  {getFileTypeLabel(resolvedType)} {att.size > 0 && `\u2022 ${formatFileSize(att.size)}`}
                </div>
              </div>
            )}
            <a
              href={url}
              download={att.filename}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      );
    }

    // Audio - inline player like WhatsApp voice messages
    if (isAudioFile(resolvedType)) {
      return (
        <div key={att.id} className="mt-2 text-left">
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
            isMe ? "bg-white/10" : "bg-gray-50 border border-gray-200"
          }`} style={{ minWidth: "220px", maxWidth: "300px" }}>
            <button
              onClick={() => setPlayingAudio(playingAudio === att.id ? null : att.id)}
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                isMe
                  ? "bg-white/20 hover:bg-white/30 text-white"
                  : "bg-blue-100 hover:bg-blue-200 text-blue-600"
              }`}
            >
              {playingAudio === att.id ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              {playingAudio === att.id ? (
                <audio
                  src={url}
                  autoPlay
                  controls
                  className="w-full h-8"
                  style={{ maxWidth: "200px" }}
                  onEnded={() => setPlayingAudio(null)}
                />
              ) : (
                <>
                  <div className={`flex items-center gap-1 ${isMe ? "text-white/80" : "text-gray-600"}`}>
                    <Volume2 className="h-3 w-3" />
                    <div className="flex gap-[2px] items-end h-4">
                      {Array.from({ length: 20 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-[3px] rounded-full ${isMe ? "bg-white/40" : "bg-gray-300"}`}
                          style={{ height: `${4 + Math.random() * 12}px` }}
                        />
                      ))}
                    </div>
                  </div>
                  <p className={`text-[10px] mt-0.5 truncate ${isMe ? "text-blue-100/70" : "text-gray-400"}`}>
                    {att.filename} {att.size > 0 && `\u2022 ${formatFileSize(att.size)}`}
                  </p>
                </>
              )}
            </div>
            <a
              href={url}
              download={att.filename}
              className={`p-1.5 rounded-full flex-shrink-0 transition-colors ${
                isMe ? "text-blue-200 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      );
    }

    // PDF - show preview-style card
    if (isPdfFile(resolvedType)) {
      return (
        <div key={att.id} className="mt-2 text-left">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all border ${
              isMe
                ? "bg-white/10 hover:bg-white/20 text-white border-white/20"
                : "bg-red-50 hover:bg-red-100 text-gray-700 border-red-200"
            }`}
            style={{ maxWidth: "300px" }}
          >
            <div className={`w-11 h-14 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isMe ? "bg-red-500/30" : "bg-red-100 border border-red-200"
            }`}>
              <div className="text-center">
                <FileText className={`h-5 w-5 mx-auto ${isMe ? "text-red-200" : "text-red-500"}`} />
                <span className={`text-[7px] font-bold mt-0.5 block ${isMe ? "text-red-200" : "text-red-500"}`}>PDF</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate leading-tight">{att.filename}</p>
              <p className={`text-[10px] mt-0.5 ${isMe ? "text-blue-100" : "text-gray-400"}`}>
                PDF Document {att.size > 0 && `\u2022 ${formatFileSize(att.size)}`}
              </p>
              <p className={`text-[10px] ${isMe ? "text-blue-100/60" : "text-gray-400"}`}>Tap to open</p>
            </div>
            <Download className={`h-4 w-4 flex-shrink-0 ${isMe ? "text-blue-200" : "text-gray-400"}`} />
          </a>
        </div>
      );
    }

    // Fallback: documents & other files - download card like WhatsApp
    const IconComp = getFileIcon(resolvedType);
    return (
      <div key={att.id} className="mt-2 text-left">
        <a
          href={url}
          download={att.filename}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all border ${
            isMe
              ? "bg-white/10 hover:bg-white/20 text-white border-white/20"
              : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200"
          }`}
          style={{ maxWidth: "300px" }}
        >
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isMe ? "bg-white/15" : "bg-blue-50"
          }`}>
            <IconComp className={`h-5 w-5 ${isMe ? "text-white" : "text-blue-600"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate leading-tight">{att.filename}</p>
            <p className={`text-[10px] mt-0.5 ${isMe ? "text-blue-100" : "text-gray-400"}`}>
              {getFileTypeLabel(resolvedType)} {att.size > 0 && `\u2022 ${formatFileSize(att.size)}`}
            </p>
          </div>
          <Download className={`h-4 w-4 flex-shrink-0 ${isMe ? "text-blue-200" : "text-gray-400"}`} />
        </a>
      </div>
    );
  };

const rootClasses = cn(
  "flex flex-col w-full h-[calc(100vh-80px)] lg:h-[calc(100vh-90px)] bg-[#f3f4f6] rounded-xl overflow-hidden shadow-sm border border-gray-200",
  className
);

return (
  <div className={rootClasses}>
      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          >
            <X className="h-6 w-6" />
          </button>
          <a
            href={lightboxImage}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          >
            <Download className="h-6 w-6" />
          </a>
          <img
            src={lightboxImage}
            alt="Full size"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

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
      <div ref={listRef} onScroll={checkNearBottom} className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3 scroll-smooth bg-gray-50/80">
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
            const emojiOnly = message.content && !message.attachments?.length && isEmojiOnly(message.content);
            return (
              <div key={message.id} className={`group flex items-end gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                {!isMe && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 shadow-sm mb-1">
                    {getInitials(message.user_name)}
                  </div>
                )}

                <div className={`flex flex-col max-w-[85%] sm:max-w-[70%] ${isMe ? "items-end" : "items-start"}`}>
                  {/* Emoji-only messages: big emoji, no bubble */}
                  {emojiOnly ? (
                    <div className="flex flex-col">
                      {!isMe && (
                        <div className="text-[10px] font-bold text-blue-600 mb-1 ml-1 leading-none">{message.user_name}</div>
                      )}
                      <p className="text-4xl leading-tight">{message.content}</p>
                      <div className={`text-[9px] mt-0.5 tabular-nums ${isMe ? "text-right text-gray-400" : "text-gray-400"}`}>
                        {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                      </div>
                      <div className={`flex gap-2 mt-0.5 ${isMe ? 'mr-1' : 'ml-1'} sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity`}>
                        <button onClick={() => handleReply(message)} className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors p-1">
                          Reply
                        </button>
                        {isMe && (
                          <button onClick={() => handleDelete(message.id)} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors p-1">
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
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

                        {/* Attachments - WhatsApp style with content-type fallback */}
                        {message.attachments?.length > 0 && message.attachments.map((att) =>
                          renderAttachment(att, isMe)
                        )}

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
                    </>
                  )}
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

        {/* Emoji picker with categories */}
        {showEmojiPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
            <div className="absolute bottom-full left-2 mb-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 w-80 overflow-hidden">
              {/* Category tabs */}
              <div className="flex border-b border-gray-100 px-1 pt-1 gap-0.5 overflow-x-auto scrollbar-hide">
                {EMOJI_CATEGORIES.map((cat, idx) => (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => setEmojiCategory(idx)}
                    className={`px-2.5 py-1.5 text-[10px] font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                      emojiCategory === idx
                        ? "bg-blue-50 text-blue-600 border-b-2 border-blue-600"
                        : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {/* Emoji grid */}
              <div className="p-2 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-8 gap-0.5">
                  {EMOJI_CATEGORIES[emojiCategory].emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded-lg transition-colors active:bg-gray-200 active:scale-110"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
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
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg mb-2 overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2">
                {attachment.type.startsWith("image/") ? (
                  <img src={URL.createObjectURL(attachment)} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : attachment.type.startsWith("video/") ? (
                  <div className="w-12 h-12 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                    <Play className="h-5 w-5 text-white" />
                  </div>
                ) : (
                  (() => {
                    const resolvedType = detectContentType(attachment.name, attachment.type);
                    const IconComp = getFileIcon(resolvedType);
                    return <IconComp className="h-5 w-5 text-indigo-600 flex-shrink-0" />;
                  })()
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-indigo-900 truncate font-medium">{attachment.name}</p>
                  <p className="text-[10px] text-indigo-500">
                    {getFileTypeLabel(detectContentType(attachment.name, attachment.type))} {"\u2022"} {formatFileSize(attachment.size)}
                  </p>
                </div>
                {submitting ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-700 tabular-nums">{uploadProgress}%</span>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAttachment(null)} className="text-indigo-400 hover:text-indigo-600 p-1">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {/* WhatsApp-style progress bar */}
              {submitting && (
                <div className="h-1.5 w-full bg-indigo-200">
                  <div className="h-full bg-indigo-600 transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }} />
                </div>
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
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.zip,.rar,.7z,.gif"
                onChange={handleFileSelect}
              />
              <input
                type="file"
                id="camera-input"
                className="hidden"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                onClick={() => document.getElementById('camera-input')?.click()}
                className="p-2.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all flex-shrink-0 active:bg-emerald-100"
                title="Take a photo"
              >
                <Camera className="h-5 w-5" />
              </button>
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
