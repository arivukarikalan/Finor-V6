import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'warning' | 'error' | 'loading';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type: ToastType, duration?: number) => string;
  removeToast: (id: string) => void;
  showLoading: (message: string) => string;
  updateToast: (id: string, message: string, type: ToastType) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  addToast: (message, type, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }],
    }));

    if (type !== 'loading') {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }
    return id;
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  showLoading: (message) => {
    return get().addToast(message, 'loading');
  },
  updateToast: (id, message, type) => {
    set((state) => ({
      toasts: state.toasts.map((t) => (t.id === id ? { ...t, message, type } : t)),
    }));
    if (type !== 'loading') {
      setTimeout(() => {
        get().removeToast(id);
      }, 4000);
    }
  },
}));
