import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.todone.app',
  appName: 'Todone',
  webDir: 'out', // Required but not used when loading from server URL

  // Server URL approach: load web app from remote server
  // For development: uncomment the localhost line
  // For production: set your deployed URL
  server: {
    // Development (run `npm run dev` first, use your machine's IP for physical device):
    // url: 'http://localhost:3000',

    // Production (set your deployed URL):
    // url: 'https://todone.yourdomain.com',

    // Allow navigation to external URLs (for OAuth redirects)
    allowNavigation: [
      'accounts.google.com',
      '*.google.com',
    ],
  },

  ios: {
    // Use WKWebView (modern, required for iOS)
    contentInset: 'automatic',
    // Allow mixed content for development
    allowsLinkPreview: false,
    scrollEnabled: true,
  },

  plugins: {
    // Keyboard plugin config (if added later)
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
