import React from 'react';
import { Auth } from '../components/Auth';

export const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-900 text-white selection:bg-indigo-500 selection:text-white">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-emerald-600 rounded-full blur-[120px]"></div>
      </div>

      <nav className="relative z-10 max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/40">
            <i className="fa-solid fa-bolt text-xl"></i>
          </div>
          <span className="text-xl font-black tracking-tighter">Freelance<span className="text-indigo-400">OS</span></span>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-10 pb-40">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-10">
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-4">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              All features included • 3 months free
            </div>
            
            <h1 className="text-6xl md:text-7xl font-black tracking-tighter leading-tight">
              One Engine. <br/> 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-emerald-400 to-indigo-400">Pure Power.</span>
            </h1>

            <p className="text-slate-400 text-lg md:text-xl font-medium leading-relaxed">
              Professional business control for independent freelancers. No tiers. No complexity. 
              Everything unlocked for <span className="text-white">£4.99/mo</span>.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { icon: 'fa-brain', title: 'Smart AI Coach', desc: 'Growth analytics and strategic advice included.' },
                { icon: 'fa-cloud-arrow-up', title: 'Global Sync', desc: 'Secure cloud backup on all devices.' },
                { icon: 'fa-calendar-check', title: 'Auto-Schedule', desc: 'Google Calendar sync built-in.' },
                { icon: 'fa-file-invoice-dollar', title: 'Financials', desc: 'Quotes and invoicing made effortless.' }
              ].map((f, i) => (
                <div key={i} className="flex gap-4 p-4 bg-white/5 border border-white/10 rounded-2xl">
                  <i className={`fa-solid ${f.icon} text-indigo-400 text-sm mt-1`}></i>
                  <div>
                    <h3 className="text-xs font-black mb-1">{f.title}</h3>
                    <p className="text-slate-500 text-[10px] leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500/10 blur-[100px] rounded-full"></div>
            <div className="relative z-20">
              <Auth onSuccess={() => window.location.reload()} />
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-20 px-6 mt-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
               <i className="fa-solid fa-bolt text-sm"></i>
             </div>
             <span className="text-xl font-black uppercase tracking-widest">FreelanceOS</span>
          </div>
          <p className="text-slate-600 text-[10px] font-bold">© 2025 FreelanceOS. Simple Business Control.</p>
        </div>
      </footer>
    </div>
  );
};