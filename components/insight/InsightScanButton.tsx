'use client';

/**
 * InsightScanButton Component
 *
 * Primary button to trigger the insight scan. Displays above the task list
 * similar to Gmail's Compose button. Opens a bottom sheet on mobile or
 * modal on desktop with scan results.
 */

import { useState, useCallback } from 'react';
import { useInsightScan } from '@/hooks/useInsightScan';
import InsightPanel from './InsightPanel';

export default function InsightScanButton() {
  const [isOpen, setIsOpen] = useState(false);
  const scan = useInsightScan();

  const handleClick = useCallback(() => {
    setIsOpen(true);
    if (scan.phase === 'idle') {
      scan.startScan();
    }
  }, [scan]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    // Don't cancel the scan - let it complete in background
  }, []);

  return (
    <>
      <button
        onClick={handleClick}
        className="
          flex items-center gap-2
          px-4 py-2.5
          rounded-full
          bg-inbox-accent-light
          text-inbox-accent
          font-medium
          text-sm
          hover:bg-blue-100
          active:bg-blue-200
          transition-colors duration-100
          shadow-sm
          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-inbox-accent
          focus-visible:ring-offset-2
        "
      >
        <span className="material-symbols-rounded text-xl">auto_awesome</span>
        <span>What can I help with?</span>
        {scan.phase === 'scanning' || scan.phase === 'analyzing' ? (
          <span className="w-4 h-4 border-2 border-inbox-accent border-t-transparent rounded-full animate-spin" />
        ) : null}
      </button>

      <InsightPanel
        isOpen={isOpen}
        onClose={handleClose}
        scan={scan}
      />
    </>
  );
}
