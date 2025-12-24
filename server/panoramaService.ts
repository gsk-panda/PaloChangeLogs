import { ChangeRecord, ChangeType, ActionType, CommitStatus } from '../types';
import { XMLParser } from 'fast-xml-parser';

const PANORAMA_HOST = process.env.PANORAMA_HOST || 'https://panorama.officeours.com';
const PANORAMA_API_KEY = process.env.PANORAMA_API_KEY || 'LUFRPT1UcFFML3JPQ21CRVFLU2w2ZHc1dzU4aVRGN1E9dzczNHg3T0VsRS9yYmFMcEpWdXBWdHkzS2dEa1FqU3dPN0xoejZDMWVpQVVNZlZUeGFIZ0xVMm5vZEtCYVcxdA==';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text'
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const pollForJobResults = async (jobId: string): Promise<string> => {
    const pollUrl = `${PANORAMA_HOST}/api/?type=log&action=get&job-id=${jobId}&key=${encodeURIComponent(PANORAMA_API_KEY)}`;
    
    let attempts = 0;
    const maxAttempts = 60;

    console.log(`[Polling] Starting to poll for job ${jobId}, max attempts: ${maxAttempts}`);

    while (attempts < maxAttempts) {
        const response = await fetch(pollUrl, {
             headers: { 'Accept': 'application/xml' }
        });
        
        if (!response.ok) {
            console.log(`[Polling] Attempt ${attempts + 1}: HTTP ${response.status}`);
            throw new Error(`Polling failed: ${response.status}`);
        }
        
        const text = await response.text();
        const doc = parser.parse(text);
        
        const respStatus = doc.response?.['@_status'];
        if (respStatus === 'error') {
            const msg = doc.response?.result?.msg?.['#text'] || 
                       doc.response?.msg?.['#text'] ||
                       "Unknown job error";
            console.log(`[Polling] Attempt ${attempts + 1}: Error response: ${msg}`);
            throw new Error(`Job failed: ${msg}`);
        }
        
        const entries = Array.isArray(doc.response?.result?.entry) 
            ? doc.response.result.entry 
            : doc.response?.result?.entry 
                ? [doc.response.result.entry] 
                : [];
        
        if (entries.length > 0) {
            console.log(`[Polling] Attempt ${attempts + 1}: Found ${entries.length} entries, returning results`);
            return text;
        }

        const jobStatus = doc.response?.result?.job?.status?.['#text'] || 
                         doc.response?.result?.job?.status;
        
        if (jobStatus === 'COMPLETE' || jobStatus === 'FIN') {
            console.log(`[Polling] Attempt ${attempts + 1}: Job status ${jobStatus}, returning results`);
            if (entries.length === 0) {
                console.log(`[Polling] ⚠ Job completed but no entries found. Response preview: ${text.substring(0, 500)}`);
            }
            return text;
        }
        
        if (attempts % 5 === 0 || attempts === 0) {
            const resultPreview = JSON.stringify(doc.response?.result || {}).substring(0, 300);
            console.log(`[Polling] Attempt ${attempts + 1}/${maxAttempts}: Job status: ${jobStatus || 'PENDING'}, entries: ${entries.length}, result preview: ${resultPreview}`);
        }

        await delay(1000);
        attempts++;
    }
    
    console.log(`[Polling] Timeout after ${maxAttempts} attempts`);
    throw new Error("Timeout waiting for Panorama log query.");
};

const executePanoramaQuery = async (queryParams: string): Promise<string> => {
    const url = `${PANORAMA_HOST}/api/?${queryParams}&key=${encodeURIComponent(PANORAMA_API_KEY)}&_t=${Date.now()}`;

    try {
        console.log(`[Panorama API] Requesting: ${PANORAMA_HOST}/api/?${queryParams.substring(0, 100)}...`);
        const response = await fetch(url, {
            headers: { 'Accept': 'application/xml' }
        });
        console.log(`[Panorama API] Response status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
             if (response.status === 404) throw new Error(`Endpoint not found (404).`);
             if (response.status === 403) throw new Error(`Access Denied (403).`);
             throw new Error(`API Request Failed: ${response.status}`);
        }
        
        const text = await response.text();
        
        if (text.trim().toLowerCase().startsWith('<!doctype html') || text.trim().toLowerCase().startsWith('<html')) {
             throw new Error("Received HTML instead of XML. Check proxy settings.");
        }

        if (text.length < 200) {
            console.log(`[Panorama API] Response preview (first 500 chars): ${text.substring(0, 500)}`);
        }

        const doc = parser.parse(text);
        
        const respStatus = doc.response?.['@_status'];
        if (respStatus === "error") {
            const errorMsg = doc.response?.result?.msg?.['#text'] || 
                           doc.response?.msg?.['#text'] ||
                           "Unknown API Error";
            throw new Error(`Panorama API error: ${errorMsg}`);
        }
        
        const jobNode = doc.response?.result?.job;
        console.log(`[Panorama API] Job node type: ${typeof jobNode}, value:`, jobNode);
        
        const hasJobId = jobNode !== undefined && jobNode !== null;
        const hasStatus = jobNode && typeof jobNode === 'object' && 'status' in jobNode;
        const isJobIdOnly = hasJobId && !hasStatus;
        
        console.log(`[Panorama API] hasJobId: ${hasJobId}, hasStatus: ${hasStatus}, isJobIdOnly: ${isJobIdOnly}`);
        
        if (isJobIdOnly) {
             let jobId: string | undefined;
             if (typeof jobNode === 'string' || typeof jobNode === 'number') {
                 jobId = String(jobNode);
                 console.log(`[Panorama API] Extracted job ID from string/number: ${jobId}`);
             } else if (jobNode && typeof jobNode === 'object') {
                 jobId = jobNode['#text'] || String(jobNode);
                 console.log(`[Panorama API] Extracted job ID from object: ${jobId}`);
             }
             
             if (jobId) {
                 console.log(`[Panorama API] Job ID returned, polling for results: ${jobId}`);
                 return await pollForJobResults(jobId);
             } else {
                 console.log(`[Panorama API] Job node found but couldn't extract ID. Type: ${typeof jobNode}, Value:`, jobNode);
             }
        }
        
        const entryCount = Array.isArray(doc.response?.result?.entry) 
            ? doc.response.result.entry.length 
            : doc.response?.result?.entry 
                ? 1 
                : 0;
        console.log(`[Panorama API] Direct response with ${entryCount} entries`);
        
        return text;
    } catch (error) {
        console.error("Panorama Fetch Error:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(`Panorama API request failed: ${String(error)}`);
    }
}

