
import React, { useState } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Client } from '../types';
import { generateId } from '../services/db';

interface ClientImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (clients: Client[]) => void;
  tenantId: string;
}

export const ClientImporter: React.FC<ClientImporterProps> = ({ isOpen, onClose, onImport, tenantId }) => {
  const [pastedData, setPastedData] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Uses process.env.API_KEY directly for basic text tasks as per guidelines
  const handleParse = async () => {
    if (!pastedData.trim()) return;
    setIsParsing(true);
    setError(null);

    try {
      // Direct use of process.env.API_KEY for a fresh instance
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const prompt = `
        You are a data extraction expert for a freelance CRM.
        I have pasted raw data from a spreadsheet. Extract every distinct client entity.
        
        Rules:
        1. Identify company names, addresses, emails, and phone numbers.
        2. Clean up formatting (proper casing for names and addresses).
        3. Payment terms: default to 30 if not specified.
        4. Return as a clean JSON array.
        
        Input Data:
        ${pastedData}
      `;

      // Using gemini-3-flash-preview for text extraction tasks
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Company or individual name" },
                email: { type: Type.STRING, description: "Billing email" },
                phone: { type: Type.STRING, description: "Phone number" },
                address: { type: Type.STRING, description: "Multi-line billing address" },
                paymentTermsDays: { type: Type.INTEGER, description: "Payment terms in days" }
              },
              required: ["name"]
            }
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Cloud analysis returned no data.");
      
      const rawItems = JSON.parse(text);
      if (!Array.isArray(rawItems)) throw new Error("AI returned an invalid data format.");

      const clients: Client[] = rawItems.map((c: any) => ({
        id: generateId(),
        name: c.name || 'Imported Client',
        email: c.email || '',
        phone: (c.phone || '').toString(),
        address: c.address || '',
        paymentTermsDays: parseInt(c.paymentTermsDays) || 30,
        tenant_id: tenantId || 'local-user'
      }));

      onImport(clients);
      onClose();
    } catch (err: any) {
      console.error("Smart Import Error:", err);
      setError(`Import Interrupted: ${err.message || 'Check your internet connection.'}`);
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-300">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Smart Client Import</h3>
            <p className="text-sm text-slate-500 font-medium">Using Gemini 3.0 Flash for high-speed extraction.</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white text-slate-400 hover:text-rose-500 border border-slate-200 transition-all">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <div className="p-8">
          <div className="relative group">
            <textarea
              className="w-full h-80 p-6 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 outline-none leading-relaxed text-sm font-medium custom-scrollbar transition-all"
              placeholder="Paste rows here from Excel or Google Sheets..."
              value={pastedData}
              onChange={(e) => setPastedData(e.target.value)}
            />
            {pastedData && !isParsing && (
              <button 
                onClick={() => setPastedData('')} 
                className="absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest text-slate-300 hover:text-rose-500 transition-colors"
              >
                Clear Input
              </button>
            )}
          </div>
          
          {error && (
            <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-xs font-bold text-rose-500 flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
              <i className="fa-solid fa-circle-exclamation mt-0.5"></i>
              <span className="leading-relaxed">{error}</span>
            </div>
          )}
          
          <div className="mt-8">
            <button 
              disabled={isParsing || !pastedData.trim()}
              onClick={handleParse}
              className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
            >
              {isParsing ? (
                <>
                  <i className="fa-solid fa-spinner animate-spin"></i>
                  <span>Analyzing Records...</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                  <span>Analyze & Import Clients</span>
                </>
              )}
            </button>
            <p className="mt-4 text-center text-[10px] text-slate-400 font-black uppercase tracking-widest">
              Secure Project Connection Active (Flash 3.0)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
