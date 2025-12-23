import { fetchChangeLogsRange } from './panoramaService';
import { saveChangeLogs, hasDateData, closeDb } from './db';
import { getTodayMST, addDaysToDateString } from '../utils/dateUtils';

const DAYS_TO_FETCH = parseInt(process.env.DAYS_TO_FETCH || '30', 10);
const SKIP_EXISTING = process.env.SKIP_EXISTING !== 'false';
const DELAY_BETWEEN_REQUESTS = parseInt(process.env.DELAY_MS || '1000', 10);

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchAndSaveDate = async (date: string): Promise<{ success: boolean; count: number; error?: string; skipped?: boolean }> => {
  try {
    if (SKIP_EXISTING && hasDateData(date)) {
      console.log(`[${date}] Skipping - already exists in database`);
      return { success: true, count: 0, skipped: true };
    }

    console.log(`[${date}] Fetching from Panorama...`);
    const logs = await fetchChangeLogsRange(date, date);
    console.log(`[${date}] Received ${logs.length} total logs from Panorama`);
    
    const filteredLogs = logs.filter(log => 
      log.description && log.description.trim().length > 0
    );
    
    console.log(`[${date}] After filtering (with descriptions): ${filteredLogs.length} logs`);
    
    if (filteredLogs.length > 0) {
      saveChangeLogs(filteredLogs, date);
      console.log(`[${date}] ✓ Saved ${filteredLogs.length} change logs`);
      return { success: true, count: filteredLogs.length };
    } else {
      if (logs.length > 0) {
        console.log(`[${date}] ⚠ Found ${logs.length} logs but none had descriptions (all filtered out)`);
      } else {
        console.log(`[${date}] No logs found for this date`);
      }
      return { success: true, count: 0 };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[${date}] ✗ Error: ${errorMsg}`);
    if (error instanceof Error && error.stack) {
      console.error(`[${date}] Stack trace:`, error.stack);
    }
    return { success: false, count: 0, error: errorMsg };
  }
};

const main = async () => {
  console.log('='.repeat(60));
  console.log('Panorama Historical Data Population Script');
  console.log('='.repeat(60));
  console.log(`Days to fetch: ${DAYS_TO_FETCH}`);
  console.log(`Skip existing dates: ${SKIP_EXISTING}`);
  console.log(`Delay between requests: ${DELAY_BETWEEN_REQUESTS}ms`);
  console.log('='.repeat(60));
  console.log('');

  const today = getTodayMST();
  const stats = {
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    totalLogs: 0
  };

  const errors: Array<{ date: string; error: string }> = [];

  for (let i = 1; i <= DAYS_TO_FETCH; i++) {
    const targetDate = addDaysToDateString(today, -i);
    stats.total++;

    const result = await fetchAndSaveDate(targetDate);
    
    if (result.success) {
      if (result.skipped) {
        stats.skipped++;
      } else {
        stats.successful++;
        stats.totalLogs += result.count;
      }
    } else {
      stats.failed++;
      if (result.error) {
        errors.push({ date: targetDate, error: result.error });
      }
    }

    if (i < DAYS_TO_FETCH && DELAY_BETWEEN_REQUESTS > 0) {
      await delay(DELAY_BETWEEN_REQUESTS);
    }

    if (i % 10 === 0) {
      console.log(`\nProgress: ${i}/${DAYS_TO_FETCH} dates processed\n`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Population Complete');
  console.log('='.repeat(60));
  console.log(`Total dates processed: ${stats.total}`);
  console.log(`Successful: ${stats.successful}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Skipped (already exists): ${stats.skipped}`);
  console.log(`Total logs saved: ${stats.totalLogs}`);
  console.log('='.repeat(60));

  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach(({ date, error }) => {
      console.log(`  ${date}: ${error}`);
    });
  }

  closeDb();
  process.exit(stats.failed > 0 ? 1 : 0);
};

main().catch((error) => {
  console.error('Fatal error:', error);
  closeDb();
  process.exit(1);
});

