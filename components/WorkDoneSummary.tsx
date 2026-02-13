'use client';

import { useState, useEffect } from 'react';
import type { AgentStepSummary } from '@/lib/types';

interface WorkDoneSummaryProps {
  steps: AgentStepSummary[];
  isRunning?: boolean;
  currentStep?: string | null;
  onCancel?: () => void;
}

/**
 * Human-friendly labels for each tool
 */
const toolLabels: Record<string, { short: string; full: string }> = {
  gmail_search: { short: 'searched emails', full: 'Searched your emails' },
  gmail_read: { short: 'read email', full: 'Read the email' },
  gmail_draft: { short: 'drafted reply', full: 'Drafted a reply' },
  calendar_list: { short: 'checked calendar', full: 'Checked your calendar' },
  calendar_create: { short: 'created event', full: 'Created calendar event' },
  contacts_search: { short: 'found contacts', full: 'Found contact info' },
  web_search: { short: 'searched web', full: 'Searched the web' },
  web_fetch: { short: 'gathered info', full: 'Gathered information' },
};

/**
 * WorkDoneSummary - Collapsible inline pill showing what steps the agent took
 *
 * Collapsed: "Searched emails, read message, searched web"
 * Expanded: Vertical list with timing info
 */
export function WorkDoneSummary({ steps, isRunning, currentStep, onCancel }: WorkDoneSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Load expansion state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('todone-expand-steps');
    if (saved === 'true') {
      setIsExpanded(true);
    }
  }, []);

  // Save expansion state
  const toggleExpand = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem('todone-expand-steps', String(newState));
  };

  if (steps.length === 0 && !isRunning) {
    return null;
  }

  // Generate collapsed summary text
  const summaryText = steps
    .map(s => toolLabels[s.tool]?.short || s.tool)
    .join(', ');

  // In-progress state
  if (isRunning && steps.length === 0) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-inbox-accent/10 text-inbox-accent rounded-full text-[13px] mb-3">
        <span className="material-symbols-rounded text-[14px] animate-pulse">auto_awesome</span>
        <span>Getting started...</span>
        <div className="flex gap-0.5 ml-1">
          <span className="w-1 h-1 bg-inbox-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-1 bg-inbox-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-1 bg-inbox-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      {/* Collapsed pill */}
      <button
        onClick={toggleExpand}
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-inbox-bg-secondary hover:bg-inbox-bg-hover rounded-full text-[13px] text-inbox-text-secondary transition-colors duration-150"
        aria-expanded={isExpanded}
      >
        {isRunning ? (
          <span className="material-symbols-rounded text-[14px] text-inbox-accent animate-pulse">
            auto_awesome
          </span>
        ) : (
          <span className="material-symbols-rounded text-[14px] text-green-600">
            check_circle
          </span>
        )}
        <span className="max-w-[300px] truncate">
          {isRunning && currentStep ? currentStep : (summaryText || 'Working...')}
        </span>
        <span className={`material-symbols-rounded text-[16px] transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}>
          expand_more
        </span>
        {isRunning && onCancel && (
          <span
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="ml-1 text-inbox-text-tertiary hover:text-inbox-text-secondary cursor-pointer"
          >
            Cancel
          </span>
        )}
      </button>

      {/* Expanded list */}
      {isExpanded && (
        <div className="mt-2 ml-1 space-y-1 animate-fade-in">
          {steps.map((step, index) => {
            const labels = toolLabels[step.tool] || { short: step.tool, full: step.tool };
            return (
              <div key={`${step.tool}-${index}`} className="flex items-center gap-2 text-[13px]">
                <span className="material-symbols-rounded text-[14px] text-green-600">check</span>
                <span className="text-inbox-text-primary">{labels.full}</span>
                {step.detail && (
                  <span className="text-inbox-text-tertiary truncate max-w-[200px]">{step.detail}</span>
                )}
                {step.durationMs && (
                  <span className="text-inbox-text-tertiary text-[11px]">
                    {step.durationMs < 1000
                      ? `${step.durationMs}ms`
                      : `${(step.durationMs / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            );
          })}
          {isRunning && currentStep && (
            <div className="flex items-center gap-2 text-[13px]">
              <span className="material-symbols-rounded text-[14px] text-inbox-accent animate-pulse">pending</span>
              <span className="text-inbox-accent">{currentStep}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default WorkDoneSummary;
