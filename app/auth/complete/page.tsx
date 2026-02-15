'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

/**
 * Post-OAuth landing page. After Google OAuth completes, NextAuth redirects here.
 *
 * - If we're in the standalone PWA: redirect to / immediately.
 * - If we're in Safari (user came from PWA → Safari for OAuth): show a
 *   "Return to Todone" prompt. The session cookie is already set and shared
 *   with the PWA, so when they tap back to the app, they'll be logged in.
 */
export default function AuthCompletePage() {
  const router = useRouter();
  const [isStandalone, setIsStandalone] = useState<boolean | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;

    if (standalone) {
      // We're in the PWA — just go home
      router.replace('/');
    } else {
      setIsStandalone(false);
    }
  }, [router]);

  // Still detecting...
  if (isStandalone === null) {
    return null;
  }

  // We're in Safari after OAuth from the PWA
  return (
    <div className="min-h-screen bg-inbox-bg-primary flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-inbox-success/10 mb-6">
          <MaterialIcon name="check_circle" size={48} className="text-inbox-success" fill />
        </div>
        <h1 className="text-2xl font-medium text-inbox-text-primary mb-2">
          You&apos;re signed in!
        </h1>
        <p className="text-inbox-text-secondary text-base mb-8">
          Return to the Todone app on your home screen to continue.
        </p>
        <div className="bg-white rounded-2xl p-6 shadow-[var(--inbox-shadow-elevated)]">
          <div className="flex items-center gap-3 justify-center text-inbox-text-tertiary">
            <MaterialIcon name="touch_app" size={24} />
            <span className="text-sm">Tap the Todone icon on your home screen</span>
          </div>
        </div>
      </div>
    </div>
  );
}
