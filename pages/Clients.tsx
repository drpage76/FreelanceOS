import React, { useState } from 'react';
import { AppState, Client } from '../types';
import { ClientImporter } from '../components/ClientImporter';
import { AddClientModal } from '../components/AddClientModal';
import { DB } from '../services/db';
// Use direct named imports from react-router-dom to avoid property access errors
import { Link } from 'react-router-dom';

interface ClientsProps {
  state: AppState;
  onRefresh: () => void;
}

export const Clients: React.FC<ClientsProps> = ({ state, onRefresh }) => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleImported = async (newClients: Client[]) => {
    setIsProcessing(true);
    try {
      for (const client of newClients) {
        await DB.saveClient(client);
      }
      await onRefresh();
      alert(`Successfully imported ${newClients.length} clients.`);
    } catch (err) {
      console.error("Import failed:", err);
      alert("Import partially failed. Please check your cloud connection.");
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredClients = state.clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.includes(searchTerm))
  );

  const openAddModal = () => {
    setEditingClient(null);
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setIsModalOpen(true);
  };

  const exportToCSV = () => {
    const headers = ['Client Name', 'Address', 'Email', 'Phone', 'Payment Terms (days)'];
    const rows = filteredClients.map(c => [
      `"${c.name}"`,
      `"${c.address.replace(/"/g, '""')}"`,
      `"${c.email}"`,
      `"${c.phone || ''}"`,
      c.paymentTermsDays
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Clients_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (clientId: string, name: string) => {
    if (window.confirm(`Are you sure you want to remove ${name}?`)) {
      await DB.deleteClient(clientId);
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Clients</h2>
          <p className="text-slate-500 font-medium">High-density view of your professional billing network.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={exportToCSV}
            className="bg-white text-slate-600 border border-slate-200 px-6 py-3 rounded-2xl font-black shadow-sm hover:bg-slate-50 transition-all flex items-center"
          >
            <i className="fa-solid fa-file-csv mr-2 text-emerald-600"></i> Export
          </button>
          <button 
            disabled={isProcessing}
            onClick={() => setIsImportOpen(true)}
            className="bg-white text-indigo-600 border border-indigo-100 px-6 py-3 rounded-2xl font-black shadow-sm hover:bg-indigo-50 transition-all flex items-center disabled:opacity-50"
          >
            {isProcessing ? <i className="fa-solid fa-spinner animate-spin mr-2"></i> : <i className="fa-solid fa-file-import mr-2"></i>}
            Smart Import
          </button>
          <button 
            onClick={openAddModal}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
          >
            <i className="fa-solid fa-plus mr-2"></i> Add Client
          </button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm">
        <div className="relative">
          <i className="fa-solid fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input 
            type="text" 
            placeholder="Search clients..." 
            className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 transition-all font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Client Name</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Address</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Terms</th>
                <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClients.length === 0 ? (
                <tr><td colSpan={6} className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No clients in directory</td></tr>
              ) : (
                filteredClients.map(client => (
                  <tr key={client.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-4 align-top">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-black text-[10px]">
                          {client.name.charAt(0)}
                        </div>
                        <span className="font-black text-slate-900 text-sm whitespace-nowrap">{client.name}</span>
                      </div>
                    </td>
                    <td className="p-4 align-top">
                      <p className="text-[11px] leading-relaxed text-slate-500 font-medium max-w-[200px] line-clamp-2" title={client.address}>
                        {client.address || '—'}
                      </p>
                    </td>
                    <td className="p-4 align-top">
                      <span className="text-xs font-bold text-slate-700 block truncate max-w-[150px]">{client.email || '—'}</span>
                    </td>
                    <td className="p-4 align-top">
                      <span className="text-xs font-bold text-slate-700 block whitespace-nowrap">{client.phone || '—'}</span>
                    </td>
                    <td className="p-4 align-top text-center">
                      <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-black uppercase tracking-widest">
                        {client.paymentTermsDays}d
                      </span>
                    </td>
                    <td className="p-4 align-top text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => openEditModal(client)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                        >
                          <i className="fa-solid fa-pen text-xs"></i>
                        </button>
                        <Link 
                          to="/jobs" 
                          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 rounded-lg text-[10px] font-black transition-all uppercase"
                        >
                          Archive
                        </Link>
                        <button 
                          onClick={() => handleDelete(client.id, client.name)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                        >
                          <i className="fa-solid fa-trash-can text-xs"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ClientImporter 
        isOpen={isImportOpen} 
        onClose={() => setIsImportOpen(false)} 
        onImport={handleImported} 
        tenantId={state.user?.email || ''} 
      />

      <AddClientModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={onRefresh}
        tenantId={state.user?.email || ''}
        initialData={editingClient}
      />
    </div>
  );
};