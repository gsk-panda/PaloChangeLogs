const getPanoramaApiKey = (): string => {
  if (typeof process !== 'undefined' && (process as any).env && (process as any).env.PANORAMA_API_KEY) {
    return (process as any).env.PANORAMA_API_KEY;
  }
  return '';
};

export const PANORAMA_CONFIG = {
  HOST: '/panorama-proxy',
  API_KEY: getPanoramaApiKey(),
};

// Keeping empty arrays as fallbacks/initial states
export const MOCK_DAILY_STATS = [];
export const MOCK_CHANGES = [];