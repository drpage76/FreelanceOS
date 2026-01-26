
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
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-xl shadow-indigo-500/20">
            <i className="fa-solid fa-bolt text-xl"></i>
          </div>
          <span className="text-xl font-black tracking-tighter">Freelance<span className="text-indigo-400">OS</span></span>
        </div>
        <div className="flex items-center gap-8">
          <a href="#features" className="hidden md:block text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hidden md:block text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Pricing</a>
          <button 
            onClick={() => setShowAuth(true)}
            className="px-6 py-2.5 bg-white text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-400 hover:text-white transition-all shadow-lg"
          >
            Launch Console
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
          <div className="text-center space-y-12">
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-4 animate-bounce">
              <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
              The Operating System for Modern Professionals
            </div>
            
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-tight max-w-5xl mx-auto">
              Jobs, invoices, and time <br/> 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-emerald-400 to-indigo-400 animate-pulse-soft">— simplified.</span>
            </h1>

            <p className="text-slate-400 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
              The only tool you need to run your one-person business. From the first quote to the final payment, all synchronized in your private cloud.
            </p>

            <div className="flex flex-col md:flex-row items-center justify-center gap-6 pt-8">
              <button 
                onClick={() => setShowAuth(true)}
                className="px-12 py-5 bg-indigo-600 text-white rounded-[24px] font-black text-lg shadow-2xl shadow-indigo-500/30 hover:bg-indigo-500 hover:scale-105 transition-all group"
              >
                Get Started for Free <i className="fa-solid fa-arrow-right ml-3 group-hover:translate-x-1 transition-transform"></i>
              </button>
              <div className="text-left">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                  No credit card required
                </p>
                <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">
                  FreelanceOS.org — Domain Verified
                </p>
              </div>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-32" id="features">
              {[
                { 
                  icon: 'fa-briefcase', 
                  title: 'Job Management', 
                  desc: 'Track every project from potential lead to completed delivery. Full status workflow with shift-based or continuous scheduling.' 
                },
                { 
                  icon: 'fa-calendar-day', 
                  title: 'Calendar Entries', 
                  desc: 'Visualize your entire month at a glance. Bi-directional sync with Google Calendar keeps your schedule perfectly aligned.' 
                },
                { 
                  icon: 'fa-file-invoice-dollar', 
                  title: 'Quotes & Invoicing', 
                  desc: 'Professional document generation built-in. Convert accepted quotations into active jobs with a single click. (Lite Ready)' 
                },
                { 
                  icon: 'fa-users-gear', 
                  title: 'Client Management', 
                  desc: 'A robust CRM for your billing contacts. Store payment terms, multiple addresses, and full project history per entity.' 
                }
              ].map((feat, i) => (
                <div key={i} className="p-8 bg-white/5 border border-white/10 rounded-[40px] text-left hover:bg-white/[0.08] transition-all hover:border-white/20 group">
                  <div className="w-12 h-12 bg-indigo-600/20 border border-indigo-600/30 rounded-2xl flex items-center justify-center text-indigo-400 mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <i className={`fa-solid ${feat.icon} text-lg`}></i>
                  </div>
                  <h3 className="text-lg font-black mb-3">{feat.title}</h3>
                  <p className="text-slate-400 font-medium leading-relaxed text-xs">{feat.desc}</p>
                </div>
              ))}
            </div>

            {/* Cloud Teaser */}
            <div className="mt-20 p-10 bg-gradient-to-br from-indigo-900/40 to-slate-900/40 border border-white/5 rounded-[50px] max-w-4xl mx-auto text-left flex flex-col md:flex-row items-center gap-10">
              <div className="flex-1">
                 <h2 className="text-3xl font-black mb-4">Enterprise infrastructure for everyone.</h2>
                 <p className="text-slate-400 font-medium text-sm leading-relaxed mb-6">
                   Every account includes a private Supabase instance and Gemini AI coaching options. Whether you are on the Lite tier or Pro, your data is secure and portable.
                 </p>
                 <div className="flex gap-4">
                    <span className="px-3 py-1 bg-white/5 rounded-lg text-[9px] font-black uppercase border border-white/10">Supabase Cloud</span>
                    <span className="px-3 py-1 bg-white/5 rounded-lg text-[9px] font-black uppercase border border-white/10">Gemini 3.0</span>
                    <span className="px-3 py-1 bg-white/5 rounded-lg text-[9px] font-black uppercase border border-white/10">Google Search</span>
                 </div>
              </div>
              <div className="w-48 h-48 bg-indigo-600/20 rounded-[40px] flex items-center justify-center border border-indigo-500/30">
                 <i className="fa-solid fa-cloud-bolt text-6xl text-indigo-400"></i>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 border-t border-white/10 py-20 px-6 mt-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
               <i className="fa-solid fa-bolt text-sm"></i>
             </div>
             <span className="text-sm font-black uppercase tracking-widest">FreelanceOS</span>
          </div>
          <div className="flex gap-10 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <a href="#" className="hover:text-indigo-400 transition-colors">Security</a>
            <a href="#" className="hover:text-indigo-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-indigo-400 transition-colors">Terms</a>
            <a href="https://freelanceos.org" className="text-indigo-400">FreelanceOS.org</a>
          </div>
          <p className="text-slate-600 text-[10px] font-bold">© 2025 FreelanceOS. Operating at the speed of logic.</p>
        </div>
      </footer>
    </div>
  );
};
