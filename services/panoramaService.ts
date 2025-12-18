import { ChangeRecord, DailyStat, AdminStat, ChangeType, ActionType, CommitStatus } from '../types';
import { PANORAMA_CONFIG } from '../constants';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Polls the Panorama API for job results given a Job ID
 */
const pollForJobResults = async (jobId: string): Promise<string> => {
    const { HOST, API_KEY } = PANORAMA_CONFIG;
    const pollUrl = `${HOST}/api/?type=log&action=get&job-id=${jobId}&key=${encodeURIComponent(API_KEY)}`;
    
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
        
        if (doc.querySelectorAll("entry").length > 0) return text;

        const jobStatus = doc.querySelector("job status")?.textContent;
        if (jobStatus === 'COMPLETE' || jobStatus === 'FIN') return text; 

        const respStatus = doc.querySelector("response")?.getAttribute("status");
        if (respStatus === 'error') {
            const msg = doc.querySelector("result msg")?.textContent || "Unknown job error";
            throw new Error(`Job failed: ${msg}`);
        }

        await delay(1000);
        attempts++;
    }
    throw new Error("Timeout waiting for Panorama log query.");
}

/**
 * Generic helper to execute a Panorama query string
 */
const executePanoramaQuery = async (queryParams: string): Promise<string> => {
    const { HOST, API_KEY } = PANORAMA_CONFIG;
    const url = `${HOST}/api/?${queryParams}&key=${encodeURIComponent(API_KEY)}&_t=${Date.now()}`;

    try {
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
        const jobNode = doc.querySelector("result job");
        const isJobIdOnly = jobNode && !doc.querySelector("result job status");
        
        if (isJobIdOnly) {
             const jobId = jobNode.textContent?.trim();
             if (jobId) return await pollForJobResults(jobId);
        }
        
        return text;
    } catch (error) {
        console.error("Panorama Fetch Error:", error);
        throw error;
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
    const msg = xmlDoc.querySelector("result msg")?.textContent || "Unknown API Error";
    throw new Error(`Panorama API returned error: ${msg}`);
  }

  const entries = xmlDoc.querySelectorAll("entry");
  const records: ChangeRecord[] = [];

  entries.forEach((entry, index) => {
    try {
      const cmd = entry.querySelector("cmd")?.textContent || "unknown";
      if (cmd !== 'set' && cmd !== 'edit') return; 

      const seqno = entry.querySelector("seqno")?.textContent || "";
      const timeStr = entry.querySelector("receive_time")?.textContent || new Date().toISOString();
      const admin = entry.querySelector("admin")?.textContent || "system";
      const path = entry.querySelector("path")?.textContent || "";
      
      let type = ChangeType.SYSTEM;
      if (path.includes("policy")) type = ChangeType.SECURITY_POLICY;
      else if (path.includes("address") || path.includes("object")) type = ChangeType.OBJECT;
      else if (path.includes("network") || path.includes("interface")) type = ChangeType.NETWORK;

      const beforePreview = entry.querySelector("before-change-preview")?.textContent || "";
      const afterPreview = entry.querySelector("after-change-preview")?.textContent || "";

      records.push({
        id: `log-${seqno || index}-${Date.now()}`,
        seqno: seqno,
        timestamp: timeStr,
        admin: admin,
        deviceGroup: 'Global',
        type: type,
        action: ActionType.EDIT,
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

/**
 * Fetches change logs for a specific date range (start to end inclusive)
 */
export const fetchChangeLogsRange = async (startDate: string, endDate: string): Promise<ChangeRecord[]> => {
    // Increase nlogs as we are fetching a larger window
    let params = 'type=log&log-type=config&nlogs=2000'; 
    
    const start = startDate.replace(/-/g, '/');
    const end = endDate.replace(/-/g, '/');
    const query = `(receive_time geq '${start} 00:00:00') and (receive_time leq '${end} 23:59:59')`;
    params += `&query=${encodeURIComponent(query)}`;
    
    const xml = await executePanoramaQuery(params);
    return parsePanoramaXML(xml);
}

/**
 * Calculates daily statistics for a specific 7-day range
 */
const getLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const calculateDailyStatsInRange = (logs: ChangeRecord[], endDateStr: string): DailyStat[] => {
    const statsMap = new Map<string, number>();
    const endDate = getLocalDate(endDateStr);
    
    // Initialize the 7-day map with 0s to ensure consistent chart
    for (let i = 0; i < 7; i++) {
        const d = new Date(endDate);
        d.setDate(endDate.getDate() - (6 - i));
        const key = formatDateForAPI(d);
        statsMap.set(key, 0);
    }
  
    const normalizeLogDate = (timestamp: string): string => {
      if (!timestamp) return '';
      const datePart = timestamp.split(' ')[0].trim();
      const normalized = datePart.replace(/\//g, '-');
      const parts = normalized.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      return normalized;
    };

    logs.forEach(log => {
      const dateKey = normalizeLogDate(log.timestamp);
      if (statsMap.has(dateKey)) {
        statsMap.set(dateKey, (statsMap.get(dateKey) || 0) + 1);
      }
    });

    const stats = Array.from(statsMap.entries())
      .map(([date, changes]) => ({ date, changes }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    return stats;
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