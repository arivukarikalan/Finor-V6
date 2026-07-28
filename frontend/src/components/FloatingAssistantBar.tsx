import React, { useState, useEffect, useRef } from 'react';
import { Brain, Sparkles, X, Send, Bot, User, ArrowUpRight, RefreshCw } from 'lucide-react';
import { apiRequest } from '../services/api';
import type { TabId } from './Navigation';

interface FloatingAssistantBarProps {
  setActiveTab: (tab: TabId) => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export const FloatingAssistantBar: React.FC<FloatingAssistantBarProps> = ({ setActiveTab }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '👋 Hi! I am **Finor AI Assistant**. I can analyze your spending, identify avoidable expenses (like junk food & impulse shopping), track company reimbursements, and review your portfolio!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim();
    if (!textToSend || loading) return;

    const userMsg: Message = {
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customPrompt) setInput('');
    setLoading(true);

    try {
      const res: any = await apiRequest('/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend })
      });

      const assistantMsg: Message = {
        role: 'assistant',
        content: res.reply || res.message || 'No response received.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);
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
          <div className="bg-dark-depth-1 border border-dark-border w-full sm:max-w-lg h-[90vh] sm:h-[620px] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-6 duration-300">
            
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-dark-border/60 bg-dark-depth-2/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-brand-500 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
                  <Brain className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-white flex items-center gap-1.5">
                    Finor AI Assistant
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  </h3>
                  <p className="text-[10px] text-gray-400">Intelligent Portfolio & Expense Coach</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setActiveTab('ai-chat');
                  }}
                  className="px-2.5 py-1 text-[10px] font-bold text-brand-400 hover:text-brand-300 bg-brand-500/10 rounded-lg border border-brand-500/20 flex items-center gap-1 cursor-pointer"
                  title="Open full screen mode"
                >
                  Full View <ArrowUpRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-dark-depth-2 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Action Suggestion Chips */}
            <div className="px-4 py-2 bg-dark-depth-2/40 border-b border-dark-border/40 flex items-center gap-2 overflow-x-auto scrollbar-none">
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
                  className="px-3 py-1 rounded-full bg-dark-depth-2 hover:bg-brand-500/20 border border-dark-border/60 text-[10px] font-bold text-gray-300 hover:text-white whitespace-nowrap transition-all cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Message Feed */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-xl bg-brand-500/20 border border-brand-500/30 text-brand-400 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-brand-500 text-white rounded-br-none shadow-md shadow-brand-900/20 font-medium' 
                      : 'bg-dark-depth-2 border border-dark-border text-gray-200 rounded-bl-none whitespace-pre-wrap'
                  }`}>
                    {msg.content}
                    {msg.timestamp && (
                      <span className={`block text-[8px] mt-1.5 font-mono ${msg.role === 'user' ? 'text-brand-100/70 text-right' : 'text-gray-500'}`}>
                        {msg.timestamp}
                      </span>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-7 h-7 rounded-xl bg-brand-500/20 border border-brand-500/30 text-brand-400 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 animate-spin" />
                  </div>
                  <div className="bg-dark-depth-2 border border-dark-border rounded-2xl rounded-bl-none px-4 py-3 text-xs text-gray-400 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-400" />
                    Finor AI is analyzing your data...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="p-3 border-t border-dark-border/60 bg-dark-depth-2/40 flex items-center gap-2">
              <input
                type="text"
                placeholder="Ask Finor AI about expenses, budget, portfolio..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 bg-dark-depth-2 border border-dark-border rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
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
