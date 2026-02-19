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
import type { ChatMessage } from '@/lib/types';
import { QuickReferenceCard } from '@/components/QuickReferenceCard';
import { Markdown } from '@/components/ui/Markdown';
import { openGmailThread } from '@/lib/email/gmail-links';
import { useAgentContext } from '@/contexts/AgentContext';
import { AgentProgress } from '@/components/AgentProgress';
import { v4 as uuidv4 } from 'uuid';

interface InsightDetailPanelProps {
  action: InsightAction;
  actionState?: LocalActionState | null;
  onExecute: (actionId: string, userInput?: string, replyMode?: 'draft' | 'write') => Promise<{ success: boolean; taskId?: string; error?: string }>;
  onDismiss: (actionId: string) => Promise<boolean>;
  onClose: () => void;
  getEmailContent?: (messageId: string) => EmailContent | null;
  onChatUpdate?: (actionId: string, messages: ChatMessage[]) => void;
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

    const linkKey = `link-${keyIndex++}`;
    const linkUrl = url;
    parts.push(
      <a
        key={linkKey}
        href={linkUrl}
        onClick={(e) => {
          e.preventDefault();
          window.open(linkUrl, '_blank', 'noopener,noreferrer');
        }}
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

/**
 * Animated warmup steps shown before real SSE progress events arrive.
 * Steps reveal one at a time to show the agent is working.
 */
const WARMUP_STEPS = [
  { icon: 'mark_email_read', text: 'Reading the email thread...' },
  { icon: 'stylus_note', text: 'Matching your tone and style...' },
  { icon: 'edit', text: 'Drafting your response...' },
];

function DraftWarmupSteps() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    // Reveal steps one by one
    const timers = WARMUP_STEPS.map((_, i) =>
      setTimeout(() => setVisibleCount(i + 1), (i + 1) * 1200)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="rounded-lg border border-inbox-accent/20 bg-inbox-accent/5 overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-1.5">
        <span className="material-symbols-rounded text-inbox-accent text-[16px] animate-pulse">auto_awesome</span>
        <span className="text-[13px] text-inbox-accent font-medium">Working on it...</span>
      </div>
      {WARMUP_STEPS.map((step, i) => (
        <div
          key={step.icon}
          className={`px-3 py-2 flex items-center gap-2 transition-all duration-300 ${
            i < visibleCount ? 'opacity-100' : 'opacity-0 h-0 py-0 overflow-hidden'
          }`}
        >
          <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
            i < visibleCount - 1
              ? 'bg-green-100/50 text-green-500/70'
              : 'bg-inbox-accent/10 text-inbox-accent'
          }`}>
            {i < visibleCount - 1 ? (
              <span className="material-symbols-rounded text-[12px]">check</span>
            ) : (
              <span className="material-symbols-rounded text-[14px] animate-pulse">{step.icon}</span>
            )}
          </div>
          <span className={`text-[13px] ${
            i < visibleCount - 1 ? 'text-inbox-text-primary' : 'text-inbox-accent'
          }`}>
            {step.text}
          </span>
          {i === visibleCount - 1 && (
            <div className="typing-indicator scale-75">
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function InsightDetailPanel({
  action,
  actionState,
  onExecute,
  onDismiss,
  onClose,
  getEmailContent,
  onChatUpdate,
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

  // Meeting prep state (separate from email)
  const [meetingInput, setMeetingInput] = useState('');
  const [isExecutingMeeting, setIsExecutingMeeting] = useState(false);

  // Follow-up chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isTextareaScrollable, setIsTextareaScrollable] = useState(false);

  // Auto-resize textarea to fit content
  const autoResizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    setIsTextareaScrollable(el.scrollHeight > el.clientHeight);
  }, []);

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

  // Reset email-specific state when switching to a different action,
  // but restore state if agent is running or draft was already generated
  useEffect(() => {
    const isEmail = action.type === 'draft_response';
    const stillGenerating = actionState?.status === 'in_progress' && isEmail;
    const existingDraft = isEmail && actionState?.status === 'completed'
      ? actionState.result?.pendingDrafts?.find(d => d.type === 'email')?.content
      : undefined;

    setDraftText(existingDraft || '');
    setHasDraftGenerated(!!existingDraft);
    setIsGeneratingDraft(stillGenerating || false);
    setError(null);
    setCopied(false);
    setEmailContent(null);
    setMeetingInput('');
    setIsExecutingMeeting(false);
  }, [action.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Auto-resize textarea when draft text changes
  useEffect(() => {
    autoResizeTextarea();
  }, [draftText, autoResizeTextarea]);

  // Focus input when email loads
  useEffect(() => {
    if (emailContent && inputRef.current) {
      inputRef.current.focus();
    }
  }, [emailContent]);

  // Auto-execute meeting prep when panel opens (skip if already completed/failed)
  const hasAutoExecutedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isMeeting && !isExecutingMeeting && !isCompleted && !hasFailed && hasAutoExecutedRef.current !== action.id) {
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
  }, [isMeeting, action.id, isExecutingMeeting, isCompleted, hasFailed, onExecute]);

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

  // Handle "Draft for me" — same path for initial draft and redraft.
  // Captures user direction BEFORE the first draft, then reuses it on redraft.
  const userDirectionRef = useRef<string | undefined>(undefined);

  const handleGenerateDraft = useCallback(async () => {
    const previousDraft = draftText;

    // On first draft, capture whatever direction the user typed.
    // On redraft, reuse the same direction so the prompt is identical.
    if (!hasDraftGenerated) {
      userDirectionRef.current = draftText || undefined;
    }

    setIsGeneratingDraft(true);
    setHasDraftGenerated(false);
    setDraftText('');
    setError(null);

    try {
      const result = await onExecute(action.id, userDirectionRef.current, 'draft');
      if (!result.success) {
        setError(result.error || 'Failed to generate draft');
        setIsGeneratingDraft(false);
        if (previousDraft) {
          setDraftText(previousDraft);
          setHasDraftGenerated(true);
        }
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsGeneratingDraft(false);
      if (previousDraft) {
        setDraftText(previousDraft);
        setHasDraftGenerated(true);
      }
    }
  }, [action.id, draftText, hasDraftGenerated, onExecute]);

  // When AI draft is ready, update the textarea and collapse email
  useEffect(() => {
    if (!isMeeting && isCompleted && actionResult?.pendingDrafts && actionResult.pendingDrafts.length > 0) {
      const emailDraft = actionResult.pendingDrafts.find(d => d.type === 'email');
      if (emailDraft && emailDraft.content) {
        setDraftText(emailDraft.content);
        setHasDraftGenerated(true);
        setIsGeneratingDraft(false);
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

  // Initialize chat from persisted state when action changes
  useEffect(() => {
    setChatMessages(actionState?.result?.chatMessages || []);
    setChatInput('');
  }, [action.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Build context summary for chat API from action result
  const buildChatContext = useCallback(() => {
    const parts: string[] = [];
    if (isMeeting) {
      parts.push(`Meeting: ${subject}`);
      if (attendees.length > 0) parts.push(`Attendees: ${attendees.join(', ')}`);
      if (actionResult?.message) parts.push(`Prep result:\n${actionResult.message}`);
    } else {
      parts.push(`Email subject: ${subject}`);
      parts.push(`From: ${senderName}`);
      if (actionResult?.pendingDrafts?.[0]?.content) {
        parts.push(`Draft reply:\n${actionResult.pendingDrafts[0].content}`);
      }
      if (actionResult?.message) parts.push(`Agent notes:\n${actionResult.message}`);
    }
    return parts.join('\n\n');
  }, [isMeeting, subject, senderName, attendees, actionResult]);

  // Send follow-up chat message
  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: chatInput.trim(),
      timestamp: Date.now(),
    };

    const updatedMessages = [...chatMessages, userMessage];
    setChatMessages(updatedMessages);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: action.id,
          taskTitle: subject,
          taskResearch: { markdown: buildChatContext() },
          message: userMessage.content,
          history: chatMessages,
        }),
      });

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: data.reply || 'Sorry, I could not process that request.',
        timestamp: Date.now(),
      };

      const allMessages = [...updatedMessages, assistantMessage];
      setChatMessages(allMessages);
      onChatUpdate?.(action.id, allMessages);
    } catch {
      const errorMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: Date.now(),
      };
      const allMessages = [...updatedMessages, errorMessage];
      setChatMessages(allMessages);
      onChatUpdate?.(action.id, allMessages);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, chatMessages, action.id, subject, buildChatContext, onChatUpdate]);

  const handleChatKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  }, [handleSendChat]);

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

          {/* Action icons aligned with sender name */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isMeeting && threadId && (
              <button
                onClick={handleOpenThread}
                className="p-2 text-gray-400 hover:text-inbox-accent hover:bg-gray-100 rounded-full transition-colors"
                title="Open in Gmail"
                aria-label="Open in Gmail"
              >
                <span className="material-symbols-rounded text-xl">open_in_new</span>
              </button>
            )}
            <button
              onClick={handleDismiss}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              title="Dismiss this suggestion"
              aria-label="Dismiss this suggestion"
            >
              <span className="material-symbols-rounded text-xl">close</span>
            </button>
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
                {/* Collapsible agent steps */}
                {(agentProgress.length > 0 || isAgentRunning) && (
                  <AgentProgress
                    events={agentProgress}
                    isRunning={false}
                    currentStep={null}
                    hasCompletedResult
                    collapsible
                    defaultCollapsed
                  />
                )}

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

                {/* Inline action pills */}
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-[13px] font-medium text-gray-700 transition-colors"
                  >
                    Done
                  </button>
                  <button
                    onClick={handleExecuteMeeting}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-[13px] font-medium text-gray-500 transition-colors flex items-center gap-1.5"
                  >
                    <span className="material-symbols-rounded text-sm">refresh</span>
                    Re-prep
                  </button>
                </div>

                {/* Follow-up chat messages */}
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="mb-2">
                    <div className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`
                        w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
                        ${msg.role === 'user'
                          ? 'bg-inbox-accent text-white'
                          : 'bg-inbox-accent/10 text-inbox-accent'
                        }
                      `}>
                        <span className="material-symbols-rounded text-[14px]">
                          {msg.role === 'user' ? 'person' : 'auto_awesome'}
                        </span>
                      </div>
                      <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'flex justify-end' : 'pt-0.5'}`}>
                        {msg.role === 'user' ? (
                          <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] bg-inbox-accent text-white">
                            {msg.content}
                          </div>
                        ) : (
                          <div className="text-[13px]">
                            <Markdown content={msg.content} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Chat loading indicator */}
                {isChatLoading && (
                  <div className="flex items-start gap-2.5 mb-2">
                    <div className="w-7 h-7 rounded-full bg-inbox-accent/10 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-rounded text-[14px] text-inbox-accent">auto_awesome</span>
                    </div>
                    <div className="flex gap-1 pt-2.5">
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
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
              /* Gmail-like email card — always visible for context */
              <div className="border-l-[3px] border-l-gray-300 bg-gray-50/50 rounded-r-lg px-4 py-3">
                <div className="text-[14px] text-gray-700 leading-relaxed whitespace-pre-wrap max-w-[600px]">
                  {processEmailBody(emailContent.body)}
                </div>
              </div>
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
      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0 overflow-y-auto" style={{ maxHeight: '60vh' }}>
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
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask a follow-up..."
                  disabled={isChatLoading}
                  className="
                    flex-1 px-4 py-2.5
                    text-[14px] text-gray-900
                    bg-white border border-gray-200 rounded-lg
                    focus:outline-none focus:ring-2 focus:ring-inbox-accent/20 focus:border-inbox-accent
                    placeholder:text-gray-400
                    disabled:opacity-50
                    transition-all
                  "
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="
                    w-10 h-10 rounded-full
                    bg-inbox-accent text-white
                    flex items-center justify-center
                    disabled:opacity-38 disabled:cursor-not-allowed
                    hover:bg-inbox-accent-hover
                    transition-colors flex-shrink-0
                  "
                  aria-label="Send"
                >
                  <span className="material-symbols-rounded text-lg">arrow_upward</span>
                </button>
              </div>
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
          /* Email reply footer */
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

            {/* Textarea OR Agent Progress (mutually exclusive) */}
            <div aria-live="polite">
              {isGeneratingDraft ? (
                /* Agent progress replaces textarea during generation */
                <div
                  className="bg-white border border-inbox-accent/20 rounded-xl p-4"
                  style={{ minHeight: '180px' }}
                  role="status"
                >
                  {agentProgress.length > 0 || isAgentRunning ? (
                    <AgentProgress
                      events={agentProgress}
                      isRunning={isAgentRunning}
                      currentStep={agentState?.currentStep || null}
                    />
                  ) : (
                    <DraftWarmupSteps />
                  )}
                </div>
              ) : (
                /* Normal textarea with inline redraft button + scroll fade */
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    value={draftText}
                    onChange={(e) => {
                      setDraftText(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      setIsTextareaScrollable(el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight < el.scrollHeight - 4);
                    }}
                    placeholder={
                      replyMode === 'draft'
                        ? hasDraftGenerated
                          ? ''
                          : (suggestion || "e.g., Confirm I'm available and suggest next steps")
                        : "Type your reply..."
                    }
                    className={`
                      w-full px-4 py-3
                      text-[14px] text-gray-900 leading-relaxed
                      bg-white border rounded-xl
                      resize-none overflow-y-auto
                      focus:outline-none focus:ring-2 focus:ring-inbox-accent/20 focus:border-inbox-accent
                      placeholder:text-gray-400
                      transition-colors
                      disabled:opacity-50
                      ${hasDraftGenerated ? 'border-inbox-accent/30 ring-2 ring-inbox-accent/20' : 'border-gray-200'}
                    `}
                    disabled={isLoadingEmail}
                    style={{
                      minHeight: hasDraftGenerated ? '200px' : '80px',
                      maxHeight: '45vh',
                    }}
                  />
                  {/* Bottom fade to indicate more content below */}
                  {isTextareaScrollable && (
                    <div className="absolute bottom-0 left-[1px] right-[1px] h-8 rounded-b-xl pointer-events-none bg-gradient-to-t from-white to-transparent" />
                  )}
                  {/* Redraft button inside the textarea area */}
                  {hasDraftGenerated && (
                    <button
                      onClick={handleGenerateDraft}
                      disabled={isGeneratingDraft}
                      className="
                        absolute bottom-2 right-2
                        flex items-center gap-1
                        px-2 py-1
                        text-[11px] font-medium
                        text-inbox-accent/70 hover:text-inbox-accent
                        bg-white/80 hover:bg-inbox-accent/5
                        border border-inbox-accent/15 hover:border-inbox-accent/30
                        rounded-md
                        transition-all
                        disabled:opacity-50
                        backdrop-blur-sm
                        z-10
                      "
                    >
                      <span className="material-symbols-rounded text-sm">auto_fix_high</span>
                      Redraft
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons row */}
            <div className="flex items-center gap-2 mt-3">
              {(replyMode === 'write' || hasDraftGenerated) ? (
                /* Draft ready or write mode — helper text + Copy + Open in Gmail */
                <>
                  {/* Helper text */}
                  <span className="flex-1 text-[11px] text-gray-400">
                    {hasDraftGenerated ? 'Edit if needed, then copy and paste in Gmail' : ''}
                  </span>

                  {/* Copy */}
                  <button
                    onClick={handleCopyDraft}
                    disabled={!draftText.trim()}
                    className={`
                      px-3 py-2
                      text-[13px] font-medium
                      rounded-lg
                      transition-all
                      disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center gap-1.5
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

                  {/* Open in Gmail */}
                  <button
                    onClick={handleOpenThread}
                    disabled={!threadId}
                    className="
                      px-3 py-2
                      text-[13px] font-medium text-white
                      bg-inbox-accent hover:bg-inbox-accent-hover
                      rounded-lg
                      transition-all
                      disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center gap-1.5
                      shadow-sm hover:shadow
                      whitespace-nowrap
                    "
                  >
                    <span className="material-symbols-rounded text-base">open_in_new</span>
                    Reply in Gmail
                  </button>
                </>
              ) : (
                /* Draft mode before generation */
                <>
                  <span className="flex-1 text-[12px] text-gray-500">
                    Give me direction and I&apos;ll draft a reply for you.
                  </span>
                  <button
                    onClick={handleGenerateDraft}
                    disabled={isLoadingEmail || !emailContent || isGeneratingDraft}
                    className="
                      px-4 py-2.5
                      text-[14px] font-medium text-white
                      bg-inbox-accent hover:bg-inbox-accent-hover
                      rounded-lg
                      transition-all
                      disabled:opacity-50 disabled:cursor-not-allowed
                      flex items-center gap-2
                      shadow-sm hover:shadow
                    "
                  >
                    <span className="material-symbols-rounded text-lg">edit_note</span>
                    Draft
                  </button>
                </>
              )}
            </div>

            {/* Collapsible agent steps (shown after draft is complete) */}
            {hasDraftGenerated && agentProgress.length > 0 && (
              <div className="mt-2">
                <AgentProgress
                  events={agentProgress}
                  isRunning={false}
                  currentStep={null}
                  hasCompletedResult
                  collapsible
                  defaultCollapsed
                />
              </div>
            )}

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
