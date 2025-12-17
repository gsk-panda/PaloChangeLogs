export const PANORAMA_CONFIG = {
  // CRITICAL: This must match the key in vite.config.ts proxy settings.
  // Do NOT put the full URL here. The browser sends this to Vite, which proxies it.
  HOST: '/panorama-proxy',
  // API Key provided by user
  API_KEY: 'LUFRPT1UcFFML3JPQ21CRVFLU2w2ZHc1dzU4aVRGN1E9dzczNHg3T0VsRS9yYmFMcEpWdXBWdHkzS2dEa1FqU3dPN0xoejZDMWVpQVVNZlZUeGFIZ0xVMm5vZEtCYVcxdA==',
};

// Keeping empty arrays as fallbacks/initial states
export const MOCK_DAILY_STATS = [];
export const MOCK_CHANGES = [];