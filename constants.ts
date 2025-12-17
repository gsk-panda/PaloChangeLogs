export const PANORAMA_CONFIG = {
  // CRITICAL: This must match the key in vite.config.ts proxy settings.
  // Do NOT put the full URL here. The browser sends this to Vite, which proxies it.
  HOST: '/panorama-proxy',
  // API Key provided by user
  API_KEY: 'LUFRPT1LQWx1dUk4RVVqODQrQknN3TDZtRIBYd0dhUk9dzczNHg3T0VsRS9yYmFMcEpWdXBWDFZ4S3Jwd0JYeEdLaTnnc2RVV29iQ1BqcnVCRU1vOVVHUmF6SUE2VHlDOA==',
};

// Keeping empty arrays as fallbacks/initial states
export const MOCK_DAILY_STATS = [];
export const MOCK_CHANGES = [];