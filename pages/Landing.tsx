import React, { useState } from "react";
import { Auth } from "../components/Auth";
import { Link, useNavigate } from "react-router-dom";

export const Landing: React.FC = () => {
  const [showAuth, setShowAuth] = useState(false);
  const [initialIsSignUp, setInitialIsSignUp] = useState(false);
  const navigate = useNavigate();

  const openAuth = (isSignUp: boolean) => {
    setInitialIsSignUp(isSignUp);
    setShowAuth(true);
  };

  const handleAuthSuccess = () => {
    setShowAuth(false);
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 text-white selection:bg-indigo-500 selection:text-white overflow-hidden flex flex-col relative">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-600 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600 rounded-full blur-[140px]" />
      </div>

      {/* Auth Modal */}
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
                aria-label="Close"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-900/60 backdrop-blur-2xl shadow-2xl shadow-indigo-500/10 p-6">
              <Auth initialIsSignUp={initialIsSignUp} onSuccess={handleAuthSuccess} />
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="relative z-50 max-w-7xl mx-auto w-full px-4 sm:px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-2xl shadow-indigo-500/40 shrink-0">
            <i className="fa-solid fa-bolt text-lg" />
          </div>
          <div className="leading-tight">
            <div className="text-xl font-black tracking-tighter">
              Freelance<span className="text-indigo-400">OS</span>
            </div>
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
              by PageTech Creative Ltd
            </div>
          </div>
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
            Start Free Trial
          </button>
        </div>
      </nav>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-8">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_360px] gap-8 xl:gap-10 items-center">
            {/* Left */}
            <div className="min-w-0">
              <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 shadow-inner mb-5">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]" />
                Professional Business Operating System
              </div>

              <h1 className="text-4xl sm:text-6xl lg:text-7xl xl:text-[6.4rem] font-black tracking-tighter leading-[0.9] text-white italic max-w-[12ch]">
                Jobs, invoices, and time —
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-emerald-400 to-indigo-400">
                  simplified.
                </span>
              </h1>

              <p className="mt-5 text-slate-400 text-lg sm:text-xl xl:text-2xl font-medium leading-relaxed max-w-4xl">
                FreelanceOS helps independent professionals manage jobs, invoices, mileage and business visibility in one
                clean system.
              </p>
            </div>

            {/* Right / stacked boxes */}
            <div className="flex flex-col gap-3 w-full max-w-[360px] xl:ml-auto">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Monthly</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-white">£9.99</p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">per month + VAT</p>
              </div>

              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">Annual</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-white">£99.99</p>
                <p className="mt-1 text-[10px] font-bold text-emerald-200">per year + VAT</p>
              </div>

              <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 px-5 py-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300">Beta Offer</p>
                <p className="mt-2 text-xl font-black tracking-tight text-white">10% off for life</p>
                <p className="mt-1 text-[10px] font-bold text-indigo-200">for early adopters</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Access</p>
                <p className="mt-2 text-xl font-black tracking-tight text-white">No tiers</p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">all features included</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-50 border-t border-white/5 bg-slate-900/80 backdrop-blur-xl py-5 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-wrap justify-center items-center gap-6">
            <Link
              to="/privacy"
              className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-400"
            >
              Terms
            </Link>
          </div>
          <p className="text-slate-600 text-[9px] font-black uppercase tracking-[0.2em] text-center">
            © 2026 PAGETECH CREATIVE LTD
          </p>
        </div>
      </footer>
    </div>
  );
};