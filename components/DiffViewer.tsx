import React, { useMemo } from 'react';

interface DiffViewerProps {
  before: string;
  after: string;
}

interface DiffSegment {
  text: string;
  type: 'added' | 'removed' | 'unchanged';
}

const DiffViewer: React.FC<DiffViewerProps> = ({ before, after }) => {
  
  const computeWordDiff = (beforeLine: string, afterLine: string): { before: DiffSegment[], after: DiffSegment[] } => {
    const splitIntoWords = (line: string) => {
      const parts: string[] = [];
      const regex = /(\S+|\s+)/g;
      let match;
      while ((match = regex.exec(line)) !== null) {
        parts.push(match[0]);
      }
      return parts;
    };
    
    const beforeParts = splitIntoWords(beforeLine);
    const afterParts = splitIntoWords(afterLine);
    
    const beforeSegments: DiffSegment[] = [];
    const afterSegments: DiffSegment[] = [];
    
    let bIdx = 0;
    let aIdx = 0;
    
    while (bIdx < beforeParts.length || aIdx < afterParts.length) {
      if (bIdx >= beforeParts.length) {
        afterSegments.push({ text: afterParts.slice(aIdx).join(''), type: 'added' });
        break;
      }
      if (aIdx >= afterParts.length) {
        beforeSegments.push({ text: beforeParts.slice(bIdx).join(''), type: 'removed' });
        break;
      }
      
      if (beforeParts[bIdx] === afterParts[aIdx]) {
        beforeSegments.push({ text: beforeParts[bIdx], type: 'unchanged' });
        afterSegments.push({ text: afterParts[aIdx], type: 'unchanged' });
        bIdx++;
        aIdx++;
      } else {
        let foundMatch = false;
        
        for (let searchA = aIdx + 1; searchA < afterParts.length && searchA < aIdx + 10; searchA++) {
          if (beforeParts[bIdx] === afterParts[searchA]) {
            for (let i = aIdx; i < searchA; i++) {
              afterSegments.push({ text: afterParts[i], type: 'added' });
            }
            aIdx = searchA;
            foundMatch = true;
            break;
          }
        }
        
        if (!foundMatch) {
          for (let searchB = bIdx + 1; searchB < beforeParts.length && searchB < bIdx + 10; searchB++) {
            if (afterParts[aIdx] === beforeParts[searchB]) {
              for (let i = bIdx; i < searchB; i++) {
                beforeSegments.push({ text: beforeParts[i], type: 'removed' });
              }
              bIdx = searchB;
              foundMatch = true;
              break;
            }
          }
        }
        
        if (!foundMatch) {
          beforeSegments.push({ text: beforeParts[bIdx], type: 'removed' });
          afterSegments.push({ text: afterParts[aIdx], type: 'added' });
          bIdx++;
          aIdx++;
        }
      }
    }
    
    return { before: beforeSegments, after: afterSegments };
  };
  
  const { beforeLines, afterLines, lineDiffs } = useMemo(() => {
    const splitText = (text: string) => {
        if (!text) return [];
        if (text.includes('\n')) {
            return text.split('\n').map(line => line.trimEnd()); 
        }
        return text.split(';')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => line + ';');
    };

    const bLines = splitText(before);
    const aLines = splitText(after);

    const lineDiffsMap = new Map<number, { before: DiffSegment[], after: DiffSegment[], afterIdx: number }>();
    const usedAfterIndices = new Set<number>();
    
    const findBestMatch = (bLine: string) => {
      const trimmedB = bLine.trim();
      if (trimmedB.length === 0) return null;
      
      let bestMatchIdx = -1;
      let bestMatchScore = 0;
      let bestMatchType: 'exact' | 'prefix' | 'contains' = 'exact';
      
      aLines.forEach((aLine, aIdx) => {
        if (usedAfterIndices.has(aIdx)) return;
        const trimmedA = aLine.trim();
        if (trimmedA.length === 0) return;
        
        if (trimmedA === trimmedB) {
          bestMatchIdx = aIdx;
          bestMatchScore = 1;
          bestMatchType = 'exact';
          return;
        }
        
        const commonPrefixLen = Math.min(trimmedA.length, trimmedB.length);
        let prefixMatch = 0;
        for (let i = 0; i < commonPrefixLen && trimmedA[i] === trimmedB[i]; i++) {
          prefixMatch++;
        }
        
        if (prefixMatch >= 3) {
          const minLen = Math.min(trimmedA.length, trimmedB.length);
          const prefixRatio = prefixMatch / minLen;
          const overallSimilarity = prefixMatch / Math.max(trimmedA.length, trimmedB.length);
          
          if (prefixRatio >= 0.3 || (prefixMatch >= 5 && overallSimilarity > 0.15)) {
            if (overallSimilarity > bestMatchScore || prefixRatio > 0.5) {
              bestMatchIdx = aIdx;
              bestMatchScore = Math.max(bestMatchScore, overallSimilarity);
              bestMatchType = 'prefix';
            }
          }
        }
        
        const checkPrefix = (str1: string, str2: string, len: number) => {
          return str1.substring(0, Math.min(len, str1.length)) === str2.substring(0, Math.min(len, str2.length));
        };
        
        if (checkPrefix(trimmedA, trimmedB, 5) || checkPrefix(trimmedB, trimmedA, 5)) {
          const minLen = Math.min(trimmedA.length, trimmedB.length);
          const similarity = minLen / Math.max(trimmedA.length, trimmedB.length);
          if (similarity > bestMatchScore || minLen >= 5) {
            bestMatchIdx = aIdx;
            bestMatchScore = Math.max(bestMatchScore, similarity);
            bestMatchType = 'contains';
          }
        }
      });
      
      if (bestMatchIdx >= 0 && bestMatchScore < 1 && bestMatchType !== 'exact') {
        return { idx: bestMatchIdx, score: bestMatchScore };
      }
      
      return null;
    };
    
    bLines.forEach((bLine, bIdx) => {
      const trimmedB = bLine.trim();
      if (trimmedB.length === 0) return;
      
      const match = findBestMatch(bLine);
      if (match) {
        const aLine = aLines[match.idx];
        lineDiffsMap.set(bIdx, { ...computeWordDiff(bLine, aLine), afterIdx: match.idx });
        usedAfterIndices.add(match.idx);
      }
    });

    return { beforeLines: bLines, afterLines: aLines, lineDiffs: lineDiffsMap };
  }, [before, after]);
  
  const hasChanges = useMemo(() => {
    const bSet = new Set(beforeLines.map(l => l.trim()).filter(l => l.length > 0));
    const aSet = new Set(afterLines.map(l => l.trim()).filter(l => l.length > 0));
    
    const removed = beforeLines.filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !aSet.has(trimmed);
    }).length;
    
    const added = afterLines.filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !bSet.has(trimmed);
    }).length;
    
    return { removed, added, hasInlineChanges: lineDiffs.size > 0 };
  }, [beforeLines, afterLines, lineDiffs]);

  const getLineDiff = (idx: number, side: 'before' | 'after') => {
    if (side === 'before') {
      return lineDiffs.get(idx);
    } else {
      for (const [, diff] of lineDiffs.entries()) {
        if (diff.afterIdx === idx) {
          return diff;
        }
      }
      return null;
    }
  };

  const renderLine = (line: string, idx: number, side: 'before' | 'after') => {
    const diff = getLineDiff(idx, side);
    const bSet = new Set(beforeLines.map(l => l.trim()).filter(l => l.length > 0));
    const aSet = new Set(afterLines.map(l => l.trim()).filter(l => l.length > 0));
    
    if (side === 'before') {
      const trimmed = line.trim();
      const hasExactMatch = aSet.has(trimmed);
      const hasPartialMatch = diff !== null;
      
      if (hasPartialMatch && diff) {
        return (
          <div key={idx} className="px-4 py-0.5 whitespace-pre-wrap break-all flex text-slate-400 border-l-2 border-transparent">
            <span className="w-6 inline-block text-slate-700 select-none text-[10px] text-right mr-3">{idx + 1}</span>
            <span>
              {diff.before.map((segment, segIdx) => (
                <span
                  key={segIdx}
                  className={segment.type === 'removed' ? 'bg-red-900/20 text-red-300' : ''}
                >
                  {segment.text}
                </span>
              ))}
            </span>
          </div>
        );
      }
      
      if (!hasExactMatch && trimmed.length > 0) {
        const hasPrefixMatch = Array.from(aSet).some(a => {
          const trimmedA = a.trim();
          return trimmedA.startsWith(trimmed.substring(0, Math.min(trimmed.length, 10))) ||
                 trimmed.startsWith(trimmedA.substring(0, Math.min(trimmedA.length, 10)));
        });
        
        if (!hasPrefixMatch) {
          return (
            <div key={idx} className="px-4 py-0.5 whitespace-pre-wrap break-all flex text-slate-400 border-l-2 border-transparent">
              <span className="w-6 inline-block text-slate-700 select-none text-[10px] text-right mr-3">{idx + 1}</span>
              <span className="bg-red-900/20 text-red-300">{line}</span>
            </div>
          );
        }
      }
      
      return (
        <div key={idx} className="px-4 py-0.5 whitespace-pre-wrap break-all flex text-slate-400 border-l-2 border-transparent">
          <span className="w-6 inline-block text-slate-700 select-none text-[10px] text-right mr-3">{idx + 1}</span>
          <span>{line}</span>
        </div>
      );
    } else {
      const trimmed = line.trim();
      const hasExactMatch = bSet.has(trimmed);
      const hasPartialMatch = diff !== null;
      
      if (hasPartialMatch && diff) {
        return (
          <div key={idx} className="px-4 py-0.5 whitespace-pre-wrap break-all flex text-slate-400 border-l-2 border-transparent">
            <span className="w-6 inline-block text-slate-700 select-none text-[10px] text-right mr-3">{idx + 1}</span>
            <span>
              {diff.after.map((segment, segIdx) => (
                <span
                  key={segIdx}
                  className={segment.type === 'added' ? 'bg-emerald-900/20 text-emerald-300' : ''}
                >
                  {segment.text}
                </span>
              ))}
            </span>
          </div>
        );
      }
      
      if (!hasExactMatch && trimmed.length > 0) {
        const hasPrefixMatch = Array.from(bSet).some(b => {
          const trimmedB = b.trim();
          return trimmedB.startsWith(trimmed.substring(0, Math.min(trimmed.length, 10))) ||
                 trimmed.startsWith(trimmedB.substring(0, Math.min(trimmedB.length, 10)));
        });
        
        if (!hasPrefixMatch) {
          return (
            <div key={idx} className="px-4 py-0.5 whitespace-pre-wrap break-all flex text-slate-400 border-l-2 border-transparent">
              <span className="w-6 inline-block text-slate-700 select-none text-[10px] text-right mr-3">{idx + 1}</span>
              <span className="bg-emerald-900/20 text-emerald-300">{line}</span>
            </div>
          );
        }
      }
      
      return (
        <div key={idx} className="px-4 py-0.5 whitespace-pre-wrap break-all flex text-slate-400 border-l-2 border-transparent">
          <span className="w-6 inline-block text-slate-700 select-none text-[10px] text-right mr-3">{idx + 1}</span>
          <span>{line}</span>
        </div>
      );
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 text-xs font-mono rounded-lg overflow-hidden border border-slate-800 shadow-sm">
      <div className="flex flex-col bg-slate-900">
        <div className="bg-slate-950/50 border-b border-slate-800 px-4 py-2 flex items-center justify-between sticky top-0 z-10">
            <span className="text-red-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                Previous Config
            </span>
            <span className="text-slate-600 text-[10px]">{hasChanges.removed} lines removed</span>
        </div>
        <div className="p-0 overflow-x-auto flex-1 custom-scrollbar min-h-[200px] bg-slate-900">
            <div className="py-2">
                {beforeLines.map((line, idx) => renderLine(line, idx, 'before'))}
                {beforeLines.length === 0 && (
                    <div className="px-8 py-4 text-slate-600 italic">No previous configuration available.</div>
                )}
            </div>
        </div>
      </div>
      
      <div className="flex flex-col bg-slate-900 border-l border-slate-800">
        <div className="bg-slate-950/50 border-b border-slate-800 px-4 py-2 flex items-center justify-between sticky top-0 z-10">
            <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                New Config
            </span>
            <span className="text-slate-600 text-[10px]">{hasChanges.added} lines added</span>
        </div>
        <div className="p-0 overflow-x-auto flex-1 custom-scrollbar min-h-[200px] bg-slate-900">
            <div className="py-2">
                {afterLines.map((line, idx) => renderLine(line, idx, 'after'))}
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