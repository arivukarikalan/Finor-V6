import { useToastStore } from '../context/toastStore';
import type { Toast } from '../context/toastStore';
import { Info, CheckCircle, AlertTriangle, XCircle, Loader2, X } from 'lucide-react';

export const ToastContainer = () => {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastCard = ({ toast, onClose }: { toast: Toast; onClose: () => void }) => {
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
      case 'loading':
        return <Loader2 className="w-4 h-4 text-brand-400 animate-spin shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case 'success':
        return 'border-emerald-500/20 bg-dark-depth-2/90';
      case 'warning':
        return 'border-amber-500/20 bg-dark-depth-2/90';
      case 'error':
        return 'border-rose-500/20 bg-dark-depth-2/90';
      case 'loading':
        return 'border-brand-500/20 bg-dark-depth-2/90';
      default:
        return 'border-blue-500/20 bg-dark-depth-2/90';
    }
  };

  return (
    <div
      className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 animate-slide-up ${getBorderColor()}`}
    >
      <div className="flex items-center gap-2.5">
        {getIcon()}
        <span className="text-[11px] font-medium text-gray-200">{toast.message}</span>
      </div>
      {toast.type !== 'loading' && (
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
