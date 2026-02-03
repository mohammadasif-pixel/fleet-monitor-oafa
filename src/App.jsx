import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  Filter,
  RefreshCw,
  Search,
  Truck,
  Car,
  Clock,
  Gauge,
  AlertTriangle,
  Calendar,
  Download,
  ChevronLeft,
  ChevronLast,
  ChevronFirst
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://127.0.0.1:8008/oem/can-health';

const App = () => {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [oemFilter, setOemFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('All');
  const [limit] = useState(50);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const fetchData = useCallback(async (pageNum = page, currentOem = oemFilter, currentStatus = statusTab, currentSearch = search) => {
    setLoading(true);
    try {
      const response = await axios.get(API_BASE, {
        params: {
          page: pageNum,
          limit: limit,
          oem: currentOem,
          status: currentStatus,
          search: currentSearch
        }
      });
      setItems(response.data.items);
      setTotal(response.data.total);
      setTotalPages(response.data.pages);
      setSummary(response.data.summary);
      setError(null);
    } catch (err) {
      setError('Connection Error. Background task might be warming up.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, oemFilter, statusTab, search, limit]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 1800000); // 30 mins
    return () => clearInterval(interval);
  }, []);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1); // Reset to page 1 on search
    fetchData(1, oemFilter, statusTab, e.target.value);
  };

  const handleOemChange = (e) => {
    setOemFilter(e.target.value);
    setPage(1);
    fetchData(1, e.target.value, statusTab, search);
  };

  const handleStatusChange = (newStatus) => {
    setStatusTab(newStatus);
    setPage(1);
    fetchData(1, oemFilter, newStatus, search);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      fetchData(newPage, oemFilter, statusTab, search);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const response = await axios.get(`${API_BASE}/export`, {
        params: { oem: oemFilter, status: statusTab, search: search }
      });
      const data = response.data.map(v => ({
        'Vehicle ID': v.vehicle_id,
        'OEM': v.oem,
        'Status': v.status,
        'Inactive Days': v.days_inactive,
        'Last Seen': v.last_updated ? new Date(v.last_updated).toLocaleString() : 'N/A'
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Health Report");
      XLSX.writeFile(wb, `OEM_Health_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (loading && items.length === 0) {
    if (summary?.status === 'Initializing') {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0c] text-white gap-4">
          <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
          <div className="text-xl font-medium text-slate-400">Syncing with Production OEMs...</div>
          <div className="text-xs text-slate-600">This may take up to 2-3 minutes.</div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0c] text-white">
        <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
        <div className="mt-4 text-slate-500">Connecting...</div>
      </div>
    );
  }

  // If we got an empty initializing response even if loading is false (polling)
  if (!loading && items.length === 0 && summary?.status === 'Initializing') {
    setTimeout(fetchData, 5000); // Poll faster
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0c] text-white gap-4">
        <RefreshCw className="w-12 h-12 text-blue-500 animate-spin" />
        <div className="text-xl font-medium text-slate-400">Syncing with Production OEMs...</div>
        <div className="text-xs text-slate-600">Please wait while we fetch the latest data.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-200 p-4 md:p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent mb-1">
            Production Fleet Monitor
          </h1>
          <p className="text-slate-500 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary-500" />
            Synchronized every 30 mins
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => exportData()}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-green-600/20 hover:bg-green-600 text-green-400 font-semibold rounded-lg border border-green-500/20 transition-all hover:text-white"
          >
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export Excel
          </button>
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Card title="Total Fleet" value={summary?.total_vehicles || 0} icon={<Truck className="w-6 h-6 text-blue-400" />} gradient="from-blue-500/10 to-transparent" />
        <Card title="Communicating" value={summary?.communicating_count || 0} icon={<CheckCircle2 className="w-6 h-6 text-green-400" />} gradient="from-green-500/10 to-transparent" sub="Syncing Today" />
        <Card title="Non-Communicating" value={summary?.non_communicating_count || 0} icon={<AlertCircle className="w-6 h-6 text-red-400" />} gradient="from-red-500/10 to-transparent" sub="Back-dated / Missing" />
      </div>

      <main className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-8">

          <aside className="w-full lg:w-64 flex flex-col gap-6">
            <div className="glass-card p-6 rounded-2xl">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Filter className="w-4 h-4" /> Controls
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-2">OEM Provider</label>
                  <select value={oemFilter} onChange={handleOemChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                    <option>All</option>
                    <option>Switch</option>
                    <option>Bajaj</option>
                    <option>Eicher</option>
                    <option>Euler</option>
                    <option>Mahindra</option>
                  </select>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input type="text" placeholder="Search ID..." value={search} onChange={handleSearchChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm outline-none" />
                </div>
              </div>
            </div>

            <div className="glass-card p-4 rounded-2xl flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Last Update</p>
                <p className="text-xs text-slate-300">{summary?.timestamp ? new Date(summary.timestamp).toLocaleTimeString() : 'Refreshing...'}</p>
              </div>
            </div>
          </aside>

          <div className="flex-1 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="flex gap-2 p-1 bg-slate-900/50 rounded-xl border border-slate-800">
                <TabButton active={statusTab === 'All'} onClick={() => handleStatusChange('All')} label="All" />
                <TabButton active={statusTab === 'Communicating'} onClick={() => handleStatusChange('Communicating')} label="Communicating" color="green" />
                <TabButton active={statusTab === 'Non-Communicating'} onClick={() => handleStatusChange('Non-Communicating')} label="Non-Communicating" color="red" />
              </div>
              <div className="text-xs text-slate-500 font-mono">Found: {total} vehicles</div>
            </div>

            <div className="glass-card rounded-2xl overflow-hidden min-h-[600px] flex flex-col">
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/20">
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Registration</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">OEM</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Inactive Days</th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right">Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode='popLayout'>
                      {items.map((v) => (
                        <motion.tr layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key={v.vehicle_id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="px-6 py-4 font-mono text-sm text-blue-400">{v.vehicle_id}</td>
                          <td className="px-6 py-4 text-sm font-medium">{v.oem}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.status === 'Communicating' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                              {v.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {v.status === 'Communicating' && v.days_inactive === 0 ? (
                              <span className="text-green-400 font-bold">Today</span>
                            ) : (
                              <span className={v.days_inactive > 7 ? 'text-red-400 font-bold' : 'text-orange-400'}>
                                {v.days_inactive === 0 && v.last_updated ? (
                                  (() => {
                                    const diff = new Date().getTime() - new Date(v.last_updated).getTime();
                                    const hours = Math.floor(diff / (1000 * 60 * 60));
                                    return `${hours} hours ago`;
                                  })()
                                ) : (
                                  `${v.days_inactive} days`
                                )}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => setSelectedVehicle(v)} className="p-1.5 rounded bg-slate-800 border border-slate-700 hover:text-blue-400 transition-all"><ChevronRight className="w-4 h-4" /></button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {/* PAGINATION CONTROLS */}
              <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-2">
                  <PageBtn onClick={() => handlePageChange(1)} disabled={page === 1} icon={<ChevronFirst className="w-4 h-4" />} />
                  <PageBtn onClick={() => handlePageChange(page - 1)} disabled={page === 1} icon={<ChevronLeft className="w-4 h-4" />} />
                </div>
                <div className="text-xs font-semibold text-slate-500">Page {page} of {totalPages}</div>
                <div className="flex items-center gap-2">
                  <PageBtn onClick={() => handlePageChange(page + 1)} disabled={page === totalPages} icon={<ChevronRight className="w-4 h-4" />} />
                  <PageBtn onClick={() => handlePageChange(totalPages)} disabled={page === totalPages} icon={<ChevronLast className="w-4 h-4" />} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal for Raw Data */}
      <AnimatePresence>
        {selectedVehicle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedVehicle(null)}>
            <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="glass-card w-full max-w-2xl p-8 rounded-3xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold">{selectedVehicle.vehicle_id}</h2>
                <button onClick={() => setSelectedVehicle(null)} className="text-slate-500 hover:text-white">Close</button>
              </div>
              <div className="bg-black/50 p-6 rounded-2xl border border-slate-800 font-mono text-xs overflow-auto max-h-[400px]">
                <pre>{JSON.stringify(selectedVehicle.details, null, 2)}</pre>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 glass px-6 py-4 rounded-2xl border-red-500/30 text-red-400 flex items-center gap-4 shadow-2xl z-50">
          <AlertCircle className="w-6 h-6" />
          <div>
            <p className="font-bold">Connection Error</p>
            <p className="text-sm opacity-80">{error}</p>
          </div>
          <button onClick={() => fetchData()} className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-xs font-bold transition-all">
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

const Card = ({ title, value, icon, gradient, sub }) => (
  <div className={`glass-card p-8 rounded-3xl relative overflow-hidden border border-slate-800`}>
    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-20`}></div>
    <div className="relative z-10 flex items-center justify-between">
      <div>
        <p className="text-slate-500 text-sm font-medium">{title}</p>
        <div className="text-4xl font-bold my-1 tracking-tight">{value}</div>
        {sub && <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{sub}</p>}
      </div>
      <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800">{icon}</div>
    </div>
  </div>
);

const TabButton = ({ active, onClick, label, color }) => (
  <button onClick={onClick} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${active ? (color === 'red' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : color === 'green' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-slate-700 text-white border border-slate-600') : 'text-slate-500 hover:bg-slate-800'
    }`}>
    {label}
  </button>
);

const PageBtn = ({ onClick, disabled, icon }) => (
  <button onClick={onClick} disabled={disabled} className={`p-2 rounded-lg border border-slate-800 transition-all ${disabled ? 'opacity-20 cursor-not-allowed' : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'}`}>
    {icon}
  </button>
);

const InfoBlock = ({ label, value, icon }) => (
  <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
    <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">{icon} {label}</div>
    <div className="text-lg font-semibold text-white">{value}</div>
  </div>
);

export default App;
