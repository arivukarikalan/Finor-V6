import React from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

interface CustomAlertModalProps {
  isOpen: boolean;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
  onClose: () => void;
}

export const CustomAlertModal: React.FC<CustomAlertModalProps> = ({
  isOpen,
  type,
  title,
  message,
  onClose
}) => {
  if (!isOpen) return null;

  const getTheme = () => {
    switch (type) {
      case 'success':
        return {
          icon: <CheckCircle2 className="w-8 h-8 text-emerald-400" />,
          borderColor: 'border-emerald-500/30',
          glowBg: 'bg-emerald-500/5',
          btnBg: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-700/10'
        };
      case 'error':
        return {
          icon: <AlertTriangle className="w-8 h-8 text-rose-400" />,
          borderColor: 'border-rose-500/30',
          glowBg: 'bg-rose-500/5',
          btnBg: 'bg-rose-600 hover:bg-rose-500 shadow-rose-700/10'
        };
      case 'info':
      default:
        return {
          icon: <Info className="w-8 h-8 text-sky-400" />,
          borderColor: 'border-sky-500/30',
          glowBg: 'bg-sky-500/5',
          btnBg: 'bg-sky-600 hover:bg-sky-500 shadow-sky-700/10'
        };
    }
  };

  const theme = getTheme();

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className={`glass-panel w-full max-w-sm rounded-3xl border ${theme.borderColor} ${theme.glowBg} p-6 relative overflow-hidden flex flex-col items-center text-center shadow-2xl animate-in zoom-in-95 duration-200`}
      >
        {/* Top Glow */}
        <div className="absolute top-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="mb-4 p-3 rounded-full bg-white/5 border border-white/10 shadow-inner">
          {theme.icon}
        </div>

        {/* Title */}
        <h3 className="text-base font-extrabold text-white uppercase tracking-wider mb-2 font-display">
          {title}
        </h3>

        {/* Message */}
        <p className="text-xs text-gray-400 leading-relaxed mb-6 whitespace-pre-line px-2 font-medium">
          {message}
        </p>

        {/* Action Button */}
        <button
          onClick={onClose}
          className={`w-full py-2.5 rounded-xl text-xs font-black uppercase text-white transition-all cursor-pointer shadow-lg ${theme.btnBg}`}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
