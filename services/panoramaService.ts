import { ChangeRecord, DailyStat } from '../types';
import { MOCK_CHANGES, MOCK_DAILY_STATS } from '../constants';

/**
 * Fetches change logs.
 * Attempts to fetch from backend API first, falls back to mock data if API is unavailable.
 */
export const fetchChangeLogs = async (): Promise<ChangeRecord[]> => {
  try {
    const response = await fetch('/api/panorama/logs');
    if (!response.ok) {
      console.warn('API endpoint not found or error, using mock logs.');
      // Simulate network delay for mock
      return new Promise((resolve) => setTimeout(() => resolve(MOCK_CHANGES), 800));
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn("Failed to fetch change logs from API, using mock data:", error);
    return new Promise((resolve) => setTimeout(() => resolve(MOCK_CHANGES), 800));
  }
};

/**
 * Fetches daily statistics.
 * Attempts to fetch from backend API first, falls back to mock data if API is unavailable.
 */
export const fetchDailyStats = async (): Promise<DailyStat[]> => {
  try {
    const response = await fetch('/api/panorama/stats');
    if (!response.ok) {
      console.warn('API endpoint not found or error, using mock stats.');
      return new Promise((resolve) => setTimeout(() => resolve(MOCK_DAILY_STATS), 500));
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn("Failed to fetch daily stats from API, using mock data:", error);
    return new Promise((resolve) => setTimeout(() => resolve(MOCK_DAILY_STATS), 500));
  }
};