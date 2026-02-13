import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.todone.app',
  appName: 'Todone',
  webDir: 'out', // Required but not used when loading from server URL

  // Server URL approach: load web app from remote server
  server: {
    // Production URL (Vercel deployment)
    url: 'https://todone-dusky.vercel.app',

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
    // Social Login for native Google Sign-In
    SocialLogin: {
      google: {
        iOSClientId: '569427904271-0gs6jvpu4hq0plfmn2nqaqv81l3jgfed.apps.googleusercontent.com',
        // Web client ID - used as serverClientId for ID token verification
        iOSServerClientId: process.env.GOOGLE_CLIENT_ID,
      },
    },
  },
};

export default config;
