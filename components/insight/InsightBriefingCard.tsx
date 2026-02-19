'use client';

/**
 * InsightBriefingCard Component
 *
 * A task-like row that shows insight status.
 * Styled to match regular tasks with subtle differentiation.
 */

import { useState, useEffect, useMemo } from 'react';
import type { ScanObject } from './InsightView';

interface InsightBriefingCardProps {
  onClick: () => void;
  isSelected?: boolean;
  scan: ScanObject;
}

export default function InsightBriefingCard({ onClick, isSelected, scan }: InsightBriefingCardProps) {

  // Calculate total items count
  const totalItems = (scan.quickWin ? 1 : 0) +
    scan.bundles.reduce((sum, b) => sum + b.items.length, 0);

  // Rotating messages for analyzing phase
  const [analyzingIndex, setAnalyzingIndex] = useState(0);
  const analyzingMessages = useMemo(() => {
    const msgs: string[] = [];
    if (scan.emailsScanned > 0) msgs.push(`Reviewing ${scan.emailsScanned} emails...`);
    if (scan.eventsScanned > 0) msgs.push(`Checking ${scan.eventsScanned} events...`);
    msgs.push('Finding what needs attention...');
    msgs.push('Prioritizing...');
    return msgs;
  }, [scan.emailsScanned, scan.eventsScanned]);

  useEffect(() => {
    if (scan.phase !== 'analyzing') return;
    const interval = setInterval(() => {
      setAnalyzingIndex(prev => (prev + 1) % analyzingMessages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [scan.phase, analyzingMessages.length]);

  // Get summary text based on state
  const getSummaryText = () => {
    if (scan.phase === 'idle') {
      return 'Scan inbox for insights';
    }
    if (scan.phase === 'scanning') {
      return `Scanning${scan.emailsScanned > 0 ? ` · ${scan.emailsScanned} emails` : '...'}`;
    }
    if (scan.phase === 'analyzing') {
      return analyzingMessages[analyzingIndex];
    }
    if (scan.phase === 'error') {
      return 'Scan failed';
    }
    if (scan.phase === 'complete') {
      if (totalItems === 0) {
        return 'All caught up!';
      }
      // Show quick summary
      const parts: string[] = [];
      const meetingBundle = scan.bundles.find(b => b.type === 'meetings');
      const emailBundle = scan.bundles.find(b => b.type === 'drafts');
      const meetingCount = (meetingBundle?.items.length || 0) + (scan.quickWin?.type === 'meeting_prep' ? 1 : 0);
      const emailCount = (emailBundle?.items.length || 0) + (scan.quickWin?.type === 'draft_response' ? 1 : 0);

      if (meetingCount > 0) parts.push(`${meetingCount} meeting${meetingCount > 1 ? 's' : ''}`);
      if (emailCount > 0) parts.push(`${emailCount} email${emailCount > 1 ? 's' : ''}`);

      return parts.join(', ') || `${totalItems} items to review`;
    }
    return '';
  };

  // Determine if loading
  const isLoading = scan.phase === 'scanning' || scan.phase === 'analyzing';

  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-4
        text-left rounded-lg
        transition-colors duration-100
        hover:bg-inbox-bg-hover
        ${isSelected ? 'bg-inbox-accent-light' : ''}
        ${scan.phase === 'complete' && totalItems > 0 ? 'bg-inbox-accent-light/50' : ''}
      `}
    >
      {/* Sparkle icon or spinner */}
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-inbox-accent border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className={`
            material-symbols-rounded text-lg
            ${scan.phase === 'complete' && totalItems > 0 ? 'text-inbox-accent' : 'text-amber-400'}
            ${scan.phase === 'error' ? 'text-inbox-error' : ''}
          `}>
            {scan.phase === 'error' ? 'error' : 'auto_awesome'}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`
          text-sm truncate
          ${scan.phase === 'complete' && totalItems > 0
            ? 'text-inbox-text-primary'
            : 'text-inbox-text-secondary'
          }
        `}>
          <span className="font-medium">Briefing</span>
          <span className="text-inbox-text-tertiary"> · {getSummaryText()}</span>
        </p>
      </div>

      {/* Count badge (only when complete with items) */}
      {scan.phase === 'complete' && totalItems > 0 && (
        <span className="flex-shrink-0 min-w-[24px] h-6 px-2 flex items-center justify-center rounded-full bg-inbox-accent text-white text-xs font-medium">
          {totalItems}
        </span>
      )}
    </button>
  );
}
