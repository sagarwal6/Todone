'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Task, ChatMessage } from '@/lib/types';
import { MaterialIcon } from './ui/MaterialIcon';
import { Button } from './ui/Button';
import { OptionList } from './OptionCard';
import { SourceBadge } from './SourceBadge';
import { AgentProgress } from './AgentProgress';
import { PendingDrafts } from './PendingDrafts';
import { KeyFactsLine } from './KeyFactsLine';
import { Markdown } from './ui/Markdown';
import { useAgentContext } from '@/contexts/AgentContext';
import { v4 as uuidv4 } from 'uuid';
import type { PendingDraft } from '@/lib/ai/types';
import type { AgentStepSummary } from '@/lib/types';

interface SuggestedAction {
  label: string;
  prompt: string;
  icon: string;
}

// Detect if task is an informational query (questions don't need QuickReferenceCard)
function isInformationalQuery(title: string): boolean {
  const lowerTitle = title.toLowerCase().trim();
  const questionStarters = [
    'what ', 'who ', 'when ', 'where ', 'how ', 'why ', 'which ',
    'list ', 'show ', 'tell ', 'summarize ', 'find ', 'search ',
    'are there', 'is there', 'do i have', 'did i ',
  ];
  return questionStarters.some(starter => lowerTitle.startsWith(starter));
}

// Get suggested next actions - prefer AI-generated, fall back to hardcoded
function getSuggestedActions(task: Task): SuggestedAction[] {
  // Use AI-generated suggestions if available
  if (task.research?.suggestedFollowUps && task.research.suggestedFollowUps.length > 0) {
    return task.research.suggestedFollowUps.slice(0, 2).map(f => ({
      label: f.label,
      prompt: f.prompt,
      icon: f.icon,
    }));
  }

  // Personal tasks without research
  if (task.status === 'personal') {
    return [
      { label: 'help you think through this?', prompt: 'Help me think through this task and what I need to do.', icon: 'psychology' },
      { label: 'break it into steps?', prompt: 'Help me break this task into manageable steps.', icon: 'checklist' },
    ];
  }

  // Fallback: basic task-type suggestions
  const actions: SuggestedAction[] = [];
  const titleLower = task.title.toLowerCase();
  const hasOptions = task.research?.options && task.research.options.length > 0;

  if (hasOptions) {
    actions.push(
      { label: 'help pick the best option?', prompt: 'Help me pick the best option and explain why.', icon: 'thumb_up' },
      { label: 'compare them in more detail?', prompt: 'Compare these options in more detail.', icon: 'compare' },
    );
  } else if (titleLower.includes('call') || titleLower.includes('contact')) {
    actions.push(
      { label: 'draft what to say?', prompt: 'Help me draft what I should say.', icon: 'edit_note' },
    );
  } else if (titleLower.includes('email') || titleLower.includes('respond')) {
    actions.push(
      { label: 'draft a response?', prompt: 'Help me draft a response.', icon: 'edit' },
    );
  } else if (task.research) {
    actions.push(
      { label: 'tell me more?', prompt: 'Tell me more about this.', icon: 'info' },
    );
  }

  return actions.slice(0, 2);
}

interface ConversationPanelProps {
  task: Task;
  onClose: () => void;
  onAddChatMessage?: (taskId: string, message: ChatMessage) => void;
  onComplete?: (taskId: string) => void;
  onArchive?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  onTogglePin?: (taskId: string) => void;
  onUpdateQuickInfo?: (taskId: string, quickInfo: import('@/lib/types').AgentQuickInfo) => void;
  onUpdateAgentSteps?: (taskId: string, agentSteps: AgentStepSummary[]) => void;
  autoStartAgent?: boolean;
  onAgentStarted?: () => void;
  /** When true, hides title and close button (shown in page-level header instead) */
  isMobile?: boolean;
}

