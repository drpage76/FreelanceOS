import React from 'react';
// Use direct named imports from react-router to resolve missing Link export in unified environments
import { Link } from 'react-router';

export const Privacy: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
              <i className="fa-solid fa-bolt text-sm"></i>
            </div>
            <span className="text-lg font-black tracking-tighter italic">Freelance<span className="text-indigo-600">OS</span></span>
          </Link>
          <Link to="/" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors">Back to Engine</Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-20">
        <header className="mb-16 border-b border-slate-200 pb-12">
          <h1 className="text-4xl font-black tracking-tight mb-2 italic text-slate-900">Privacy Policy — FreelanceOS</h1>
          <p className="text-indigo-600 font-bold italic text-lg mb-6">“Jobs, invoices, and time — simplified.”</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Effective date: 29 January 2026</p>
        </header>

        <div className="prose prose-slate prose-headings:font-black prose-headings:tracking-tight prose-headings:italic prose-p:text-slate-600 prose-p:leading-relaxed space-y-12">
          <section>
            <p className="text-lg font-medium">
              FreelanceOS (“we”, “us”, “our”) respects your privacy. This Privacy Policy explains what information we collect, how we use it, and the choices you have.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">1) Information we collect</h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-2">a) Google Sign-In information</h3>
                <p>When you sign in with Google, we may receive:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Your name</li>
                  <li>Your email address</li>
                  <li>Your profile picture (if provided by Google)</li>
                  <li>A Google user identifier (used to link your account)</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-2">b) Data you enter into FreelanceOS</h3>
                <p>This may include information you add to run your freelance business, such as jobs, clients, invoices, times, notes, and related records.</p>
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-2">c) Technical information</h3>
                <p>We may collect basic technical data required to operate the service, such as device or browser information, log data, and IP address (typically handled by hosting providers).</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">2) How we use your information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Create and manage your FreelanceOS account</li>
              <li>Provide access to the app and its features</li>
              <li>Save and display the data you choose to store in FreelanceOS</li>
              <li>Maintain security, prevent abuse, and troubleshoot issues</li>
              <li>Improve the product and user experience</li>
            </ul>
            <p className="mt-4 font-bold text-slate-900">We do not sell your personal information.</p>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">3) How we share information</h2>
            <p>We only share information when necessary to provide the service, including with:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Authentication providers (e.g., Google) for sign-in</li>
              <li>Infrastructure providers (e.g., hosting and database services)</li>
            </ul>
            <p className="mt-4 italic">We may disclose information if required by law or to protect rights, safety, and security.</p>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">4) Data storage and security</h2>
            <p>We take reasonable measures to protect your information. No method of transmission or storage is 100% secure.</p>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">5) Data retention</h2>
            <p>We retain account and app data for as long as your account is active or as needed to provide the service. Users may request deletion.</p>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">6) Your choices and rights</h2>
            <p>Users may:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Access and update their data within the app (where supported)</li>
              <li>Request deletion of their account and associated data</li>
            </ul>
          </section>

          <section className="bg-slate-100 p-8 rounded-3xl border border-slate-200">
            <h2 className="text-xl font-black mb-4">7) Contact</h2>
            <p className="font-bold">For privacy questions or deletion requests:</p>
            <div className="mt-2 space-y-1 text-sm font-medium">
              <p>Email: <a href="mailto:drpage76@gmail.com" className="text-indigo-600 hover:underline">drpage76@gmail.com</a></p>
              <p>Product: FreelanceOS</p>
            </div>
          </section>
        </div>
      </main>
      
      <footer className="py-12 border-t border-slate-200 text-center">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">© 2025 Professional Business Operating System.</p>
      </footer>
    </div>
  );
};