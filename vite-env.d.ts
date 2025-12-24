/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_PANORAMA_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

