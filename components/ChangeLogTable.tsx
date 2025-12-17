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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Time</th>
              <th className="px-6 py-4">Admin</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Description</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {changes.map((change) => (
              <React.Fragment key={change.id}>
                <tr 
                  onClick={() => toggleExpand(change.id)}
                  className={`cursor-pointer hover:bg-slate-50 transition-colors ${expandedId === change.id ? 'bg-slate-50' : ''}`}
                >
                  <td className="px-6 py-4">
                    <StatusBadge status={change.status} />
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Date(change.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                      {change.admin}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{change.type}</td>
                  <td className="px-6 py-4 font-medium text-slate-900">{change.description}</td>
                  <td className="px-6 py-4 text-right">
                    {expandedId === change.id ? <ChevronUp size={16} className="inline" /> : <ChevronDown size={16} className="inline" />}
                  </td>
                </tr>
                {expandedId === change.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={6} className="px-6 pb-6 pt-2">
                      <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-semibold text-slate-900">Configuration Diff</h3>
                          <button 
                            onClick={(e) => handleAnalyze(e, change)}
                            disabled={loadingAi[change.id]}
                            className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-bold rounded-full shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            <Bot size={14} />
                            {loadingAi[change.id] ? 'Analyzing...' : 'Analyze with Gemini'}
                          </button>
                        </div>
                        
                        {aiAnalysis[change.id] && (
                          <div className="bg-white border border-indigo-100 rounded-lg p-4 shadow-sm animate-fadeIn">
                             <div className="flex items-center gap-2 mb-2 text-indigo-700 font-semibold text-sm">
                                <Bot size={16} />
                                <span>AI Security Insights</span>
                             </div>
                             <div className="prose prose-sm prose-indigo max-w-none text-slate-700">
                                <ReactMarkdown>{aiAnalysis[change.id]}</ReactMarkdown>
                             </div>
                          </div>
                        )}

                        <DiffViewer before={change.diffBefore} after={change.diffAfter} />
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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <ShieldCheck size={12} />
        Success
      </span>
    );
  }
  if (status === CommitStatus.FAILURE) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <AlertCircle size={12} />
        Failed
      </span>
    );
  }
  return <span className="text-slate-500">{status}</span>;
};

export default ChangeLogTable;
