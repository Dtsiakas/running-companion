/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Where this build's source code is (see lib/source.ts). */
  readonly VITE_SOURCE_URL?: string;
}
