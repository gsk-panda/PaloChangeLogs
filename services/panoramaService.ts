import { ChangeRecord, DailyStat, ChangeType, ActionType, CommitStatus } from '../types';
import { PANORAMA_CONFIG } from '../constants';

/**
 * Helper to parse Panorama XML response
 */
const parsePanoramaXML = (xmlText: string): ChangeRecord[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  const entries = xmlDoc.querySelectorAll("entry");
  const records: ChangeRecord[] = [];

  entries.forEach((entry, index) => {
    try {
      // Extract fields from XML
      const timeStr = entry.querySelector("receive_time")?.textContent || new Date().toISOString();
      const admin = entry.querySelector("admin")?.textContent || "system";
      const cmd = entry.querySelector("cmd")?.textContent || "unknown";
      const path = entry.querySelector("path")?.textContent || "";
      const typeStr = entry.querySelector("type")?.textContent || "";
      
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
      // In a real production app, we would make a secondary call to 'show config diff' based on versions.
      // Here we format the XML content we have as the "After" state.
      const rawContent = new XMLSerializer().serializeToString(entry);

      records.push({
        id: `log-${index}-${Date.now()}`,
        timestamp: timeStr, // Panorama usually sends YYYY/MM/DD HH:mm:ss
        admin: admin,
        deviceGroup: 'Global', // Default if not parsed from path
        type: type,
        action: action,
        description: description,
        status: CommitStatus.SUCCESS, // Config logs imply successful entry
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
  // Query for config logs, last 50 entries
  const url = `${HOST}/api/?type=log&log-type=config&nlogs=50&key=${encodeURIComponent(API_KEY)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Panorama API Error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    // Validate that we actually got XML back and not an HTML error page from a proxy/firewall
    if (text.trim().toLowerCase().startsWith('<!doctype html')) {
       throw new Error("Received HTML instead of XML. Check authentication or proxy settings.");
    }
    
    return parsePanoramaXML(text);

  } catch (error) {
    // Propagate error to allow UI to show failure state
    console.error("Failed to fetch from Panorama:", error);
    throw error;
  }
};

/**
 * Fetches daily statistics.
 * Aggregates data from the logs since Panorama lacks a direct stats API.
 */
export const fetchDailyStats = async (): Promise<DailyStat[]> => {
  try {
    const logs = await fetchChangeLogs();
    
    const statsMap = new Map<string, number>();
  
    logs.forEach(log => {
      // Parse standard Panorama date format "2023/10/26 14:00:00"
      const dateObj = new Date(log.timestamp);
      if (!isNaN(dateObj.getTime())) {
        const dateKey = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
        statsMap.set(dateKey, (statsMap.get(dateKey) || 0) + 1);
      }
    });
  
    const sortedStats = Array.from(statsMap.entries())
      .map(([date, changes]) => ({ date, changes }))
      .sort((a, b) => a.date.localeCompare(b.date));
  
    return sortedStats;
  } catch (error) {
    console.error("Error generating stats:", error);
    throw error;
  }
};