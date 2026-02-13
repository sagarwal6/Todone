'use client';

/**
 * InsightDetailPanel Component
 *
 * Right-side panel for viewing and acting on emails/meetings.
 * Follows Gmail reading pane pattern - list stays stable, detail shows on right.
 *
 * Email Reply Flow:
 * - "Write myself": User types reply → clicks Send → opens Gmail with draft pre-filled
 * - "Draft for me": User gives direction → AI generates draft → appears in textarea → Send opens Gmail
 * Both flows end the same way: opening Gmail to send. No jarring UI transitions.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import type { InsightAction, DraftResponseContext, MeetingPrepContext } from '@/lib/scan/types';
import type { LocalActionState } from '@/hooks/useInsightScan';
import { QuickReferenceCard } from '@/components/QuickReferenceCard';
import { openGmailThread } from '@/lib/email/gmail-links';
import { useAgentContext } from '@/contexts/AgentContext';
import { AgentProgress } from '@/components/AgentProgress';

interface InsightDetailPanelProps {
  action: InsightAction;
  actionState?: LocalActionState | null;
  onExecute: (actionId: string, userInput?: string, replyMode?: 'draft' | 'write') => Promise<{ success: boolean; taskId?: string; error?: string }>;
  onDismiss: (actionId: string) => Promise<boolean>;
  onClose: () => void;
  getEmailContent?: (messageId: string) => EmailContent | null;
}

interface EmailContent {
  id: string;
  from: string;
  to?: string[];
  cc?: string[];
  subject: string;
  body: string;
  date: string;
}

/**
 * Get sender initial for avatar
 */
function getSenderInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

/**
 * Process email body text to make URLs clickable
 */
function processEmailBody(body: string): React.ReactNode[] {
  const urlPattern = /(?:([^<\s]*?)<(https?:\/\/[^\s>]+)>|(https?:\/\/[^\s<>]+))/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = urlPattern.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }

    const textBefore = match[1];
    const urlInBrackets = match[2];
    const standaloneUrl = match[3];
    const url = urlInBrackets || standaloneUrl;
    const displayText = textBefore || url;

    parts.push(
      <a
        key={`link-${keyIndex++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-inbox-accent hover:underline break-all"
      >
        {displayText}
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [body];
}

/**
 * Get a consistent color for sender avatar based on name
 */
function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-indigo-500',
    'bg-rose-500',
  ];
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}

/**
 * Extract display info from action context
 */
function getDisplayInfo(action: InsightAction): {
  senderName: string;
  senderEmail?: string;
  subject: string;
  timeAgo: string;
  suggestion: string;
} {
  const ctx = action.context || {};

  if (action.type === 'draft_response') {
    const emailCtx = ctx as DraftResponseContext;
    const senderName = emailCtx.senderName || 'Unknown';
    const daysAgo = emailCtx.daysAgo;
    const timeAgo = daysAgo !== undefined
      ? (daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`)
      : '';

    return {
      senderName,
      senderEmail: emailCtx.senderEmail,
      subject: emailCtx.subject || action.detail || 'No subject',
      timeAgo,
      suggestion: emailCtx.suggestedDirection || action.valueProposition || '',
    };
  }

  if (action.type === 'meeting_prep') {
    const meetingCtx = ctx as MeetingPrepContext;
    const title = meetingCtx.title || action.headline;
    const attendee = meetingCtx.keyAttendee || (meetingCtx.attendees?.[0]) || 'Meeting';
    const start = meetingCtx.start ? new Date(meetingCtx.start) : null;
    const timeAgo = start ? start.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }) : '';

    return {
      senderName: attendee.split(' ')[0],
      subject: title,
      timeAgo,
      suggestion: meetingCtx.suggestedFocus || action.valueProposition || '',
    };
  }

  // Fallback
  const headline = action.headline || '';
  return {
    senderName: headline.split(' · ')[0] || 'Item',
    subject: action.detail || '',
    timeAgo: headline.split(' · ')[1] || '',
    suggestion: action.valueProposition || '',
  };
}

