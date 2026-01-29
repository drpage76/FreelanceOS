
import React, { useState } from 'react';
import { Auth } from '../components/Auth';

export const Landing: React.FC = () => {
  const [showAuth, setShowAuth] = useState(false);

  return (
    <div className="h-screen bg-slate-900 text-white selection:bg-indigo-500 selection:text-white overflow-hidden flex flex-col">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-emerald-600 rounded-full blur-[120px]"></div>
      </div>

      <nav className="relative z-50 max-w-7xl mx-auto w-full px-6 py-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/40">
            <i className="fa-solid fa-bolt text-xl"></i>
          </div>
          <span className="text-xl font-black tracking-tighter">Freelance<span className="text-indigo-400">OS</span></span>
        </div>
        <div className="flex gap-4">
           <button 
             onClick={() => setShowAuth(true)}
             className="px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
           >
             Sign In
           </button>
           <button 
             onClick={() => setShowAuth(true)}
             className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/20 hover:bg-indigo-500 transition-all"
           >
             Create Account
           </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto w-full px-6 flex-1 flex items-center justify-center pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center w-full">
          <div className="space-y-10">
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-4">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              Modern Operating System • Secure Cloud Backup
            </div>
            
            <h1 className="text-6xl md:text-7xl font-black tracking-tighter leading-tight">
              One Engine. <br/> 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-emerald-400 to-indigo-400">Total Control.</span>
            </h1>

            <p className="text-slate-400 text-lg md:text-xl font-medium leading-relaxed max-w-md">
              The professional operating system for modern freelancers. Command your financials, schedule, and client network in one high-performance workspace.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: 'fa-cloud-arrow-up', title: 'Global Sync', desc: 'Secure cloud backup' },
                { icon: 'fa-calendar-check', title: 'Schedule', desc: 'Google bi-sync' },
                { icon: 'fa-file-invoice-dollar', title: 'Logistics', desc: 'Financial engine' },
                { icon: 'fa-map-location-dot', title: 'Mileage', desc: 'Auto tracking' }
              ].map((f, i) => (
                <div key={i} className="flex gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl">
                  <i className={`fa-solid ${f.icon} text-indigo-400 text-sm mt-1`}></i>
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest">{f.title}</h3>
                    <p className="text-slate-500 text-[9px] leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[450px] flex items-center justify-center">
            {showAuth ? (
              <div className="relative z-20 w-full animate-in fade-in slide-in-from-right-4 duration-500">
                <div id="auth-section" className="max-w-md mx-auto">
                  <Auth onSuccess={() => window.location.reload()} />
                </div>
                <button 
                  onClick={() => setShowAuth(false)}
                  className="mt-6 text-slate-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors block mx-auto"
                >
                  <i className="fa-solid fa-arrow-left mr-2"></i> Back to features
                </button>
              </div>
            ) : (
              <div className="relative group">
                <div className="absolute inset-0 bg-indigo-500/20 blur-[80px] rounded-full group-hover:bg-indigo-500/30 transition-all duration-500"></div>
                <div className="bg-slate-800/50 border border-white/10 p-2 rounded-[48px] backdrop-blur-xl relative z-10 shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]">
                  <img 
                    src="https://images.unsplash.com/photo-1551288049-bbb6518149a5?auto=format&fit=crop&q=80&w=800" 
                    alt="Dashboard Preview" 
                    className="rounded-[40px] shadow-inner opacity-80 group-hover:opacity-100 transition-opacity max-h-[400px]"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button onClick={() => setShowAuth(true)} className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center shadow-2xl animate-pulse hover:scale-110 transition-transform">
                      <i className="fa-solid fa-bolt text-2xl text-white"></i>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-8 px-6 shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 opacity-50">
             <span className="text-xs font-black uppercase tracking-widest">FreelanceOS</span>
          </div>
          <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">© 2025 Professional Business Operating System.</p>
        </div>
      </footer>
    </div>
  );
};
