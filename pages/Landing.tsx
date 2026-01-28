import React, { useState } from 'react';
import { Auth } from '../components/Auth';

export const Landing: React.FC = () => {
  const [showAuth, setShowAuth] = useState(false);

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
        <div className="flex items-center gap-8">
          <a href="#features" className="hidden md:block text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Features</a>
          <button 
            onClick={() => setShowAuth(true)}
            className="px-6 py-2.5 bg-white text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-400 hover:text-white transition-all shadow-lg"
          >
            Start 3-Month Free Trial
          </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-40">
        {showAuth ? (
          <div className="max-w-md mx-auto animate-in fade-in zoom-in-95 duration-500">
            <Auth onSuccess={() => window.location.reload()} />
            <button 
              onClick={() => setShowAuth(false)}
              className="w-full mt-6 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400 transition-colors"
            >
              <i className="fa-solid fa-arrow-left mr-2"></i> Back to product info
            </button>
          </div>
        ) : (
          <div className="text-center space-y-24">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-4">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                Beta Launch Special: 3 Months Free
              </div>
              
              <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-tight max-w-5xl mx-auto">
                Professional power <br/> 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-emerald-400 to-indigo-400 animate-pulse-soft">for every freelancer.</span>
              </h1>

              <p className="text-slate-400 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
                The business engine for independent pros. Everything is included. No "Lite" versions. Just full power for <span className="text-white">£4.99/mo</span>.
              </p>

              <div className="flex flex-col md:flex-row items-center justify-center gap-6 pt-8">
                <button 
                  onClick={() => setShowAuth(true)}
                  className="px-12 py-5 bg-indigo-600 text-white rounded-[24px] font-black text-lg shadow-2xl shadow-indigo-500/30 hover:bg-indigo-500 hover:scale-105 transition-all group"
                >
                  Join Beta — 90 Days Free <i className="fa-solid fa-arrow-right ml-3 group-hover:translate-x-1 transition-transform"></i>
                </button>
              </div>
            </div>

            <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-20">
              {[
                { icon: 'fa-brain', title: 'Full AI Intelligence', desc: 'Every user gets our Gemini 3.0 Strategic Hub to analyze growth and day-rates. No restrictions.' },
                { icon: 'fa-cloud-arrow-up', title: 'Unlimited Cloud Sync', desc: 'Secure, real-time multi-device sync with Supabase included for all founders.' },
                { icon: 'fa-calendar-check', title: 'Google Integration', desc: 'Live calendar routing and Google Search grounding to keep your production schedule automated.' }
              ].map((f, i) => (
                <div key={i} className="p-10 bg-white/5 border border-white/10 rounded-[40px] text-left hover:border-indigo-500/50 transition-all">
                  <i className={`fa-solid ${f.icon} text-indigo-400 text-2xl mb-6`}></i>
                  <h3 className="text-xl font-black mb-3">{f.title}</h3>
                  <p className="text-slate-500 text-sm font-medium leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>

            <div className="pt-20">
               <div className="bg-indigo-600 p-12 md:p-20 rounded-[60px] text-center shadow-2xl shadow-indigo-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-12 opacity-10">
                    <i className="fa-solid fa-crown text-[200px]"></i>
                  </div>
                  <h2 className="text-4xl md:text-6xl font-black mb-6">Simple Pricing. Pure Value.</h2>
                  <p className="text-indigo-100 text-lg mb-12 max-w-xl mx-auto">Try everything for 90 days. If it doesn't transform your business, you pay nothing. After that, it's just £4.99.</p>
                  <div className="flex flex-col items-center">
                    <div className="text-7xl font-black mb-2">£4.99<span className="text-lg text-indigo-300">/mo</span></div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-200">Everything Included • No Hidden Tiers</p>
                  </div>
                  <button onClick={() => setShowAuth(true)} className="mt-12 px-12 py-5 bg-white text-indigo-600 rounded-[24px] font-black text-lg shadow-xl hover:bg-indigo-50 transition-all">Claim Founder Access</button>
               </div>
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 border-t border-white/10 py-20 px-6 mt-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
               <i className="fa-solid fa-bolt text-sm"></i>
             </div>
             <span className="text-xl font-black uppercase tracking-widest">FreelanceOS</span>
          </div>
          <p className="text-slate-600 text-[10px] font-bold">© 2025 FreelanceOS. Beta Access Program.</p>
        </div>
      </footer>
    </div>
  );
};