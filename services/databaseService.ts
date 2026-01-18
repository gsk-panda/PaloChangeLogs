import { ChangeRecord } from '../types';

const API_BASE = '/panorama-proxy';

export const searchChangeLogs = async (searchTerm: string, startDate?: string, endDate?: string): Promise<ChangeRecord[]> => {
  try {
    let url = `${API_BASE}/api/db/search?query=${encodeURIComponent(searchTerm)}`;
    if (startDate) {
      url += `&startDate=${encodeURIComponent(startDate)}`;
    }
    if (endDate) {
      url += `&endDate=${encodeURIComponent(endDate)}`;
    }
    console.log(`[Database] Searching database${startDate && endDate ? ` from ${startDate} to ${endDate}` : ' (all dates)'} for "${searchTerm}"`);
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Database] Search failed with status ${response.status}:`, errorText);
      throw new Error(`Database search failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`[Database] Found ${data.logs?.length || 0} matching logs in database`);
    return data.logs || [];
  } catch (err) {
    console.error('[Database] Search error:', err);
    throw err;
  }
};

export const getChangeLogsByDateRange = async (startDate: string, endDate: string): Promise<ChangeRecord[]> => {
  try {
    const url = `${API_BASE}/api/db/logs?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    console.log(`[Database] Fetching logs from database: ${startDate} to ${endDate}`);
    console.log(`[Database] Request URL: ${url}`);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    console.log(`[Database] Response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Database] Fetch failed with status ${response.status}:`, errorText);
      
      if (response.status === 400) {
        console.error(`[Database] 400 Bad Request - this should not happen. Check server logs.`);
      }
      
      throw new Error(`Database fetch failed: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[Database] Unexpected content type: ${contentType}`);
      console.error(`[Database] Response body: ${text.substring(0, 500)}`);
      throw new Error(`Database returned non-JSON response: ${contentType}`);
    }
    
    const data = await response.json();
    console.log(`[Database] Found ${data.logs?.length || 0} logs in database for date range`);
    return data.logs || [];
  } catch (err) {
    console.error('[Database] Fetch error:', err);
    throw err;
  }
};

export const getDatabaseStats = async (): Promise<{ totalRows: number; dateRange: { min: string; max: string } | null }> => {
  try {
    const response = await fetch(`${API_BASE}/api/db/stats`, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Database stats failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (err) {
    console.error('Database stats error:', err);
    return { totalRows: 0, dateRange: null };
  }
};
