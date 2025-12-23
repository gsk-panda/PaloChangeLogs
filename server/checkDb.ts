import { getTotalEntryCount, getChangeLogsByDateRange, closeDb } from './db';
import { getTodayMST, addDaysToDateString } from '../utils/dateUtils';

const main = async () => {
  try {
    console.log('Checking database...');
    
    const count = getTotalEntryCount();
    console.log(`Total entries in database: ${count}`);
    
    if (count > 0) {
      const today = getTodayMST();
      const weekAgo = addDaysToDateString(today, -7);
      
      console.log(`\nFetching logs from ${weekAgo} to ${today}...`);
      const logs = getChangeLogsByDateRange(weekAgo, today);
      console.log(`Found ${logs.length} logs in the last 7 days`);
      
      if (logs.length > 0) {
        console.log('\nSample log:');
        console.log(JSON.stringify(logs[0], null, 2));
      }
    } else {
      console.log('\nDatabase is empty. No entries found.');
    }
  } catch (error) {
    console.error('Error checking database:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  } finally {
    closeDb();
  }
};

main();

