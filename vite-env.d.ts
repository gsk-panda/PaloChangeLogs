/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AZURE_CLIENT_ID?: string;
  readonly VITE_AZURE_AUTHORITY?: string;
  readonly VITE_AZURE_REDIRECT_URI?: string;
  readonly VITE_OIDC_ENABLED?: string;
  readonly VITE_PANORAMA_SERVER?: string;
  readonly API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
