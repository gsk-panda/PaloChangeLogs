import React from 'react';

interface DiffViewerProps {
  before: string;
  after: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ before, after }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs font-mono">
      <div className="bg-red-50 border border-red-100 rounded-md p-4 overflow-x-auto">
        <h4 className="text-red-700 font-bold mb-2 uppercase tracking-wider text-[10px]">Previous Configuration</h4>
        <pre className="text-red-800 whitespace-pre-wrap break-all">{before}</pre>
      </div>
      <div className="bg-green-50 border border-green-100 rounded-md p-4 overflow-x-auto">
        <h4 className="text-green-700 font-bold mb-2 uppercase tracking-wider text-[10px]">New Configuration</h4>
        <pre className="text-green-800 whitespace-pre-wrap break-all">{after}</pre>
      </div>
    </div>
  );
};

export default DiffViewer;