export default function InsightDetailPanel({
  action,
  actionState,
  onExecute,
  onDismiss,
  onClose,
  getEmailContent,
}: InsightDetailPanelProps) {
  const { data: session } = useSession();
  const userEmail = session?.user?.email || undefined;

  const [error, setError] = useState<string | null>(null);
  const [emailContent, setEmailContent] = useState<EmailContent | null>(null);
  const [isLoadingEmail, setIsLoadingEmail] = useState(false);

  // Email reply state
  const [replyMode, setReplyMode] = useState<'draft' | 'write'>('draft');
  const [draftText, setDraftText] = useState(''); // The text in the textarea
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [hasDraftGenerated, setHasDraftGenerated] = useState(false); // True after AI generates
  const [copied, setCopied] = useState(false); // For copy feedback
  const [isEmailCollapsed, setIsEmailCollapsed] = useState(false); // Collapse email when draft ready

  // Meeting prep state (separate from email)
  const [meetingInput, setMeetingInput] = useState('');
  const [isExecutingMeeting, setIsExecutingMeeting] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isMeeting = action.type === 'meeting_prep';
  const meetingContext = isMeeting ? action.context as MeetingPrepContext : null;
  const attendees = meetingContext?.attendees || [];
  const meetingDescription = meetingContext?.description;

  const { senderName, senderEmail, subject, timeAgo, suggestion } = getDisplayInfo(action);

  // Get threadId for email actions
  const threadId = action.type === 'draft_response'
    ? (action.context as DraftResponseContext)?.threadId
    : undefined;

  // Derive meeting execution status from actionState (meetings still use the old flow)
  const isInProgress = actionState?.status === 'in_progress';
  const isCompleted = actionState?.status === 'completed';
  const hasFailed = actionState?.status === 'failed';
  const actionResult = actionState?.result;

  // Get agent context for progress tracking
  const agent = useAgentContext();
  const taskId = actionState?.taskId;
  const agentState = taskId ? agent.getAgentState(taskId) : null;
  const agentProgress = useMemo(() => agentState?.progress || [], [agentState?.progress]);
  const isAgentRunning = agentState?.isRunning || false;

  // Reset meeting executing state when external state changes
  useEffect(() => {
    if (isCompleted || hasFailed) {
      setIsExecutingMeeting(false);
    }
  }, [isCompleted, hasFailed]);

  // Reset all email-specific state when switching to a different action
  useEffect(() => {
    setDraftText('');
    setHasDraftGenerated(false);
    setIsGeneratingDraft(false);
    setIsEmailCollapsed(false);
    setError(null);
    setCopied(false);
    setEmailContent(null);
    setMeetingInput('');
    setIsExecutingMeeting(false);
  }, [action.id]);

  // Load email content on mount
  useEffect(() => {
    if (action.type !== 'draft_response') return;

    const emailCtx = action.context as DraftResponseContext;
    if (!emailCtx.messageId) return;

    const cached = getEmailContent?.(emailCtx.messageId);
    if (cached) {
      setEmailContent(cached);
      return;
    }

    const loadEmail = async () => {
      setIsLoadingEmail(true);
      setError(null);

      try {
        const response = await fetch(`/api/scan/email/${emailCtx.messageId}`);
        if (!response.ok) {
          throw new Error('Failed to load email');
        }
        const data = await response.json();
        setEmailContent(data.email);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load email');
      } finally {
        setIsLoadingEmail(false);
      }
    };

    loadEmail();
  }, [action.type, action.context, getEmailContent]);

  // Focus input when email loads
  useEffect(() => {
    if (emailContent && inputRef.current) {
      inputRef.current.focus();
    }
  }, [emailContent]);

  // Auto-execute meeting prep when panel opens
  const hasAutoExecutedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isMeeting && !isExecutingMeeting && hasAutoExecutedRef.current !== action.id) {
      hasAutoExecutedRef.current = action.id;
      const timer = setTimeout(async () => {
        setIsExecutingMeeting(true);
        setError(null);
        try {
          const result = await onExecute(action.id);
          if (!result.success) {
            setError(result.error || 'Failed');
            setIsExecutingMeeting(false);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Something went wrong');
          setIsExecutingMeeting(false);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isMeeting, action.id, isExecutingMeeting, onExecute]);

  // Copy draft text to clipboard
  const handleCopyDraft = useCallback(async () => {
    if (!draftText.trim()) return;

    try {
      await navigator.clipboard.writeText(draftText.trim());
      setCopied(true);
      // Reset after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [draftText]);

  // Open Gmail thread for reply
  const handleOpenThread = useCallback(() => {
    if (!threadId) return;
    openGmailThread(threadId, userEmail);
  }, [threadId, userEmail]);

  // Handle "Draft for me" - generate AI draft, then show in textarea
  const handleGenerateDraft = useCallback(async () => {
    setIsGeneratingDraft(true);
    setError(null);

    try {
      const result = await onExecute(action.id, draftText || undefined, 'draft');
      if (!result.success) {
        setError(result.error || 'Failed to generate draft');
        setIsGeneratingDraft(false);
        return;
      }
      // The draft will come back via actionState when the agent completes
      // We'll update the textarea when we receive it
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsGeneratingDraft(false);
    }
  }, [action.id, draftText, onExecute]);

  // When AI draft is ready, update the textarea and collapse email
  useEffect(() => {
    if (!isMeeting && isCompleted && actionResult?.pendingDrafts && actionResult.pendingDrafts.length > 0) {
      const emailDraft = actionResult.pendingDrafts.find(d => d.type === 'email');
      if (emailDraft && emailDraft.content) {
        setDraftText(emailDraft.content);
        setHasDraftGenerated(true);
        setIsGeneratingDraft(false);
        setIsEmailCollapsed(true); // Collapse email to focus on draft
      }
    }
  }, [isMeeting, isCompleted, actionResult]);

  // Handle agent failure or completion without draft for email actions
  useEffect(() => {
    if (isMeeting || !isGeneratingDraft) return;

    // If agent failed, stop generating and show error
    if (hasFailed) {
      setIsGeneratingDraft(false);
      setError(actionResult?.error || 'Failed to generate draft');
      return;
    }

    // If agent completed but no draft was created (edge case)
    if (isCompleted && (!actionResult?.pendingDrafts || actionResult.pendingDrafts.length === 0)) {
      setIsGeneratingDraft(false);
      // Don't show error - agent may have provided info in the message instead
    }
  }, [isMeeting, isGeneratingDraft, hasFailed, isCompleted, actionResult]);

  // Handle meeting prep execution
  const handleExecuteMeeting = useCallback(async () => {
    setIsExecutingMeeting(true);
    setError(null);

    try {
      const result = await onExecute(action.id, meetingInput || undefined);
      if (!result.success) {
        setError(result.error || 'Failed');
        setIsExecutingMeeting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsExecutingMeeting(false);
    }
  }, [action.id, onExecute, meetingInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  const handleDismiss = useCallback(async () => {
    await onDismiss(action.id);
    onClose();
  }, [action.id, onDismiss, onClose]);

  // Switch modes without clearing draft text
  const handleModeChange = useCallback((mode: 'draft' | 'write') => {
    setReplyMode(mode);
    // Don't clear draftText - preserve what user typed
    setHasDraftGenerated(false);
    setError(null);
  }, []);

  return (
    <div className="h-full flex flex-col bg-inbox-bg-primary">
      {/* Navigation header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-inbox-divider flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-inbox-accent hover:bg-inbox-bg-hover rounded-full px-2 py-1.5 -ml-2 transition-colors"
        >
          <span className="material-symbols-rounded text-lg">arrow_back</span>
          <span className="text-inbox-body font-medium">Proactive todos</span>
        </button>

        <div className="flex-1" />

        <button
          onClick={handleDismiss}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          title="Dismiss"
        >
          <span className="material-symbols-rounded text-xl">delete</span>
        </button>
      </div>

      {/* Content header with sender info */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-start gap-3">
          <div className={`
            w-10 h-10 rounded-full flex items-center justify-center
            ${getAvatarColor(senderName)} text-white font-medium text-base
            flex-shrink-0
          `}>
            {getSenderInitial(senderName)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[15px] font-semibold text-gray-900">
                {senderName}
              </span>
              <span className="text-[13px] text-gray-500">
                {timeAgo}
              </span>
            </div>
            {senderEmail && !isMeeting && (
              <p className="text-[13px] text-gray-500 truncate">
                {senderEmail}
              </p>
            )}
            {emailContent && !isMeeting && (
              <div className="text-[12px] text-gray-400 mt-1 space-y-0.5">
                {emailContent.to && emailContent.to.length > 0 && (
                  <p className="truncate">
                    <span className="text-gray-400">To:</span> {emailContent.to.join(', ')}
                  </p>
                )}
                {emailContent.cc && emailContent.cc.length > 0 && (
                  <p className="truncate">
                    <span className="text-gray-400">Cc:</span> {emailContent.cc.join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <h2 className="mt-3 text-[16px] font-medium text-gray-900 leading-snug">
          {subject}
        </h2>
      </div>

      {/* Body - scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isMeeting ? (
          /* Meeting content */
          <div className="space-y-5">
            {attendees.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Attendees ({attendees.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {attendees.slice(0, 8).map((attendee, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5"
                    >
                      <div className={`
                        w-6 h-6 rounded-full flex items-center justify-center
                        ${getAvatarColor(attendee)} text-white text-[11px] font-medium
                      `}>
                        {getSenderInitial(attendee)}
                      </div>
                      <span className="text-[13px] text-gray-700">
                        {attendee.split(' ')[0]}
                      </span>
                    </div>
                  ))}
                  {attendees.length > 8 && (
                    <span className="text-[13px] text-gray-500 self-center">
                      +{attendees.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {meetingDescription && (
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Description
                </p>
                <p className="text-[14px] text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {meetingDescription}
                </p>
              </div>
            )}

            {suggestion && (
              <div className="bg-blue-50 rounded-lg px-4 py-3">
                <p className="text-[13px] text-blue-800">
                  <span className="font-medium">Suggested focus:</span> {suggestion}
                </p>
              </div>
            )}

            {/* Meeting prep results */}
            {isCompleted && actionResult && (
              <div className="space-y-4 border-t border-gray-200 pt-5 mt-5">
                <div className="flex items-center gap-2 text-green-600">
                  <span className="material-symbols-rounded text-xl">check_circle</span>
                  <span className="text-[14px] font-medium">Prep complete</span>
                </div>

                {actionResult.message && (
                  <div className="text-[14px] text-gray-700 leading-relaxed whitespace-pre-wrap bg-white rounded-lg p-4 border border-gray-200">
                    {actionResult.message}
                  </div>
                )}

                {actionResult.quickInfo && Object.keys(actionResult.quickInfo).length > 0 && (
                  <QuickReferenceCard quickInfo={actionResult.quickInfo} />
                )}
              </div>
            )}
          </div>
        ) : (
          /* Email content */
          <>
            {isLoadingEmail ? (
              <div className="py-12 flex flex-col items-center justify-center text-gray-500">
                <span className="material-symbols-rounded text-3xl animate-spin mb-3">progress_activity</span>
                <span className="text-[14px]">Loading email...</span>
              </div>
            ) : emailContent ? (
              <>
                {/* Collapsed email summary when draft is ready */}
                {isEmailCollapsed && hasDraftGenerated ? (
                  <button
                    onClick={() => setIsEmailCollapsed(false)}
                    className="w-full text-left bg-gray-100 hover:bg-gray-200 rounded-lg px-4 py-3 transition-colors group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-rounded text-gray-400 group-hover:text-gray-600 transition-colors">
                        expand_more
                      </span>
                      <span className="text-[13px] font-medium text-gray-600">Original email</span>
                      <span className="text-[13px] text-gray-400 truncate flex-1">
                        {emailContent.body.slice(0, 60).replace(/\n/g, ' ')}...
                      </span>
                    </div>
                  </button>
                ) : (
                  /* Full email body */
                  <>
                    {hasDraftGenerated && (
                      <button
                        onClick={() => setIsEmailCollapsed(true)}
                        className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-600 mb-3 transition-colors"
                      >
                        <span className="material-symbols-rounded text-sm">expand_less</span>
                        Collapse
                      </button>
                    )}
                    <div className="text-[14px] text-gray-700 leading-relaxed whitespace-pre-wrap max-w-[600px]">
                      {processEmailBody(emailContent.body)}
                    </div>
                  </>
                )}
              </>
            ) : error && !draftText ? (
              <div className="py-12 text-center">
                <span className="material-symbols-rounded text-3xl text-red-400 mb-3">error</span>
                <p className="text-[14px] text-red-500">{error}</p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Footer - Email reply input OR Meeting prep state */}
      {/* Footer expands when email is collapsed and draft is ready */}
      <div className={`
        px-6 py-4 border-t border-gray-100 bg-gray-50
        transition-all duration-200 ease-out
        ${isEmailCollapsed && hasDraftGenerated && !isMeeting
          ? 'flex-1 flex flex-col min-h-0'
          : 'flex-shrink-0'
        }
      `}>
        {isMeeting ? (
          /* Meeting prep footer */
          <>
            {(isInProgress || isExecutingMeeting) && (
              <div className="py-2">
                {agentProgress.length > 0 || isAgentRunning ? (
                  <AgentProgress
                    events={agentProgress}
                    isRunning={isAgentRunning}
                    currentStep={agentState?.currentStep || null}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-4">
                    <span className="material-symbols-rounded text-3xl text-inbox-accent animate-spin mb-2">
                      progress_activity
                    </span>
                    <p className="text-[14px] text-gray-700 font-medium">
                      Starting...
                    </p>
                  </div>
                )}
              </div>
            )}

            {hasFailed && (
              <div className="flex flex-col items-center justify-center py-4">
                <span className="material-symbols-rounded text-3xl text-red-500 mb-2">error</span>
                <p className="text-[14px] text-red-600 font-medium">Something went wrong</p>
                <p className="text-[12px] text-gray-500 mt-1">
                  {actionResult?.error || 'Please try again'}
                </p>
                <button
                  onClick={handleExecuteMeeting}
                  className="mt-3 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-[13px] font-medium text-gray-700 transition-colors"
                >
                  Try again
                </button>
              </div>
            )}

            {isCompleted && (
              <button
                onClick={onClose}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-[14px] font-medium text-gray-700 transition-colors"
              >
                Done
              </button>
            )}

            {!isInProgress && !isExecutingMeeting && !isCompleted && !hasFailed && (
              <>
                <p className="text-[12px] text-gray-500 mb-3">
                  I'll research the attendees and prepare talking points for you.
                </p>
                <div className="flex gap-3">
                  <textarea
                    value={meetingInput}
                    onChange={(e) => setMeetingInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={suggestion || "Any specific topics to focus on? (optional)"}
                    rows={1}
                    className="
                      flex-1 px-4 py-3
                      text-[14px] text-gray-900
                      bg-white border border-gray-200 rounded-xl
                      resize-none
                      focus:outline-none focus:ring-2 focus:ring-inbox-accent/20 focus:border-inbox-accent
                      placeholder:text-gray-400
                      transition-all
                    "
                    style={{ minHeight: '48px' }}
                  />
                  <button
                    onClick={handleExecuteMeeting}
                    className="
                      px-5 py-3
                      text-[14px] font-medium text-white
                      bg-inbox-accent hover:bg-inbox-accent-hover
                      rounded-xl
                      transition-all
                      flex items-center gap-2
                      shadow-sm hover:shadow
                      self-end flex-shrink-0
                    "
                  >
                    <span className="material-symbols-rounded text-lg">psychology</span>
                    Prep now
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          /* Email reply footer - Progressive UI that builds */
          <>
            {/* Mode toggle */}
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => handleModeChange('draft')}
                disabled={isGeneratingDraft}
                className={`
                  text-[13px] transition-all disabled:opacity-50
                  ${replyMode === 'draft'
                    ? 'text-inbox-accent font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                  }
                `}
              >
                Draft for me
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => handleModeChange('write')}
                disabled={isGeneratingDraft}
                className={`
                  text-[13px] transition-all disabled:opacity-50
                  ${replyMode === 'write'
                    ? 'text-inbox-accent font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                  }
                `}
              >
                Write it myself
              </button>
            </div>

            {/* Draft ready header */}
            {hasDraftGenerated && (
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-rounded text-inbox-accent text-lg">edit_note</span>
                <span className="text-[11px] font-semibold text-inbox-accent uppercase tracking-wide">
                  Your draft reply
                </span>
              </div>
            )}

            {/* Helper text */}
            {!hasDraftGenerated && (
              <p className="text-[12px] text-gray-500 mb-3">
                {replyMode === 'draft'
                  ? "Give me direction and I'll draft a reply for you."
                  : "Type your reply below. Copy it, then reply in Gmail."
                }
              </p>
            )}

            {/* Textarea + Button - column layout when draft fills space */}
            <div className={`
              ${isEmailCollapsed && hasDraftGenerated ? 'flex-1 flex flex-col min-h-0' : 'flex gap-3'}
            `}>
              <div className={`
                relative
                ${isEmailCollapsed && hasDraftGenerated ? 'flex-1 min-h-0' : 'flex-1'}
                ${hasDraftGenerated ? 'ring-2 ring-inbox-accent/20 rounded-xl' : ''}
              `}>
                <textarea
                  ref={inputRef}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    replyMode === 'draft'
                      ? hasDraftGenerated
                        ? ''
                        : (suggestion || "e.g., Confirm I'm available and suggest next steps")
                      : "Type your reply..."
                  }
                  className={`
                    w-full px-4 py-3
                    text-[14px] text-gray-900
                    bg-white border rounded-xl
                    resize-none
                    focus:outline-none focus:ring-2 focus:ring-inbox-accent/20 focus:border-inbox-accent
                    placeholder:text-gray-400
                    transition-all
                    disabled:opacity-50
                    ${hasDraftGenerated ? 'border-inbox-accent/30' : 'border-gray-200'}
                    ${isEmailCollapsed && hasDraftGenerated ? 'h-full' : ''}
                  `}
                  disabled={isLoadingEmail || isGeneratingDraft}
                  style={{ minHeight: isEmailCollapsed && hasDraftGenerated ? undefined : (hasDraftGenerated ? '200px' : '140px') }}
                />

                {/* Generating indicator - show progress steps when available */}
                {isGeneratingDraft && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-xl p-3">
                    {agentProgress.length > 0 || isAgentRunning ? (
                      <div className="w-full max-w-sm">
                        <AgentProgress
                          events={agentProgress}
                          isRunning={isAgentRunning}
                          currentStep={agentState?.currentStep || null}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className="material-symbols-rounded text-2xl text-inbox-accent animate-spin mb-2">
                          progress_activity
                        </span>
                        <span className="text-[13px] text-gray-600">Starting...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons - row when expanded, column when compact */}
              <div className={`
                ${isEmailCollapsed && hasDraftGenerated
                  ? 'flex items-center justify-between mt-3 flex-shrink-0'
                  : 'flex flex-col justify-end gap-2'
                }
              `}>
                {/* Helper text - only show when expanded */}
                {isEmailCollapsed && hasDraftGenerated && (
                  <p className="text-[11px] text-gray-400">
                    Edit if needed, then copy and paste in Gmail
                  </p>
                )}
                {(replyMode === 'write' || hasDraftGenerated) ? (
                  /* Has draft text - show Copy + Open in Gmail */
                  <div className={`flex gap-2 ${isEmailCollapsed && hasDraftGenerated ? '' : 'flex-col'}`}>
                    <button
                      onClick={handleCopyDraft}
                      disabled={!draftText.trim()}
                      className={`
                        px-4 py-2.5
                        text-[13px] font-medium
                        rounded-xl
                        transition-all
                        disabled:opacity-50 disabled:cursor-not-allowed
                        flex items-center gap-2
                        whitespace-nowrap
                        ${copied
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                        }
                      `}
                    >
                      <span className="material-symbols-rounded text-base">
                        {copied ? 'check' : 'content_copy'}
                      </span>
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={handleOpenThread}
                      disabled={!threadId}
                      className="
                        px-4 py-2.5
                        text-[13px] font-medium text-white
                        bg-inbox-accent hover:bg-inbox-accent-hover
                        rounded-xl
                        transition-all
                        disabled:opacity-50 disabled:cursor-not-allowed
                        flex items-center gap-2
                        shadow-sm hover:shadow
                        whitespace-nowrap
                      "
                    >
                      <span className="material-symbols-rounded text-base">open_in_new</span>
                      Open in Gmail
                    </button>
                  </div>
                ) : (
                  /* Draft for me (before generation): Draft button triggers AI */
                  <button
                    onClick={handleGenerateDraft}
                    disabled={isLoadingEmail || !emailContent || isGeneratingDraft}
                    className="
                      px-5 py-3
                      text-[14px] font-medium text-white
                      bg-inbox-accent hover:bg-inbox-accent-hover
                      rounded-xl
                      transition-all
                      disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center gap-2
                      shadow-sm hover:shadow
                    "
                  >
                    <span className="material-symbols-rounded text-lg">edit_note</span>
                    Draft
                  </button>
                )}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <p className="text-[12px] text-red-500 mt-2">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
