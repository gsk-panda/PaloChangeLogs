import { ChangeRecord, DailyStat, ChangeType, ActionType, CommitStatus } from '../types';
import { PANORAMA_CONFIG } from '../constants';

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

  return records;
};

/**
 * Fetches change logs from real Panorama API
 */
export const fetchChangeLogs = async (): Promise<ChangeRecord[]> => {
  const { HOST, API_KEY } = PANORAMA_CONFIG;
  
  // Use 'key' query parameter which is standard for most PAN-OS versions XML API
  // Using encodeURIComponent is crucial for keys with special chars
  const url = `${HOST}/api/?type=log&log-type=config&nlogs=50&key=${encodeURIComponent(API_KEY)}`;

  console.log(`[Panorama Service] Fetching URL: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      // Removed custom headers to avoid preflight OPTIONS issues with some proxies
    });

    if (!response.ok) {
      if (response.status === 404) {
         throw new Error(`Endpoint not found (404). The proxy path '${HOST}' might be misconfigured.`);
      }
      if (response.status === 403) {
         throw new Error(`Access Denied (403). Check if the API Key has correct permissions.`);
      }
      throw new Error(`Panorama API HTTP Error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    
    // DEBUG: Log the start of response
    console.log("[Panorama Service] Response start:", text.substring(0, 100));

    // Validate that we actually got XML back
    if (text.trim().toLowerCase().startsWith('<!doctype html') || text.trim().toLowerCase().startsWith('<html')) {
       // Check if we accidentally got our own index.html (common proxy misconfig)
       if (text.includes('id="root"') || text.includes('src="/index.tsx"')) {
           throw new Error("CONFIGURATION ERROR: The app fetched its own index.html instead of the API. This usually means HOST in constants.ts is set to a URL that does not match the 'proxy' in vite.config.ts.");
       }

       // Try to extract title tag to see what page we hit
       const titleMatch = text.match(/<title>(.*?)<\/title>/i);
       const title = titleMatch ? titleMatch[1] : "Unknown Page";
       
       // Include a snippet of the HTML body for debugging
       const snippet = text.substring(0, 200).replace(/</g, '&lt;');
       
       throw new Error(`Received HTML instead of XML (Page Title: "${title}"). \nRaw start: ${snippet}`);
    }
    
    return parsePanoramaXML(text);

  } catch (error) {
    console.error("Failed to fetch from Panorama:", error);
    throw error;
  }
};

/**
 * Fetches daily statistics.
 */
export const fetchDailyStats = async (): Promise<DailyStat[]> => {
  try {
    const logs = await fetchChangeLogs();
    
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
  } catch (error) {
    console.error("Error generating stats:", error);
    return [];
  }
};