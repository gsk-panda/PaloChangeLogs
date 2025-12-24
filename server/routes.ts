import { Router } from 'express';
import { getChangeLogsByDateRange, getChangeLogsByDate, hasDateData, getTotalEntryCount, getDatesWithData } from './db';

const router = Router();

router.get('/api/changelogs/range', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    
    const logs = getChangeLogsByDateRange(startDate as string, endDate as string);
    res.json(logs);
  } catch (error: any) {
    console.error('Error fetching logs from database:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.get('/api/changelogs/date/:date', (req, res) => {
  try {
    const { date } = req.params;
    console.log(`[API] /api/changelogs/date/${date} requested`);
    const logs = getChangeLogsByDate(date);
    console.log(`[API] Found ${logs.length} logs for date ${date}`);
    res.json(logs);
  } catch (error: any) {
    console.error('Error fetching logs from database:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.get('/api/changelogs/check/:date', (req, res) => {
  try {
    const { date } = req.params;
    const exists = hasDateData(date);
    res.json({ exists });
  } catch (error: any) {
    console.error('Error checking date in database:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.get('/api/changelogs/count', (req, res) => {
  try {
    console.log('[API] /api/changelogs/count requested');
    const count = getTotalEntryCount();
    console.log('[API] Total entry count:', count);
    res.json({ count });
  } catch (error: any) {
    console.error('[API] Error getting total count from database:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/api/changelogs/dates', (req, res) => {
  try {
    console.log('[API] /api/changelogs/dates requested');
    const dates = getDatesWithData();
    console.log(`[API] Found ${dates.length} dates with data`);
    if (dates.length > 0) {
      console.log(`[API] Sample dates: ${dates.slice(0, 3).map(d => `${d.date} (${d.count})`).join(', ')}`);
    }
    res.json({ dates });
  } catch (error: any) {
    console.error('[API] Error getting dates with data:', error);
    if (error.stack) {
      console.error('[API] Stack trace:', error.stack);
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;

