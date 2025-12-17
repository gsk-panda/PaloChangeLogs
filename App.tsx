import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import ChangeLogTable from './components/ChangeLogTable';
import StatsChart from './components/StatsChart';
import { Search, Bell, Calendar, Filter } from 'lucide-react';
import { ChangeRecord, DailyStat } from './types';
import { fetchChangeLogs, fetchDailyStats } from './services/panoramaService';

const App: React.FC = () => {
  const [logs, setLogs] = useState<ChangeRecord[]>([]);
  const [stats, setStats] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [fetchedLogs, fetchedStats] = await Promise.all([
          fetchChangeLogs(),
          fetchDailyStats()
        ]);
        setLogs(fetchedLogs);
        setStats(fetchedStats);
      } catch (error) {
        console.error("Failed to load data", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

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

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 md:col-span-2">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Change Volume History</h3>
                {loading ? <div className="h-64 bg-slate-100 rounded animate-pulse"></div> : <StatsChart data={stats} />}
              </div>
              
              <div className="space-y-6">
                 <StatCard 
                   title="Total Commits Today" 
                   value="12" 
                   trend="+20%" 
                   trendUp={true} 
                 />
                 <StatCard 
                   title="Pending Review" 
                   value="3" 
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
const StatCard: React.FC<{ title: string; value: string; trend: string; trendUp: boolean; neutral?: boolean }> = ({ title, value, trend, trendUp, neutral }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
    <h4 className="text-slate-500 text-sm font-medium mb-2">{title}</h4>
    <div className="flex items-end justify-between">
      <span className="text-3xl font-bold text-slate-900">{value}</span>
      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
        neutral ? 'bg-slate-100 text-slate-600' :
        trendUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}>
        {trend}
      </span>
    </div>
  </div>
);

// Icon component needed for StatCard if we want to add one later, but removed for brevity
import { Bot } from 'lucide-react';

export default App;
