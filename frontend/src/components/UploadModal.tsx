import { useState, useRef } from 'react';
import { Upload, X, FileVideo, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { videoService } from '@/services/api.service';
import { useBucket } from '@/hooks/useBucket';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (video?: any) => void;
  bucket?: string;
  folderId?: string | null;
  replaceVideoId?: string;
}

interface FileUploadItem {
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
}

export default function UploadModal({ isOpen, onClose, onUploadComplete, bucket, folderId, replaceVideoId }: UploadModalProps) {
  const { currentBucket: hookBucket } = useBucket();
  const currentBucket = bucket || hookBucket;
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const validateFile = (file: File): string | null => {
    const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska', 'video/x-flv', 'video/x-ms-wmv', 'video/3gpp'];
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml'];
    if (!validVideoTypes.includes(file.type) && !validImageTypes.includes(file.type)) {
      return `${file.name}: Invalid file type. Supported: MP4, MOV, WebM, AVI, MKV, JPG, PNG, GIF, WebP, BMP, TIFF, SVG`;
    }
    if (file.size > 50 * 1024 * 1024 * 1024) {
      return `${file.name}: File size must be less than 50GB.`;
    }
    return null;
  };

  const addFiles = (newFiles: FileList | File[]) => {
    // If we are replacing a video, we only allow one file
    if (replaceVideoId && (files.length > 0 || newFiles.length > 1)) {
        alert("You can only upload one file when replacing a version.");
        return;
    }

    const fileArray = Array.from(newFiles);
    // ... (rest is same)
    const errors: string[] = [];
    const validItems: FileUploadItem[] = [];

    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        errors.push(error);
      } else {
        // Avoid duplicate filenames
        const alreadyAdded = files.some(f => f.file.name === file.name && f.file.size === file.size);
        if (!alreadyAdded) {
          validItems.push({ file, status: 'pending', progress: 0 });
        }
      }
    }

    if (validItems.length > 0) {
      setFiles(prev => [...prev, ...validItems]);
    }

    if (errors.length > 0) {
      setFiles(prev => [
        ...prev,
        ...errors.map(err => ({
          file: new File([], 'invalid'),
          status: 'error' as const,
          progress: 0,
          error: err,
        })),
      ].filter(f => f.file.name !== 'invalid'));
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (files.length === 0 || !currentBucket) return;

    setUploading(true);
    let hasError = false;
    let lastUploadedVideo = undefined;

    // Upload each file sequentially
    for (let i = 0; i < files.length; i++) {
        // Skip already completed or failed
      if (files[i].status === 'completed' || files[i].status === 'error') continue;

      setFiles(prev => prev.map((f, idx) =>
        idx === i ? { ...f, status: 'uploading', progress: 0 } : f
      ));

      try {
        const video = await videoService.uploadVideo(files[i].file, currentBucket, (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, progress: percent } : f
          ));
        }, replaceVideoId, folderId || undefined);

        setFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'completed', progress: 100 } : f
        ));
        lastUploadedVideo = video;
      } catch (err: any) {
        hasError = true;
        setFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'error', error: err.response?.data?.error || 'Upload failed' } : f
        ));
      }
    }

    setUploading(false);

    // Close automatically if there were no errors
    if (!hasError) {
      setTimeout(() => {
        // Clear files before closing to reset state but wait for animation
        onUploadComplete(lastUploadedVideo); 
        handleClose();
      }, 1000);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setFiles([]);
    setIsDragging(false);
    setUploading(false);
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const completedCount = files.filter(f => f.status === 'completed').length;
  const errorCount = files.filter(f => f.status === 'error').length;
  const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'uploading');
  const allCompleted = files.length > 0 && completedCount === files.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">Upload Media</h2>
            {files.length > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                {files.length} file{files.length !== 1 ? 's' : ''} selected
                {completedCount > 0 && ` · ${completedCount} completed`}
                {errorCount > 0 && ` · ${errorCount} failed`}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Drop zone - always visible to allow adding more files */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-600 mb-1 text-sm">
              Drag and drop videos or photos here, or click to browse
            </p>
            <p className="text-xs text-gray-400">
              Videos (MP4, MOV, WebM) or Photos (JPG, PNG, GIF, WebP) · Max 50GB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,image/jpeg,image/png,image/gif,image/webp,image/bmp,image/tiff,image/svg+xml"
              onChange={handleFileInputChange}
              className="hidden"
              multiple
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-4 space-y-3">
              {files.map((item, index) => (
                <div
                  key={`${item.file.name}-${index}`}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    item.status === 'completed'
                      ? 'bg-green-50 border-green-200'
                      : item.status === 'error'
                      ? 'bg-red-50 border-red-200'
                      : item.status === 'uploading'
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <FileVideo className={`h-6 w-6 flex-shrink-0 mt-0.5 ${
                    item.status === 'completed' ? 'text-green-600' :
                    item.status === 'error' ? 'text-red-500' :
                    item.status === 'uploading' ? 'text-blue-600' :
                    'text-gray-500'
                  }`} />

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{item.file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(item.file.size)}</p>

                    {item.status === 'uploading' && (
                      <div className="mt-1.5">
                        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full bg-blue-600 transition-all duration-300"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-blue-600 mt-0.5">{item.progress}%</p>
                      </div>
                    )}

                    {item.status === 'completed' && (
                      <div className="flex items-center gap-1 mt-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        <span className="text-xs text-green-600 font-medium">Uploaded successfully</span>
                      </div>
                    )}

                    {item.status === 'error' && item.error && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                        <span className="text-xs text-red-500">{item.error}</span>
                      </div>
                    )}
                  </div>

                  {/* Remove button (only when not uploading) */}
                  {!uploading && item.status !== 'uploading' && (
                    <button
                      onClick={() => removeFile(index)}
                      className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}

                  {item.status === 'uploading' && (
                    <Loader2 className="h-4 w-4 text-blue-600 animate-spin flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}

          {allCompleted && (
            <div className="mt-4 flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
              <CheckCircle2 className="h-5 w-5" />
              <div>
                <span className="text-sm font-medium">All files uploaded successfully!</span>
                <p className="text-xs text-green-500 mt-0.5">Videos will be processed in the background. Photos are ready immediately.</p>
              </div>
            </div>
          )}

          <div className="mt-4 text-sm text-gray-500">
            <p className="font-medium mb-1">Uploading to:</p>
            <p className="text-gray-600">{currentBucket}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={pendingFiles.length === 0 || uploading || allCompleted}
          >
            {uploading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading {completedCount + 1}/{files.length}...
              </span>
            ) : files.length > 1 ? (
              `Upload ${pendingFiles.length} Files`
            ) : (
              'Upload'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
