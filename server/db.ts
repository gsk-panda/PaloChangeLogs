import Database from 'better-sqlite3';
import { ChangeRecord } from '../types';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../data');
mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'changelogs.db');
console.log(`[Database] Database path: ${dbPath}`);
console.log(`[Database] Database exists: ${existsSync(dbPath)}`);
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS change_logs (
    id TEXT PRIMARY KEY,
    seqno TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    admin TEXT NOT NULL,
    device_group TEXT NOT NULL,
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    diff_before TEXT NOT NULL,
    diff_after TEXT NOT NULL,
    log_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_log_date ON change_logs(log_date);
  CREATE INDEX IF NOT EXISTS idx_timestamp ON change_logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_seqno ON change_logs(seqno);
`);

const insertLog = db.prepare(`
  INSERT OR REPLACE INTO change_logs (
    id, seqno, timestamp, admin, device_group, type, action, 
    description, status, diff_before, diff_after, log_date
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const getLogsByDateRange = db.prepare(`
  SELECT 
    id, seqno, timestamp, admin, device_group as deviceGroup, 
    type, action, description, status, diff_before as diffBefore, 
    diff_after as diffAfter
  FROM change_logs
  WHERE log_date >= ? AND log_date <= ?
  ORDER BY timestamp DESC
`);

const getLogsByDate = db.prepare(`
  SELECT 
    id, seqno, timestamp, admin, device_group as deviceGroup, 
    type, action, description, status, diff_before as diffBefore, 
    diff_after as diffAfter
  FROM change_logs
  WHERE log_date = ?
  ORDER BY timestamp DESC
`);

const checkDateExists = db.prepare(`
  SELECT COUNT(*) as count FROM change_logs WHERE log_date = ?
`);

const getTotalCount = db.prepare(`
  SELECT COUNT(*) as count FROM change_logs
`);

const getDatesWithDataQuery = db.prepare(`
  SELECT log_date as date, COUNT(*) as count 
  FROM change_logs 
  GROUP BY log_date 
  ORDER BY log_date DESC
`);

export const saveChangeLogs = (logs: ChangeRecord[], date: string) => {
  const insertMany = db.transaction((logs: ChangeRecord[], date: string) => {
    for (const log of logs) {
      insertLog.run(
        log.id,
        log.seqno,
        log.timestamp,
        log.admin,
        log.deviceGroup,
        log.type,
        log.action,
        log.description,
        log.status,
        log.diffBefore,
        log.diffAfter,
        date
      );
    }
  });
  
  insertMany(logs, date);
};

export const getChangeLogsByDateRange = (startDate: string, endDate: string): ChangeRecord[] => {
  const rows = getLogsByDateRange.all(startDate, endDate) as any[];
  return rows.map(row => ({
    id: row.id,
    seqno: row.seqno,
    timestamp: row.timestamp,
    admin: row.admin,
    deviceGroup: row.deviceGroup,
    type: row.type as any,
    action: row.action as any,
    description: row.description,
    status: row.status as any,
    diffBefore: row.diffBefore,
    diffAfter: row.diffAfter
  }));
};

export const getChangeLogsByDate = (date: string): ChangeRecord[] => {
  const rows = getLogsByDate.all(date) as any[];
  return rows.map(row => ({
    id: row.id,
    seqno: row.seqno,
    timestamp: row.timestamp,
    admin: row.admin,
    deviceGroup: row.deviceGroup,
    type: row.type as any,
    action: row.action as any,
    description: row.description,
    status: row.status as any,
    diffBefore: row.diffBefore,
    diffAfter: row.diffAfter
  }));
};

export const hasDateData = (date: string): boolean => {
  const result = checkDateExists.get(date) as { count: number };
  return result.count > 0;
};

export const getTotalEntryCount = (): number => {
  try {
    const result = getTotalCount.get() as { count: number };
    console.log(`[Database] Total entry count query result: ${result.count}`);
    return result.count;
  } catch (error) {
    console.error(`[Database] Error getting total count:`, error);
    throw error;
  }
};

export const getDatesWithData = (): Array<{ date: string; count: number }> => {
  try {
    const rows = getDatesWithDataQuery.all() as any[];
    console.log(`[Database] getDatesWithData query returned ${rows.length} dates`);
    return rows.map(row => ({
      date: row.date,
      count: row.count
    }));
  } catch (error) {
    console.error(`[Database] Error getting dates with data:`, error);
    throw error;
  }
};

export const closeDb = () => db.close();

