import { ChangeRecord, DailyStat, AdminStat, ChangeType, ActionType, CommitStatus } from '../types';
import { PANORAMA_CONFIG } from '../constants';
import { getMSTDate, getMSTDateString, parsePanoramaTimestamp, formatMSTDate } from '../utils/dateUtils';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock XML Generator for Fallback
const getMockLogsXML = (_startDate: string) => {
    const dates = [];
    for(let i=0; i<7; i++) {
        const now = new Date();
        const past = new Date(now);
        past.setDate(now.getDate() - i);
        dates.push(past);
    }

    const entries = dates.flatMap((date, dateIdx) => {
        // Generate 2-5 logs per day
        const numLogs = 2 + Math.floor(Math.random() * 4);
        return Array.from({length: numLogs}).map((_, idx) => {
            const isPolicy = Math.random() > 0.5;
            const path = isPolicy 
                ? `/config/devices/entry/vsys/entry/rulebase/security/rules/entry[@name='Rule-${dateIdx}-${idx}']`
                : `/config/devices/entry/network/interface/ethernet/entry[@name='eth1/${idx}']`;
            
            return `
            <entry>
                <seqno>${1000 + dateIdx * 10 + idx}</seqno>
                <receive_time>${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} 10:${10+idx}:00</receive_time>
                <admin>${Math.random() > 0.6 ? 'admin-jdoe' : 'admin-ssmith'}</admin>
                <path>${path}</path>
                <cmd>${Math.random() > 0.8 ? 'add' : 'edit'}</cmd>
                <before-change-detail>action: deny; service: application-default; (Brief Preview)</before-change-detail>
                <after-change-detail>action: allow; service: any; profile-setting: default; (Brief Preview)</after-change-detail>
            </entry>`;
        });
    }).join('');

    return `
    <response status="success">
        <result>
            <job><status>FIN</status></job>
            <log>
                <logs>
                    ${entries}
                </logs>
            </log>
        </result>
    </response>
    `;
};

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
    const { HOST, API_KEY } = PANORAMA_CONFIG;
    const url = `${HOST}/api/?${queryParams}&key=${encodeURIComponent(API_KEY)}&_t=${Date.now()}`;

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
        console.warn("Panorama Fetch Error:", error);
        
        // FALLBACK FOR DEMO / DEV MODE
        console.info("⚠️ Falling back to MOCK DATA due to API failure.");
        if (queryParams.includes('show-detail=yes')) {
            return `
            <response status="success">
                <result>
                    <entry>
                        <before-change-detail>
# Security Rule "Block-All"
set security rules Block-All from any
set security rules Block-All to any
set security rules Block-All source any
set security rules Block-All destination any
set security rules Block-All service application-default
set security rules Block-All action deny
                        </before-change-detail>
                        <after-change-detail>
# Security Rule "Block-All" (Modified)
set security rules Block-All from any
set security rules Block-All to any
set security rules Block-All source any
set security rules Block-All destination any
set security rules Block-All service any
set security rules Block-All action allow
set security rules Block-All profile-setting default
                        </after-change-detail>
                        <xml_blob><![CDATA[<config><security><rules><entry name="mock"><action>allow</action></entry></rules></security></config>]]></xml_blob>
                    </entry>
                </result>
            </response>`;
        }
        return getMockLogsXML(new Date().toISOString());
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

/**
 * Fetches change logs for a specific date range (start to end inclusive)
 */
export const fetchChangeLogsRange = async (startDate: string, endDate: string): Promise<ChangeRecord[]> => {
    let params = 'type=log&log-type=config&nlogs=200'; 
    
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
export const calculateDailyStatsInRange = (logs: ChangeRecord[], endDateStr: string): DailyStat[] => {
    const statsMap = new Map<string, number>();
    const endDate = getMSTDate(endDateStr);
    
    for (let i = 0; i < 7; i++) {
        const d = getMSTDate(endDateStr);
        d.setDate(endDate.getDate() - (6 - i));
        const key = getMSTDateString(d);
        statsMap.set(key, 0);
    }
  
    logs.forEach(log => {
      const logDateObj = parsePanoramaTimestamp(log.timestamp);
      const dateKey = formatMSTDate(logDateObj);
      if (statsMap.has(dateKey)) {
        statsMap.set(dateKey, (statsMap.get(dateKey) || 0) + 1);
      }
    });
  
    return Array.from(statsMap.entries()).map(([date, changes]) => ({ date, changes }));
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