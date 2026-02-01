import React, { useState } from 'react';
import { Auth } from '../components/Auth';
// Use direct named imports from react-router to resolve missing Link export in unified environments
import { Link } from 'react-router';

export const Landing: React.FC = () => {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="min-h-screen w-full bg-slate-900 text-white selection:bg-indigo-500 selection:text-white overflow-x-hidden flex flex-col">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-600 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600 rounded-full blur-[140px]"></div>
      </div>

      <nav className="relative z-50 max-w-7xl mx-auto w-full px-8 py-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/40">
            <i className="fa-solid fa-bolt text-2xl"></i>
          </div>
          <span className="text-2xl font-black tracking-tighter">Freelance<span className="text-indigo-400">OS</span></span>
        </div>
        <div className="flex gap-4">
           {!showAuth && (
             <>
               <button 
                 onClick={() => setShowAuth(true)}
                 className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-white/10 transition-all"
               >
                 Sign In
               </button>
               <button 
                 onClick={() => setShowAuth(true)}
                 className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 transition-all"
               >
                 Create Account
               </button>
             </>
           )}
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto w-full px-8 pt-10 pb-20 flex-1">
        <div className="space-y-12 mb-20 text-center lg:text-left">
           <div className="inline-flex items-center gap-3 px-6 py-2.5 bg-white/5 border border-white/10 rounded-full text-[11px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-2 shadow-inner">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]"></span>
              Professional Workspace Engine
            </div>
            <h1 className="text-6xl md:text-9xl font-black tracking-tighter leading-[0.85] text-white italic drop-shadow-2xl max-w-full">
              “Jobs, invoices, and time — <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-emerald-400 to-indigo-400">simplified.”</span>
            </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-start">
          <div className="space-y-10">
            <p className="text-slate-400 text-2xl font-medium leading-relaxed max-w-xl">
              The high-performance operating system for the modern independent professional. Built to command your business lifecycle.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[
                { icon: 'fa-cloud-arrow-up', title: 'Global Sync', desc: 'Secure real-time cloud backup' },
                { icon: 'fa-calendar-check', title: 'Schedule', desc: 'Google Calendar bi-sync' },
                { icon: 'fa-file-invoice-dollar', title: 'Financials', desc: 'Full automated ledger' },
                { icon: 'fa-map-location-dot', title: 'Mileage', desc: 'Precision auto-tracking' }
              ].map((f, i) => (
                <div key={i} className="flex gap-5 p-6 bg-white/5 border border-white/10 rounded-[32px] hover:bg-white/10 transition-all cursor-default group">
                  <div className="w-10 h-10 bg-indigo-50/10 rounded-xl flex items-center justify-center group-hover:bg-indigo-500 transition-all">
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

          <div className="relative min-h-[400px]">
            {showAuth ? (
              <div className="relative z-20 w-full animate-in fade-in slide-in-from-right-10 duration-500">
                <div id="auth-section" className="max-w-md mx-auto">
                  <Auth onSuccess={() => window.location.reload()} />
                </div>
                <button 
                  onClick={() => setShowAuth(false)}
                  className="mt-8 text-slate-500 text-[11px] font-black uppercase tracking-widest hover:text-white transition-colors block mx-auto"
                >
                  <i className="fa-solid fa-arrow-left mr-3"></i> Back to product overview
                </button>
              </div>
            ) : (
              <div className="relative w-full group">
                <div className="absolute inset-0 bg-indigo-500/30 blur-[100px] rounded-full group-hover:bg-indigo-500/40 transition-all duration-700 animate-pulse"></div>
                <div className="bg-slate-800/40 border border-white/10 p-3 rounded-[56px] backdrop-blur-3xl relative z-10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.6)] transition-all duration-700 group-hover:translate-y-[-10px] group-hover:rotate-1">
                  <div className="overflow-hidden rounded-[48px] bg-slate-900 shadow-2xl">
                    <img 
                      src="https://images.unsplash.com/photo-1551288049-bbb6518149a5?auto=format&fit=crop&q=80&w=1200" 
                      alt="Dashboard Preview" 
                      className="opacity-70 group-hover:opacity-100 transition-all duration-700 transform group-hover:scale-105"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="relative z-50 border-t border-white/5 bg-slate-900/80 backdrop-blur-xl py-12 px-8 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-10">
             <span className="text-[11px] font-black uppercase tracking-[0.3em] opacity-30">FREELANCEOS CORE</span>
             <Link to="/privacy" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400 transition-colors">Privacy Protocols</Link>
             <Link to="/terms" className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400 transition-colors">Usage Terms</Link>
          </div>
          <p className="text-slate-600 text-[10px] font-black uppercase tracking-[0.2em]">© 2025 PROFESSIONAL BUSINESS OPERATING SYSTEM.</p>
        </div>
      </footer>
    </div>
  );
};