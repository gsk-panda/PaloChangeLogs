import { Router } from 'express';
import { getChangeLogsByDateRange, getChangeLogsByDate, hasDateData } from './db';

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
    const logs = getChangeLogsByDate(date);
    res.json(logs);
  } catch (error: any) {
    console.error('Error fetching logs from database:', error);
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

export default router;

