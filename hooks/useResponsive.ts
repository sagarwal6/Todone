'use client';

import { useState, useEffect } from 'react';

// MD3 breakpoints
const BREAKPOINTS = {
  mobile: 0,
  tablet: 600,
  desktop: 905,
};

type Breakpoint = 'mobile' | 'tablet' | 'desktop';

interface ResponsiveState {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
}

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>({
    breakpoint: 'desktop',
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
  });

  useEffect(() => {
    const updateState = () => {
      const width = window.innerWidth;
      let breakpoint: Breakpoint;

      if (width < BREAKPOINTS.tablet) {
        breakpoint = 'mobile';
      } else if (width < BREAKPOINTS.desktop) {
        breakpoint = 'tablet';
      } else {
        breakpoint = 'desktop';
      }

      setState({
        breakpoint,
        isMobile: breakpoint === 'mobile',
        isTablet: breakpoint === 'tablet',
        isDesktop: breakpoint === 'desktop',
        width,
      });
    };

    // Initial update
    updateState();

    // Listen for resize events
    window.addEventListener('resize', updateState);
    return () => window.removeEventListener('resize', updateState);
  }, []);

  return state;
}

// Custom hook for matching specific breakpoints
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
