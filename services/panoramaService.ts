import { ChangeRecord, DailyStat, AdminStat, ChangeType, ActionType, CommitStatus } from '../types';
import { PANORAMA_CONFIG } from '../constants';
import { getMSTDate, extractDateFromTimestamp, addDaysToDateString } from '../utils/dateUtils';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Polls the Panorama API for job results given a Job ID
 */
const pollForJobResults = async (jobId: string): Promise<string> => {
    const { HOST } = PANORAMA_CONFIG;
    const pollUrl = `${HOST}/api/?type=log&action=get&job-id=${jobId}`;
    
    let attempts = 0;
    const maxAttempts = 30; 

    while (attempts < maxAttempts) {
        const response = await fetch(pollUrl, {
             headers: { 'Accept': 'application/xml' }
        });
        
        if (!response.ok) throw new Error(`Polling failed: ${response.status}`);
        
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        
        const respStatus = doc.querySelector("response")?.getAttribute("status");
        if (respStatus === 'error') {
            const msg = doc.querySelector("result msg")?.textContent?.trim() || 
                       doc.querySelector("msg")?.textContent?.trim() ||
                       "Unknown job error";
            throw new Error(`Job failed: ${msg}`);
        }
        
        if (doc.querySelectorAll("entry").length > 0) return text;

        const jobStatus = doc.querySelector("job status")?.textContent;
        if (jobStatus === 'COMPLETE' || jobStatus === 'FIN') return text;

        await delay(1000);
        attempts++;
    }
    throw new Error("Timeout waiting for Panorama log query.");
}

/**
 * Generic helper to execute a Panorama query string
 */
