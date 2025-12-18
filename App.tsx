import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChangeLogTable from './components/ChangeLogTable';
import StatsChart from './components/StatsChart';
import { Search, Bell, Calendar, AlertTriangle, RefreshCw, User, Award } from 'lucide-react';
import { ChangeRecord, DailyStat, AdminStat } from './types';
import { fetchChangeLogsRange, calculateDailyStatsInRange, calculateAdminStats } from './services/panoramaService';

const App: React.FC = () => {
  const [allLogs, setAllLogs] = useState<ChangeRecord[]>([]);
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const getTodayLocalDate = (): string => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalDate());

  const getLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const loadData = async (targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const end = getLocalDate(targetDate);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);

      const startDateStr = formatDateForAPI(start);
      const endDateStr = formatDateForAPI(end);

      const fetchedLogs = await fetchChangeLogsRange(startDateStr, endDateStr);
      
      const dailyStats = calculateDailyStatsInRange(fetchedLogs, endDateStr);
      const admins = calculateAdminStats(fetchedLogs);
      
      setAllLogs(fetchedLogs);
      setStats(dailyStats);
      setAdminStats(admins);
    } catch (err: any) {
      console.error("Failed to load data", err);
      setError(err.message || "Failed to connect to Panorama.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate]);

  const normalizeDate = (dateStr: string): string => {
    return dateStr.replace(/\//g, '-');
  };

  const tableLogs = allLogs.filter(log => {
    const logDate = normalizeDate(log.timestamp.split(' ')[0]);
    return logDate === selectedDate;
  });
  
  const changeCount = tableLogs.length;
  const totalWindowChanges = allLogs.length;
  
  const displayDateLabel = getLocalDate(selectedDate).toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4 text-slate-500">
            <Search size={20} />
            <input 
              type="text" 
              placeholder="Search history..." 
              className="bg-transparent border-none focus:ring-0 text-sm w-64 md:w-96 text-slate-800 placeholder-slate-400"
            />
          </div>
          <div className="flex items-center gap-6">
            <button className="text-slate-500 hover:text-slate-700 relative">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-xs">
              JD
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-slate-500 mt-1">Reviewing changes for {displayDateLabel}</p>
              </div>
              <div className="flex items-center gap-3">
                 <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 shadow-sm focus-within:ring-2 focus-within:ring-orange-500 transition-all">
                    <Calendar size={16} className="text-slate-400" />
                    <input 
                        type="date" 
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent border-none outline-none focus:ring-0 text-slate-700 p-0 text-sm"
                    />
                 </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col gap-2 animate-fadeIn">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="text-red-600" size={20} />
                    <div>
                      <h3 className="text-sm font-bold text-red-800">Connection Error</h3>
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  </div>
                  <button onClick={() => loadData(selectedDate)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50">
                    <RefreshCw size={14} /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* Stats Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard 
                title={`Changes on ${getLocalDate(selectedDate).toLocaleDateString([], {month: 'short', day: 'numeric'})}`}
                value={changeCount.toString()} 
                trend={changeCount > 0 ? "Observed" : "Zero"} 
                trendUp={changeCount > 0} 
              />
              <StatCard 
                title="7-Day Total Activity" 
                value={totalWindowChanges.toString()} 
                trend="Range" 
                trendUp={true} 
                neutral
              />
              <StatCard 
                title="Active Admins (7 Days)" 
                value={adminStats.length.toString()} 
                trend="Verified" 
                trendUp={true} 
                neutral
              />
            </div>

            {/* Main Charts Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-semibold text-slate-900">7-Day Activity Timeline</h3>
                    <span className="text-xs text-slate-400">Past week ending {displayDateLabel}</span>
                </div>
                {loading ? (
                  <div className="h-64 bg-slate-100 rounded animate-pulse flex items-center justify-center text-slate-400 text-sm">Loading stats...</div>
                ) : (
                  <StatsChart 
                    data={stats} 
                    selectedDate={selectedDate}
                    onDateSelect={handleDateSelect}
                  />
                )}
                <p className="mt-4 text-[10px] text-slate-400 text-center">Click a bar to view logs for that specific day.</p>
              </div>
              
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-2 mb-6">
                    <Award size={18} className="text-orange-500" />
                    <h3 className="text-sm font-semibold text-slate-900">Top Admins (7 Days)</h3>
                </div>
                {loading ? (
                   <div className="space-y-4">
                     {[1,2,3,4].map(i => <div key={i} className="h-8 bg-slate-50 rounded animate-pulse"></div>)}
                   </div>
                ) : adminStats.length === 0 ? (
                    <div className="h-48 flex items-center justify-center text-slate-400 text-xs">No admin data</div>
                ) : (
                    <div className="space-y-4">
                        {adminStats.slice(0, 5).map((stat) => (
                            <div key={stat.admin} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                                        <User size={14} />
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 truncate w-32">{stat.admin}</span>
                                </div>
                                <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded">
                                    {stat.changes}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
              </div>
            </div>

            {/* Log Table for Selected Day */}
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                   <h2 className="text-lg font-bold text-slate-900">
                     Daily Log Entries
                   </h2>
                   <span className="text-sm text-slate-500">{changeCount} entries found</span>
               </div>
               {loading ? (
                 <div className="space-y-3">
                   {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-lg shadow-sm animate-pulse"></div>)}
                 </div>
               ) : (
                 <ChangeLogTable changes={tableLogs} />
               )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string; trend: string; trendUp: boolean; neutral?: boolean }> = ({ title, value, trend, trendUp, neutral }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 transition-transform hover:scale-[1.02]">
    <h4 className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">{title}</h4>
    <div className="flex items-end justify-between">
      <span className="text-3xl font-bold text-slate-900 block">{value}</span>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
        neutral ? 'bg-slate-100 text-slate-600' :
        trendUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}>
        {trend}
      </span>
    </div>
  </div>
);

export default App;