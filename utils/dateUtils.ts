const MST_TIMEZONE = 'America/Denver';

const getTimezoneOffset = (date: Date): number => {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const mstDate = new Date(date.toLocaleString('en-US', { timeZone: MST_TIMEZONE }));
  return utcDate.getTime() - mstDate.getTime();
};

export const getMSTDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const tempDate = new Date(`${dateStr}T12:00:00`);
  const offset = getTimezoneOffset(tempDate);
  const mstMidnight = new Date(`${dateStr}T00:00:00Z`);
  return new Date(mstMidnight.getTime() - offset);
};

export const formatMSTDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: MST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

export const formatMSTTime = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: MST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
};

export const formatMSTDateTime = (date: Date): { date: string; time: string } => {
  return {
    time: formatMSTTime(date),
    date: new Intl.DateTimeFormat('en-US', {
      timeZone: MST_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date)
  };
};

export const parsePanoramaTimestamp = (timestampStr: string): Date => {
  const parts = timestampStr.split(' ');
  if (parts.length >= 2) {
    const datePart = parts[0].replace(/\//g, '-');
    const timePart = parts[1] || '00:00:00';
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes, seconds] = timePart.split(':').map(s => parseInt(s) || 0);
    
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    const tempDate = new Date(`${dateStr}T${timeStr}`);
    const mstFormatted = tempDate.toLocaleString('en-US', { timeZone: MST_TIMEZONE });
    const utcFormatted = tempDate.toLocaleString('en-US', { timeZone: 'UTC' });
    
    const mstDate = new Date(mstFormatted);
    const utcDate = new Date(utcFormatted);
    const offset = utcDate.getTime() - mstDate.getTime();
    
    return new Date(tempDate.getTime() + offset);
  }
  return new Date(timestampStr);
};

export const getMSTDateString = (date: Date): string => {
  return formatMSTDate(date);
};

export const getTodayMST = (): string => {
  const now = new Date();
  return formatMSTDate(now);
};
