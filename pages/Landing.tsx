
import React, { useState } from 'react';
import { Auth } from '../components/Auth';
import { Link } from 'react-router';

export const Landing: React.FC = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [initialIsSignUp, setInitialIsSignUp] = useState(false);

  const openAuth = (isSignUp: boolean) => {
    setInitialIsSignUp(isSignUp);
    setShowAuth(true);
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 text-white selection:bg-indigo-500 selection:text-white overflow-x-hidden flex flex-col relative">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-600 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600 rounded-full blur-[140px]"></div>
      </div>

      {/* Auth Modal Overlay */}
      {showAuth && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div 
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl cursor-pointer" 
            onClick={() => setShowAuth(false)}
          />
          <div className="relative z-[110] w-full max-w-md my-auto animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
            <div className="w-full flex justify-end mb-4">
              <button 
                onClick={() => setShowAuth(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all border border-white/10"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <Auth 
              initialIsSignUp={initialIsSignUp}
              onSuccess={() => window.location.reload()} 
            />
          </div>
        </div>
      )}

      <nav className="relative z-50 max-w-7xl mx-auto w-full px-4 sm:px-8 py-6 sm:py-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-2xl shadow-indigo-500/40">
            <i className="fa-solid fa-bolt text-lg"></i>
          </div>
          <span className="text-xl font-black tracking-tighter">Freelance<span className="text-indigo-400">OS</span></span>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => openAuth(false)}
            className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            Sign In
          </button>
          <button 
            onClick={() => openAuth(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 transition-all"
          >
            Register
          </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-8 pt-6 pb-20 flex-1">
        <div className="space-y-6 sm:space-y-10 mb-12 text-center lg:text-left">
           <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 shadow-inner">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]"></span>
              Professional Business Operating System
            </div>
            <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-[1.1] text-white italic drop-shadow-2xl max-w-full">
              “Jobs, invoices, <br className="hidden sm:block" />and time — <br className="lg:hidden" /><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-emerald-400 to-indigo-400">simplified.”</span>
            </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          <div className="space-y-8">
            <p className="text-slate-400 text-lg sm:text-2xl font-medium leading-relaxed max-w-xl">
              The high-performance workspace for modern independent professionals. £9.99/mo + VAT. Start your 30-day full access free trial today.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
               <button 
                 onClick={() => openAuth(true)}
                 className="px-8 py-4 bg-indigo-600 text-white rounded-[20px] font-black text-xs uppercase tracking-widest shadow-2xl shadow-indigo-500/40 hover:bg-indigo-500 transition-all text-center"
               >
                 Start 30-Day Trial
               </button>
               <button 
                 onClick={() => openAuth(false)}
                 className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-[20px] font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all text-center"
               >
                 Sign In to OS
               </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pt-4">
              {[
                { icon: 'fa-cloud-arrow-up', title: 'Global Sync', desc: 'Secure cloud backup' },
                { icon: 'fa-calendar-check', title: 'Schedule', desc: 'Calendar integration' },
                { icon: 'fa-file-invoice-dollar', title: 'Financials', desc: 'Automated ledger' },
                { icon: 'fa-map-location-dot', title: 'Mileage', desc: 'Map auto-tracking' }
              ].map((f, i) => (
                <div key={i} className="flex gap-4 p-5 bg-white/5 border border-white/10 rounded-[24px] hover:bg-white/10 transition-all cursor-default group text-left">
                  <div className="w-10 h-10 bg-indigo-50/10 rounded-xl flex items-center justify-center group-hover:bg-indigo-500 transition-all shrink-0">
                    <i className={`fa-solid ${f.icon} text-indigo-400 group-hover:text-white text-lg`}></i>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[10px] font-black uppercase tracking-widest mb-1 truncate">{f.title}</h3>
                    <p className="text-slate-500 text-[10px] font-bold leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative w-full overflow-hidden">
            <div className="relative w-full group max-w-2xl mx-auto lg:max-w-none">
              <div className="absolute inset-0 bg-indigo-500/20 blur-[60px] rounded-full group-hover:bg-indigo-500/30 transition-all duration-700 animate-pulse"></div>
              <div className="bg-slate-800/40 border border-white/10 p-2 rounded-[32px] backdrop-blur-3xl relative z-10 shadow-2xl transition-all duration-700">
                <div className="overflow-hidden rounded-[24px] bg-slate-900 aspect-video">
                  <img 
                    src="https://images.unsplash.com/photo-1551288049-bbb6518149a5?auto=format&fit=crop&q=80&w=1200" 
                    alt="Dashboard Preview" 
                    className="opacity-60 group-hover:opacity-100 transition-all duration-700 w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-50 border-t border-white/5 bg-slate-900/80 backdrop-blur-xl py-8 px-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-wrap justify-center items-center gap-6">
             <span className="text-[9px] font-black uppercase tracking-[0.3em] opacity-30">FREELANCEOS CORE</span>
             <Link to="/privacy" className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400">Privacy</Link>
             <Link to="/terms" className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400">Terms</Link>
          </div>
          <p className="text-slate-600 text-[9px] font-black uppercase tracking-[0.2em] text-center">© 2026 PAGETECH SOLUTIONS LTD. PROFESSIONAL BUSINESS OPERATING SYSTEM.</p>
        </div>
      </footer>
    </div>
  );
};
