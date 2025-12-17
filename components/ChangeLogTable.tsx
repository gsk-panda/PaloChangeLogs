import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldCheck, AlertCircle, Bot, FileText, Loader2 } from 'lucide-react';
import { ChangeRecord, CommitStatus } from '../types';
import DiffViewer from './DiffViewer';
import { analyzeChange } from '../services/geminiService';
import { fetchLogDetail } from '../services/panoramaService';
import ReactMarkdown from 'react-markdown';

interface ChangeLogTableProps {
  changes: ChangeRecord[];
}

const ChangeLogTable: React.FC<ChangeLogTableProps> = ({ changes }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState<Record<string, boolean>>({});
  
  // State for handling detail fetching
  const [detailsData, setDetailsData] = useState<Record<string, string>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [detailsError, setDetailsError] = useState<Record<string, string>>({});

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleAnalyze = async (e: React.MouseEvent, record: ChangeRecord) => {
    e.stopPropagation();
    if (aiAnalysis[record.id]) return;

    setLoadingAi(prev => ({ ...prev, [record.id]: true }));
    try {
      const result = await analyzeChange(record.description, record.diffBefore, record.diffAfter);
      setAiAnalysis(prev => ({ ...prev, [record.id]: result }));
    } finally {
      setLoadingAi(prev => ({ ...prev, [record.id]: false }));
    }
  };

  const handleFetchDetails = async (e: React.MouseEvent, record: ChangeRecord) => {
      e.stopPropagation();
      if (detailsData[record.id]) return; // Already fetched

      setLoadingDetails(prev => ({ ...prev, [record.id]: true }));
      setDetailsError(prev => ({ ...prev, [record.id]: '' }));
      
      try {
          // Uses the exact query format requested
          const xmlResult = await fetchLogDetail(record.seqno);
          setDetailsData(prev => ({ ...prev, [record.id]: xmlResult }));
      } catch (err: any) {
          console.error("Failed to fetch details", err);
          setDetailsError(prev => ({ ...prev, [record.id]: err.message || "Failed to load details" }));
      } finally {
          setLoadingDetails(prev => ({ ...prev, [record.id]: false }));
      }
  };

  if (changes.length === 0) {
      return (
          <div className="text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm">
              <p>No changes found matching the filter (cmd=set/edit).</p>
          </div>
      );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ring-1 ring-slate-900/5">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 table-fixed">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="w-32 px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Time</th>
              <th scope="col" className="w-32 px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Admin</th>
              <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
              <th scope="col" className="w-20 px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {changes.map((change) => (
              <React.Fragment key={change.id}>
                <tr 
                  onClick={() => toggleExpand(change.id)}
                  className={`cursor-pointer hover:bg-slate-50 transition-colors ${expandedId === change.id ? 'bg-slate-50' : ''}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {new Date(change.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                      {change.admin}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900 truncate" title={change.description}>
                    {change.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-500">
                    {expandedId === change.id ? <ChevronUp size={18} className="inline" /> : <ChevronDown size={18} className="inline" />}
                  </td>
                </tr>
                {expandedId === change.id && (
                  <tr className="bg-slate-50/50">
                    <td colSpan={4} className="px-0">
                      <div className="px-6 py-6 border-t border-slate-200 shadow-inner bg-slate-50">
                        <div className="flex flex-col gap-6">
                          {/* Action Bar */}
                          <div className="flex flex-wrap justify-between items-center border-b border-slate-200 pb-4 gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-slate-900">Configuration Details</h3>
                                <div className="text-sm text-slate-500 mt-1">
                                    <span className="font-mono text-xs bg-slate-200 px-2 py-0.5 rounded mr-2">SEQ: {change.seqno}</span>
                                    <span className="font-mono text-xs text-slate-600 break-all">{change.description}</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                  onClick={(e) => handleFetchDetails(e, change)}
                                  disabled={loadingDetails[change.id]}
                                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-all disabled:opacity-50"
                                >
                                  {loadingDetails[change.id] ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                                  {detailsData[change.id] ? 'Refresh Details' : 'Load Full Details'}
                                </button>
                                <button 
                                  onClick={(e) => handleAnalyze(e, change)}
                                  disabled={loadingAi[change.id]}
                                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:shadow-md hover:opacity-90 transition-all disabled:opacity-50"
                                >
                                  <Bot size={16} />
                                  {loadingAi[change.id] ? 'Analyzing...' : 'Analyze Change'}
                                </button>
                            </div>
                          </div>
                          
                          {/* Error Message for Details */}
                          {detailsError[change.id] && (
                              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                                  <AlertCircle size={16} />
                                  {detailsError[change.id]}
                              </div>
                          )}

                          {/* Full Details View */}
                          {detailsData[change.id] && (
                            <div className="bg-slate-900 rounded-xl overflow-hidden shadow-sm ring-1 ring-slate-900/10">
                                <div className="bg-slate-800 px-4 py-2 flex items-center justify-between border-b border-slate-700">
                                    <span className="text-slate-300 text-xs font-mono font-bold uppercase tracking-wider">Detailed Log Response</span>
                                </div>
                                <div className="p-4 overflow-x-auto">
                                    <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all leading-relaxed">
                                        {detailsData[change.id]}
                                    </pre>
                                </div>
                            </div>
                          )}

                          {/* AI Analysis View */}
                          {aiAnalysis[change.id] && (
                            <div className="bg-white border border-indigo-100 rounded-xl p-6 shadow-sm ring-1 ring-indigo-50 animate-fadeIn">
                               <div className="flex items-center gap-2 mb-3 text-indigo-700 font-bold text-sm uppercase tracking-wide">
                                  <Bot size={18} />
                                  <span>Gemini Analysis</span>
                               </div>
                               <div className="prose prose-sm prose-indigo max-w-none text-slate-700 leading-relaxed">
                                  <ReactMarkdown>{aiAnalysis[change.id]}</ReactMarkdown>
                                </div>
                            </div>
                          )}

                          {/* Standard Diff View */}
                          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                             <DiffViewer before={change.diffBefore} after={change.diffAfter} />
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