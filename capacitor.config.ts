import type { CapacitorConfig } from '@capacitor/cli';

// Tooling debug hanya aktif bila SYNTXRR_DEV_BUILD=true diberikan secara eksplisit.
// Dibaca lewat globalThis agar tetap type-safe tanpa @types/node
// (tsconfig memakai "types": ["vite/client"]) dan tanpa dependency tambahan.
const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
const isDevBuild = nodeProcess?.env?.SYNTXRR_DEV_BUILD === 'true';

const config: CapacitorConfig = {
  appId: 'com.syntxrr.streamtools',
  appName: 'SYNTXRR STREAM',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: isDevBuild,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#080C16',
    },
  },
  android: {
    allowMixedContent: isDevBuild,
    captureInput: true,
    webContentsDebuggingEnabled: isDevBuild,
  },
};

export default config;
