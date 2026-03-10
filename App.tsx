// src/App.tsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { HashRouter, Routes, Route, Navigate, Link, Outlet } from "react-router-dom";

import { Navigation } from "./components/Navigation";

import { Dashboard } from "./pages/Dashboard";
import { Jobs } from "./pages/Jobs";
import { JobDetails } from "./pages/JobDetails";
import { Clients } from "./pages/Clients";
import { Invoices } from "./pages/Invoices";
import Mileage from "./pages/Mileage";
import { Settings } from "./pages/Settings";
import { Landing } from "./pages/Landing";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { Diag } from "./pages/Diag";

import { CreateJobModal } from "./components/CreateJobModal";
import { AppState, Tenant, JobStatus, InvoiceStatus, UserPlan, Job, JobItem } from "./types";
import { DB, getSupabase } from "./services/db";
import { syncJobToGoogle, deleteJobFromGoogle, listPersonalGoogleEvents } from "./services/googleCalendar";
import { checkSubscriptionStatus } from "./utils";

// ✅ Use ONE Supabase client everywhere (this should be your singleton)
import { supabase } from "./lib/supabaseClient";

/** Hard timeout so the app never hangs forever */
function withTimeout<T>(promise: Promise<T>, ms: number, label = "Operation") {
  let timer: any;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Error Boundary Component to prevent Blank Screens */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  private hardReset = () => {
    try {
      window.location.reload();
    } catch {
      window.location.href =
        window.location.origin + window.location.pathname + window.location.search + (window.location.hash || "#/");
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center mb-6 border border-rose-500/20">
            <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
          </div>
          <h1 className="text-white text-2xl font-black mb-2 tracking-tight">Workspace Crash Detected</h1>
          <p className="text-slate-400 max-w-md mb-8 text-sm font-medium">
            A technical protocol failure occurred. Your data is safe in the cloud, but the interface needs a hard reset.
          </p>
          <button
            onClick={this.hardReset}
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

/** ✅ SAFE AUTH GATE */
const AuthGate: React.FC<{
  authChecked: boolean;
  currentUser: Tenant | null;
  children: React.ReactNode;
}> = ({ authChecked, currentUser, children }) => {
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-6 p-4">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-center">
          <p className="text-white text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">
            Establishing Secure Workspace
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) return <Landing />;
  return <>{children}</>;
};

// Layout Wrapper (NO redirects here)
const MainLayout: React.FC<{
  isSyncing: boolean;
  currentUser: Tenant;
  isReadOnly: boolean;
  isNewJobModalOpen: boolean;
  setIsNewJobModalOpen: (open: boolean) => void;
  clients: any[];
  existingJobs: Job[];
  onSaveJob: (job: Job, items: JobItem[], clientName: string) => Promise<void>;
  onLogout: () => void;
}> = ({
  isSyncing,
  currentUser,
  isReadOnly,
  isNewJobModalOpen,
  setIsNewJobModalOpen,
  clients,
  existingJobs,
  onSaveJob,
  onLogout,
}) => {
  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-50 overflow-hidden relative">
      <Navigation isSyncing={isSyncing} user={currentUser} onLogout={onLogout} />

      {isReadOnly && (
        <div className="fixed top-0 left-0 right-0 bg-rose-600 text-white py-2 text-center z-[200] text-[10px] font-black uppercase tracking-[0.2em] shadow-lg">
          Trial Period Expired. Access is currently Read-Only.{" "}
          <Link to="/settings" className="underline ml-2 hover:text-rose-100 transition-colors">
            Reactivate Elite Plan
          </Link>
        </div>
      )}

      <main
        className={`flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 custom-scrollbar ${
          isReadOnly ? "pt-12" : ""
        }`}
      >
        <div className="max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

      <CreateJobModal
        key={isNewJobModalOpen ? "modal-active" : "modal-idle"}
        isOpen={isNewJobModalOpen}
        onClose={() => setIsNewJobModalOpen(false)}
        clients={clients}
        existingJobs={existingJobs}
        tenant_id={currentUser?.email || ""}
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
  const [authChecked, setAuthChecked] = useState(false);

  const hasLoadedOnce = useRef(false);
  const syncInProgress = useRef(false);
  const initializationStarted = useRef(false);

  const [appState, setAppState] = useState<AppState>({
    user: null,
    clients: [],
    jobs: [],
    quotes: [],
    externalEvents: [],
    jobItems: [],
    invoices: [],
    mileage: [],
  });

  const subStatus = useMemo(() => checkSubscriptionStatus(currentUser), [currentUser]);
  const isReadOnly = useMemo(
    () => subStatus.isTrialExpired && currentUser?.plan !== UserPlan.ACTIVE,
    [subStatus, currentUser]
  );

  const getLatestToken = useCallback(async () => {
    return (await DB.getGoogleAccessToken()) || undefined;
  }, []);

  const stripOAuthCodeFromUrl = useCallback(() => {
    if (window.location.search && window.location.search.includes("code=")) {
      const cleanUrl = window.location.origin + window.location.pathname + (window.location.hash || "#/");
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, []);

  const loadData = useCallback(
    async (forcedUser?: Tenant) => {
      if (syncInProgress.current) return;
      syncInProgress.current = true;
      setIsSyncing(true);

      try {
        const user = forcedUser || (await DB.getCurrentUser());
        if (!user) {
          setAppState((prev) => ({ ...prev, user: null }));
          setCurrentUser(null);
          return;
        }

        const token = await getLatestToken();
        setGoogleAccessToken(token);

        const [clients, jobs, invoices, mileage] = await Promise.allSettled([
          DB.getClients(),
          DB.getJobs(),
          DB.getInvoices(),
          DB.getMileage(),
        ]);

        const getVal = (res: any) => (res.status === "fulfilled" ? res.value : []);

        const reconciledJobs = (getVal(jobs) || []).map((job: Job) => {
          const inv = (getVal(invoices) || []).find((i: any) => i.jobId === job.id);
          if (inv?.status === InvoiceStatus.PAID && job.status !== JobStatus.COMPLETED) {
            return { ...job, status: JobStatus.COMPLETED };
          }
          return job;
        });

        let externalEvents: any[] = [];
        if (token) {
          try {
            externalEvents = await listPersonalGoogleEvents(token, {
              timeMin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
              timeMax: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
              maxResults: 2500,
            });
          } catch (e) {
            console.warn("[Google personal events fetch failed]", e);
          }
        }

        setCurrentUser(user);
        setAppState({
          user,
          clients: getVal(clients) || [],
          jobs: reconciledJobs,
          quotes: [],
          invoices: getVal(invoices) || [],
          mileage: getVal(mileage) || [],
          externalEvents,
          jobItems: [],
        });

        hasLoadedOnce.current = true;
      } catch (err) {
        console.error("Data Load Error:", err);
      } finally {
        setIsSyncing(false);
        syncInProgress.current = false;
      }
    },
    [getLatestToken]
  );

  const handleSyncAll = useCallback(async () => {
    if (syncInProgress.current || !currentUser) return;
    setIsSyncing(true);

    try {
      const token = await getLatestToken();
      if (!token) {
        alert("Google Authentication required.");
        setIsSyncing(false);
        return;
      }

      for (const job of appState.jobs) {
        const client = appState.clients.find((c) => c.id === job.clientId);

        if (job.syncToCalendar === false || job.status === JobStatus.CANCELLED) {
          await deleteJobFromGoogle(job.id, token);
        } else {
          await syncJobToGoogle(job, token, client?.name);
        }
      }

      await loadData(currentUser);
    } catch (e) {
      console.error(e);
      setIsSyncing(false);
    }
  }, [appState.jobs, appState.clients, currentUser, getLatestToken, loadData]);

  useEffect(() => {
    if (initializationStarted.current) return;
    initializationStarted.current = true;

    const init = async () => {
      try {
        // ✅ If we returned from Google with ?code=..., do the PKCE exchange ourselves (no DB.initializeSession)
        if (window.location.search?.includes("code=")) {
          await withTimeout(supabase.auth.exchangeCodeForSession(window.location.href), 8000, "exchangeCodeForSession");
          stripOAuthCodeFromUrl();
        }

        // ✅ Get session (never hang forever)
        const { data } = await withTimeout(supabase.auth.getSession(), 8000, "supabase.auth.getSession");
        const hasSession = !!data?.session;

        if (!hasSession) {
          setCurrentUser(null);
          return;
        }

        // ✅ Load your tenant/profile (wrap it too, just in case)
        const user = await withTimeout(DB.getCurrentUser(), 8000, "DB.getCurrentUser");
        if (user) {
          setCurrentUser(user);
          await loadData(user);
        } else {
          setCurrentUser(null);
        }
      } catch (e) {
        console.warn("[init failed]", e);
        setCurrentUser(null);
        hasLoadedOnce.current = false;
        setAppState({
          user: null,
          clients: [],
          jobs: [],
          quotes: [],
          externalEvents: [],
          jobItems: [],
          invoices: [],
          mileage: [],
        });
      } finally {
        // ✅ This guarantees the spinner can’t stick forever
        setAuthChecked(true);
      }
    };

    init();

    // Keep your auth change listener (but make sure it uses the same singleton client)
    const {
      data: { subscription },
    } = (supabase.auth as any).onAuthStateChange(async (event: string) => {
      try {
        if (event === "SIGNED_IN") {
          stripOAuthCodeFromUrl();

          const user = await withTimeout(DB.getCurrentUser(), 8000, "DB.getCurrentUser");
          if (user) {
            setCurrentUser(user);
            if (!hasLoadedOnce.current) await loadData(user);
          }
        }

        if (event === "SIGNED_OUT") {
          setCurrentUser(null);
          hasLoadedOnce.current = false;
          setAppState({
            user: null,
            clients: [],
            jobs: [],
            quotes: [],
            externalEvents: [],
            jobItems: [],
            invoices: [],
            mileage: [],
          });
        }
      } finally {
        setAuthChecked(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadData, stripOAuthCodeFromUrl]);

  const handleSaveNewJob = async (job: Job, items: JobItem[], clientName: string) => {
    if (isReadOnly) {
      alert("Workspace is currently read-only.");
      return;
    }

    // 1) ALWAYS save to DB first (this is the critical bit)
    await DB.saveJob(job);
    await DB.saveJobItems(job.id, items);

    // optimistic UI update
    setAppState((prev) => ({
      ...prev,
      jobs: [job, ...prev.jobs],
    }));

    // helper: detect Google auth failures
    const isGoogleAuthError = (err: any) => {
      const msg = String(err?.message || err || "");
      return (
        msg.includes("Invalid Credentials") ||
        msg.includes("UNAUTHENTICATED") ||
        msg.includes("Request had invalid authentication credentials") ||
        msg.includes("401")
      );
    };

    // 2) Google sync is BEST-EFFORT (must never block saving)
    try {
      const token = await getLatestToken();
      if (token) {
        if (job.syncToCalendar === false || job.status === JobStatus.CANCELLED) {
          await deleteJobFromGoogle(job.id, token);
        } else {
          await syncJobToGoogle(job, token, clientName);
        }
      }
    } catch (err: any) {
      console.warn("[Calendar Sync Failed] Job was saved, but Google sync failed:", err);

      // If token is dead/expired, clear the cached token so next action can re-auth cleanly
      if (isGoogleAuthError(err)) {
        try {
          DB.clearGoogleTokenCache?.();
        } catch {}
      }

      // IMPORTANT: do NOT throw
    }

    // 3) Refresh state from source of truth
    await loadData();
  };

  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/diag" element={<Diag />} />

          <Route
            path="/*"
            element={
              <AuthGate authChecked={authChecked} currentUser={currentUser}>
                {currentUser ? (
                  <MainLayout
                    isSyncing={isSyncing}
                    currentUser={currentUser}
                    isReadOnly={isReadOnly}
                    isNewJobModalOpen={isNewJobModalOpen}
                    setIsNewJobModalOpen={setIsNewJobModalOpen}
                    clients={appState.clients}
                    existingJobs={appState.jobs}
                    onSaveJob={handleSaveNewJob}
                    onLogout={() => DB.signOut().then(() => window.location.reload())}
                  />
                ) : (
                  <Landing />
                )}
              </AuthGate>
            }
          >
            <Route index element={currentUser ? <Navigate to="dashboard" replace /> : <Landing />} />

            <Route
              path="dashboard"
              element={
                <Dashboard
                  state={appState}
                  onNewJobClick={() => !isReadOnly && setIsNewJobModalOpen(true)}
                  onSyncCalendar={handleSyncAll}
                  isSyncing={isSyncing}
                  googleAccessToken={googleAccessToken}
                />
              }
            />

            <Route
              path="jobs"
              element={
                <Jobs
                  state={appState}
                  onNewJobClick={() => !isReadOnly && setIsNewJobModalOpen(true)}
                  onRefresh={loadData}
                />
              }
            />
            <Route path="jobs/:id" element={<JobDetails onRefresh={loadData} googleAccessToken={googleAccessToken} />} />

            <Route path="clients" element={<Clients state={appState} onRefresh={loadData} />} />
            <Route path="invoices" element={<Invoices state={appState} onRefresh={loadData} googleAccessToken={googleAccessToken} />} />
            <Route path="mileage" element={<Mileage state={appState} onRefresh={loadData} />} />

            <Route
              path="settings"
              element={
                <Settings
                  user={currentUser}
                  onLogout={() => DB.signOut().then(() => window.location.reload())}
                  onRefresh={loadData}
                />
              }
            />

            <Route path="*" element={<Navigate to={currentUser ? "dashboard" : "/"} replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;