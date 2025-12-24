import { fetchChangeLogsRange } from './panoramaService';
import { saveChangeLogs, hasDateData, closeDb, getTotalEntryCount } from './db';
import { getTodayMST, addDaysToDateString } from '../utils/dateUtils';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, chownSync, statSync } from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, 'changelogs.db');

const DAYS_TO_FETCH = parseInt(process.env.DAYS_TO_FETCH || '30', 10);
const SKIP_EXISTING = process.env.SKIP_EXISTING !== 'false';
const DELAY_BETWEEN_REQUESTS = parseInt(process.env.DELAY_MS || '1000', 10);
const START_DATE = process.env.START_DATE;
const END_DATE = process.env.END_DATE;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const fetchAndSaveDate = async (date: string): Promise<{ success: boolean; count: number; error?: string; skipped?: boolean }> => {
  try {
    if (SKIP_EXISTING && hasDateData(date)) {
      console.log(`[${date}] Skipping - already exists in database`);
      return { success: true, count: 0, skipped: true };
    }

    console.log(`[${date}] Fetching from Panorama...`);
    let logs: any[];
    try {
      logs = await fetchChangeLogsRange(date, date);
    } catch (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      if (errorMsg.includes('Timeout')) {
        console.error(`[${date}] ✗ Polling timeout - job may still be processing`);
        throw new Error(`Polling timeout: ${errorMsg}`);
      }
      throw fetchError;
    }
    
    console.log(`[${date}] Received ${logs.length} total logs from Panorama`);
    
    if (logs.length === 0) {
      console.log(`[${date}] ⚠ No logs returned from Panorama for this date`);
      return { success: true, count: 0 };
    }
    
    if (logs.length > 0) {
      saveChangeLogs(logs, date);
      console.log(`[${date}] ✓ Saved ${logs.length} change logs`);
      return { success: true, count: logs.length };
    } else {
      console.log(`[${date}] No logs found for this date`);
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

  let startDate: string;
  let endDate: string;
  
  if (START_DATE && END_DATE) {
    startDate = START_DATE;
    endDate = END_DATE;
    console.log(`Using custom date range: ${startDate} to ${endDate}`);
  } else {
    const today = getTodayMST();
    endDate = addDaysToDateString(today, -1);
    startDate = addDaysToDateString(endDate, -(DAYS_TO_FETCH - 1));
    console.log(`Today's date (MST): ${today}`);
    console.log(`Will fetch dates from ${startDate} to ${endDate} (${DAYS_TO_FETCH} days)`);
    console.log(`\n⚠ NOTE: If no logs are found, try specifying dates manually:`);
    console.log(`   START_DATE=2024-12-01 END_DATE=2024-12-31 npm run populate:history`);
  }
  console.log('');
  
  const stats = {
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    totalLogs: 0
  };

  const errors: Array<{ date: string; error: string }> = [];

  const startDateObj = new Date(startDate + 'T00:00:00');
  const endDateObj = new Date(endDate + 'T00:00:00');
  const totalDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  for (let i = 0; i < totalDays; i++) {
    const targetDate = addDaysToDateString(startDate, i);
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

    if (i < totalDays - 1 && DELAY_BETWEEN_REQUESTS > 0) {
      await delay(DELAY_BETWEEN_REQUESTS);
    }

    if ((i + 1) % 10 === 0) {
      console.log(`\nProgress: ${i + 1}/${totalDays} dates processed\n`);
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
  console.log(`Database path: ${dbPath}`);
  console.log(`Database exists: ${existsSync(dbPath)}`);
  
  if (existsSync(dbPath)) {
    try {
      const stats = statSync(dbPath);
      console.log(`Database owner: UID ${stats.uid}, GID ${stats.gid}`);
      
      const isRoot = process.getuid && process.getuid() === 0;
      const serviceUser = process.env.SERVICE_USER || 'palo-changelogs';
      
      if (isRoot) {
        console.log(`\n⚠ Running as root detected. Fixing database permissions...`);
        try {
          execSync(`chown -R ${serviceUser}:${serviceUser} "${dataDir}"`, { stdio: 'inherit' });
          console.log(`✓ Changed ownership of ${dataDir} to ${serviceUser}:${serviceUser}`);
        } catch (chownError) {
          console.error(`✗ Failed to change ownership: ${chownError}`);
          console.log(`\n⚠ Manual fix required:`);
          console.log(`   sudo chown -R ${serviceUser}:${serviceUser} "${dataDir}"`);
        }
      }
    } catch (statError) {
      console.error(`Error checking database stats: ${statError}`);
    }
  }
  
  try {
    const totalCount = getTotalEntryCount();
    console.log(`Total entries in database: ${totalCount}`);
  } catch (error) {
    console.error('Error verifying database count:', error);
    if (existsSync(dbPath)) {
      console.log(`\n⚠ Database exists but cannot be read. Check permissions:`);
      console.log(`   ls -la "${dbPath}"`);
      console.log(`   sudo chown -R palo-changelogs:palo-changelogs "${dataDir}"`);
    }
  }

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

