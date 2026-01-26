
import React, { useState, useEffect, useRef } from 'react';
import { AppState, UserPlan } from '../types';
import { startBusinessChat } from '../services/gemini';
// Fix: Use namespace import for react-router-dom to resolve exported member errors
import * as ReactRouterDOM from 'react-router-dom';

const { Link } = ReactRouterDOM;

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const Assistant: React.FC<{ state: AppState }> = ({ state }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  // Fix: Declare chatRef using const to resolve "Cannot find name 'chatRef'" errors.
  const chatRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPro = state.user?.plan && state.user.plan !== UserPlan.FREE;

  useEffect(() => {
    if (isPro && !chatRef.current) {
      chatRef.current = startBusinessChat(state);
      setMessages([{ role: 'model', text: `Hi ${state.user?.name}! I've analyzed your ${state.jobs.length} projects. How can I help you grow your business today?` }]);
    }
  }, [state, isPro]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() === '' || !chatRef.current) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      const result = await chatRef.current.sendMessage({ message: userMsg });
      // result.text is used correctly as a property
      setMessages(prev => [...prev, { role: 'model', text: result.text }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error connecting to the business cloud." }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] max-w-2xl mx-auto text-center px-4">
        <div className="w-24 h-24 bg-indigo-50 rounded-[40px] flex items-center justify-center text-indigo-600 mb-8 shadow-xl shadow-indigo-100">
          <i className="fa-solid fa-lock text-4xl"></i>
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-4">AI Business Coach</h2>
        <p className="text-slate-500 font-medium text-lg mb-8 leading-relaxed">
          Unlock a dedicated AI advisor that understands your revenue, client trends, and profitability. Available exclusively to Pro members.
        </p>
        <Link to="/settings" className="bg-indigo-600 text-white px-10 py-5 rounded-3xl font-black text-lg shadow-2xl shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-3">
          <i className="fa-solid fa-bolt"></i> Upgrade to Pro
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <i className="fa-solid fa-robot"></i>
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Freelance CRM Coach</h2>
            <p className="text-xs text-emerald-500 font-black uppercase tracking-widest flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Analyzing Live Data
            </p>
          </div>
        </div>
        <button onClick={() => setMessages([])} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors">
          Reset Session
        </button>
      </header>

      <div className="flex-1 bg-white rounded-[40px] border border-slate-200 shadow-xl overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 custom-scrollbar">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-6 py-4 rounded-[28px] text-sm font-medium leading-relaxed shadow-sm ${
                m.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-none'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-slate-50 border border-slate-100 px-6 py-4 rounded-[28px] rounded-tl-none flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <form onSubmit={handleSend} className="p-4 bg-slate-50 border-t border-slate-100">
          <div className="relative">
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your business stats, tax, or strategy..." 
              className="w-full pl-6 pr-16 py-5 bg-white border border-slate-200 rounded-full outline-none focus:ring-4 focus:ring-indigo-500/10 font-medium shadow-inner"
            />
            <button 
              type="submit"
              className="absolute right-2 top-2 w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
