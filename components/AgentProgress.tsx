'use client';

/**
 * AgentProgress Component
 *
 * Shows a detailed vertical list of steps the AI agent is performing.
 * Each step shows what the agent did with relevant context.
 * Designed to feel like a capable assistant doing real work for you.
 */

import { useMemo } from 'react';
import type { AgentProgressEvent } from '@/lib/ai/types';
import type { AgentStepSummary } from '@/lib/types';

interface AgentProgressProps {
  events: AgentProgressEvent[];
  isRunning: boolean;
  currentStep: string | null;
  onCancel?: () => void;
  hasCompletedResult?: boolean;
  /** Persisted steps from previous agent run (used when events are empty) */
  persistedSteps?: AgentStepSummary[];
}

/**
 * Human-friendly labels and icons for each tool
 */
const toolConfig: Record<string, { label: string; activeLabel: string; icon: string }> = {
  gmail_search: { label: 'Searched your emails', activeLabel: 'Searching emails', icon: 'mail' },
  gmail_read: { label: 'Read the email', activeLabel: 'Reading email', icon: 'mark_email_read' },
  gmail_draft: { label: 'Drafted a reply', activeLabel: 'Drafting reply', icon: 'edit' },
  calendar_list: { label: 'Checked your calendar', activeLabel: 'Checking calendar', icon: 'calendar_month' },
  calendar_create: { label: 'Created calendar event', activeLabel: 'Creating event', icon: 'event' },
  contacts_search: { label: 'Found contact info', activeLabel: 'Searching contacts', icon: 'contacts' },
  contacts_analyze: { label: 'Analyzed relationship', activeLabel: 'Analyzing relationship', icon: 'person_search' },
  web_search: { label: 'Searched the web', activeLabel: 'Searching the web', icon: 'travel_explore' },
  web_fetch: { label: 'Gathered information', activeLabel: 'Fetching page', icon: 'language' },
};

/**
 * Get a detail string from tool args (e.g., search query, email subject)
 */
function getStepDetail(tool: string, args: Record<string, unknown>): string | null {
  switch (tool) {
    case 'gmail_search':
      return args.query ? `"${args.query}"` : null;
    case 'gmail_read':
      return null; // Don't show message ID
    case 'web_search':
      return args.query ? `"${args.query}"` : null;
    case 'calendar_list':
      if (args.daysAhead) return `Next ${args.daysAhead} days`;
      return null;
    default:
      return null;
  }
}

interface ProcessedStep {
  tool: string;
  detail: string | null;
  status: 'completed' | 'running' | 'pending';
  durationMs?: number;
}

/**
 * Process events into a list of steps with their status.
 * Single-pass: steps appear as 'running' when tool_start arrives,
 * then transition to 'completed' when tool_result arrives.
 */
function processSteps(events: AgentProgressEvent[]): ProcessedStep[] {
  const steps: ProcessedStep[] = [];
  const stepsByTool = new Map<string, ProcessedStep>();

  // Single pass: process events in order
  for (const event of events) {
    if (event.type === 'tool_start') {
      // Only add step if we haven't seen this tool yet
      if (!stepsByTool.has(event.tool)) {
        const step: ProcessedStep = {
          tool: event.tool,
          detail: getStepDetail(event.tool, event.args),
          status: 'running',
        };
        steps.push(step);
        stepsByTool.set(event.tool, step);
      }
    } else if (event.type === 'tool_result') {
      // Update existing step to completed
      const step = stepsByTool.get(event.tool);
      if (step) {
        step.status = 'completed';
        step.durationMs = event.duration_ms;
      }
    }
  }

  return steps;
}

