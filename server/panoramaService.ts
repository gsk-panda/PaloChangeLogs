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
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
        const response = await fetch(pollUrl, {
             headers: { 'Accept': 'application/xml' }
        });
        
        if (!response.ok) throw new Error(`Polling failed: ${response.status}`);
        
        const text = await response.text();
        const doc = parser.parse(text);
        
        const respStatus = doc.response?.['@_status'];
        if (respStatus === 'error') {
            const msg = doc.response?.result?.msg?.['#text'] || 
                       doc.response?.msg?.['#text'] ||
                       "Unknown job error";
            throw new Error(`Job failed: ${msg}`);
        }
        
        if (doc.response?.result?.entry) return text;

        const jobStatus = doc.response?.result?.job?.status?.['#text'];
        if (jobStatus === 'COMPLETE' || jobStatus === 'FIN') return text;

        await delay(1000);
        attempts++;
    }
    throw new Error("Timeout waiting for Panorama log query.");
};

const executePanoramaQuery = async (queryParams: string): Promise<string> => {
    const url = `${PANORAMA_HOST}/api/?${queryParams}&key=${encodeURIComponent(PANORAMA_API_KEY)}&_t=${Date.now()}`;

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

        const doc = parser.parse(text);
        
        const respStatus = doc.response?.['@_status'];
        if (respStatus === "error") {
            const errorMsg = doc.response?.result?.msg?.['#text'] || 
                           doc.response?.msg?.['#text'] ||
                           "Unknown API Error";
            throw new Error(`Panorama API error: ${errorMsg}`);
        }
        
        const jobNode = doc.response?.result?.job;
        const isJobIdOnly = jobNode && !jobNode.status;
        
        if (isJobIdOnly) {
             const jobId = typeof jobNode === 'string' ? jobNode : jobNode?.['#text'];
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

  const entries = Array.isArray(doc.response?.result?.entry) 
    ? doc.response.result.entry 
    : doc.response?.result?.entry 
      ? [doc.response.result.entry] 
      : [];
  
  const records: ChangeRecord[] = [];

  entries.forEach((entry: any, index: number) => {
    try {
      const cmd = entry.cmd?.['#text'] || entry.cmd || "unknown";
      const seqno = entry.seqno?.['#text'] || entry.seqno || "";
      const timeStr = entry.receive_time?.['#text'] || entry.receive_time || new Date().toISOString();
      const admin = entry.admin?.['#text'] || entry.admin || "system";
      const path = entry.path?.['#text'] || entry.path || "";
      
      let type: ChangeType = ChangeType.SYSTEM;
      if (path.includes("policy")) type = ChangeType.SECURITY_POLICY;
      else if (path.includes("address") || path.includes("object")) type = ChangeType.OBJECT;
      else if (path.includes("network") || path.includes("interface")) type = ChangeType.NETWORK;

      const beforePreview = entry['before-change-detail']?.['#text'] || entry['before-change-detail'] || "";
      const afterPreview = entry['after-change-detail']?.['#text'] || entry['after-change-detail'] || "";

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

export const fetchChangeLogsRange = async (startDate: string, endDate: string): Promise<ChangeRecord[]> => {
    let params = 'type=log&log-type=config&nlogs=200'; 
    
    const start = formatDateForPanorama(startDate);
    const end = formatDateForPanorama(endDate);
    const query = `(receive_time geq '${start} 00:00:00') and (receive_time leq '${end} 23:59:59')`;
    params += `&query=${encodeURIComponent(query)}`;
    
    const xml = await executePanoramaQuery(params);
    return parsePanoramaXML(xml);
}

