import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      // MD3 breakpoints
      mobile: "0px",
      tablet: "600px",
      desktop: "905px",
    },
    extend: {
      colors: {
        // MD3 Primary
        primary: {
          DEFAULT: "var(--md-primary)",
          container: "var(--md-primary-container)",
        },
        "on-primary": {
          DEFAULT: "var(--md-on-primary)",
          container: "var(--md-on-primary-container)",
        },
        // MD3 Secondary
        secondary: {
          DEFAULT: "var(--md-secondary)",
          container: "var(--md-secondary-container)",
        },
        "on-secondary": {
          DEFAULT: "var(--md-on-secondary)",
          container: "var(--md-on-secondary-container)",
        },
        // MD3 Tertiary
        tertiary: {
          DEFAULT: "var(--md-tertiary)",
          container: "var(--md-tertiary-container)",
        },
        "on-tertiary": {
          DEFAULT: "var(--md-on-tertiary)",
          container: "var(--md-on-tertiary-container)",
        },
        // MD3 Surface
        surface: {
          DEFAULT: "var(--md-surface)",
          dim: "var(--md-surface-dim)",
          bright: "var(--md-surface-bright)",
          container: {
            lowest: "var(--md-surface-container-lowest)",
            low: "var(--md-surface-container-low)",
            DEFAULT: "var(--md-surface-container)",
            high: "var(--md-surface-container-high)",
            highest: "var(--md-surface-container-highest)",
          },
        },
        "on-surface": {
          DEFAULT: "var(--md-on-surface)",
          variant: "var(--md-on-surface-variant)",
        },
        // MD3 Outline
        outline: {
          DEFAULT: "var(--md-outline)",
          variant: "var(--md-outline-variant)",
        },
        // MD3 Semantic colors
        error: {
          DEFAULT: "var(--md-error)",
          container: "var(--md-error-container)",
        },
        "on-error": {
          DEFAULT: "var(--md-on-error)",
          container: "var(--md-on-error-container)",
        },
        success: {
          DEFAULT: "var(--md-success)",
          container: "var(--md-success-container)",
        },
        "on-success": {
          DEFAULT: "var(--md-on-success)",
          container: "var(--md-on-success-container)",
        },
        // Inverse
        inverse: {
          surface: "var(--md-inverse-surface)",
          "on-surface": "var(--md-inverse-on-surface)",
          primary: "var(--md-inverse-primary)",
        },
        // Scrim
        scrim: "var(--md-scrim)",
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "28px",
        pill: "9999px",
      },
      fontFamily: {
        sans: ["Roboto", "system-ui", "sans-serif"],
        display: ["Google Sans", "Roboto", "system-ui", "sans-serif"],
      },
      fontSize: {
        // MD3 Type scale
        "display-large": ["57px", { lineHeight: "64px", letterSpacing: "-0.25px" }],
        "display-medium": ["45px", { lineHeight: "52px", letterSpacing: "0px" }],
        "display-small": ["36px", { lineHeight: "44px", letterSpacing: "0px" }],
        "headline-large": ["32px", { lineHeight: "40px", letterSpacing: "0px" }],
        "headline-medium": ["28px", { lineHeight: "36px", letterSpacing: "0px" }],
        "headline-small": ["24px", { lineHeight: "32px", letterSpacing: "0px" }],
        "title-large": ["22px", { lineHeight: "28px", letterSpacing: "0px" }],
        "title-medium": ["16px", { lineHeight: "24px", letterSpacing: "0.15px", fontWeight: "500" }],
        "title-small": ["14px", { lineHeight: "20px", letterSpacing: "0.1px", fontWeight: "500" }],
        "body-large": ["16px", { lineHeight: "24px", letterSpacing: "0.5px" }],
        "body-medium": ["14px", { lineHeight: "20px", letterSpacing: "0.25px" }],
        "body-small": ["12px", { lineHeight: "16px", letterSpacing: "0.4px" }],
        "label-large": ["14px", { lineHeight: "20px", letterSpacing: "0.1px", fontWeight: "500" }],
        "label-medium": ["12px", { lineHeight: "16px", letterSpacing: "0.5px", fontWeight: "500" }],
        "label-small": ["11px", { lineHeight: "16px", letterSpacing: "0.5px", fontWeight: "500" }],
      },
      boxShadow: {
        // MD3 Elevation levels
        "elevation-0": "none",
        "elevation-1": "0px 1px 3px 1px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.3)",
        "elevation-2": "0px 2px 6px 2px rgba(0, 0, 0, 0.15), 0px 1px 2px 0px rgba(0, 0, 0, 0.3)",
        "elevation-3": "0px 4px 8px 3px rgba(0, 0, 0, 0.15), 0px 1px 3px 0px rgba(0, 0, 0, 0.3)",
        "elevation-4": "0px 6px 10px 4px rgba(0, 0, 0, 0.15), 0px 2px 3px 0px rgba(0, 0, 0, 0.3)",
        "elevation-5": "0px 8px 12px 6px rgba(0, 0, 0, 0.15), 0px 4px 4px 0px rgba(0, 0, 0, 0.3)",
      },
      spacing: {
        // Base unit: 4px
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-top": "env(safe-area-inset-top)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-in-bottom": "slideInBottom 0.3s ease-out",
        shimmer: "shimmer 1.5s infinite",
        "scale-in": "scaleIn 0.2s ease-out",
        ripple: "ripple 0.6s linear",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideInBottom: {
          "0%": { opacity: "0", transform: "translateY(100%)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        ripple: {
          "0%": { transform: "scale(0)", opacity: "0.5" },
          "100%": { transform: "scale(4)", opacity: "0" },
        },
      },
      transitionTimingFunction: {
        // MD3 motion curves
        "md-standard": "cubic-bezier(0.2, 0, 0, 1)",
        "md-standard-decelerate": "cubic-bezier(0, 0, 0, 1)",
        "md-standard-accelerate": "cubic-bezier(0.3, 0, 1, 1)",
        "md-emphasized": "cubic-bezier(0.2, 0, 0, 1)",
        "md-emphasized-decelerate": "cubic-bezier(0.05, 0.7, 0.1, 1)",
        "md-emphasized-accelerate": "cubic-bezier(0.3, 0, 0.8, 0.15)",
      },
    },
  },
  plugins: [],
};

export default config;
