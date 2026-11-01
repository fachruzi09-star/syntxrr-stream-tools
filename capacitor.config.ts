import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.syntxrr.streamtools',
  appName: 'SYNTXRR STREAM TOOLS',
  webDir: 'dist',
  server: {
    // AndroidScheme 'https' provides standard HTTPS origin in Android WebView,
    // ensuring reliable IndexedDB persistence, Web Audio, and Web Crypto APIs.
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#080C16',
    },
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