export function AgentProgress({
  events,
  isRunning,
  onCancel,
  hasCompletedResult = false,
  persistedSteps,
}: AgentProgressProps) {
  // Process events into display steps (from live events)
  const liveSteps = useMemo(() => processSteps(events), [events]);

  // Use persisted steps as fallback when no live events
  const steps = useMemo((): ProcessedStep[] => {
    if (liveSteps.length > 0) {
      return liveSteps;
    }
    // Convert persisted steps to ProcessedStep format
    if (persistedSteps && persistedSteps.length > 0) {
      return persistedSteps.map(ps => ({
        tool: ps.tool,
        detail: ps.detail,
        status: 'completed' as const,
        durationMs: ps.durationMs,
      }));
    }
    return [];
  }, [liveSteps, persistedSteps]);

  // Determine final state
  const lastEvent = events[events.length - 1];
  const hasPersistedSteps = persistedSteps && persistedSteps.length > 0;
  const isCompleted = lastEvent?.type === 'complete' || hasCompletedResult || hasPersistedSteps;
  const isError = lastEvent?.type === 'error';
  const isCancelled = lastEvent?.type === 'cancelled';

  // Don't render if nothing to show
  if (steps.length === 0 && !isRunning && !hasCompletedResult && !hasPersistedSteps) {
    return null;
  }

  // Error state
  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-rounded text-red-600 text-[16px]">error</span>
          <span className="text-[13px] text-red-800 font-medium">Something went wrong</span>
          <span className="text-[12px] text-red-600">{lastEvent.error}</span>
          {onCancel && (
            <button
              onClick={onCancel}
              className="ml-auto text-[12px] text-inbox-accent hover:underline"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  // Cancelled state
  if (isCancelled) {
    return (
      <div className="rounded-lg border border-inbox-divider bg-inbox-bg-secondary px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-rounded text-inbox-text-tertiary text-[16px]">cancel</span>
          <span className="text-[13px] text-inbox-text-secondary">Stopped</span>
        </div>
      </div>
    );
  }

  // No steps yet but running - show initial state
  if (steps.length === 0 && isRunning) {
    return (
      <div className="rounded-lg border border-inbox-accent/20 bg-inbox-accent/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-rounded text-inbox-accent text-[16px] animate-pulse">auto_awesome</span>
          <span className="text-[13px] text-inbox-accent font-medium">Getting started...</span>
          <div className="typing-indicator scale-90">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    );
  }

  // Main view: Show steps in a box
  const borderColor = isCompleted ? 'border-green-200' : 'border-inbox-accent/20';
  const bgColor = isCompleted ? 'bg-green-50/30' : 'bg-inbox-accent/5';

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}>
      {/* Header - compact */}
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isCompleted ? (
            <>
              <span className="material-symbols-rounded text-green-600 text-[16px]">auto_awesome</span>
              <span className="text-[13px] text-green-700 font-medium">Work completed</span>
            </>
          ) : (
            <>
              <span className="material-symbols-rounded text-inbox-accent text-[16px] animate-pulse">auto_awesome</span>
              <span className="text-[13px] text-inbox-accent font-medium">Working on it...</span>
            </>
          )}
        </div>
        {isRunning && onCancel && (
          <button
            onClick={onCancel}
            className="text-[11px] text-inbox-text-tertiary hover:text-inbox-text-secondary transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Steps list - compact */}
      <div>
        {steps.map((step, index) => {
          const config = toolConfig[step.tool] || { label: step.tool, activeLabel: step.tool, icon: 'build' };
          const isActive = step.status === 'running' && isRunning;

          return (
            <div
              key={`${step.tool}-${index}`}
              className={`px-3 py-2 flex items-center gap-2 ${isActive ? 'bg-white/50' : ''}`}
            >
              {/* Icon - muted green for completed, prominent for running */}
              <div className={`
                w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0
                ${step.status === 'completed' ? 'bg-green-100/50 text-green-500/70' : ''}
                ${step.status === 'running' ? 'bg-inbox-accent/10 text-inbox-accent' : ''}
              `}>
                {step.status === 'completed' ? (
                  <span className="material-symbols-rounded text-[12px]">check</span>
                ) : (
                  <span className={`material-symbols-rounded text-[14px] ${isActive ? 'animate-pulse' : ''}`}>
                    {config.icon}
                  </span>
                )}
              </div>

              {/* Content - inline */}
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <span className={`text-[13px] ${step.status === 'completed' ? 'text-inbox-text-primary' : 'text-inbox-accent'}`}>
                  {step.status === 'running' ? config.activeLabel : config.label}
                </span>
                {step.detail && (
                  <span className="text-[11px] text-inbox-text-tertiary truncate max-w-[50%]">
                    {step.detail}
                  </span>
                )}
                {isActive && (
                  <div className="typing-indicator scale-75">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                )}
              </div>

              {/* Duration badge for completed steps */}
              {step.status === 'completed' && step.durationMs && (
                <span className="text-[10px] text-inbox-text-tertiary">
                  {step.durationMs < 1000
                    ? `${step.durationMs}ms`
                    : `${(step.durationMs / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AgentProgress;
