import { ChangeRecord } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? '' : 'http://localhost:3001');

export const fetchChangeLogsFromDatabase = async (startDate: string, endDate: string): Promise<ChangeRecord[]> => {
  try {
    const response = await fetch(`${API_BASE}/api/changelogs/range?startDate=${startDate}&endDate=${endDate}`);
    if (!response.ok) {
      throw new Error(`Database API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching from database:', error);
    throw error;
  }
};

export const checkDateInDatabase = async (date: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE}/api/changelogs/check/${date}`);
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return data.exists;
  } catch (error) {
    console.error('Error checking date in database:', error);
    return false;
  }
};

