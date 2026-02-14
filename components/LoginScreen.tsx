'use client';

import { signIn } from 'next-auth/react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

export function LoginScreen() {
  const handleSignIn = () => {
    signIn('google', { callbackUrl: '/' });
  };

  return (
    <div className="min-h-screen bg-inbox-bg-primary flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        {/* Logo and branding */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-inbox-accent-light mb-6">
            <MaterialIcon name="task_alt" size={48} className="text-inbox-accent" fill />
          </div>
          <h1 className="text-3xl font-medium text-inbox-text-primary mb-2">
            Todone
          </h1>
          <p className="text-inbox-text-secondary text-base">
            AI-powered task research for getting things done
          </p>
        </div>

        {/* Sign in card */}
        <div className="bg-white rounded-2xl p-8 shadow-[var(--inbox-shadow-elevated)]">
          <h2 className="text-xl font-medium text-inbox-text-primary mb-2">
            Welcome
          </h2>
          <p className="text-inbox-text-tertiary text-sm mb-6">
            Sign in to save your tasks and get personalized research
          </p>

          <button
            onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-3 px-4 py-3
                       border border-inbox-divider-strong rounded-full
                       bg-white hover:bg-inbox-bg-hover
                       text-inbox-text-primary font-medium
                       transition-all duration-150
                       hover:shadow-[var(--inbox-shadow-subtle)]
                       active:scale-[0.98]"
          >
            <GoogleIcon />
            Continue with Google
          </button>
        </div>

        {/* Footer */}
        <p className="mt-8 text-xs text-inbox-text-tertiary">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
