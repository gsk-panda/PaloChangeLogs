import React from 'react';

interface DiffViewerProps {
  before: string;
  after: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ before, after }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 text-xs font-mono divide-y md:divide-y-0 md:divide-x divide-slate-200">
      <div className="flex flex-col">
        <div className="bg-red-50/50 border-b border-red-100 px-4 py-2 flex items-center justify-between">
            <span className="text-red-700 font-bold uppercase tracking-wider text-[10px]">Previous Config</span>
        </div>
        <div className="bg-red-50/20 p-4 overflow-x-auto flex-1">
            <pre className="text-red-900/80 whitespace-pre-wrap break-all leading-relaxed">{before}</pre>
        </div>
      </div>
      
      <div className="flex flex-col">
        <div className="bg-green-50/50 border-b border-green-100 px-4 py-2 flex items-center justify-between">
            <span className="text-green-700 font-bold uppercase tracking-wider text-[10px]">New Config</span>
        </div>
        <div className="bg-green-50/20 p-4 overflow-x-auto flex-1">
            <pre className="text-green-900/80 whitespace-pre-wrap break-all leading-relaxed">{after}</pre>
        </div>
      </div>
    </div>
  );
};

export default DiffViewer;