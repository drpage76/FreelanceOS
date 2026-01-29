
import React from 'react';
import { Link } from 'react-router-dom';

export const Terms: React.FC = () => {
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
          <h1 className="text-4xl font-black tracking-tight mb-2 italic text-slate-900">Terms of Service — FreelanceOS</h1>
          <p className="text-indigo-600 font-bold italic text-lg mb-6">“Jobs, invoices, and time — simplified.”</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Effective date: 29 January 2026</p>
        </header>

        <div className="prose prose-slate prose-headings:font-black prose-headings:tracking-tight prose-headings:italic prose-p:text-slate-600 prose-p:leading-relaxed space-y-12">
          <section>
            <p className="text-lg font-medium">
              These Terms of Service (“Terms”) govern your use of FreelanceOS (the “Service”). By using the Service, you agree to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">1) The Service</h2>
            <p>FreelanceOS provides tools to help manage freelance work, including jobs, invoices, and time tracking. Features may change over time.</p>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">2) Accounts and access</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Users are responsible for maintaining the confidentiality of their login details.</li>
              <li>Users are responsible for activity that occurs under their account.</li>
              <li>Users must provide accurate information when using the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">3) Your content and data</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Users retain ownership of the content and data they enter.</li>
              <li>Users grant FreelanceOS permission to store and process data solely to provide the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">4) Acceptable use</h2>
            <p>Users agree not to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Use the Service for unlawful purposes</li>
              <li>Attempt to gain unauthorized access to systems or data</li>
              <li>Disrupt or interfere with the Service</li>
              <li>Upload malicious code or abuse the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">5) Availability and changes</h2>
            <p>The Service is provided on an “as available” basis. Availability is not guaranteed, and features may change.</p>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">6) Disclaimers</h2>
            <p>The Service is provided “as is” without warranties of any kind, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.</p>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">7) Limitation of liability</h2>
            <p>To the maximum extent permitted by law, FreelanceOS is not liable for indirect, incidental, special, consequential, or punitive damages, or loss of data or business.</p>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">8) Termination</h2>
            <p>Access may be suspended or terminated for violations of these Terms or for security or legal reasons. Users may stop using the Service at any time.</p>
          </section>

          <section>
            <h2 className="text-xl font-black mb-4">9) Governing law</h2>
            <p>These Terms are governed by the laws of the United Kingdom, unless local law requires otherwise.</p>
          </section>

          <section className="bg-slate-100 p-8 rounded-3xl border border-slate-200">
            <h2 className="text-xl font-black mb-4">10) Contact</h2>
            <p className="font-bold">Questions about these Terms:</p>
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