const executePanoramaQuery = async (queryParams: string): Promise<string> => {
    const { HOST } = PANORAMA_CONFIG;
    const url = `${HOST}/api/?${queryParams}&_t=${Date.now()}`;

    try {
        // Attempt actual fetch
        const response = await fetch(url, {
            headers: { 'Accept': 'application/xml' }
        });
        
        if (!response.ok) {
             if (response.status === 404) throw new Error(`Endpoint not found (404).`);
             if (response.status === 403) throw new Error(`Access Denied (403).`);
             throw new Error(`API Request Failed: ${response.status}`);
        }
        
        const text = await response.text();
        
        if (text.trim().toLowerCase().startsWith('<!doctype html') || text.trim().toLowerCase().startsWith('<html')) {
             throw new Error("Received HTML instead of XML. Check proxy settings.");
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        
        const respStatus = doc.querySelector("response")?.getAttribute("status");
        if (respStatus === "error") {
            const errorMsg = doc.querySelector("result msg")?.textContent?.trim() || 
                           doc.querySelector("msg")?.textContent?.trim() ||
                           "Unknown API Error";
            throw new Error(`Panorama API error: ${errorMsg}`);
        }
        
        const jobNode = doc.querySelector("result job");
        const isJobIdOnly = jobNode && !doc.querySelector("result job status");
        
        if (isJobIdOnly) {
             const jobId = jobNode.textContent?.trim();
             if (jobId) return await pollForJobResults(jobId);
        }
        
        return text;
    } catch (error) {
        console.error("Panorama Fetch Error:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(`Panorama API request failed: ${String(error)}`);
    }
}

/**
 * Helper to parse Panorama XML response
 */
const parsePanoramaXML = (xmlText: string): ChangeRecord[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  
  const status = xmlDoc.querySelector("response")?.getAttribute("status");
  if (status === "error") {
    const msg = xmlDoc.querySelector("result msg")?.textContent?.trim() || 
                xmlDoc.querySelector("msg")?.textContent?.trim() ||
                xmlDoc.querySelector("result")?.textContent?.trim() ||
                "Unknown API Error";
    throw new Error(`Panorama API returned error: ${msg}`);
  }

  const entries = xmlDoc.querySelectorAll("entry");
  const records: ChangeRecord[] = [];

  entries.forEach((entry, index) => {
    try {
      const cmd = entry.querySelector("cmd")?.textContent || "unknown";
      const seqno = entry.querySelector("seqno")?.textContent || "";
      const timeStr = entry.querySelector("receive_time")?.textContent || new Date().toISOString();
      const admin = entry.querySelector("admin")?.textContent || "system";
      const path = entry.querySelector("path")?.textContent || "";
      
      let type = ChangeType.SYSTEM;
      if (path.includes("policy")) type = ChangeType.SECURITY_POLICY;
      else if (path.includes("address") || path.includes("object")) type = ChangeType.OBJECT;
      else if (path.includes("network") || path.includes("interface")) type = ChangeType.NETWORK;

      const beforePreview = entry.querySelector("before-change-detail")?.textContent || "";
      const afterPreview = entry.querySelector("after-change-detail")?.textContent || "";

      records.push({
        id: `log-${seqno || index}-${Date.now()}`,
        seqno: seqno,
        timestamp: timeStr,
        admin: admin,
        deviceGroup: 'Global',
        type: type,
        action: cmd === 'add' ? ActionType.ADD : cmd === 'delete' ? ActionType.DELETE : ActionType.EDIT,
        description: path,
        status: CommitStatus.SUCCESS, 
        diffBefore: beforePreview || 'No previous configuration state.',
        diffAfter: afterPreview || 'No new configuration state.', 
      });
    } catch (e) {
      console.warn("Failed to parse log entry", e);
    }
  });

  return records;
};

const formatDateForPanorama = (dateStr: string): string => {
    const parts = dateStr.split(/[-\/]/);
    if (parts.length === 3) {
        let year: string, month: string, day: string;
        if (parts[0].length === 4) {
            [year, month, day] = parts;
        } else {
            [month, day, year] = parts;
        }
        return `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
    }
    return dateStr.replace(/-/g, '/');
};

/**
 * Fetches change logs for a specific date range (start to end inclusive)
 */
export const fetchChangeLogsRange = async (startDate: string, endDate: string, maxLogs?: number): Promise<ChangeRecord[]> => {
    const nlogs = maxLogs || 200;
    let params = `type=log&log-type=config&nlogs=${nlogs}`; 
    
    const start = formatDateForPanorama(startDate);
    const end = formatDateForPanorama(endDate);
    const query = `(receive_time geq '${start} 00:00:00') and (receive_time leq '${end} 23:59:59')`;
    params += `&query=${encodeURIComponent(query)}`;
    
    const xml = await executePanoramaQuery(params);
    return parsePanoramaXML(xml);
}

/**
 * Fetches ALL change logs for a specific date range by making multiple requests if needed
 */
export const fetchAllChangeLogsRange = async (startDate: string, endDate: string): Promise<ChangeRecord[]> => {
    const allLogs: ChangeRecord[] = [];
    const batchSize = 500;
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
        const start = formatDateForPanorama(startDate);
        const end = formatDateForPanorama(endDate);
        const query = `(receive_time geq '${start} 00:00:00') and (receive_time leq '${end} 23:59:59')`;
        
        let params = `type=log&log-type=config&nlogs=${batchSize}`;
        params += `&query=${encodeURIComponent(query)}`;
        
        if (offset > 0) {
            params += `&skip=${offset}`;
        }
        
        try {
            const xml = await executePanoramaQuery(params);
            const batchLogs = parsePanoramaXML(xml);
            
            if (batchLogs.length === 0) {
                hasMore = false;
            } else {
                allLogs.push(...batchLogs);
                
                if (batchLogs.length < batchSize) {
                    hasMore = false;
                } else {
                    offset += batchSize;
                }
            }
        } catch (err) {
            console.error("Error fetching batch of logs:", err);
            hasMore = false;
        }
    }
    
    return allLogs;
}

/**
 * Calculates daily statistics for a specific 7-day range
 * Only counts logs that have a description (matching Change Log table filter)
 */
export const calculateDailyStatsInRange = (logs: ChangeRecord[], endDateStr: string): DailyStat[] => {
    const statsMap = new Map<string, number>();
    
    for (let i = 0; i < 7; i++) {
        const daysOffset = -(6 - i);
        const key = addDaysToDateString(endDateStr, daysOffset);
        statsMap.set(key, 0);
    }
  
    logs.forEach(log => {
      const hasDescription = log.description && log.description.trim().length > 0;
      if (!hasDescription) return;
      
      const dateKey = extractDateFromTimestamp(log.timestamp);
      if (statsMap.has(dateKey)) {
        statsMap.set(dateKey, (statsMap.get(dateKey) || 0) + 1);
      }
    });
  
    const stats = Array.from(statsMap.entries()).map(([date, changes]) => ({ date, changes }));
    return stats.sort((a, b) => {
      const dateA = getMSTDate(a.date).getTime();
      const dateB = getMSTDate(b.date).getTime();
      return dateA - dateB;
    });
};

/**
 * Aggregates change counts per administrator
 */
export const calculateAdminStats = (logs: ChangeRecord[]): AdminStat[] => {
    const adminMap = new Map<string, number>();
    
    logs.forEach(log => {
        adminMap.set(log.admin, (adminMap.get(log.admin) || 0) + 1);
    });

    return Array.from(adminMap.entries())
        .map(([admin, changes]) => ({ admin, changes }))
        .sort((a, b) => b.changes - a.changes);
}

export const fetchLogDetail = async (seqno: string): Promise<string> => {
    const query = `(seqno eq ${seqno})`;
    const params = `type=log&log-type=config&show-detail=yes&query=${encodeURIComponent(query)}&uniq=yes&dir=backward&nlogs=1`;
    return await executePanoramaQuery(params);
}

/**
 * Helper to parse detailed XML response
 */
export const parseDetailedXml = (xml: string): { before: string, after: string } => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const entry = doc.querySelector("entry");
    
    if (!entry) return { before: '', after: '' };
    
    const before = entry.querySelector("before-change-detail")?.textContent?.trim() || "";
    const after = entry.querySelector("after-change-detail")?.textContent?.trim() || "";
    
    return { before, after };
}