
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router';

import { Navigation } from './components/Navigation';
import { Dashboard } from './pages/Dashboard';
import { Jobs } from './pages/Jobs';
import { JobDetails } from './pages/JobDetails';
import { Clients } from './pages/Clients';
import { Invoices } from './pages/Invoices';
import { Mileage } from './pages/Mileage';
import { Settings } from './pages/Settings';
import { Landing } from './pages/Landing'; 
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
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
  
  const hasLoadedOnce = useRef(false);
  const syncInProgress = useRef(false);
  const initializationStarted = useRef(false);
  
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
        setAppState(prev => ({ ...prev, user: null, jobs: [] }));
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
      console.error("Data Load Error:", err);
    } finally {
      setIsSyncing(false);
      syncInProgress.current = false;
      setIsLoading(false);
    }
  }, [getLatestToken]);

  useEffect(() => {
    if (initializationStarted.current) return;
    initializationStarted.current = true;

    // Failsafe timer to prevent stuck loading screen
    const failsafe = setTimeout(() => {
      if (isLoading) {
        console.warn("Failsafe triggered: Initialization timeout. Starting app.");
        setIsLoading(false);
      }
    }, 5000);

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
        console.error("Initialization error:", e);
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
          setAppState({ user: null, clients: [], jobs: [], quotes: [], externalEvents: [], jobItems: [], invoices: [], mileage: [] });
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
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-6 p-4">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <div className="text-center">
        <p className="text-white text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Establishing Secure Workspace</p>
        <button 
          onClick={() => setIsLoading(false)} 
          className="mt-8 text-slate-500 text-[9px] font-black uppercase tracking-widest hover:text-white transition-colors"
        >
          Skip Synchronization
        </button>
      </div>
    </div>
  );

  const AppLayout = ({ children }: { children: React.ReactNode }) => (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-50 overflow-hidden relative">
      <Navigation isSyncing={isSyncing} user={currentUser} />
      <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 custom-scrollbar">
        <div className="max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
      <CreateJobModal 
        isOpen={isNewJobModalOpen} 
        onClose={() => setIsNewJobModalOpen(false)} 
        clients={appState.clients} 
        tenant_id={currentUser?.email || ''}
        onSave={async (job, items, clientName) => {
          await DB.saveJob(job);
          await DB.saveJobItems(job.id, items);
          const token = await getLatestToken();
          if (token) await syncJobToGoogle(job, token, clientName);
          await loadData();
        }} 
      />
    </div>
  );

  return (
    <HashRouter>
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        {!currentUser ? (
          <>
            <Route path="/" element={<Landing />} />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        ) : (
          <>
            <Route path="/" element={<AppLayout><Dashboard state={appState} onNewJobClick={() => setIsNewJobModalOpen(true)} onSyncCalendar={() => loadData(currentUser)} isSyncing={isSyncing} /></AppLayout>} />
            <Route path="/jobs" element={<AppLayout><Jobs state={appState} onNewJobClick={() => setIsNewJobModalOpen(true)} onRefresh={loadData} /></AppLayout>} />
            <Route path="/jobs/:id" element={<AppLayout><JobDetails onRefresh={loadData} googleAccessToken={googleAccessToken} /></AppLayout>} />
            <Route path="/clients" element={<AppLayout><Clients state={appState} onRefresh={loadData} /></AppLayout>} />
            <Route path="/invoices" element={<AppLayout><Invoices state={appState} onRefresh={loadData} googleAccessToken={googleAccessToken} /></AppLayout>} />
            <Route path="/mileage" element={<AppLayout><Mileage state={appState} onRefresh={loadData} /></AppLayout>} />
            <Route path="/settings" element={<AppLayout><Settings user={currentUser} onLogout={() => DB.signOut().then(() => window.location.reload())} onRefresh={loadData} /></AppLayout>} />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        )}
      </Routes>
    </HashRouter>
  );
};

export default App;
