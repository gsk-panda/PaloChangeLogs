const MST_TIMEZONE = 'America/Denver';

export const getMSTDate = (dateString: string): Date => {
  try {
    const [year, month, day] = dateString.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return new Date();
    }
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const date = new Date(`${dateStr}T00:00:00`);
    if (isNaN(date.getTime())) {
      return new Date();
    }
    return date;
  } catch (e) {
    console.warn('Error in getMSTDate:', e);
    return new Date();
  }
};

export const formatMSTDate = (date: Date): string => {
  try {
    if (!date || isNaN(date.getTime())) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: MST_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const day = parts.find(p => p.type === 'day')?.value || '';
    
    return `${year}-${month}-${day}`;
  } catch (e) {
    console.warn('Error formatting MST date:', e);
    if (!date || isNaN(date.getTime())) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

export const formatMSTTime = (date: Date): string => {
  try {
    if (!date || isNaN(date.getTime())) {
      return '00:00';
    }
    
    if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    
    return new Intl.DateTimeFormat('en-US', {
      timeZone: MST_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  } catch (e) {
    console.warn('Error formatting MST time:', e);
    if (!date || isNaN(date.getTime())) {
      return '00:00';
    }
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
};

export const formatMSTDateTime = (date: Date): { date: string; time: string } => {
  try {
    return {
      time: formatMSTTime(date),
      date: formatMSTDate(date)
    };
  } catch (e) {
    console.warn('Error formatting MST date/time:', e);
    return {
      time: '00:00',
      date: formatMSTDate(new Date())
    };
  }
};

export const parsePanoramaTimestamp = (timestampStr: string): Date => {
  try {
    const parts = timestampStr.split(' ');
    if (parts.length >= 2) {
      const datePart = parts[0];
      const timePart = parts[1] || '00:00:00';
      
      const dateComponents = datePart.split(/[-\/]/).map(Number);
      let year: number, month: number, day: number;
      
      if (dateComponents.length === 3) {
        if (dateComponents[0] > 1000) {
          [year, month, day] = dateComponents;
        } else {
          [month, day, year] = dateComponents;
        }
      } else {
        return new Date();
      }
      
      const [hours, minutes, seconds] = timePart.split(':').map(s => parseInt(s) || 0);
      
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      
      const date = new Date(`${dateStr}T${timeStr}`);
      if (isNaN(date.getTime())) {
        return new Date();
      }
      return date;
    }
    const date = new Date(timestampStr);
    return isNaN(date.getTime()) ? new Date() : date;
  } catch (e) {
    console.warn('Error parsing timestamp:', timestampStr, e);
    return new Date();
  }
};

export const getMSTDateString = (date: Date): string => {
  return formatMSTDate(date);
};

export const getTodayMST = (): string => {
  try {
    const now = new Date();
    return formatMSTDate(now);
  } catch (e) {
    console.warn('Error getting today MST:', e);
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};
