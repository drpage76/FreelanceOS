
import React, { useState } from 'react';
import { Auth } from '../components/Auth';
import { Link } from 'react-router';

export const Landing: React.FC = () => {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="min-h-screen w-full bg-slate-900 text-white selection:bg-indigo-500 selection:text-white overflow-x-hidden flex flex-col relative">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-600 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600 rounded-full blur-[140px]"></div>
      </div>

      {/* Auth Modal Overlay */}
      {showAuth && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
          <div 
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl cursor-pointer" 
            onClick={() => setShowAuth(false)}
          />
          <div className="relative z-[110] w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
            <div className="absolute -top-12 right-0 sm:-right-12">
              <button 
                onClick={() => setShowAuth(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <Auth onSuccess={() => window.location.reload()} />
          </div>
        </div>
      )}

      <nav className="relative z-50 max-w-7xl mx-auto w-full px-4 sm:px-8 py-6 sm:py-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/40">
            <i className="fa-solid fa-bolt text-xl sm:text-2xl"></i>
          </div>
          <span className="text-xl sm:text-2xl font-black tracking-tighter">Freelance<span className="text-indigo-400">OS</span></span>
        </div>
        <div className="flex gap-2 sm:gap-4">
          <button 
            onClick={() => setShowAuth(true)}
            className="px-4 sm:px-6 py-2.5 sm:py-3 bg-white/5 border border-white/10 text-white rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            Sign In
          </button>
          <button 
            onClick={() => setShowAuth(true)}
            className="hidden xs:block px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 transition-all"
          >
            Join Elite
          </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-8 pt-6 sm:pt-10 pb-20 flex-1 flex flex-col">
        <div className="space-y-6 sm:space-y-12 mb-12 sm:mb-20 text-center lg:text-left">
           <div className="inline-flex items-center gap-3 px-4 sm:px-6 py-2 sm:py-2.5 bg-white/5 border border-white/10 rounded-full text-[9px] sm:text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-2 shadow-inner">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]"></span>
              High-Performance Workspace
            </div>
            <h1 className="text-4xl sm:text-6xl md:text-9xl font-black tracking-tighter leading-[0.9] text-white italic drop-shadow-2xl break-words">
              “Jobs, invoices, and time — <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-emerald-400 to-indigo-400">simplified.”</span>
            </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          <div className="space-y-8 sm:space-y-10">
            <p className="text-slate-400 text-lg sm:text-2xl font-medium leading-relaxed max-w-xl">
              The high-performance operating system for the modern independent professional. Built to command your business lifecycle.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {[
                { icon: 'fa-cloud-arrow-up', title: 'Global Sync', desc: 'Secure real-time cloud backup' },
                { icon: 'fa-calendar-check', title: 'Schedule', desc: 'Google Calendar bi-sync' },
                { icon: 'fa-file-invoice-dollar', title: 'Financials', desc: 'Full automated ledger' },
                { icon: 'fa-map-location-dot', title: 'Mileage', desc: 'Precision auto-tracking' }
              ].map((f, i) => (
                <div key={i} className="flex gap-4 sm:gap-5 p-5 sm:p-6 bg-white/5 border border-white/10 rounded-[24px] sm:rounded-[32px] hover:bg-white/10 transition-all cursor-default group">
                  <div className="w-10 h-10 bg-indigo-50/10 rounded-xl flex items-center justify-center group-hover:bg-indigo-500 transition-all shrink-0">
                    <i className={`fa-solid ${f.icon} text-indigo-400 group-hover:text-white text-lg`}></i>
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest mb-1">{f.title}</h3>
                    <p className="text-slate-500 text-[10px] font-bold leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="relative w-full group max-w-2xl mx-auto lg:max-w-none">
              <div className="absolute inset-0 bg-indigo-500/20 blur-[80px] sm:blur-[100px] rounded-full group-hover:bg-indigo-500/30 transition-all duration-700 animate-pulse"></div>
              <div className="bg-slate-800/40 border border-white/10 p-2 sm:p-3 rounded-[32px] sm:rounded-[56px] backdrop-blur-3xl relative z-10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.6)] transition-all duration-700 hover:scale-[1.02]">
                <div className="overflow-hidden rounded-[24px] sm:rounded-[48px] bg-slate-900 shadow-2xl aspect-video sm:aspect-auto">
                  <img 
                    src="https://images.unsplash.com/photo-1551288049-bbb6518149a5?auto=format&fit=crop&q=80&w=1200" 
                    alt="Dashboard Preview" 
                    className="opacity-70 group-hover:opacity-100 transition-all duration-700 w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-50 border-t border-white/5 bg-slate-900/80 backdrop-blur-xl py-8 sm:py-12 px-4 sm:px-8 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 sm:gap-8">
          <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-10">
             <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-[0.3em] opacity-30">FREELANCEOS CORE</span>
             <Link to="/privacy" className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400 transition-colors">Privacy</Link>
             <Link to="/terms" className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400 transition-colors">Terms</Link>
          </div>
          <p className="text-slate-600 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-center">© 2026 PROFESSIONAL BUSINESS OPERATING SYSTEM.</p>
        </div>
      </footer>
    </div>
  );
};
