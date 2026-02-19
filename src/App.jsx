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

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:9000/oem/can-health'
  : 'https://can-health-api.onrender.com/oem/can-health';

const App = () => {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  const [dqData, setDqData] = useState(null);
  const [dqLoading, setDqLoading] = useState(false);
  const [dqPage, setDqPage] = useState(1);
  const DQ_PAGE_SIZE = 50;
  const [error, setError] = useState(null);

  // Filters
  const [oemFilter, setOemFilter] = useState('All');
  const [regionFilter, setRegionFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('Communicating');
  const [limit] = useState(50);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const fetchData = useCallback(async (pageNum = page, currentOem = oemFilter, currentStatus = statusTab, currentSearch = search, currentRegion = regionFilter) => {
    setLoading(true);
    try {
      const response = await axios.get(API_BASE, {
        params: {
          page: pageNum,
          limit: limit,
          oem: currentOem,
          status: currentStatus,
          search: currentSearch,
          region: currentRegion
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
  }, [page, oemFilter, statusTab, search, limit, regionFilter]);

  const fetchDataQuality = async (currentOem = oemFilter, currentRegion = regionFilter) => {
    setDqLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/data-quality`, {
        params: { oem: currentOem, region: currentRegion }
      });
      setDqData(res.data);
      setDqPage(1);
    } catch (err) {
      setError('Data Quality fetch failed.');
    } finally {
      setDqLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Smart polling: every 15s if data looks stale, else every 30 mins
  useEffect(() => {
    const isStale = !summary || !summary.no_api_response_count;
    const interval = setInterval(() => fetchData(), isStale ? 15000 : 1800000);
    return () => clearInterval(interval);
  }, [summary]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1); // Reset to page 1 on search
    fetchData(1, oemFilter, statusTab, e.target.value);
  };

  const handleOemChange = (e) => {
    setOemFilter(e.target.value);
    setPage(1);
    if (statusTab === 'Data Quality') {
      fetchDataQuality(e.target.value, regionFilter);
    } else {
      fetchData(1, e.target.value, statusTab, search, regionFilter);
    }
  };

  const handleRegionChange = (e) => {
    setRegionFilter(e.target.value);
    setPage(1);
    if (statusTab === 'Data Quality') {
      fetchDataQuality(oemFilter, e.target.value);
    } else {
      fetchData(1, oemFilter, statusTab, search, e.target.value);
    }
  };

  const handleStatusChange = (newStatus) => {
    setStatusTab(newStatus);
    setPage(1);
    if (newStatus === 'Data Quality') {
      fetchDataQuality(oemFilter, regionFilter);
    } else {
      fetchData(1, oemFilter, newStatus, search, regionFilter);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      fetchData(newPage, oemFilter, statusTab, search);
    }
  };

  const forceRefresh = async () => {
    if (forceRefreshing) return;
    setForceRefreshing(true);
    try {
      // Fire POST - server returns immediately, refresh runs in background
      await axios.post(`${API_BASE}/refresh`);
      // Poll /status every 3s until refresh_running = false
      const poll = () => {
        axios.get(`${API_BASE}/status`).then(res => {
          if (!res.data.refresh_running) {
            fetchData(1, oemFilter, statusTab, search).then(() => setForceRefreshing(false));
          } else {
            setTimeout(poll, 3000);
          }
        }).catch(() => setForceRefreshing(false));
      };
      setTimeout(poll, 2000); // Start polling after 2s
    } catch (err) {
      setError('Force refresh failed.');
      setForceRefreshing(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      if (statusTab === 'Data Quality' && dqData?.items?.length) {
        // Export all DQ data (no pagination — full list)
        const data = dqData.items.map(v => ({
          'Vehicle ID': v.vehicle_id,
          'OEM': v.oem,
          'City': v.region || '—',
          'Records (24h)': v.count_24h,
          'Expected (24h)': v.expected_24h,
          'Score %': v.score_pct,
          'Last Seen': v.last_seen ? new Date(v.last_seen).toLocaleString() : 'N/A'
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data Quality');
        XLSX.writeFile(wb, `Data_Quality_${oemFilter}_${regionFilter}_${new Date().toISOString().split('T')[0]}.xlsx`);
      } else {
        const response = await axios.get(`${API_BASE}/export`, {
          params: { oem: oemFilter, status: statusTab, search: search, region: regionFilter }
        });
        const data = response.data.map(v => ({
          'Vehicle ID': v.vehicle_id,
          'OEM': v.oem,
          'Status': (v.details?.status === 'No API Integration' || v.details?.status === 'No API Response')
            ? 'No API'
            : v.status === 'Non-Communicating' ? 'Non-Communicating (> 24h)' : v.status,
          'Inactive Days': (v.details?.status === 'No API Integration' || v.details?.status === 'No API Response') ? '—' : v.days_inactive,
          'Last Seen': v.last_updated ? new Date(v.last_updated).toLocaleString() : 'N/A'
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Health Report');
        XLSX.writeFile(wb, `OEM_Health_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      }
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
            Synchronized every 30 mins (v2.1 Strict Mode)
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
            onClick={() => forceRefresh()}
            disabled={forceRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600/20 hover:bg-amber-600 text-amber-400 font-semibold rounded-lg border border-amber-500/20 transition-all hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${forceRefreshing ? 'animate-spin' : ''}`} />
            {forceRefreshing ? 'Syncing OEMs...' : 'Force Refresh'}
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
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <Card title="Total Fleet" value={summary?.total_vehicles || 0} icon={<Truck className="w-6 h-6 text-blue-400" />} gradient="from-blue-500/10 to-transparent" />
        <Card title="Communicating" value={summary?.communicating_count || 0} icon={<CheckCircle2 className="w-6 h-6 text-green-400" />} gradient="from-green-500/10 to-transparent" sub="Syncing Today" />
        <Card title="Non-Communicating" value={summary?.silent_count || 0} icon={<AlertCircle className="w-6 h-6 text-red-500" />} gradient="from-red-500/10 to-transparent" sub="In API, Not Sending" />
        <Card title="No API Response" value={summary?.no_api_response_count || 0} icon={<AlertTriangle className="w-6 h-6 text-amber-400" />} gradient="from-amber-500/10 to-transparent" sub="Not in OEM API" />
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
                    <option value="All">All Providers</option>
                    <optgroup label="Live API Integration">
                      <option value="Euler">Euler</option>
                      <option value="Bajaj">Bajaj</option>
                      <option value="Switch">Switch</option>
                      <option value="Mahindra">Mahindra</option>
                      <option value="Volvo Eicher">Volvo Eicher</option>
                    </optgroup>
                    <optgroup label="No API Integration (Offline)">
                      <option value="Altigreen">Altigreen</option>
                      <option value="Piaggio">Piaggio</option>
                      <option value="Tata">Tata</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-500 block mb-2">City</label>
                  <select value={regionFilter} onChange={handleRegionChange} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm outline-none">
                    <option value="All">All Cities</option>
                    {(summary?.available_regions || []).map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
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
              <div className="flex gap-2 p-1 bg-slate-900/50 rounded-xl border border-slate-800 flex-wrap">
                <TabButton active={statusTab === 'All'} onClick={() => handleStatusChange('All')} label="All" />
                <TabButton active={statusTab === 'Communicating'} onClick={() => handleStatusChange('Communicating')} label="Communicating" color="green" />
                <TabButton active={statusTab === 'Non-Communicating'} onClick={() => handleStatusChange('Non-Communicating')} label="Non-Communicating" color="red" />
                <TabButton active={statusTab === 'No API Response'} onClick={() => handleStatusChange('No API Response')} label={`No API Response (${summary?.no_api_response_count || 0})`} color="amber" />
                <TabButton active={statusTab === 'No API'} onClick={() => handleStatusChange('No API')} label="No API (Static)" color="slate" />
                <TabButton active={statusTab === 'Data Quality'} onClick={() => handleStatusChange('Data Quality')} label="📊 Data Quality" color="purple" />
              </div>
              <div className="text-xs text-slate-500 font-mono">Found: {total} vehicles</div>
            </div>

            {statusTab === 'Data Quality' ? (
              <div className="glass-card rounded-2xl overflow-hidden min-h-[600px] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/20 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-bold text-slate-200">24h Packet Frequency</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Window: {dqData ? `${new Date(dqData.window_start).toUTCString().slice(5, 22)} → ${new Date(dqData.window_end).toUTCString().slice(5, 22)} UTC` : 'Loading...'}
                    </p>
                  </div>
                  <button onClick={() => fetchDataQuality()} className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 text-xs font-semibold rounded-lg border border-purple-500/20 transition-all">
                    <RefreshCw className={`w-3 h-3 ${dqLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                <div className="flex-1 overflow-x-auto">
                  {dqLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-3">
                      <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
                      <p className="text-slate-500 text-sm">Querying MongoDB...</p>
                    </div>
                  ) : !dqData || dqData.items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-2">
                      <p className="text-slate-500">No data found for selected filters.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-800/20">
                          <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Registration</th>
                          <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">OEM</th>
                          <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">City</th>
                          <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Records (24h)</th>
                          <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Score</th>
                          <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Last Seen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dqData.items
                          .slice((dqPage - 1) * DQ_PAGE_SIZE, dqPage * DQ_PAGE_SIZE)
                          .map((v) => {
                            const pct = v.score_pct;
                            const color = pct >= 80 ? 'green' : pct >= 40 ? 'amber' : 'red';
                            const barColor = color === 'green' ? 'bg-green-500' : color === 'amber' ? 'bg-amber-500' : 'bg-red-500';
                            const textColor = color === 'green' ? 'text-green-400' : color === 'amber' ? 'text-amber-400' : 'text-red-400';
                            const badgeBg = color === 'green' ? 'bg-green-500/10' : color === 'amber' ? 'bg-amber-500/10' : 'bg-red-500/10';
                            return (
                              <tr key={v.vehicle_id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                <td className="px-6 py-4 font-mono text-sm text-blue-400">{v.vehicle_id}</td>
                                <td className="px-6 py-4 text-sm font-medium">{v.oem}</td>
                                <td className="px-6 py-4 text-sm">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                    {v.region || '—'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-300 font-mono">
                                  {v.count_24h} <span className="text-slate-600">/ {v.expected_24h}</span>
                                </td>
                                <td className="px-6 py-4" style={{ minWidth: '180px' }}>
                                  <div className="flex items-center gap-3">
                                    <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                                      <div className={`h-2 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className={`text-xs font-bold ${textColor} ${badgeBg} px-2 py-0.5 rounded-full min-w-[48px] text-center`}>
                                      {pct}%
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-xs text-slate-500">
                                  {v.last_seen ? new Date(v.last_seen).toLocaleTimeString() : '—'}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Summary footer */}
                {dqData && (() => {
                  const dqTotalPages = Math.ceil(dqData.items.length / DQ_PAGE_SIZE);
                  const startRow = (dqPage - 1) * DQ_PAGE_SIZE + 1;
                  const endRow = Math.min(dqPage * DQ_PAGE_SIZE, dqData.items.length);
                  return (
                    <div className="px-6 py-3 border-t border-slate-800 bg-black/20 flex items-center justify-between flex-wrap gap-3">
                      {/* Score summary */}
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span>Total: <span className="text-slate-300 font-bold">{dqData.total}</span></span>
                        <span className="text-green-400">🟢 ≥80%: <span className="font-bold">{dqData.items.filter(v => v.score_pct >= 80).length}</span></span>
                        <span className="text-amber-400">🟡 40–79%: <span className="font-bold">{dqData.items.filter(v => v.score_pct >= 40 && v.score_pct < 80).length}</span></span>
                        <span className="text-red-400">🔴 &lt;40%: <span className="font-bold">{dqData.items.filter(v => v.score_pct < 40).length}</span></span>
                      </div>
                      {/* Pagination */}
                      <div className="flex items-center gap-2">
                        <PageBtn onClick={() => setDqPage(1)} disabled={dqPage === 1} icon={<ChevronFirst className="w-4 h-4" />} />
                        <PageBtn onClick={() => setDqPage(p => Math.max(1, p - 1))} disabled={dqPage === 1} icon={<ChevronLeft className="w-4 h-4" />} />
                        <span className="text-xs font-semibold text-slate-500">{startRow}–{endRow} of {dqData.items.length}</span>
                        <PageBtn onClick={() => setDqPage(p => Math.min(dqTotalPages, p + 1))} disabled={dqPage === dqTotalPages} icon={<ChevronRight className="w-4 h-4" />} />
                        <PageBtn onClick={() => setDqPage(dqTotalPages)} disabled={dqPage === dqTotalPages} icon={<ChevronLast className="w-4 h-4" />} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="glass-card rounded-2xl overflow-hidden min-h-[600px] flex flex-col">
                <div className="flex-1 overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-800/20">
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Registration</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">OEM</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">City</th>
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
                            <td className="px-6 py-4 text-sm text-slate-400">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                {v.region || '—'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${v.status === 'Communicating' ? 'bg-green-500/10 text-green-400' :
                                v.details?.status === 'No API Response' ? 'bg-amber-500/10 text-amber-400' :
                                  v.details?.status === 'No API Integration' ? 'bg-slate-500/10 text-slate-400' :
                                    'bg-red-500/10 text-red-400'
                                }`}>
                                {v.details?.status === 'No API Integration' ? 'No API' :
                                  v.details?.status === 'No API Response' ? 'No API Resp.' :
                                    v.status === 'Communicating' ? 'Online' : 'Offline'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              {(v.details?.status === 'No API Integration' || v.details?.status === 'No API Response') ? (
                                <span className="text-slate-500 font-mono text-xs">—</span>
                              ) : (
                                v.status === 'Communicating' && v.days_inactive === 0 ? (
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
                                )
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
            )}
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

      {/* Blocking Loader for Refresh */}
      {forceRefreshing && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
          <RefreshCw className="w-16 h-16 text-blue-500 animate-spin mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Syncing Data...</h2>
          <p className="text-slate-400 text-sm">Fetching latest telemetry from all OEMs</p>
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
  <button onClick={onClick} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${active
    ? color === 'red' ? 'bg-red-500/20 text-red-400 border border-red-500/30'
      : color === 'green' ? 'bg-green-500/20 text-green-400 border border-green-500/30'
        : color === 'amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          : color === 'purple' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
            : 'bg-slate-700 text-white border border-slate-600'
    : 'text-slate-500 hover:bg-slate-800'
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
