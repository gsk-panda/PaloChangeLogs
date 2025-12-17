import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldCheck, AlertCircle, Bot } from 'lucide-react';
import { ChangeRecord, CommitStatus } from '../types';
import DiffViewer from './DiffViewer';
import { analyzeChange } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

interface ChangeLogTableProps {
  changes: ChangeRecord[];
}

const ChangeLogTable: React.FC<ChangeLogTableProps> = ({ changes }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, string>>({});
  const [loadingAi, setLoadingAi] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleAnalyze = async (e: React.MouseEvent, record: ChangeRecord) => {
    e.stopPropagation();
    if (aiAnalysis[record.id]) return; // Already analyzed

    setLoadingAi(prev => ({ ...prev, [record.id]: true }));
    try {
      const result = await analyzeChange(record.description, record.diffBefore, record.diffAfter);
      setAiAnalysis(prev => ({ ...prev, [record.id]: result }));
    } finally {
      setLoadingAi(prev => ({ ...prev, [record.id]: false }));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ring-1 ring-slate-900/5">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 table-fixed">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="w-24 px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Status</th>
              <th scope="col" className="w-32 px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Time</th>
              <th scope="col" className="w-32 px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Admin</th>
              <th scope="col" className="w-40 px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Type</th>
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
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={change.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {new Date(change.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                      {change.admin}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">{change.type}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900 truncate">
                    {change.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-slate-500">
                    {expandedId === change.id ? <ChevronUp size={18} className="inline" /> : <ChevronDown size={18} className="inline" />}
                  </td>
                </tr>
                {expandedId === change.id && (
                  <tr className="bg-slate-50/50">
                    <td colSpan={6} className="px-0">
                      <div className="px-6 py-6 border-t border-slate-200 shadow-inner bg-slate-50">
                        <div className="flex flex-col gap-6">
                          <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                            <div>
                                <h3 className="text-base font-semibold text-slate-900">Configuration Details</h3>
                                <p className="text-sm text-slate-500">
                                  Full Description: <span className="text-slate-700 italic">{change.description}</span>
                                </p>
                            </div>
                            <button 
                              onClick={(e) => handleAnalyze(e, change)}
                              disabled={loadingAi[change.id]}
                              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:shadow-md hover:opacity-90 transition-all disabled:opacity-50 disabled:shadow-none"
                            >
                              <Bot size={16} />
                              {loadingAi[change.id] ? 'Analyzing...' : 'Analyze Change'}
                            </button>
                          </div>
                          
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

const StatusBadge: React.FC<{ status: CommitStatus }> = ({ status }) => {
  if (status === CommitStatus.SUCCESS) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
        <ShieldCheck size={14} />
        Success
      </span>
    );
  }
  if (status === CommitStatus.FAILURE) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
        <AlertCircle size={14} />
        Failed
      </span>
    );
  }
  return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">{status}</span>;
};

export default ChangeLogTable;