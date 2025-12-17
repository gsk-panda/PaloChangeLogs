import { ChangeRecord, DailyStat, ChangeType, ActionType, CommitStatus } from '../types';
import { PANORAMA_CONFIG } from '../constants';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper to parse Panorama XML response
 */
const parsePanoramaXML = (xmlText: string): ChangeRecord[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  
  // Check for API errors in XML format
  const status = xmlDoc.querySelector("response")?.getAttribute("status");
  if (status === "error") {
    const msg = xmlDoc.querySelector("result msg")?.textContent || "Unknown API Error";
    throw new Error(`Panorama API returned error: ${msg}`);
  }

  const entries = xmlDoc.querySelectorAll("entry");
  const records: ChangeRecord[] = [];

  entries.forEach((entry, index) => {
    try {
      // Extract fields from XML
      const timeStr = entry.querySelector("receive_time")?.textContent || new Date().toISOString();
      const admin = entry.querySelector("admin")?.textContent || "system";
      const cmd = entry.querySelector("cmd")?.textContent || "unknown";
      const path = entry.querySelector("path")?.textContent || "";
      
      // Map to Application Types
      let type = ChangeType.SYSTEM;
      if (path.includes("policy")) type = ChangeType.SECURITY_POLICY;
      else if (path.includes("address") || path.includes("object")) type = ChangeType.OBJECT;
      else if (path.includes("network") || path.includes("interface")) type = ChangeType.NETWORK;

      let action = ActionType.EDIT;
      if (cmd === 'add') action = ActionType.ADD;
      if (cmd === 'delete') action = ActionType.DELETE;
      
      // Construct a description from the path if implicit
      const description = `Command '${cmd}' executed on path: ${path.substring(0, 50)}...`;

      // Simulating Diff (Panorama Config Logs don't always return full diff in the summary view)
      const rawContent = new XMLSerializer().serializeToString(entry);

      records.push({
        id: `log-${index}-${Date.now()}`,
        timestamp: timeStr, // Panorama usually sends YYYY/MM/DD HH:mm:ss
        admin: admin,
        deviceGroup: 'Global', // Default if not parsed from path
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

  // Sort records by timestamp descending (newest first)
  return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

/**
 * Polls the Panorama API for job results given a Job ID
 */
const pollForJobResults = async (jobId: string): Promise<string> => {
    const { HOST, API_KEY } = PANORAMA_CONFIG;
    // Note: Use encodeURIComponent for the key
    const pollUrl = `${HOST}/api/?type=log&action=get&job-id=${jobId}&key=${encodeURIComponent(API_KEY)}`;
    
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout roughly

    while (attempts < maxAttempts) {
        console.log(`[Panorama Service] Polling Job ${jobId} (Attempt ${attempts + 1})...`);
        const response = await fetch(pollUrl);
        if (!response.ok) throw new Error(`Polling failed: ${response.status}`);
        
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        
        // 1. Check for entries (Success)
        // If the job is done and returned logs, <entry> tags will be present
        if (doc.querySelectorAll("entry").length > 0) {
            return text;
        }

        // 2. Check for Explicit COMPLETE status without entries (Empty Success)
        // User specified status should be COMPLETE
        const jobStatus = doc.querySelector("job status")?.textContent;
        if (jobStatus === 'COMPLETE') {
             // Job finished but no entries found (or different XML structure), return text to be parsed safely
             return text; 
        }

        // 3. Check for API Error
        const respStatus = doc.querySelector("response")?.getAttribute("status");
        if (respStatus === 'error') {
            const msg = doc.querySelector("result msg")?.textContent || "Unknown job error";
            throw new Error(`Job failed: ${msg}`);
        }

        // 4. If 'ACT' (Active) or 'PEND' (Pending), wait and retry
        await delay(1000);
        attempts++;
    }
    throw new Error("Timeout waiting for Panorama log query.");
}

/**
 * Fetches change logs from real Panorama API handling async jobs
 */
export const fetchChangeLogs = async (): Promise<ChangeRecord[]> => {
    const { HOST, API_KEY } = PANORAMA_CONFIG;
    const url = `${HOST}/api/?type=log&log-type=config&nlogs=100&key=${encodeURIComponent(API_KEY)}`;
    
    console.log(`[Panorama Service] Initiating Query: ${url}`);
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
             if (response.status === 404) throw new Error(`Endpoint not found (404). Check HOST/Proxy config.`);
             if (response.status === 403) throw new Error(`Access Denied (403). Check API Key.`);
             throw new Error(`API Request Failed: ${response.status}`);
        }
        
        const text = await response.text();
        console.log("[Panorama Service] Initial Response:", text.substring(0, 150));
        
        // Safety check for HTML responses (proxy errors)
        if (text.trim().toLowerCase().startsWith('<!doctype html') || text.trim().toLowerCase().startsWith('<html')) {
             throw new Error("Received HTML instead of XML. Check Proxy configuration.");
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/xml");
        
        // Check if the response is a Job ID
        // Typical structure: <response status="success"><result><job>123</job></result></response>
        const jobNode = doc.querySelector("result job");
        
        // Ensure it's not a status report node (which has children like <status>, <progress>)
        // Only treat it as a new job ID if it doesn't have status children yet
        const isJobIdOnly = jobNode && !doc.querySelector("result job status");
        
        if (isJobIdOnly) {
             const jobId = jobNode.textContent?.trim();
             if (jobId) {
                 console.log(`[Panorama Service] Async Job ID detected: ${jobId}`);
                 const resultText = await pollForJobResults(jobId);
                 return parsePanoramaXML(resultText);
             }
        }
        
        // Fallback: synchronous response
        return parsePanoramaXML(text);

    } catch (error) {
        console.error("Panorama Fetch Error:", error);
        throw error;
    }
}

/**
 * Calculates daily statistics from existing logs (synchronous)
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