export function ConversationPanel({ task, onClose, onAddChatMessage, onComplete, onArchive, onDelete, onTogglePin, onUpdateQuickInfo, onUpdateAgentSteps, autoStartAgent, onAgentStarted, isMobile = false }: ConversationPanelProps) {
  // Initialize messages from persisted chat history
  const [messages, setMessages] = useState<ChatMessage[]>(task.chatMessages || []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Global agent context - agents run in background even when switching tasks
  const { getAgentState, isAgentRunning, startAgent, cancelAgent } = useAgentContext();

  // Get agent state for this task
  const agentState = getAgentState(task.id);
  const isRunning = isAgentRunning(task.id);
  const agentProgress = agentState?.progress || [];
  const currentStep = agentState?.currentStep || null;
  const agentResult = agentState?.result || null;
  const agentError = agentState?.error || null;

  // NOTE: Agent result persistence (message, quickInfo, steps) is handled globally
  // in page.tsx via the persistedAgentResultsRef effect. This prevents duplicate
  // persistence that occurred when ConversationPanel remounted with stale state.

  const suggestedActions = getSuggestedActions(task);

  // Start agent wrapper with callbacks
  const handleStartAgent = useCallback(() => {
    startAgent(task.id, task.title, task.research, task.customPrompt);
  }, [task.id, task.title, task.research, task.customPrompt, startAgent]);

  // Auto-start agent when panel opens if appropriate
  useEffect(() => {
    const chatMessages = task.chatMessages || [];
    const lastMessage = chatMessages[chatMessages.length - 1];

    // Check if agent has already completed work on this task
    // - Has quickInfo saved (agent extracted key facts)
    // - Has an assistant message (agent responded)
    const hasAssistantMessage = chatMessages.some(m => m.role === 'assistant');
    const hasQuickInfo = !!task.agentQuickInfo;
    const agentAlreadyWorked = hasAssistantMessage || hasQuickInfo;

    // Check if we're waiting for an agent response:
    // - No messages yet (fresh task), OR
    // - Last message is from user (they asked something, waiting for response)
    const waitingForResponse = chatMessages.length === 0 || lastMessage?.role === 'user';

    // Only auto-start if:
    // 1. Explicitly requested via autoStartAgent prop, OR
    // 2. No in-memory agent state AND waiting for a response AND agent hasn't already worked
    const noAgentStateYet = agentProgress.length === 0 && !agentResult && !agentError;
    const shouldAutoStart = autoStartAgent || (noAgentStateYet && waitingForResponse && !agentAlreadyWorked);

    if (shouldAutoStart && !isRunning) {
      handleStartAgent();
      onAgentStarted?.();
    }
  }, [autoStartAgent, isRunning, agentProgress.length, agentResult, agentError, task.chatMessages, task.agentQuickInfo, handleStartAgent, onAgentStarted]);

  // Load messages when task changes
  useEffect(() => {
    setMessages(task.chatMessages || []);
    setShowSources(false);
  }, [task.id, task.chatMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    // Persist user message
    onAddChatMessage?.(task.id, userMessage);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          taskTitle: task.title,
          taskResearch: task.research,
          message: userMessage.content,
          history: messages,
        }),
      });

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: data.reply || 'Sorry, I could not process that request.',
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      // Persist assistant message
      onAddChatMessage?.(task.id, assistantMessage);
    } catch {
      const errorMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
      // Persist error message so user knows what happened
      onAddChatMessage?.(task.id, errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [input, task, isLoading, messages, onAddChatMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-inbox-bg-primary">
      {/* Header - Inbox style: minimal chrome */}
      <div className={`flex-shrink-0 border-b border-inbox-divider ${isMobile ? 'px-4 py-3' : 'px-6 py-4'}`}>
        <div className={isMobile ? '' : 'flex items-start justify-between gap-4'}>
          {/* Title + close button (desktop only) */}
          {!isMobile && (
            <div className="flex items-start justify-between gap-4 w-full">
              <h2 className="text-inbox-headline text-inbox-text-primary flex-1 min-w-0">
                {task.title}
              </h2>
              <button
                onClick={onClose}
                className="p-2 -mr-2 rounded-full text-inbox-text-secondary hover:text-inbox-text-primary hover:bg-inbox-bg-hover transition-colors duration-100"
                aria-label="Close panel"
              >
                <MaterialIcon name="close" size={24} weight={300} />
              </button>
            </div>
          )}
          {/* Action bar */}
          <div className={`flex items-center gap-1 ${isMobile ? '' : 'mt-3'}`}>
            {task.status !== 'completed' && task.status !== 'archived' && (
              <>
                <button
                  onClick={() => onComplete?.(task.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-inbox-caption text-inbox-text-secondary hover:text-inbox-success hover:bg-inbox-success/10 transition-colors"
                >
                  <MaterialIcon name="check_circle" size={16} weight={300} />
                  <span>Done</span>
                </button>
                <button
                  onClick={() => onTogglePin?.(task.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-inbox-caption transition-colors ${
                    task.isPinned
                      ? 'text-inbox-accent bg-inbox-accent/10'
                      : 'text-inbox-text-secondary hover:text-inbox-accent hover:bg-inbox-accent/10'
                  }`}
                >
                  <MaterialIcon name="push_pin" size={16} weight={300} fill={task.isPinned} />
                  <span>{task.isPinned ? 'Pinned' : 'Pin'}</span>
                </button>
                <button
                  onClick={() => onArchive?.(task.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-inbox-caption text-inbox-text-secondary hover:text-inbox-text-primary hover:bg-inbox-bg-hover transition-colors"
                >
                  <MaterialIcon name="inventory_2" size={16} weight={300} />
                  <span>Archive</span>
                </button>
              </>
            )}
            <button
              onClick={() => { onDelete?.(task.id); onClose(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-inbox-caption text-inbox-text-secondary hover:text-inbox-error hover:bg-inbox-error/10 transition-colors"
            >
              <MaterialIcon name="delete" size={16} weight={300} />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className={`flex-1 overflow-y-auto ${isMobile ? 'px-4 py-4' : 'px-6 py-6'}`}>
        {/* 1. Agent Progress - what the agent did (green box, compact) */}
        {(isRunning || agentProgress.length > 0 || agentResult?.status === 'completed' || (task.agentSteps && task.agentSteps.length > 0)) && (
          <div className="mb-4">
            <AgentProgress
              events={agentProgress}
              isRunning={isRunning}
              currentStep={currentStep}
              onCancel={() => cancelAgent(task.id)}
              hasCompletedResult={agentResult?.status === 'completed'}
              persistedSteps={task.agentSteps}
            />
          </div>
        )}

        {/* 2. Agent explanation message - show from live result OR first persisted assistant message */}
        {(() => {
          const liveMessage = agentResult?.status === 'completed' ? agentResult.message : null;
          const liveQuickInfo = agentResult?.status === 'completed' ? agentResult.quickInfo : null;

          // If no live result, check for first assistant message in chat history (agent's persisted response)
          const firstAssistantMessage = !liveMessage
            ? (task.chatMessages || []).find(m => m.role === 'assistant')?.content
            : null;

          const displayMessage = liveMessage || firstAssistantMessage;
          const displayQuickInfo = liveQuickInfo || task.agentQuickInfo;

          if (!displayMessage) return null;

          return (
            <div className="mb-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-inbox-accent-light flex items-center justify-center flex-shrink-0">
                  <MaterialIcon name="auto_awesome" size={16} className="text-inbox-accent" />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <Markdown content={displayMessage} />

                  {/* Inline key facts */}
                  {displayQuickInfo && !isInformationalQuery(task.title) && (
                    <KeyFactsLine quickInfo={displayQuickInfo} />
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3. Pending Drafts - action items */}
        {agentResult?.status === 'completed' && agentResult.pendingDrafts && agentResult.pendingDrafts.length > 0 && (
          <div className="mb-4">
            <PendingDrafts
              taskId={task.id}
              drafts={agentResult.pendingDrafts as PendingDraft[]}
              onDraftConfirmed={(draftId, result) => {
                console.log('Draft confirmed:', draftId, result);
              }}
              onDraftRejected={(draftId) => {
                console.log('Draft rejected:', draftId);
              }}
            />
          </div>
        )}

        {/* Initial research summary as AI message - Inbox style */}
        {task.research && (
          <div className="mb-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-inbox-accent-light flex items-center justify-center flex-shrink-0">
                <MaterialIcon name="auto_awesome" size={16} className="text-inbox-accent" />
              </div>
              <div className="flex-1">
                <div className="space-y-3">
                  {/* Main summary with inline actions - no bubble, ChatGPT style */}
                  <p className="text-inbox-body text-inbox-text-primary leading-relaxed">
                    {task.research.summary}
                    {/* Inline action buttons */}
                    {task.research.keyActions && task.research.keyActions.length > 0 && (
                      <span className="inline-flex flex-wrap items-center gap-2 ml-1">
                        {task.research.keyActions.map((action, index) => (
                          <a
                            key={index}
                            href={action.value}
                            target={action.type === 'link' ? '_blank' : undefined}
                            rel={action.type === 'link' ? 'noopener noreferrer' : undefined}
                            className="inline-flex items-center gap-1 px-3 py-1 text-inbox-caption font-medium text-inbox-accent bg-inbox-accent-light rounded-full hover:bg-inbox-accent hover:text-inbox-text-inverse transition-colors duration-150"
                          >
                            {action.label}
                            <MaterialIcon name="open_in_new" size={14} />
                          </a>
                        ))}
                      </span>
                    )}
                  </p>

                  {/* Quick info - phone, hours, price */}
                  {(task.research.quickInfo?.phoneFormatted || task.research.quickInfo?.hours || task.research.quickInfo?.price) && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-inbox-body">
                      {task.research.quickInfo?.phoneFormatted && (
                        <span className="flex items-center gap-1.5 text-inbox-text-primary">
                          <MaterialIcon name="call" size={16} className="text-inbox-text-tertiary" />
                          <a
                            href={`tel:${task.research.quickInfo.phone}`}
                            className="hover:text-inbox-accent transition-colors duration-100"
                          >
                            {task.research.quickInfo.phoneFormatted}
                          </a>
                        </span>
                      )}
                      {task.research.quickInfo?.hours && (
                        <span className="flex items-center gap-1.5 text-inbox-text-secondary">
                          <MaterialIcon name="schedule" size={16} className="text-inbox-text-tertiary" />
                          {task.research.quickInfo.hours}
                        </span>
                      )}
                      {task.research.quickInfo?.price && (
                        <span className="flex items-center gap-1.5 font-medium text-inbox-success">
                          {task.research.quickInfo.price}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Additional context */}
                  {task.research.quickInfo?.details && (
                    <p className="text-inbox-body text-inbox-text-secondary">
                      {task.research.quickInfo.details}
                    </p>
                  )}

                  {/* Options presented conversationally */}
                  {task.research.options && task.research.options.length > 0 && (
                    <div>
                      <p className="text-inbox-body text-inbox-text-secondary mb-2">
                        I found {task.research.options.length} options that might work:
                      </p>
                      <OptionList options={task.research.options} compact={false} />
                    </div>
                  )}

                  {/* Suggestions as natural continuation */}
                  {suggestedActions.length > 0 && messages.length === 0 && (
                    <p className="text-inbox-body text-inbox-text-secondary">
                      Would you like me to {suggestedActions.map(a => a.label).join(' or ')}
                    </p>
                  )}
                </div>

                {/* Collapsible Sources */}
                {task.research.sources && task.research.sources.length > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowSources(!showSources)}
                      className="flex items-center gap-2 text-inbox-caption text-inbox-text-secondary hover:text-inbox-text-primary transition-colors duration-100"
                    >
                      <MaterialIcon name={showSources ? 'expand_less' : 'expand_more'} size={18} weight={300} />
                      <MaterialIcon name="source" size={16} weight={300} />
                      <span>{task.research.sources.length} sources</span>
                    </button>
                    {showSources && (
                      <div className="mt-3 space-y-2 animate-fade-in">
                        {task.research.sources.map((source, index) => (
                          <SourceBadge key={index} source={source} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Researching state */}
        {task.status === 'researching' && (
          <div className="flex items-start gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-inbox-accent-light flex items-center justify-center flex-shrink-0">
              <MaterialIcon name="progress_activity" size={16} className="text-inbox-accent animate-spin" />
            </div>
            <div className="flex-1 pt-1">
              <p className="text-inbox-body text-inbox-text-secondary">
                Researching this task...
              </p>
            </div>
          </div>
        )}

        {/* Personal task */}
        {task.status === 'personal' && (
          <div className="flex items-start gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-inbox-accent-light flex items-center justify-center flex-shrink-0">
              <MaterialIcon name="auto_awesome" size={16} className="text-inbox-accent" />
            </div>
            <div className="flex-1 pt-1">
              <p className="text-inbox-body text-inbox-text-primary leading-relaxed">
                Happy to help with this! I'll probably need a bit more context though. Want to tell me more about what you're trying to do, or I can help you think through it step by step.
              </p>
            </div>
          </div>
        )}

        {/* Chat messages - skip first assistant message (shown in dedicated section above) */}
        {(() => {
          let skippedFirst = false;
          return messages.filter((msg) => {
            // Skip the first assistant message (it's the agent's initial response, shown above)
            if (!skippedFirst && msg.role === 'assistant') {
              skippedFirst = true;
              return false;
            }
            return true;
          });
        })().map((msg) => (
          <div key={msg.id} className="mb-4">
            <div className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                ${msg.role === 'user'
                  ? 'bg-inbox-accent text-inbox-text-inverse'
                  : 'bg-inbox-accent-light text-inbox-accent'
                }
              `}>
                <MaterialIcon
                  name={msg.role === 'user' ? 'person' : 'auto_awesome'}
                  size={16}
                />
              </div>
              <div className={`flex-1 min-w-0 ${msg.role === 'user' ? 'flex justify-end' : 'pt-1'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[85%] p-4 rounded-2xl text-inbox-body bg-inbox-accent text-inbox-text-inverse">
                    {msg.content}
                  </div>
                ) : (
                  <Markdown content={msg.content} />
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator for chat API */}
        {isLoading && (
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-inbox-accent-light flex items-center justify-center flex-shrink-0">
              <MaterialIcon name="auto_awesome" size={16} className="text-inbox-accent" />
            </div>
            <div className="flex-1 pt-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-inbox-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-inbox-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-inbox-text-tertiary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Agent error message */}
        {agentError && !isRunning && (
          <div className="mb-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <MaterialIcon name="error" size={16} className="text-inbox-error" />
            </div>
            <div className="flex-1 pt-1">
              <p className="text-inbox-body text-inbox-error">{agentError}</p>
            </div>
          </div>
        )}

        {/* Start Agent button - fallback if auto-start didn't trigger */}
        {!isRunning && agentProgress.length === 0 && !agentResult && messages.length === 0 && (
          <div className="mb-4">
            <button
              onClick={handleStartAgent}
              className="
                flex items-center gap-2
                px-4 py-3
                w-full
                rounded-xl
                bg-inbox-accent-light
                text-inbox-accent
                font-medium
                text-sm
                hover:bg-blue-100
                active:bg-blue-200
                transition-colors duration-100
                border border-inbox-accent/20
              "
            >
              <MaterialIcon name="auto_awesome" size={20} />
              <span>{agentError ? 'Try again' : 'Let Todone work on this'}</span>
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat input - Inbox style */}
      <div className={`flex-shrink-0 border-t border-inbox-divider bg-inbox-bg-primary ${isMobile ? 'px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]' : 'px-6 py-4'}`}>
        <div className="flex gap-3 items-center">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a follow-up question..."
              disabled={isLoading}
              className="
                w-full px-4 py-3
                text-inbox-body text-inbox-text-primary
                bg-inbox-bg-input
                border-0 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-inbox-accent focus:ring-offset-0
                focus:bg-inbox-bg-primary
                disabled:opacity-38
                placeholder:text-inbox-text-tertiary
                transition-all duration-150
              "
            />
          </div>
          <Button
            variant="filled"
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            icon="arrow_upward"
            className="rounded-full w-12 h-12 p-0"
            aria-label="Send"
          />
        </div>
      </div>
    </div>
  );
}
