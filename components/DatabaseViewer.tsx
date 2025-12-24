import React, { useEffect, useState } from 'react';
import { Database, Calendar, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

interface DateEntry {
  date: string;
  count: number;
}

interface DatabaseViewerProps {
  onDateSelect?: (date: string) => void;
}

const DatabaseViewer: React.FC<DatabaseViewerProps> = ({ onDateSelect }) => {
  const [dates, setDates] = useState<DateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchDates = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/changelogs/dates`);
        if (response.ok) {
          const data = await response.json();
          setDates(data.dates || []);
        }
      } catch (error) {
        console.error('Error fetching database dates:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      fetchDates();
    }
  }, [isOpen]);

  const formatDate = (dateStr: string): string => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors shadow-sm"
      >
        <Database size={16} />
        <span>View Database</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-800 w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg">
              <Database size={20} className="text-orange-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Database Contents</h2>
              <p className="text-sm text-slate-500">Dates with stored change logs</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-500">Loading database dates...</div>
            </div>
          ) : dates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Database size={48} className="mb-4 opacity-20" />
              <p className="font-medium text-slate-400">No data in database</p>
              <p className="text-sm mt-1">Run the populate script to add historical data</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-slate-500 mb-4">
                {dates.length} date{dates.length !== 1 ? 's' : ''} with data • {dates.reduce((sum, d) => sum + d.count, 0).toLocaleString()} total entries
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {dates.map((entry) => (
                  <button
                    key={entry.date}
                    onClick={() => {
                      if (onDateSelect) {
                        onDateSelect(entry.date);
                        setIsOpen(false);
                      }
                    }}
                    className="flex items-center justify-between p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-orange-500/50 rounded-lg transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar size={16} className="text-slate-500 group-hover:text-orange-500 transition-colors" />
                      <div>
                        <div className="text-sm font-medium text-slate-300 group-hover:text-white">
                          {formatDate(entry.date)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {entry.date}
                        </div>
                      </div>
                    </div>
                    <div className="px-2 py-1 bg-slate-900 group-hover:bg-slate-800 rounded text-xs font-semibold text-slate-400 group-hover:text-orange-400 transition-colors">
                      {entry.count.toLocaleString()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DatabaseViewer;

