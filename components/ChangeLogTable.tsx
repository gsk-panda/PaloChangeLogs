import React, { useState, useEffect } from 'react';
import { ChevronDown, AlertCircle, Loader2, GitCommit, User } from 'lucide-react';
import { ChangeRecord, ActionType } from '../types';
import DiffViewer from './DiffViewer';
import { fetchLogDetail, parseDetailedXml } from '../services/panoramaService';

interface ChangeLogTableProps {
  changes: ChangeRecord[];
}

const ChangeLogTable: React.FC<ChangeLogTableProps> = ({ changes }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // State for handling detail fetching
  const [detailsData, setDetailsData] = useState<Record<string, string>>({});
  const [detailedDiffs, setDetailedDiffs] = useState<Record<string, {before: string, after: string}>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [detailsError, setDetailsError] = useState<Record<string, string>>({});

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  useEffect(() => {
    if (expandedId) {
        const record = changes.find(c => c.id === expandedId);
        // Only fetch if we haven't fetched details yet and aren't currently fetching
        if (record && !detailedDiffs[record.id] && !loadingDetails[record.id]) {
            fetchDetailsForRecord(record);
        }
    }
  }, [expandedId, changes]);

  const fetchDetailsForRecord = async (record: ChangeRecord) => {
      setLoadingDetails(prev => ({ ...prev, [record.id]: true }));
      setDetailsError(prev => ({ ...prev, [record.id]: '' }));
      
      try {
          const xmlResult = await fetchLogDetail(record.seqno);
          setDetailsData(prev => ({ ...prev, [record.id]: xmlResult }));
          
          const parsed = parseDetailedXml(xmlResult);
          if (parsed.before || parsed.after) {
             setDetailedDiffs(prev => ({ ...prev, [record.id]: parsed }));
          }
      } catch (err: any) {
          console.error("Failed to fetch details", err);
          setDetailsError(prev => ({ ...prev, [record.id]: err.message || "Failed to load details" }));
      } finally {
          setLoadingDetails(prev => ({ ...prev, [record.id]: false }));
      }
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case ActionType.ADD: return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case ActionType.DELETE: return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  if (changes.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 bg-slate-900 rounded-xl border border-dashed border-slate-800">
              <GitCommit size={48} className="mb-4 opacity-20" />
              <p className="font-medium text-slate-400">No changes found</p>
              <p className="text-sm">No configuration changes match the current filters.</p>
          </div>
      );
  }

  return (
    <div className="bg-slate-900 rounded-xl shadow-lg shadow-black/20 border border-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-800 table-fixed">
          <thead className="bg-slate-950/50 backdrop-blur">
            <tr>
              <th scope="col" className="w-40 px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Timestamp</th>
              <th scope="col" className="w-48 px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Admin</th>
              <th scope="col" className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Path / Description</th>
              <th scope="col" className="w-24 px-6 py-4 text-right text-[11px] font-bold text-slate-500 uppercase tracking-widest">Action</th>
              <th scope="col" className="w-12 px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="bg-slate-900 divide-y divide-slate-800">
            {changes.map((change) => (
              <React.Fragment key={change.id}>
                <tr 
                  onClick={() => toggleExpand(change.id)}
                  className={`group cursor-pointer transition-all duration-200 ${
                    expandedId === change.id ? 'bg-slate-800/50' : 'hover:bg-slate-800/30'
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-300 font-mono">
                    {new Date(change.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}
                    <span className="text-slate-500 ml-2 text-xs font-normal">
                      {new Date(change.timestamp).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-slate-500 border border-slate-700/50">
                          <User size={12} />
                       </div>
                       <span className="text-sm font-medium text-slate-400">{change.admin}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400 truncate max-w-lg" title={change.description}>
                    <span className="font-mono text-xs bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border border-slate-700 mr-2">
                       {change.seqno}
                    </span>
                    {change.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getActionBadgeColor(change.action)}`}>
                      {change.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-slate-600">
                    <div className={`transition-transform duration-300 group-hover:text-slate-400 ${expandedId === change.id ? 'rotate-180 text-orange-500' : ''}`}>
                      <ChevronDown size={16} />
                    </div>
                  </td>
                </tr>
                {expandedId === change.id && (
                  <tr className="bg-slate-800/30">
                    <td colSpan={5} className="px-0 pt-0 pb-4 border-b border-slate-800">
                      <div className="mx-4 mt-2 bg-slate-900 rounded-lg border border-slate-700/50 shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex flex-col">
                          {/* Action Bar */}
                          <div className="flex flex-wrap justify-between items-center px-6 py-4 border-b border-slate-800 gap-4 bg-slate-950/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-800 rounded-md border border-slate-700/50">
                                    <GitCommit size={18} className="text-slate-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-200">Change Details</h3>
                                    <p className="text-xs text-slate-500 font-mono mt-0.5 max-w-xl truncate">{change.description}</p>
                                </div>
                            </div>
                          </div>
                          
                          <div className="p-6 space-y-6">
                            {/* Error Message for Details */}
                            {detailsError[change.id] && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                                    <AlertCircle size={16} />
                                    {detailsError[change.id]}
                                </div>
                            )}

                            {/* Standard Diff View with Loading State */}
                            <div className="rounded-lg border border-slate-700/50 overflow-hidden shadow-md relative">
                               {loadingDetails[change.id] && !detailedDiffs[change.id] ? (
                                   <div className="p-12 flex flex-col items-center justify-center text-slate-500 bg-slate-900/50">
                                       <Loader2 size={24} className="animate-spin mb-2 text-orange-500" />
                                       <span className="text-xs font-medium">Fetching full detailed configuration...</span>
                                   </div>
                               ) : (
                                   <DiffViewer 
                                      before={detailedDiffs[change.id]?.before || change.diffBefore} 
                                      after={detailedDiffs[change.id]?.after || change.diffAfter} 
                                   />
                               )}
                            </div>

                            {/* Full Details View (Optional/Advanced) */}
                            {detailsData[change.id] && (
                              <div className="rounded-lg overflow-hidden border border-slate-700/50 shadow-md">
                                  <div className="bg-slate-950 px-4 py-2 flex items-center justify-between border-b border-slate-800">
                                      <span className="text-slate-500 text-[10px] font-mono font-bold uppercase tracking-wider">Raw Detailed XML Response</span>
                                  </div>
                                  <div className="bg-slate-900 p-4 overflow-x-auto max-h-60 custom-scrollbar">
                                      <pre className="text-[10px] font-mono text-emerald-400 whitespace-pre-wrap break-all leading-relaxed">
                                          {detailsData[change.id]}
                                      </pre>
                                  </div>
                              </div>
                            )}

                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ChangeLogTable;