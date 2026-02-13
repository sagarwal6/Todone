'use client';

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return (window as any).Capacitor?.isNativePlatform?.() ?? false;
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web';
  return (window as any).Capacitor?.getPlatform?.() ?? 'web';
}
