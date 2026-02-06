
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate, Link, Outlet, useLocation } from 'react-router-dom';

import { Navigation } from './components/Navigation';
import { Dashboard } from './pages/Dashboard';
import { Jobs } from './pages/Jobs';
import { JobDetails } from './pages/JobDetails';
import { Clients } from './pages/Clients';
import { Invoices } from './pages/Invoices';
import { Mileage } from './pages/Mileage';
import { Quotes } from './pages/Quotes';
import { Settings } from './pages/Settings';
import { Landing } from './pages/Landing'; 
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
import { CreateJobModal } from './components/CreateJobModal';
import { AppState, Tenant, JobStatus, InvoiceStatus, UserPlan, Job, JobItem } from './types';
import { DB, getSupabase } from './services/db';
import { fetchGoogleEvents, syncJobToGoogle } from './services/googleCalendar';
import { checkSubscriptionStatus } from './utils';

/**
 * Error Boundary Component to prevent Blank Screens
 */
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("FreelanceOS Error Boundary caught crash:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center mb-6 border border-rose-500/20">
            <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
          </div>
          <h1 className="text-white text-2xl font-black mb-2 tracking-tight">Workspace Crash Detected</h1>
          <p className="text-slate-400 max-w-md mb-8 text-sm font-medium">A technical protocol failure occurred. Your data is safe in the cloud, but the interface needs a hard reset.</p>
          <button 
            onClick={() => window.location.href = window.location.origin + window.location.pathname}
            className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all"
          >
            Re-Initialize Workspace
          </button>
          <pre className="mt-12 text-[9px] text-slate-700 font-mono uppercase bg-black/20 p-4 rounded-xl max-w-2xl overflow-x-auto">
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Layout Wrapper
const MainLayout: React.FC<{
  isSyncing: boolean;
  currentUser: Tenant | null;
  isReadOnly: boolean;
  isNewJobModalOpen: boolean;
  setIsNewJobModalOpen: (open: boolean) => void;
  clients: any[];
  onSaveJob: (job: Job, items: JobItem[], clientName: string) => Promise<void>;
}> = ({ 
  isSyncing, currentUser, isReadOnly, 
  isNewJobModalOpen, setIsNewJobModalOpen, clients, onSaveJob 
}) => {
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-50 overflow-hidden relative">
      <Navigation isSyncing={isSyncing} user={currentUser} />
      {isReadOnly && (
        <div className="fixed top-0 left-0 right-0 bg-rose-600 text-white py-2 text-center z-[200] text-[10px] font-black uppercase tracking-[0.2em] shadow-lg">
           Trial Period Expired. Access is currently Read-Only. <Link to="/settings" className="underline ml-2 hover:text-rose-100 transition-colors">Reactivate Elite Plan</Link>
        </div>
      )}
      <main className={`flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 custom-scrollbar ${isReadOnly ? 'pt-12' : ''}`}>
        <div className="max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
      <CreateJobModal 
        isOpen={isNewJobModalOpen} 
        onClose={() => setIsNewJobModalOpen(false)} 
        clients={clients} 
        tenant_id={currentUser?.email || ''}
        onSave={onSaveJob}
      />
    </div>
  );
};

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

  const subStatus = useMemo(() => checkSubscriptionStatus(currentUser), [currentUser]);
  const isReadOnly = useMemo(() => subStatus.isTrialExpired && currentUser?.plan !== UserPlan.ACTIVE, [subStatus, currentUser]);

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

      const [clients, jobs, invoices, mileage, quotes] = await Promise.allSettled([
        DB.getClients(),
        DB.getJobs(),
        DB.getInvoices(),
        DB.getMileage(),
        DB.getQuotes()
      ]);

      const getVal = (res: any) => res.status === 'fulfilled' ? res.value : [];
      
      const reconciledJobs = (getVal(jobs) || []).map((job: Job) => {
        const inv = (getVal(invoices) || []).find((i: any) => i.jobId === job.id);
        if (inv?.status === InvoiceStatus.PAID && job.status !== JobStatus.COMPLETED) {
          return { ...job, status: JobStatus.COMPLETED };
        }
        return job;
      });

      const googleEvents = token ? await fetchGoogleEvents(user.email, token).catch(() => []) : [];

      setCurrentUser(user);
      setAppState({
        user,
        clients: getVal(clients) || [],
        jobs: reconciledJobs,
        quotes: getVal(quotes) || [],
        invoices: getVal(invoices) || [],
        mileage: getVal(mileage) || [],
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

    const safetyTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 8000);

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
        clearTimeout(safetyTimeout);
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
        clearTimeout(safetyTimeout);
        subscription.unsubscribe();
      };
    }
    return () => clearTimeout(safetyTimeout);
  }, [loadData]);

  const handleSaveNewJob = async (job: Job, items: JobItem[], clientName: string) => {
    if (isReadOnly) {
      alert("Workspace is currently read-only. Please reactivate your subscription.");
      return;
    }
    
    await DB.saveJob(job);
    await DB.saveJobItems(job.id, items);
    
    setAppState(prev => ({
      ...prev,
      jobs: [job, ...prev.jobs]
    }));

    const token = await getLatestToken();
    if (token) await syncJobToGoogle(job, token, clientName);
    
    await loadData();
  };

  if (isLoading) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-6 p-4">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <div className="text-center">
        <p className="text-white text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">Establishing Secure Workspace</p>
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          
          <Route path="/" element={!currentUser ? <Landing /> : <Navigate to="/dashboard" replace />} />
          
          <Route path="/" element={
            <MainLayout 
              isSyncing={isSyncing} 
              currentUser={currentUser} 
              isReadOnly={isReadOnly} 
              isNewJobModalOpen={isNewJobModalOpen}
              setIsNewJobModalOpen={setIsNewJobModalOpen}
              clients={appState.clients}
              onSaveJob={handleSaveNewJob}
            />
          }>
            <Route path="dashboard" element={<Dashboard state={appState} onNewJobClick={() => !isReadOnly && setIsNewJobModalOpen(true)} onSyncCalendar={() => loadData(currentUser)} isSyncing={isSyncing} />} />
            <Route path="jobs" element={<Jobs state={appState} onNewJobClick={() => !isReadOnly && setIsNewJobModalOpen(true)} onRefresh={loadData} />} />
            <Route path="jobs/:id" element={<JobDetails onRefresh={loadData} googleAccessToken={googleAccessToken} />} />
            <Route path="clients" element={<Clients state={appState} onRefresh={loadData} />} />
            <Route path="quotes" element={<Quotes state={appState} onRefresh={loadData} />} />
            <Route path="invoices" element={<Invoices state={appState} onRefresh={loadData} googleAccessToken={googleAccessToken} />} />
            <Route path="mileage" element={<Mileage state={appState} onRefresh={loadData} />} />
            <Route path="settings" element={<Settings user={currentUser} onLogout={() => DB.signOut().then(() => window.location.reload())} onRefresh={loadData} />} />
          </Route>

          <Route path="*" element={<Navigate to={currentUser ? "/dashboard" : "/"} replace />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;
