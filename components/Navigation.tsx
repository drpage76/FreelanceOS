
import React, { useEffect, useState } from 'react';
// Fix: Use namespace import for react-router-dom to resolve exported member errors
import * as ReactRouterDOM from 'react-router-dom';

const { Link, useLocation } = ReactRouterDOM;

import { Tenant, UserPlan } from '../types';
import { DB } from '../services/db';

interface NavItemProps {
  to: string;
  icon: string;
  label: string;
  active: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label, active }) => (
  <Link 
    to={to} 
    className={`flex flex-col md:flex-row items-center p-3 md:px-4 md:py-2.5 rounded-xl transition-all ${
      active ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100'
    }`}
  >
    <i className={`fa-solid ${icon} md:mr-3 text-lg`}></i>
    <span className="text-[9px] md:text-sm font-bold mt-1 md:mt-0">{label}</span>
  </Link>
);

export const Navigation: React.FC<{ isSyncing?: boolean; user?: Tenant | null }> = ({ isSyncing, user }) => {
  const location = useLocation();
  const isPro = user?.plan && user.plan !== UserPlan.FREE;
  const [cloudActive, setCloudActive] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      if (!DB.isCloudConfigured()) {
        setCloudActive(false);
        return;
      }
      const result = await DB.testConnection();
      setCloudActive(result.success);
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="no-print fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 md:relative md:border-t-0 md:h-screen md:w-64 md:border-r p-2 md:p-4 z-50 flex flex-col">
      <div className="hidden md:flex flex-col mb-8 px-2">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white mr-3 shadow-lg shadow-indigo-100">
            <i className="fa-solid fa-bolt text-xl"></i>
          </div>
          <h1 className="font-black text-xl tracking-tight leading-none text-slate-900">Freelance<br/>OS</h1>
        </div>
        {isPro && (
          <span className="mt-2 text-[8px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full self-start border border-indigo-100 uppercase">
            Cloud Professional
          </span>
        )}
      </div>

      <div className="flex justify-around md:flex-col md:space-y-1 flex-1 overflow-y-auto custom-scrollbar">
        <NavItem to="/" icon="fa-chart-pie" label="Dashboard" active={location.pathname === '/'} />
        <NavItem to="/jobs" icon="fa-briefcase" label="Jobs" active={location.pathname.startsWith('/jobs')} />
        <NavItem to="/clients" icon="fa-users" label="Clients" active={location.pathname.startsWith('/clients')} />
        <NavItem to="/invoices" icon="fa-file-invoice-dollar" label="Financials" active={location.pathname.startsWith('/invoices')} />
        <NavItem to="/mileage" icon="fa-car-side" label="Mileage" active={location.pathname === '/mileage'} />
        <NavItem to="/assistant" icon="fa-robot" label="AI Coach" active={location.pathname === '/assistant'} />
        <NavItem to="/settings" icon="fa-gear" label="Settings" active={location.pathname === '/settings'} />
      </div>

      <div className="hidden md:block p-4 mt-auto border-t border-slate-100">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-indigo-500 animate-pulse' : cloudActive ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
          </div>
          <span className={`text-[10px] font-black uppercase tracking-widest ${cloudActive ? 'text-slate-400' : 'text-rose-500'}`}>
            {isSyncing ? 'Syncing...' : cloudActive ? 'Cloud Active' : 'Offline'}
          </span>
        </div>
      </div>
    </nav>
  );
};
