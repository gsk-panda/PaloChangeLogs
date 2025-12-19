import React, { useMemo } from 'react';

interface DiffViewerProps {
  before: string;
  after: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ before, after }) => {
  
  const { beforeLines, afterLines, addedLines, removedLines } = useMemo(() => {
    // Helper to split text into lines, handling both newlines and semicolons
    const splitText = (text: string) => {
        if (!text) return [];
        // If it looks like a real config dump (newlines), split by newline
        if (text.includes('\n')) {
            return text.split('\n').map(line => line.trimEnd()); 
        }
        // Fallback for brief/inline format
        return text.split(';')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => line + ';');
    };

    const bLines = splitText(before);
    const aLines = splitText(after);

    // Create sets for fast lookup of existence (ignoring whitespace for matching purposes)
    const bSet = new Set(bLines.map(l => l.trim()));
    const aSet = new Set(aLines.map(l => l.trim()));

    // Identify indices/content that are unique
    // For specific line highlighting
    const removed = new Set<number>();
    bLines.forEach((line, idx) => {
        if (!aSet.has(line.trim())) {
            removed.add(idx);
        }
    });

    const added = new Set<number>();
    aLines.forEach((line, idx) => {
        if (!bSet.has(line.trim())) {
            added.add(idx);
        }
    });

    return { beforeLines: bLines, afterLines: aLines, addedLines: added, removedLines: removed };
  }, [before, after]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 text-xs font-mono rounded-lg overflow-hidden border border-slate-800 shadow-sm">
      {/* Previous Config Panel */}
      <div className="flex flex-col bg-slate-900">
        <div className="bg-slate-950/50 border-b border-slate-800 px-4 py-2 flex items-center justify-between sticky top-0 z-10">
            <span className="text-red-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Previous Config
            </span>
            <span className="text-slate-600 text-[10px]">{removedLines.size} lines removed</span>
        </div>
        <div className="p-0 overflow-x-auto flex-1 custom-scrollbar min-h-[200px] bg-slate-900">
            <div className="py-2">
                {beforeLines.map((line, idx) => {
                    const isRemoved = removedLines.has(idx);
                    return (
                        <div 
                            key={idx} 
                            className={`px-4 py-0.5 whitespace-pre-wrap break-all flex ${
                                isRemoved ? 'bg-red-900/20 text-red-300 border-l-2 border-red-500/50' : 'text-slate-400 border-l-2 border-transparent'
                            }`}
                        >
                            <span className="w-6 inline-block text-slate-700 select-none text-[10px] text-right mr-3">{idx + 1}</span>
                            <span>{line}</span>
                        </div>
                    );
                })}
                {beforeLines.length === 0 && (
                    <div className="px-8 py-4 text-slate-600 italic">No previous configuration available.</div>
                )}
            </div>
        </div>
      </div>
      
      {/* New Config Panel */}
      <div className="flex flex-col bg-slate-900 border-l border-slate-800">
        <div className="bg-slate-950/50 border-b border-slate-800 px-4 py-2 flex items-center justify-between sticky top-0 z-10">
            <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                New Config
            </span>
            <span className="text-slate-600 text-[10px]">{addedLines.size} lines added</span>
        </div>
        <div className="p-0 overflow-x-auto flex-1 custom-scrollbar min-h-[200px] bg-slate-900">
            <div className="py-2">
                {afterLines.map((line, idx) => {
                    const isAdded = addedLines.has(idx);
                    return (
                        <div 
                            key={idx} 
                            className={`px-4 py-0.5 whitespace-pre-wrap break-all flex ${
                                isAdded ? 'bg-emerald-900/20 text-emerald-300 border-l-2 border-emerald-500/50' : 'text-slate-400 border-l-2 border-transparent'
                            }`}
                        >
                            <span className="w-6 inline-block text-slate-700 select-none text-[10px] text-right mr-3">{idx + 1}</span>
                            <span>{line}</span>
                        </div>
                    );
                })}
                {afterLines.length === 0 && (
                    <div className="px-8 py-4 text-slate-600 italic">No new configuration state.</div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default DiffViewer;