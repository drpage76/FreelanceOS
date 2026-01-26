
import React, { useState, useEffect, useRef } from 'react';
import { AppState, UserPlan } from '../types';
import { startBusinessChat } from '../services/gemini';
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
  const chatRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPro = state.user?.plan && state.user.plan !== UserPlan.FREE;

  useEffect(() => {
    if (isPro && !chatRef.current) {
      chatRef.current = startBusinessChat(state);
      setMessages([{ role: 'model', text: `Hi ${state.user?.name || 'there'}! I've audited your project history. We have ${state.jobs.length} records to work with. What's our growth priority today?` }]);
    }
  }, [state, isPro]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (msgText: string) => {
    if (msgText.trim() === '' || !chatRef.current) return;
    setMessages(prev => [...prev, { role: 'user', text: msgText }]);
    setIsTyping(true);
    setInput('');

    try {
      const result = await chatRef.current.sendMessage({ message: msgText });
      setMessages(prev => [...prev, { role: 'model', text: result.text }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: "I'm having trouble accessing the business context. Please check your cloud sync." }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isPro) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] max-w-2xl mx-auto text-center px-4">
        <div className="w-24 h-24 bg-indigo-50 rounded-[40px] flex items-center justify-center text-indigo-600 mb-8 shadow-xl">
          <i className="fa-solid fa-sparkles text-4xl"></i>
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-4">Pro AI Coaching</h2>
        <p className="text-slate-500 font-medium text-lg mb-8 leading-relaxed">
          Unlock a dedicated business advisor that analyzes your revenue, suggests day-rate optimizations, and helps you scale your freelance operation.
        </p>
        <Link to="/settings" className="bg-indigo-600 text-white px-10 py-5 rounded-3xl font-black text-lg shadow-2xl hover:bg-indigo-700 transition-all flex items-center gap-3">
          <i className="fa-solid fa-bolt"></i> Unlock Pro Features
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-6 px-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <i className="fa-solid fa-robot"></i>
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">Strategy Hub</h2>
            <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Context Synced
            </p>
          </div>
        </div>
        <button onClick={() => setMessages([])} className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500">Reset Session</button>
      </header>

      <div className="flex-1 bg-white rounded-[40px] border border-slate-200 shadow-xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 custom-scrollbar">
          {messages.length === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
              {[
                "Analyze my most profitable clients",
                "How can I hit £5k this month?",
                "Suggest a tax-saving strategy",
                "Write a polite late-payment nudge"
              ].map(q => (
                <button key={q} onClick={() => handleSend(q)} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left text-[11px] font-black text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all">
                  {q} <i className="fa-solid fa-arrow-right ml-1 opacity-50"></i>
                </button>
              ))}
            </div>
          )}
          
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-6 py-4 rounded-[28px] text-sm font-medium leading-relaxed ${
                m.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-100' 
                  : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-none'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-slate-50 px-6 py-4 rounded-[28px] rounded-tl-none flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></span>
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSend(input); }} className="p-6 bg-slate-50 border-t border-slate-100">
          <div className="relative">
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your revenue, clients, or strategy..." 
              className="w-full pl-6 pr-16 py-5 bg-white border border-slate-200 rounded-3xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-medium shadow-inner"
            />
            <button type="submit" className="absolute right-2 top-2 w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center hover:bg-black transition-all">
              <i className="fa-solid fa-paper-plane"></i>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
