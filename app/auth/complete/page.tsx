'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

/**
 * Post-OAuth landing page. After Google OAuth completes, NextAuth redirects here.
 *
 * - Always attempts to redirect to / after a brief delay.
 * - If the redirect doesn't work (e.g., PWA → Safari OAuth flow on iOS),
 *   shows a "Return to Todone" prompt as a fallback.
 */
export default function AuthCompletePage() {
  const router = useRouter();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    // Try to redirect home after a short delay (let cookie settle)
    const timer = setTimeout(() => {
      router.replace('/');
    }, 500);

    // If we're still here after 2s, show the fallback UI
    // (this happens when Safari was opened from the PWA and can't navigate back)
    const fallbackTimer = setTimeout(() => {
      setShowFallback(true);
    }, 2000);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
    };
  }, [router]);

  if (!showFallback) {
    return null;
  }

  // Fallback for PWA → Safari OAuth flow
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
          If you have Todone on your home screen, switch back to it now.
          Otherwise, tap the button below.
        </p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-inbox-accent text-white rounded-full text-sm font-medium"
        >
          <MaterialIcon name="arrow_forward" size={18} />
          Go to Todone
        </a>
      </div>
    </div>
  );
}
