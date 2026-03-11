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

      {/* Top Nav */}
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
      <main className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-8 flex-1 flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 xl:gap-16 items-center w-full">
          {/* Left */}
          <div className="space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 shadow-inner">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_#10b981]" />
              Professional Business Operating System
            </div>

            <div className="space-y-3">
              <div className="text-[10px] sm:text-xs font-black uppercase tracking-[0.35em] text-slate-500">
                FreelanceOS by PageTech Creative Ltd
              </div>

              <h1 className="text-4xl sm:text-6xl xl:text-7xl font-black tracking-tighter leading-[0.98] text-white italic">
                Jobs, invoices,
                <br />
                and time —
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-emerald-400 to-indigo-400">
                  simplified.
                </span>
              </h1>
            </div>

            <p className="text-slate-400 text-base sm:text-xl font-medium leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Built for independent professionals who want jobs, scheduling, invoices, mileage and business visibility
              in one clean system.
            </p>

            {/* Compact pricing strip */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 max-w-3xl mx-auto lg:mx-0">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Monthly</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-white">£9.99</p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">per month + VAT</p>
              </div>

              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">Annual</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-white">£99.99</p>
                <p className="mt-1 text-[10px] font-bold text-emerald-200">per year + VAT</p>
              </div>

              <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300">Beta Offer</p>
                <p className="mt-2 text-base font-black tracking-tight text-white">10% off for life</p>
                <p className="mt-1 text-[10px] font-bold text-indigo-200">for early adopters</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Access</p>
                <p className="mt-2 text-base font-black tracking-tight text-white">No tiers</p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">full access to every feature</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
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
          </div>

          {/* Right - generic product mock, not real data */}
          <div className="relative w-full">
            <div className="relative group max-w-2xl mx-auto">
              <div className="absolute inset-0 bg-indigo-500/20 blur-[60px] rounded-full group-hover:bg-indigo-500/30 transition-all duration-700 animate-pulse" />

              <div className="bg-slate-800/40 border border-white/10 p-2 rounded-[32px] backdrop-blur-3xl relative z-10 shadow-2xl">
                <div className="overflow-hidden rounded-[24px] bg-slate-950 border border-white/5">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-white/[0.03]">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">
                        Workspace Preview
                      </p>
                      <p className="text-sm font-black text-white mt-1">
                        FreelanceOS <span className="text-slate-500 font-bold">by PageTech Creative Ltd</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400/70" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Jobs</p>
                        <p className="text-2xl font-black text-white mt-2">24</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mt-1">
                          Active workflow
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Invoices</p>
                        <p className="text-2xl font-black text-white mt-2">12</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mt-1">
                          Sent this month
                        </p>
                      </div>

                      <div className="rounded-2xl bg-indigo-500/10 border border-indigo-400/20 p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Visibility</p>
                        <p className="text-2xl font-black text-white mt-2">Full</p>
                        <div className="w-full h-1.5 rounded-full bg-white/10 mt-3 overflow-hidden">
                          <div className="h-full w-[88%] bg-indigo-500 rounded-full" />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                          Core Tools
                        </p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">
                          All Included
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {[
                          "Jobs & scheduling",
                          "Client management",
                          "Invoices & financials",
                          "Mileage tracking",
                          "Dashboard reporting",
                          "Google sign-in",
                        ].map((item) => (
                          <div
                            key={item}
                            className="flex items-center gap-2 rounded-xl bg-slate-900/70 border border-white/5 px-3 py-2"
                          >
                            <i className="fa-solid fa-circle-check text-emerald-400 text-xs" />
                            <span className="text-[10px] font-bold text-slate-300">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">
                        Built For Independent Professionals
                      </p>
                      <div className="grid grid-cols-4 gap-3">
                        {[
                          { label: "Jobs", icon: "fa-briefcase" },
                          { label: "Calendar", icon: "fa-calendar-check" },
                          { label: "Invoices", icon: "fa-file-invoice-dollar" },
                          { label: "Mileage", icon: "fa-map-location-dot" },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="rounded-xl bg-slate-900/70 border border-white/5 p-3 flex flex-col items-center justify-center text-center"
                          >
                            <i className={`fa-solid ${item.icon} text-indigo-400 text-sm mb-2`} />
                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-center lg:text-left">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Product preview — illustrative layout only
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-50 border-t border-white/5 bg-slate-900/80 backdrop-blur-xl py-6 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-wrap justify-center items-center gap-6">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] opacity-30">
              FREELANCEOS BY PAGETECH CREATIVE LTD
            </span>
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
            © 2026 PAGETECH CREATIVE LTD. FREELANCEOS — JOBS, INVOICES, AND TIME — SIMPLIFIED.
          </p>
        </div>
      </footer>
    </div>
  );
};