const parsePanoramaXML = (xmlText: string): ChangeRecord[] => {
  const doc = parser.parse(xmlText);
  
  const status = doc.response?.['@_status'];
  if (status === "error") {
    const msg = doc.response?.result?.msg?.['#text'] || 
                doc.response?.msg?.['#text'] ||
                doc.response?.result?.['#text'] ||
                "Unknown API Error";
    throw new Error(`Panorama API returned error: ${msg}`);
  }

  let entries: any[] = [];
  
  if (doc.response?.result?.log?.logs?.entry) {
    entries = Array.isArray(doc.response.result.log.logs.entry)
      ? doc.response.result.log.logs.entry
      : [doc.response.result.log.logs.entry];
  } else if (doc.response?.result?.entry) {
    entries = Array.isArray(doc.response.result.entry)
      ? doc.response.result.entry
      : [doc.response.result.entry];
  }
  
  console.log(`[Panorama Parse] Found ${entries.length} entries in XML response`);
  if (entries.length === 0 && doc.response?.result) {
    console.log(`[Panorama Parse] Result structure:`, JSON.stringify(doc.response.result, null, 2).substring(0, 1000));
  }
  
  const records: ChangeRecord[] = [];

  entries.forEach((entry: any, index: number) => {
    try {
      const seqno = entry.seqno?.['#text'] || entry.seqno || "";
      const timeStr = entry.receive_time?.['#text'] || entry.receive_time || new Date().toISOString();
      
      const cmd = entry.cmd?.['#text'] || entry.cmd || entry.action?.['#text'] || entry.action || "unknown";
      const admin = entry.admin?.['#text'] || entry.admin || entry.user?.['#text'] || entry.user || "system";
      const path = entry.path?.['#text'] || entry.path || entry.config_path?.['#text'] || entry.config_path || "";
      
      let type: ChangeType = ChangeType.SYSTEM;
      if (path.includes("policy")) type = ChangeType.SECURITY_POLICY;
      else if (path.includes("address") || path.includes("object")) type = ChangeType.OBJECT;
      else if (path.includes("network") || path.includes("interface")) type = ChangeType.NETWORK;

      const beforePreview = entry['before-change-detail']?.['#text'] || entry['before-change-detail'] || entry.before?.['#text'] || entry.before || "";
      const afterPreview = entry['after-change-detail']?.['#text'] || entry['after-change-detail'] || entry.after?.['#text'] || entry.after || "";

      const description = path || `Config change (seqno: ${seqno})`;

      // Skip generic "Config change (seqno:" entries - they don't have meaningful descriptions
      if (description.startsWith('Config change (seqno:')) {
        return; // Skip this entry
      }

      records.push({
        id: `log-${seqno || index}-${Date.now()}`,
        seqno: seqno,
        timestamp: timeStr,
        admin: admin,
        deviceGroup: 'Global',
        type: type,
        action: cmd === 'add' ? ActionType.ADD : cmd === 'delete' ? ActionType.DELETE : ActionType.EDIT,
        description: description,
        status: CommitStatus.SUCCESS,
        diffBefore: beforePreview || 'No previous configuration state.',
        diffAfter: afterPreview || 'No new configuration state.',
      });
    } catch (e) {
      console.warn("Failed to parse log entry", e);
      console.warn("Entry data:", JSON.stringify(entry, null, 2).substring(0, 500));
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

export const fetchChangeLogsRange = async (startDate: string, endDate: string): Promise<ChangeRecord[]> => {
    let params = 'type=log&log-type=config&nlogs=200'; 
    
    const start = formatDateForPanorama(startDate);
    const end = formatDateForPanorama(endDate);
    const query = `(receive_time geq '${start} 00:00:00') and (receive_time leq '${end} 23:59:59')`;
    params += `&query=${encodeURIComponent(query)}`;
    
    console.log(`[Panorama Query] Date range: ${startDate} to ${endDate}`);
    console.log(`[Panorama Query] Formatted: ${start} to ${end}`);
    console.log(`[Panorama Query] Query string: ${query}`);
    
    const xml = await executePanoramaQuery(params);
    console.log(`[Panorama Query] Response length: ${xml.length} characters`);
    
    return parsePanoramaXML(xml);
}

