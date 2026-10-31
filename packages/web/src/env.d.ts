/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Where this build's source code is (see lib/source.ts). */
  readonly VITE_SOURCE_URL?: string;
}

/** The release version, from the root package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;
