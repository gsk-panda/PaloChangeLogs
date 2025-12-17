import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChangeLogTable from './components/ChangeLogTable';
import StatsChart from './components/StatsChart';
import { Search, Bell, Calendar, Filter, Bot, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { ChangeRecord, DailyStat } from './types';
import { fetchChangeLogs, calculateDailyStats } from './services/panoramaService';

const App: React.FC = () => {
  const [logs, setLogs] = useState<ChangeRecord[]>([]);
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setShowErrorDetails(false);
    try {
      // Fetch logs once (handling async job polling if necessary)
      const fetchedLogs = await fetchChangeLogs();
      
      // Calculate stats locally from the fetched logs
      const calculatedStats = calculateDailyStats(fetchedLogs);
      
      setLogs(fetchedLogs);
      setStats(calculatedStats);
    } catch (err: any) {
      console.error("Failed to load data", err);
      setError(err.message || "Failed to connect to Panorama. Please check network connectivity.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Calculate Today's stats
  const todayStr = new Date().toISOString().split('T')[0];
  const todayStats = stats.find(s => s.date === todayStr);
  const todayCount = todayStats ? todayStats.changes : 0;
  
  // Find last activity if 0
  let lastActivity = "None";
  if (todayCount === 0 && logs.length > 0) {
     const lastDate = new Date(logs[0].timestamp);
     lastActivity = lastDate.toLocaleDateString();
  }

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
              placeholder="Search commit logs, objects, or admins..." 
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            
            {/* Title Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Daily Activity</h1>
                <p className="text-slate-500 mt-1">Overview of configuration changes across Panorama device groups.</p>
              </div>
              <div className="flex items-center gap-3">
                 <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Calendar size={16} />
                    Last 7 Days
                 </button>
                 <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Filter size={16} />
                    Filters
                 </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col gap-2 animate-fadeIn">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="text-red-600" size={20} />
                    <div>
                      <h3 className="text-sm font-bold text-red-800">Connection Error</h3>
                      <p className="text-sm text-red-600">{error.split('\n')[0]}</p>
                    </div>
                  </div>
                  <button 
                    onClick={loadData}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-red-200 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50"
                  >
                    <RefreshCw size={14} /> Retry
                  </button>
                </div>
                
                {/* Expandable Technical Details */}
                <div>
                   <button 
                     onClick={() => setShowErrorDetails(!showErrorDetails)}
                     className="flex items-center gap-1 text-xs text-red-700 font-semibold hover:underline mt-1"
                   >
                     {showErrorDetails ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                     Technical Details
                   </button>
                   
                   {showErrorDetails && (
                     <div className="mt-2 bg-red-100/50 p-3 rounded text-xs font-mono text-red-800 break-all whitespace-pre-wrap">
                       {error}
                       <div className="mt-2 pt-2 border-t border-red-200">
                         <strong>Troubleshooting:</strong><br/>
                         1. Ensure `HOST` in constants.ts is set to '/panorama-proxy'.<br/>
                         2. Check if the Vite dev server is running.<br/>
                         3. Verify the proxy target in vite.config.ts is reachable.<br/>
                       </div>
                     </div>
                   )}
                </div>
              </div>
            )}

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 md:col-span-2">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Change Volume History</h3>
                {loading ? (
                  <div className="h-64 bg-slate-100 rounded animate-pulse flex items-center justify-center text-slate-400 text-sm">Loading stats...</div>
                ) : stats.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                    <Clock size={32} className="mb-2 opacity-50"/>
                    <span className="text-sm font-medium">No recent history available</span>
                  </div>
                ) : (
                  <StatsChart data={stats} />
                )}
              </div>
              
              <div className="space-y-6">
                 <StatCard 
                   title="Total Commits Today" 
                   value={todayCount.toString()} 
                   subValue={todayCount === 0 && lastActivity !== "None" ? `Last: ${lastActivity}` : undefined}
                   trend={todayCount > 0 ? "Active" : "Quiet"} 
                   trendUp={todayCount > 0} 
                 />
                 <StatCard 
                   title="Pending Review" 
                   value="0" 
                   trend="Normal" 
                   trendUp={true} 
                   neutral
                 />
                 <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
                    <div className="relative z-10">
                      <h3 className="font-semibold text-indigo-100 mb-1">AI Audit Active</h3>
                      <p className="text-sm text-indigo-200 mb-4">Gemini 2.5 is monitoring for high-risk policy changes.</p>
                      <button className="bg-white/20 hover:bg-white/30 transition text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                        View Alerts
                      </button>
                    </div>
                    <div className="absolute -bottom-4 -right-4 opacity-20">
                      <Bot size={100} />
                    </div>
                 </div>
              </div>
            </div>

            {/* Change Log Table */}
            <div>
               <h2 className="text-lg font-bold text-slate-900 mb-4">Recent Commits</h2>
               {loading ? (
                 <div className="space-y-3">
                   {[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-lg shadow-sm animate-pulse"></div>)}
                 </div>
               ) : (
                 <ChangeLogTable changes={logs} />
               )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

// Helper sub-component for stats
const StatCard: React.FC<{ title: string; value: string; subValue?: string; trend: string; trendUp: boolean; neutral?: boolean }> = ({ title, value, subValue, trend, trendUp, neutral }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
    <h4 className="text-slate-500 text-sm font-medium mb-2">{title}</h4>
    <div className="flex items-end justify-between">
      <div>
        <span className="text-3xl font-bold text-slate-900 block">{value}</span>
        {subValue && <span className="text-xs text-slate-400 font-medium mt-1 block">{subValue}</span>}
      </div>
      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
        neutral ? 'bg-slate-100 text-slate-600' :
        trendUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}>
        {trend}
      </span>
    </div>
  </div>
);

export default App;