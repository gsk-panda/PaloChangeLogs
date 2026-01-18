export const PANORAMA_CONFIG = {
  // CRITICAL: This must match the key in vite.config.ts proxy settings.
  // Do NOT put the full URL here. The browser sends this to Vite, which proxies it.
  HOST: '/panorama-proxy',
  // API Key is handled by the backend proxy - do not include it in frontend requests
};

// Keeping empty arrays as fallbacks/initial states
export const MOCK_DAILY_STATS = [];
export const MOCK_CHANGES = [];