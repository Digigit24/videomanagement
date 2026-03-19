import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'loading';
  persistent?: boolean;
  onClose: () => void;
}

export function Toast({ message, type = 'success', persistent = false, onClose }: ToastProps) {
  useEffect(() => {
    if (persistent) return;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose, persistent]);

  const bg = type === 'error' ? 'bg-red-600' : type === 'loading' ? 'bg-gray-800' : 'bg-green-600';

  return (
    <div
      className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 ${bg} text-white`}
    >
      {type === 'loading' && (
        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin flex-shrink-0" />
      )}
      <span className="text-sm font-medium">{message}</span>
      {!persistent && (
        <button onClick={onClose} className="hover:opacity-80">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
