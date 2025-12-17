import { ChangeRecord, DailyStat, ChangeType, ActionType, CommitStatus } from '../types';
import { PANORAMA_CONFIG } from '../constants';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Polls the Panorama API for job results given a Job ID
 */
const pollForJobResults = async (jobId: string): Promise<string> => {
    const { HOST, API_KEY } = PANORAMA_CONFIG;
    // Note: API Key encoding is critical here.
    const pollUrl = `${HOST}/api/?type=log&action=get&job-id=${jobId}&key=${encodeURIComponent(API_KEY)}`;
    
    let attempts = 0;
    const maxAttempts = 30; 

    while (attempts < maxAttempts) {
        console.log(`[Panorama Service] Polling Job ${jobId} (Attempt ${attempts + 1})...`);
        const response = await fetch(pollUrl, {
             headers: { 'Accept': 'application/xml' }
        });
        
        if (!response.ok) throw new Error(`Polling failed: ${response.status}`);
        
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        
        // 1. Check for entries (Success)
        if (doc.querySelectorAll("entry").length > 0) {
            return text;
        }

        // 2. Check for Explicit COMPLETE status 
        const jobStatus = doc.querySelector("job status")?.textContent;
        if (jobStatus === 'COMPLETE' || jobStatus === 'FIN') {
             return text; 
        }

        // 3. Check for API Error
        const respStatus = doc.querySelector("response")?.getAttribute("status");
        if (respStatus === 'error') {
            const msg = doc.querySelector("result msg")?.textContent || "Unknown job error";
            throw new Error(`Job failed: ${msg}`);
        }

        // 4. Wait and retry
        await delay(1000);
        attempts++;
    }
    throw new Error("Timeout waiting for Panorama log query.");
}

/**
 * Generic helper to execute a Panorama query string, handling async Job IDs if necessary.
 */
const executePanoramaQuery = async (queryParams: string): Promise<string> => {
    const { HOST, API_KEY } = PANORAMA_CONFIG;
    // Construct full URL. 
    // We add a timestamp to prevent caching.
    const url = `${HOST}/api/?${queryParams}&key=${encodeURIComponent(API_KEY)}&_t=${Date.now()}`;

    console.log(`[Panorama Service] Executing Query: ${url}`);

    try {
        const response = await fetch(url, {
            headers: { 'Accept': 'application/xml' }
        });
        
        if (!response.ok) {
             if (response.status === 404) throw new Error(`Endpoint not found (404). Check HOST/Proxy config.`);
             if (response.status === 403) throw new Error(`Access Denied (403). Check API Key.`);
             throw new Error(`API Request Failed: ${response.status}`);
        }
        
        const text = await response.text();
        
        // Safety check for HTML responses
        if (text.trim().toLowerCase().startsWith('<!doctype html') || text.trim().toLowerCase().startsWith('<html')) {
             console.error("Received HTML response:", text.substring(0, 500));
             throw new Error("Received HTML instead of XML. The proxy target may be incorrect, the API key invalid, or the server is returning a login page.");
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        
        // Check if the response is a Job ID
        const jobNode = doc.querySelector("result job");
        // Ensure it is just a job ID response, not a job status response
        const isJobIdOnly = jobNode && !doc.querySelector("result job status");
        
        if (isJobIdOnly) {
             const jobId = jobNode.textContent?.trim();
             if (jobId) {
                 console.log(`[Panorama Service] Async Job ID detected: ${jobId}`);
                 return await pollForJobResults(jobId);
             }
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

      // FILTER: Only show "set" or "edit" commands as requested
      if (cmd !== 'set' && cmd !== 'edit') {
        return; 
      }

      const seqno = entry.querySelector("seqno")?.textContent || "";
      const timeStr = entry.querySelector("receive_time")?.textContent || new Date().toISOString();
      const admin = entry.querySelector("admin")?.textContent || "system";
      const path = entry.querySelector("path")?.textContent || "";
      
      let type = ChangeType.SYSTEM;
      if (path.includes("policy")) type = ChangeType.SECURITY_POLICY;
      else if (path.includes("address") || path.includes("object")) type = ChangeType.OBJECT;
      else if (path.includes("network") || path.includes("interface")) type = ChangeType.NETWORK;

      const action = ActionType.EDIT; // Since we filter for set/edit
      
      const description = `Command '${cmd}' executed on path: ${path.substring(0, 50)}...`;
      const rawContent = new XMLSerializer().serializeToString(entry);

      records.push({
        id: `log-${seqno || index}-${Date.now()}`,
        seqno: seqno,
        timestamp: timeStr,
        admin: admin,
        deviceGroup: 'Global',
        type: type,
        action: action,
        description: description,
        status: CommitStatus.SUCCESS, 
        diffBefore: '<!-- Previous configuration state not available in summary log -->',
        diffAfter: rawContent, 
      });
    } catch (e) {
      console.warn("Failed to parse log entry", e);
    }
  });

  return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

/**
 * Fetches change logs from real Panorama API
 */
export const fetchChangeLogs = async (): Promise<ChangeRecord[]> => {
    // nlogs=100
    const xml = await executePanoramaQuery('type=log&log-type=config&nlogs=100');
    return parsePanoramaXML(xml);
}

/**
 * Fetches detailed log information for a specific sequence number.
 * matches format: query=(seqno eq <id>)&uniq=yes&dir=backward&nlogs=1
 */
export const fetchLogDetail = async (seqno: string): Promise<string> => {
    if (!seqno) throw new Error("Sequence number is required to fetch details.");
    
    // Note: The parentheses in the query often need to be encoded, but encodeURIComponent handles that.
    const query = `(seqno eq ${seqno})`;
    const params = `type=log&log-type=config&show-detail=yes&query=${encodeURIComponent(query)}&uniq=yes&dir=backward&nlogs=1`;
    
    return await executePanoramaQuery(params);
}

/**
 * Calculates daily statistics from existing logs
 */
export const calculateDailyStats = (logs: ChangeRecord[]): DailyStat[] => {
    const statsMap = new Map<string, number>();
  
    logs.forEach(log => {
      const dateObj = new Date(log.timestamp);
      if (!isNaN(dateObj.getTime())) {
        const dateKey = dateObj.toISOString().split('T')[0];
        statsMap.set(dateKey, (statsMap.get(dateKey) || 0) + 1);
      }
    });
  
    const sortedStats = Array.from(statsMap.entries())
      .map(([date, changes]) => ({ date, changes }))
      .sort((a, b) => a.date.localeCompare(b.date));
  
    return sortedStats;
};