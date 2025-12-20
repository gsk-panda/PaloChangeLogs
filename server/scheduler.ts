import cron from 'node-cron';
import { fetchChangeLogsRange } from './panoramaService';
import { saveChangeLogs } from './db';
import { addDaysToDateString, getTodayMST } from '../utils/dateUtils';

const fetchAndSavePreviousDay = async () => {
  try {
    const today = getTodayMST();
    const yesterday = addDaysToDateString(today, -1);
    
    console.log(`[Scheduler] Fetching change logs for ${yesterday}...`);
    
    const logs = await fetchChangeLogsRange(yesterday, yesterday);
    
    const filteredLogs = logs.filter(log => 
      log.description && log.description.trim().length > 0
    );
    
    saveChangeLogs(filteredLogs, yesterday);
    
    console.log(`[Scheduler] Saved ${filteredLogs.length} change logs for ${yesterday}`);
  } catch (error) {
    console.error('[Scheduler] Error fetching and saving previous day logs:', error);
  }
};

export const startScheduler = () => {
  cron.schedule('0 1 * * *', async () => {
    await fetchAndSavePreviousDay();
  }, {
    timezone: 'America/Denver'
  });
  
  console.log('[Scheduler] Daily job scheduled to run at 01:00 MST');
};

export const runSchedulerNow = async () => {
  await fetchAndSavePreviousDay();
};

