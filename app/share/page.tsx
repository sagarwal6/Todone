'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { useState, useEffect, useCallback, Suspense } from 'react';

/**
 * Share Target Page
 *
 * Receives shared content from other apps via the Web Share Target API.
 * The manifest.json share_target config sends GET requests here with
 * title, text, and url query params.
 *
 * Flow:
 * 1. User shares content from Safari/Mail/etc → Todone appears in share sheet
 * 2. This page receives the shared params
 * 3. If not signed in → redirect to login, then back here
 * 4. Composes a task title from the shared content (preserving the source URL)
 * 5. Creates the task via API
 * 6. Redirects to home
 */

function ShareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  const [taskTitle, setTaskTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  // Extract shared params
  const sharedTitle = searchParams.get('title') || '';
  const sharedText = searchParams.get('text') || '';
  const sharedUrl = searchParams.get('url') || '';

  // Compose task title from shared content, preserving the URL
  useEffect(() => {
    const parts: string[] = [];

    if (sharedTitle) {
      parts.push(sharedTitle);
    }

    if (sharedText && sharedText !== sharedTitle && sharedText !== sharedUrl) {
      parts.push(sharedText);
    }

    // Always append URL so it's preserved in the task
    if (sharedUrl) {
      // If we already have a title/text, add URL on its own line-like separator
      if (parts.length > 0) {
        parts.push(sharedUrl);
      } else {
        parts.push(sharedUrl);
      }
    }

    setTaskTitle(parts.join(' — ') || 'Shared item');
  }, [sharedTitle, sharedText, sharedUrl]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      // Store share params in sessionStorage so we can resume after login
      sessionStorage.setItem('pendingShare', JSON.stringify({
        title: sharedTitle,
        text: sharedText,
        url: sharedUrl,
      }));
      signIn('google', { callbackUrl: '/share?' + searchParams.toString() });
    }
  }, [status, sharedTitle, sharedText, sharedUrl, searchParams]);

  const handleCreate = useCallback(async () => {
    if (!taskTitle.trim() || isCreating) return;

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle.trim(),
          source: 'user',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create task');
      }

      setCreated(true);
      // Brief pause to show success, then redirect home
      setTimeout(() => router.push('/'), 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsCreating(false);
    }
  }, [taskTitle, isCreating, router]);

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-inbox-bg-primary">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-rounded text-3xl text-inbox-accent animate-spin">
            progress_activity
          </span>
          <p className="text-[14px] text-inbox-text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - will redirect
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-inbox-bg-primary">
        <p className="text-[14px] text-inbox-text-secondary">Redirecting to sign in...</p>
      </div>
    );
  }

  // Success state
  if (created) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-inbox-bg-primary">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <span className="material-symbols-rounded text-4xl text-inbox-success check-pop">
            check_circle
          </span>
          <p className="text-[16px] font-medium text-inbox-text-primary">Saved to Todone</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-inbox-bg-primary safe-area-inset">
      {/* Header */}
      <div className="px-5 pt-6 pb-4 border-b border-inbox-divider">
        <div className="flex items-center justify-between">
          <h1 className="text-[20px] font-semibold text-inbox-text-primary">
            Save to Todone
          </h1>
          <button
            onClick={() => router.push('/')}
            className="p-2 text-inbox-text-tertiary hover:text-inbox-text-primary rounded-full hover:bg-inbox-bg-hover transition-colors"
          >
            <span className="material-symbols-rounded text-xl">close</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-6 space-y-5">
        {/* Source preview */}
        {sharedUrl && (
          <div className="flex items-start gap-3 p-4 bg-inbox-bg-secondary rounded-xl">
            <span className="material-symbols-rounded text-xl text-inbox-accent mt-0.5">link</span>
            <div className="flex-1 min-w-0">
              {sharedTitle && (
                <p className="text-[14px] font-medium text-inbox-text-primary mb-1">
                  {sharedTitle}
                </p>
              )}
              <a
                href={sharedUrl}
                onClick={(e) => {
                  e.preventDefault();
                  window.open(sharedUrl, '_blank', 'noopener,noreferrer');
                }}
                className="text-[13px] text-inbox-accent hover:underline break-all"
              >
                {sharedUrl}
              </a>
            </div>
          </div>
        )}

        {/* Editable task title */}
        <div>
          <label className="text-[11px] font-semibold text-inbox-text-tertiary uppercase tracking-wider mb-2 block">
            Task
          </label>
          <textarea
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            className="
              w-full px-4 py-3
              text-[15px] text-inbox-text-primary leading-relaxed
              bg-white border border-inbox-divider-strong rounded-xl
              resize-none
              focus:outline-none focus:ring-2 focus:ring-inbox-accent/20 focus:border-inbox-accent
              placeholder:text-inbox-text-tertiary
              transition-all
            "
            rows={3}
            placeholder="What do you want to do with this?"
            autoFocus
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-[13px] text-inbox-error">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/')}
            className="
              flex-1 py-3
              text-[14px] font-medium text-inbox-text-secondary
              bg-inbox-bg-secondary rounded-xl
              hover:bg-inbox-bg-hover transition-colors
            "
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!taskTitle.trim() || isCreating}
            className="
              flex-1 py-3
              text-[14px] font-medium text-white
              bg-inbox-accent rounded-xl
              hover:bg-inbox-accent-hover
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all
              flex items-center justify-center gap-2
            "
          >
            {isCreating ? (
              <>
                <span className="material-symbols-rounded text-lg animate-spin">progress_activity</span>
                Saving...
              </>
            ) : (
              <>
                <span className="material-symbols-rounded text-lg">add_task</span>
                Save task
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-inbox-bg-primary">
        <span className="material-symbols-rounded text-3xl text-inbox-accent animate-spin">
          progress_activity
        </span>
      </div>
    }>
      <ShareContent />
    </Suspense>
  );
}
