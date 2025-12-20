import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChangeLogTable from './components/ChangeLogTable';
import StatsChart from './components/StatsChart';
import { Bell, Calendar, AlertTriangle, RefreshCw, User, Award, Activity, Layers, ShieldCheck } from 'lucide-react';
import { ChangeRecord, DailyStat, AdminStat } from './types';
import { fetchChangeLogsRange, calculateDailyStatsInRange, calculateAdminStats } from './services/panoramaService';
import { getTodayMST, getMSTDate, getMSTDateString, parsePanoramaTimestamp, formatMSTDate, extractDateFromTimestamp } from './utils/dateUtils';

const App: React.FC = () => {
  const [allLogs, setAllLogs] = useState<ChangeRecord[]>([]);
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    try {
      return getTodayMST();
    } catch (e) {
      console.warn('Error initializing date:', e);
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  });

  const loadData = async (targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const end = getMSTDate(targetDate);
      const start = getMSTDate(targetDate);
      start.setDate(end.getDate() - 6);

      const startDateStr = getMSTDateString(start);
      const endDateStr = getMSTDateString(end);

      const fetchedLogs = await fetchChangeLogsRange(startDateStr, endDateStr);
      
      const filteredLogs = fetchedLogs.filter(log => {
        const hasDescription = log.description && log.description.trim().length > 0;
        return hasDescription;
      });
      
      const dailyStats = calculateDailyStatsInRange(filteredLogs, endDateStr);
      const admins = calculateAdminStats(filteredLogs);
      
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

  const filteredLogs = allLogs.filter(log => {
    const hasDescription = log.description && log.description.trim().length > 0;
    return hasDescription;
  });

  const normalizedSelectedDate = (() => {
    try {
      const [year, month, day] = selectedDate.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return selectedDate;
      }
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    } catch (e) {
      return selectedDate;
    }
  })();

  const tableLogs = filteredLogs.filter(log => {
    const logDateStr = extractDateFromTimestamp(log.timestamp);
    const matchesDate = logDateStr === normalizedSelectedDate;
    return matchesDate;
  });
  
  const changeCount = tableLogs.length;
  const totalWindowChanges = filteredLogs.length;
  
  const selectedDateObj = (() => {
    try {
      const date = getMSTDate(selectedDate);
      return date;
    } catch (e) {
      console.warn('Error creating selectedDateObj:', e);
      return new Date(selectedDate);
    }
  })();
  
  const displayDateLabel = (() => {
    try {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }).format(date);
    } catch (e) {
      console.warn('Error formatting display date:', e);
      return selectedDate;
    }
  })();

  const handleDateSelect = (date: string) => {
    try {
      const normalizedDate = formatMSTDate(getMSTDate(date));
      setSelectedDate(normalizedDate);
    } catch (e) {
      console.warn('Error normalizing selected date:', e);
      setSelectedDate(date);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 font-sans text-slate-200">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header */}
        <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 h-16 flex items-center justify-end px-8 sticky top-0 z-10">
          <div className="flex items-center gap-6">
            <button className="text-slate-500 hover:text-slate-300 relative transition-colors">
              <Bell size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full ring-2 ring-slate-900"></span>
            </button>
            <div className="flex items-center gap-3 pl-6 border-l border-slate-800">
              <div className="text-right hidden md:block">
                <div className="text-sm font-semibold text-slate-300">John Doe</div>
                <div className="text-xs text-slate-500">Security Admin</div>
              </div>
              <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-orange-500/20 to-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 font-bold text-xs shadow-sm">
                JD
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8 scroll-smooth">
          <div className="max-w-7xl mx-auto space-y-8 pb-12">
            
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Security Dashboard</h1>
                <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
                  <Activity size={14} className="text-orange-500" />
                  Reviewing changes for <span className="font-medium text-slate-300">{displayDateLabel}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                 <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 shadow-sm hover:border-orange-500/50 focus-within:ring-1 focus-within:ring-orange-500/50 transition-all">
                    <Calendar size={16} className="text-slate-500" />
                    <input 
                        type="date" 
                        value={selectedDate}
                        onChange={(e) => handleDateSelect(e.target.value)}
                        className="bg-transparent border-none outline-none focus:ring-0 text-slate-300 p-0 text-sm cursor-pointer font-medium color-scheme-dark"
                    />
                 </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col gap-2 animate-fadeIn shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-500/20 rounded-full">
                      <AlertTriangle className="text-red-400" size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-red-200">Connection Error</h3>
                      <p className="text-sm text-red-300/80 mt-0.5">{error}</p>
                    </div>
                  </div>
                  <button onClick={() => loadData(selectedDate)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-red-500/30 text-red-300 text-sm font-medium rounded-lg hover:bg-slate-800 hover:shadow-sm transition-all">
                    <RefreshCw size={14} /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* Stats Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard 
                title={`Changes on ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' }).format(selectedDateObj)}`}
                value={changeCount.toString()} 
                trend={changeCount > 0 ? "Changes Detected" : "No Activity"} 
                trendUp={changeCount > 0} 
                icon={<Layers size={22} className="text-blue-400" />}
                colorClass="blue"
              />
              <StatCard 
                title="7-Day Total Activity" 
                value={totalWindowChanges.toString()} 
                trend="Past Week" 
                trendUp={true} 
                neutral
                icon={<Activity size={22} className="text-purple-400" />}
                colorClass="purple"
              />
              <StatCard 
                title="Active Admins (7 Days)" 
                value={adminStats.length.toString()} 
                trend="Contributors" 
                trendUp={true} 
                neutral
                icon={<ShieldCheck size={22} className="text-emerald-400" />}
                colorClass="emerald"
              />
            </div>

            {/* Main Charts Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-slate-900 p-6 rounded-xl shadow-lg shadow-black/20 border border-slate-800 lg:col-span-2 flex flex-col">
                <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-base font-bold text-white">Activity Timeline</h3>
                      <p className="text-xs text-slate-500 mt-1">Daily commit frequency over the last 7 days</p>
                    </div>
                    <span className="text-xs font-mono bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700/50">Last 7 Days</span>
                </div>
                <div className="flex-1 min-h-[250px]">
                  {loading ? (
                    <div className="h-full bg-slate-800/50 rounded-lg animate-pulse flex items-center justify-center text-slate-500 text-sm">Loading visualization...</div>
                  ) : (
                    <StatsChart 
                      data={stats} 
                      selectedDate={selectedDate}
                      onDateSelect={handleDateSelect}
                    />
                  )}
                </div>
                <p className="mt-4 text-[11px] text-slate-500 text-center flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span> Selected Date
                  <span className="w-2 h-2 rounded-full bg-slate-700 ml-2"></span> Other Days
                </p>
              </div>
              
              <div className="bg-slate-900 p-6 rounded-xl shadow-lg shadow-black/20 border border-slate-800 flex flex-col">
                <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
                    <div className="p-2 bg-orange-500/10 rounded-lg">
                      <Award size={20} className="text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">Top Contributors</h3>
                      <p className="text-xs text-slate-500">Most active admins</p>
                    </div>
                </div>
                {loading ? (
                   <div className="space-y-4">
                     {[1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-800 rounded-lg animate-pulse"></div>)}
                   </div>
                ) : adminStats.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600 text-xs gap-2">
                      <User size={24} className="opacity-20" />
                      No admin data available
                    </div>
                ) : (
                    <div className="space-y-2 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                        {adminStats.slice(0, 10).map((stat, idx) => (
                            <div key={stat.admin} className="flex items-center justify-between group p-2 hover:bg-slate-800 rounded-lg transition-colors cursor-default">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                      idx === 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-500'
                                    }`}>
                                        {idx + 1}
                                    </div>
                                    <span className="text-sm font-medium text-slate-300 truncate max-w-[120px]" title={stat.admin}>{stat.admin}</span>
                                </div>
                                <span className="text-xs font-bold px-2.5 py-1 bg-slate-800 group-hover:bg-slate-700 border border-transparent group-hover:border-slate-600 text-slate-400 group-hover:text-slate-300 rounded-full transition-all">
                                    {stat.changes} <span className="text-[10px] font-normal text-slate-600 ml-0.5">edits</span>
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
                   <div>
                     <h2 className="text-lg font-bold text-white">Change Log</h2>
                     <p className="text-slate-500 text-sm mt-0.5">Detailed records for {displayDateLabel}</p>
                   </div>
                   <div className="text-xs font-medium px-3 py-1 bg-slate-900 border border-slate-800 rounded-full text-slate-400 shadow-sm">
                     {changeCount} total entries
                   </div>
               </div>
               {loading ? (
                 <div className="space-y-3">
                   {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-900 rounded-lg shadow-sm animate-pulse"></div>)}
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

const StatCard: React.FC<{ 
  title: string; 
  value: string; 
  trend: string; 
  trendUp: boolean; 
  neutral?: boolean;
  icon: React.ReactNode;
  colorClass: 'blue' | 'purple' | 'emerald';
}> = ({ title, value, trend, trendUp, neutral, icon, colorClass }) => {
  
  const bgColors = {
    blue: 'bg-blue-500/10',
    purple: 'bg-purple-500/10',
    emerald: 'bg-emerald-500/10'
  };

  return (
    <div className="bg-slate-900 p-6 rounded-xl shadow-lg shadow-black/20 border border-slate-800 relative overflow-hidden group transition-all hover:-translate-y-0.5 hover:shadow-xl hover:border-slate-700">
      <div className={`absolute top-0 left-0 w-full h-1 ${
        colorClass === 'blue' ? 'bg-blue-500' : colorClass === 'purple' ? 'bg-purple-500' : 'bg-emerald-500'
      }`}></div>
      
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-lg ${bgColors[colorClass]}`}>
          {icon}
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider border border-transparent ${
          neutral ? 'bg-slate-800 text-slate-400 group-hover:border-slate-700' :
          trendUp ? 'bg-emerald-500/10 text-emerald-400 group-hover:border-emerald-500/20' : 'bg-red-500/10 text-red-400'
        }`}>
          {trend}
        </span>
      </div>
      
      <div>
        <h4 className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1">{title}</h4>
        <span className="text-3xl font-bold text-white block tracking-tight">{value}</span>
      </div>
    </div>
  );
};

export default App;