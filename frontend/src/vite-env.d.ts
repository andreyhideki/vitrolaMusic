/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly URL_BUY_ME_A_COFFEE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
