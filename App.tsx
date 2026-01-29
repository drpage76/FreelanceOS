import React, { useState, useEffect, useCallback, useRef } from 'react';
// Use direct named imports from react-router-dom to avoid property access errors
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

import { Navigation } from './components/Navigation';
import { Dashboard } from './pages/Dashboard';
import { Jobs } from './pages/Jobs';
import { JobDetails } from './pages/JobDetails';
import { Clients } from './pages/Clients';
import { Invoices } from './pages/Invoices';
import { Quotes } from './pages/Quotes';
import { Mileage } from './pages/Mileage';
import { Assistant } from './pages/Assistant';
import { Settings } from './pages/Settings';
import { Landing } from './pages/Landing'; 
import { CreateJobModal } from './components/CreateJobModal';
import { AppState, Tenant, JobStatus, InvoiceStatus } from './types';
import { DB, getSupabase } from './services/db';
import { fetchGoogleEvents, syncJobToGoogle } from './services/googleCalendar';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<Tenant | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | undefined>(undefined);
  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const isInitializing = useRef(false);
  const hasLoadedOnce = useRef(false);
  const syncInProgress = useRef(false);
  
  const [appState, setAppState] = useState<AppState>({
    user: null, clients: [], jobs: [], quotes: [], externalEvents: [], jobItems: [], invoices: [], mileage: [],
  });

  const getLatestToken = useCallback(async () => {
    const client = getSupabase();
    if (!client) return undefined;
    try {
      const { data: { session } } = await (client.auth as any).getSession();
      return session?.provider_token || session?.access_token;
    } catch (e) {
      return undefined;
    }
  }, []);

  const loadData = useCallback(async (forcedUser?: Tenant) => {
    if (syncInProgress.current) return;
    syncInProgress.current = true;
    setIsSyncing(true);
    
    try {
      const user = forcedUser || await DB.getCurrentUser();
      if (!user) {
        setAppState(prev => ({ ...prev, user: null }));
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }

      const token = await getLatestToken();
      if (token) setGoogleAccessToken(token);

      const [clients, jobs, invoices, mileage, quotes] = await Promise.all([
        DB.getClients().catch(() => []),
        DB.getJobs().catch(() => []),
        DB.getInvoices().catch(() => []),
        DB.getMileage().catch(() => []),
        DB.getQuotes().catch(() => [])
      ]);

      const reconciledJobs = (jobs || []).map(job => {
        const inv = (invoices || []).find(i => i.jobId === job.id);
        if (inv?.status === InvoiceStatus.PAID && job.status !== JobStatus.COMPLETED) {
          return { ...job, status: JobStatus.COMPLETED };
        }
        return job;
      });

      const googleEvents = token ? await fetchGoogleEvents(user.email, token).catch(() => []) : [];

      setCurrentUser(user);
      setAppState({
        user,
        clients: clients || [],
        jobs: reconciledJobs,
        quotes: quotes || [],
        invoices: invoices || [],
        mileage: mileage || [],
        externalEvents: googleEvents || [],
        jobItems: []
      });
      hasLoadedOnce.current = true;
    } catch (err) {
      console.error("Critical Load Error:", err);
    } finally {
      setIsSyncing(false);
      syncInProgress.current = false;
      setIsLoading(false);
    }
  }, [getLatestToken]);

  useEffect(() => {
    if (isInitializing.current) return;
    isInitializing.current = true;

    // Failsafe: Force stop loading after 6 seconds if DB doesn't respond
    const failsafe = setTimeout(() => {
      if (isLoading) {
        console.warn("Initialization taking too long. Forcing app start.");
        setIsLoading(false);
      }
    }, 6000);

    const init = async () => {
      try {
        await DB.initializeSession();
        const user = await DB.getCurrentUser();
        if (user) {
          setCurrentUser(user);
          await loadData(user);
        } else {
          setIsLoading(false);
        }
      } catch (e) {
        console.error("Initialization Failed:", e);
        setIsLoading(false);
      } finally {
        clearTimeout(failsafe);
      }
    };

    init();

    const client = getSupabase();
    if (client) {
      const { data: { subscription } } = (client.auth as any).onAuthStateChange(async (event: string, session: any) => {
        if (event === 'SIGNED_IN' && !hasLoadedOnce.current) {
          const user = await DB.getCurrentUser();
          if (user) {
            setCurrentUser(user);
            loadData(user);
          }
        }
        if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
          hasLoadedOnce.current = false;
          setAppState({
            user: null, clients: [], jobs: [], quotes: [], externalEvents: [], jobItems: [], invoices: [], mileage: [],
          });
          setIsLoading(false);
        }
      });
      return () => {
        subscription.unsubscribe();
        clearTimeout(failsafe);
      };
    }
  }, [loadData, isLoading]);

  if (isLoading) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-6">
      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <div className="text-center">
        <p className="text-white text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Establishing Secure Workspace</p>
        <p className="text-slate-500 text-[8px] font-bold uppercase tracking-widest mt-4">Checking Cloud Protocols...</p>
      </div>
    </div>
  );

  if (!currentUser) return <Landing />; 

  return (
    <HashRouter>
      <div className="flex flex-col md:flex-row h-screen bg-slate-50 overflow-hidden">
        <Navigation isSyncing={isSyncing} user={currentUser} />
        <main className="flex-1 p-3 md:p-6 overflow-y-auto flex flex-col custom-scrollbar">
          <Routes>
            <Route path="/" element={<Dashboard state={appState} onNewJobClick={() => setIsNewJobModalOpen(true)} onSyncCalendar={() => loadData(currentUser)} isSyncing={isSyncing} />} />
            <Route path="/jobs" element={<Jobs state={appState} onNewJobClick={() => setIsNewJobModalOpen(true)} onRefresh={loadData} />} />
            <Route path="/jobs/:id" element={<JobDetails onRefresh={loadData} googleAccessToken={googleAccessToken} />} />
            <Route path="/quotes" element={<Quotes state={appState} onRefresh={loadData} />} />
            <Route path="/clients" element={<Clients state={appState} onRefresh={loadData} />} />
            <Route path="/invoices" element={<Invoices state={appState} onRefresh={loadData} />} />
            <Route path="/mileage" element={<Mileage state={appState} onRefresh={loadData} />} />
            <Route path="/assistant" element={<Assistant state={appState} />} />
            <Route path="/settings" element={<Settings user={currentUser} onLogout={() => DB.signOut().then(() => window.location.reload())} onRefresh={loadData} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
      <CreateJobModal 
        isOpen={isNewJobModalOpen} 
        onClose={() => setIsNewJobModalOpen(false)} 
        clients={appState.clients} 
        tenant_id={currentUser?.email}
        onSave={async (job, items, clientName) => {
          await DB.saveJob(job);
          await DB.saveJobItems(job.id, items);
          const token = await getLatestToken();
          if (token) await syncJobToGoogle(job, token, clientName);
          await loadData();
        }} 
      />
    </HashRouter>
  );
};

export default App;