import React, { useState, useEffect, useRef } from 'react';
import { Brain, Sparkles, X, Send, Bot, User, ArrowUpRight, RefreshCw, Paperclip } from 'lucide-react';
import { apiRequest } from '../services/api';
import { compressImage } from '../utils/imageCompressor';
import type { TabId } from './Navigation';

interface FloatingAssistantBarProps {
  setActiveTab: (tab: TabId) => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  imagePreview?: string;
}

interface UploadedImage {
  data: string; // base64 string
  mimeType: string;
  previewUrl: string;
}

const DRAFT_KEY = 'finor_ai_assistant_draft';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours expiry ("delete one day once")

function loadDraftMessage(): string {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.text === 'string' && parsed.timestamp) {
      if (Date.now() - parsed.timestamp > DRAFT_MAX_AGE_MS) {
        localStorage.removeItem(DRAFT_KEY);
        return '';
      }
      return parsed.text;
    }
  } catch {
    localStorage.removeItem(DRAFT_KEY);
  }
  return '';
}

function saveDraftMessage(text: string) {
  try {
    if (!text.trim()) {
      localStorage.removeItem(DRAFT_KEY);
    } else {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, timestamp: Date.now() }));
    }
  } catch {}
}

function clearDraftMessage() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export const FloatingAssistantBar: React.FC<FloatingAssistantBarProps> = ({ setActiveTab }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '👋 Hi! I am **Finor AI Assistant**. I can analyze your spending, identify avoidable expenses (like junk food & impulse shopping), track company reimbursements, and review your portfolio! You can also upload stock charts or receipt screenshots for instant visual analysis.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState(() => loadDraftMessage());
  const [selectedImage, setSelectedImage] = useState<UploadedImage | null>(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLightMode, setIsLightMode] = useState<boolean>(() => localStorage.getItem('finor_theme') === 'light');

  useEffect(() => {
    const handleTheme = () => {
      setIsLightMode(localStorage.getItem('finor_theme') === 'light');
    };
    window.addEventListener('themechange', handleTheme);
    return () => window.removeEventListener('themechange', handleTheme);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleInputChange = (val: string) => {
    setInput(val);
    saveDraftMessage(val);
  };

  const handleImageFile = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const compressed = await compressImage(file);
      setSelectedImage(compressed);
    } catch (err) {
      console.error('Failed to process image:', err);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleImageFile(file);
        }
      }
    }
  };

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim();
    if ((!textToSend && !selectedImage) || loading) return;

    const currentImg = selectedImage;
    const promptMessage = textToSend || 'Please analyze this uploaded image in the context of my portfolio and finances.';

    const userMsg: Message = {
      role: 'user',
      content: promptMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      imagePreview: currentImg?.previewUrl
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customPrompt) {
      setInput('');
      clearDraftMessage();
    }
    setSelectedImage(null);
    setLoading(true);

    try {
      const res: any = await apiRequest('/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: promptMessage,
          image: currentImg ? { data: currentImg.data, mimeType: currentImg.mimeType } : undefined
        })
      });

      const assistantMsg: Message = {
        role: 'assistant',
        content: res.reply || res.message || 'No response received.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Sync into finor_ai_chats so it appears in the left sidebar of AI Assistant
      try {
        const saved = localStorage.getItem('finor_ai_chats');
        const parsed = saved ? JSON.parse(saved) : [];
        const cleanPrompt = promptMessage.replace(/[\r\n]+/g, ' ').trim();
        const words = cleanPrompt.split(/\s+/);
        const title = words.slice(0, 6).join(' ') + (words.length > 6 ? '...' : '');
        const newId = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).substring(2, 9));
        const newSession = {
          id: newId,
          title: title || 'Quick Assistant Chat',
          createdAt: Date.now(),
          messages: [
            { role: 'user' as const, content: promptMessage, timestamp: userMsg.timestamp, imagePreview: userMsg.imagePreview },
            { role: 'assistant' as const, content: assistantMsg.content, timestamp: assistantMsg.timestamp }
          ]
        };
        const updated = [newSession, ...(Array.isArray(parsed) ? parsed : [])];
        localStorage.setItem('finor_ai_chats', JSON.stringify(updated));
        localStorage.setItem('finor_ai_active_chat_id', newId);
        apiRequest('/assistant/sessions', {
          method: 'POST',
          body: JSON.stringify({ session: newSession })
        }).catch(() => {});
      } catch {}
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an issue connecting to Finor AI servers. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ─── FLOATING EXPANDED CHAT MODAL ─── */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className={`w-full sm:max-w-lg h-[90vh] sm:h-[620px] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-6 duration-300 border ${
            isLightMode ? 'bg-white border-slate-200 text-slate-900' : 'bg-dark-depth-1 border-dark-border text-white'
          }`}>
            
            {/* Modal Header */}
            <div className={`px-5 py-4 border-b flex items-center justify-between ${
              isLightMode ? 'border-slate-200 bg-slate-50/80' : 'border-dark-border/60 bg-dark-depth-2/60'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-brand-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
                  <Brain className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className={`text-xs font-extrabold flex items-center gap-1.5 ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
                    Finor AI Assistant
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  </h3>
                  <p className={`text-[10px] ${isLightMode ? 'text-slate-500' : 'text-gray-400'}`}>Intelligent Portfolio & Expense Coach</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setActiveTab('ai-chat');
                  }}
                  className="px-2.5 py-1 text-[10px] font-bold text-brand-500 hover:text-brand-600 bg-brand-500/10 rounded-lg border border-brand-500/20 flex items-center gap-1 cursor-pointer"
                  title="Open full screen mode"
                >
                  Full View <ArrowUpRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className={`p-1.5 rounded-lg cursor-pointer ${isLightMode ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200' : 'text-gray-400 hover:text-white hover:bg-dark-depth-2'}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Action Suggestion Chips */}
            <div className={`px-4 py-2 border-b flex items-center gap-2 overflow-x-auto scrollbar-none ${
              isLightMode ? 'bg-slate-100/60 border-slate-200' : 'bg-dark-depth-2/40 border-dark-border/40'
            }`}>
              {[
                { label: '⚠️ Avoidable Expenses', prompt: 'Analyze my transactions and show avoidable/impulse expenses like snacks, shopping, or theatres.' },
                { label: '📊 Expense Audit', prompt: 'Give me a complete breakdown of my monthly spending and budget savings.' },
                { label: '💼 Reimbursable Claims', prompt: 'Show my pending company reimbursable claims.' },
                { label: '📈 Portfolio Check', prompt: 'Summarize my current holdings and P&L performance.' }
              ].map(chip => (
                <button
                  key={chip.label}
                  onClick={() => handleSend(chip.prompt)}
                  disabled={loading}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 disabled:opacity-50 border ${
                    isLightMode 
                      ? 'bg-white hover:bg-brand-50 text-slate-700 hover:text-brand-600 border-slate-300 shadow-sm' 
                      : 'bg-dark-depth-2 hover:bg-brand-500/20 text-gray-300 hover:text-white border-dark-border/60'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Message Feed */}
            <div className={`flex-1 p-4 overflow-y-auto space-y-4 text-xs ${isLightMode ? 'bg-slate-50/50' : ''}`}>
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-xl bg-brand-500/20 border border-brand-500/30 text-brand-500 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-500/20 font-medium' 
                      : isLightMode 
                        ? 'bg-white border border-slate-200 text-slate-800 rounded-bl-none whitespace-pre-wrap shadow-sm' 
                        : 'bg-dark-depth-2 border border-dark-border text-gray-200 rounded-bl-none whitespace-pre-wrap'
                  }`}>
                    {msg.imagePreview && (
                      <div className="mb-2">
                        <img 
                          src={msg.imagePreview} 
                          alt="User upload" 
                          className="max-h-44 max-w-full rounded-xl object-contain border border-white/20 shadow-sm" 
                        />
                      </div>
                    )}
                    {msg.content}
                    {msg.timestamp && (
                      <span className={`block text-[8px] mt-1.5 font-mono ${
                        msg.role === 'user' 
                          ? 'text-brand-100/80 text-right' 
                          : isLightMode ? 'text-slate-400' : 'text-gray-500'
                      }`}>
                        {msg.timestamp}
                      </span>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-500 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-7 h-7 rounded-xl bg-brand-500/20 border border-brand-500/30 text-brand-500 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 animate-spin" />
                  </div>
                  <div className={`rounded-2xl rounded-bl-none px-4 py-3 text-xs flex items-center gap-2 border ${
                    isLightMode ? 'bg-white border-slate-200 text-slate-600 shadow-sm' : 'bg-dark-depth-2 border-dark-border text-gray-400'
                  }`}>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-500" />
                    Finor AI is analyzing your data...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Image Preview if selected */}
            {selectedImage && (
              <div className={`px-3 py-2 border-t flex items-center justify-between ${
                isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-dark-depth-3/80 border-dark-border/60'
              }`}>
                <div className="flex items-center gap-2 overflow-hidden">
                  <img 
                    src={selectedImage.previewUrl} 
                    alt="Upload preview" 
                    className="w-10 h-10 rounded-lg object-cover border border-brand-500/40" 
                  />
                  <div className="text-[10px] truncate">
                    <span className="font-bold text-brand-400 block truncate">Image Attached</span>
                    <span className="text-gray-400 text-[9px]">Ready for visual AI analysis</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="p-1 rounded-full text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                  title="Remove image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Input Bar */}
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className={`p-3 border-t flex items-center gap-2 ${
              isLightMode ? 'border-slate-200 bg-white' : 'border-dark-border/60 bg-dark-depth-2/40'
            }`}>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageFile(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                  selectedImage 
                    ? 'bg-brand-500/20 border-brand-500 text-brand-400' 
                    : (isLightMode ? 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200' : 'bg-dark-depth-3 border-dark-border/60 text-gray-400 hover:text-white')
                }`}
                title="Attach chart or receipt image"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <input
                type="text"
                placeholder="Ask Finor AI about expenses, portfolio, charts..."
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onPaste={handlePaste}
                className={`flex-1 border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-brand-500 ${
                  isLightMode 
                    ? 'bg-slate-100 border-slate-200 text-slate-900 placeholder-slate-400' 
                    : 'bg-dark-depth-2 border-dark-border text-white placeholder-gray-500'
                }`}
              />
              <button
                type="submit"
                disabled={(!input.trim() && !selectedImage) || loading}
                className="p-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white cursor-pointer transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

          </div>
        </div>
      )}

      {/* ─── FLOATING ANIMATED TRIGGER BAR (Visible across all screens) ─── */}
      <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-40 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 text-white font-extrabold text-xs shadow-2xl shadow-brand-500/30 hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20 cursor-pointer overflow-hidden"
        >
          {/* Animated Glow Effect */}
          <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          
          <div className="relative flex items-center justify-center">
            <span className="absolute -inset-1 rounded-full bg-emerald-400 animate-ping opacity-75" />
            <div className="relative w-6 h-6 rounded-full bg-dark-depth-0/60 flex items-center justify-center border border-white/30">
              <Brain className="w-3.5 h-3.5 text-brand-300 group-hover:rotate-12 transition-transform" />
            </div>
          </div>

          <span className="relative tracking-wide font-display text-white hidden sm:inline">
            Finor AI Assistant
          </span>
          <span className="relative tracking-wide font-display text-white sm:hidden">
            AI Assistant
          </span>

          <Sparkles className="relative w-3.5 h-3.5 text-amber-300 animate-pulse" />
        </button>
      </div>
    </>
  );
};
