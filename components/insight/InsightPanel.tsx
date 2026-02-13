'use client';

/**
 * InsightPanel Component
 *
 * Displays scan results in a bottom sheet (mobile) or modal (desktop).
 * Shows:
 * - Friendly greeting header
 * - Quick Win featured card
 * - Collapsible offer bundles
 */

import { useEffect, useRef } from 'react';
import type { ScanState } from '@/lib/scan/types';
import QuickWinCard from './QuickWinCard';
import OfferBundle from './OfferBundle';

interface InsightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  scan: ScanState & {
    startScan: () => Promise<void>;
    cancelScan: () => void;
    executeAction: (actionId: string) => Promise<{ success: boolean; taskId?: string; error?: string }>;
    dismissAction: (actionId: string) => Promise<boolean>;
    addToTasks?: (actionId: string) => Promise<{ success: boolean; taskId?: string; error?: string }>;
  };
}

export default function InsightPanel({ isOpen, onClose, scan }: InsightPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Check if we have any content to show
  const hasQuickWin = !!scan.quickWin;
  const hasBundles = scan.bundles.length > 0;
  const hasContent = hasQuickWin || hasBundles;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-[insight-fade-in_0.2s_ease-out]"
        onClick={onClose}
      />

      {/* Panel - Bottom sheet on mobile, centered modal on desktop */}
      <div
        ref={panelRef}
        className="fixed z-50 bg-inbox-bg-primary shadow-inbox-elevated animate-[insight-slide-up_0.3s_ease-out] inset-x-0 bottom-0 rounded-t-2xl max-h-[85vh] md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:w-full md:max-w-lg md:max-h-[80vh]"
      >
        {/* Handle bar (mobile) */}
        <div className="md:hidden flex justify-center py-2">
          <div className="w-10 h-1 bg-inbox-divider-strong rounded-full" />
        </div>

        {/* Header - Friendly greeting style */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-inbox-divider">
          <div className="flex items-center gap-2">
            <span className="material-symbols-rounded text-inbox-accent text-xl">auto_awesome</span>
            <h2 className="text-lg font-medium text-inbox-text-primary">
              {scan.phase === 'scanning' || scan.phase === 'analyzing'
                ? 'Scanning...'
                : 'Hi there'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-inbox-bg-hover transition-colors"
          >
            <span className="material-symbols-rounded text-inbox-text-tertiary">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(85vh-120px)] md:max-h-[calc(80vh-120px)]">
          {(scan.phase === 'scanning' || scan.phase === 'analyzing') && (
            <ScanProgress
              phase={scan.phase}
              emailsScanned={scan.emailsScanned}
              eventsScanned={scan.eventsScanned}
            />
          )}

          {scan.phase === 'error' && (
            <ErrorState
              error={scan.error || 'Something went wrong'}
              onRetry={scan.startScan}
            />
          )}

          {scan.phase === 'complete' && (
            <div className="p-4">
              {/* Greeting */}
              {hasContent && (
                <p className="text-inbox-text-secondary mb-4">
                  {scan.greeting || 'I found a few ways to help you today.'}
                </p>
              )}

              {/* Quick Win Card */}
              {hasQuickWin && (
                <div className="mb-4">
                  <QuickWinCard
                    action={scan.quickWin!}
                    onExecute={scan.executeAction}
                    onSkip={scan.dismissAction}
                    onAddToTasks={scan.addToTasks}
                  />
                </div>
              )}

              {/* Bundles Section */}
              {hasBundles && (
                <div className="space-y-3">
                  {/* Section Header - only show if we have quick win above */}
                  {hasQuickWin && (
                    <h3 className="text-xs font-semibold text-inbox-text-tertiary uppercase tracking-wide">
                      Ways I can help
                    </h3>
                  )}

                  {/* Bundle Cards */}
                  {scan.bundles.map((bundle, i) => (
                    <OfferBundle
                      key={`${bundle.type}-${i}`}
                      bundle={bundle}
                      onExecute={scan.executeAction}
                      onDismiss={scan.dismissAction}
                      onAddToTasks={scan.addToTasks}
                    />
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!hasContent && <EmptyState />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ScanProgress({
  phase,
  emailsScanned,
  eventsScanned,
}: {
  phase: 'scanning' | 'analyzing';
  emailsScanned: number;
  eventsScanned: number;
}) {
  return (
    <div className="p-6 text-center">
      {/* Animated icon */}
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-inbox-accent-light flex items-center justify-center">
        <span className="material-symbols-rounded text-3xl text-inbox-accent animate-pulse">
          {phase === 'scanning' ? 'mail' : 'psychology'}
        </span>
      </div>

      <p className="text-inbox-text-primary font-medium mb-2">
        {phase === 'scanning' ? 'Scanning your inbox...' : 'Analyzing for insights...'}
      </p>

      <p className="text-sm text-inbox-text-tertiary">
        {phase === 'scanning' ? (
          <>
            {emailsScanned > 0 && `${emailsScanned} emails`}
            {emailsScanned > 0 && eventsScanned > 0 && ' · '}
            {eventsScanned > 0 && `${eventsScanned} events`}
          </>
        ) : (
          'Finding actionable items'
        )}
      </p>

      {/* Progress bar */}
      <div className="mt-4 h-1 bg-inbox-bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-inbox-accent rounded-full animate-[insight-progress_15s_ease-out_forwards]" />
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
        <span className="material-symbols-rounded text-3xl text-inbox-error">error</span>
      </div>

      <p className="text-inbox-text-primary font-medium mb-2">
        Couldn&apos;t complete scan
      </p>

      <p className="text-sm text-inbox-text-tertiary mb-4">
        {error}
      </p>

      <button
        onClick={onRetry}
        className="px-4 py-2 bg-inbox-accent text-white rounded-full text-sm font-medium hover:bg-inbox-accent-hover transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
        <span className="material-symbols-rounded text-3xl text-inbox-success">check_circle</span>
      </div>

      <p className="text-inbox-text-primary font-medium mb-2">
        All caught up!
      </p>

      <p className="text-sm text-inbox-text-tertiary">
        No urgent items need your attention right now.
      </p>
    </div>
  );
}
