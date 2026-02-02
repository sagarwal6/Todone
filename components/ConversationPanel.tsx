'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Task, ChatMessage } from '@/lib/types';
import { MaterialIcon } from './ui/MaterialIcon';
import { Button } from './ui/Button';
import { OptionList } from './OptionCard';
import { SourceBadge } from './SourceBadge';
import { v4 as uuidv4 } from 'uuid';

interface SuggestedAction {
  label: string;
  prompt: string;
  icon: string;
}

// Get suggested next actions based on task type and research
// Phrased as "Want me to..." to feel like part of the conversation
function getSuggestedActions(task: Task): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  const titleLower = task.title.toLowerCase();
  const hasOptions = task.research?.options && task.research.options.length > 0;
  const hasPhone = task.research?.quickInfo?.phone;

  // Flight/travel tasks with options
  if (hasOptions && (titleLower.includes('flight') || titleLower.includes('hotel') || titleLower.includes('travel'))) {
    actions.push(
      { label: 'help you pick the best option?', prompt: 'Help me pick the best option based on price and convenience.', icon: 'thumb_up' },
      { label: 'compare them by travel time?', prompt: 'Compare these options by total travel time including layovers.', icon: 'schedule' },
    );
  }

  // Shopping/comparison tasks
  if (hasOptions && (titleLower.includes('buy') || titleLower.includes('find') || titleLower.includes('compare'))) {
    actions.push(
      { label: 'find the best value?', prompt: 'Which option gives me the best value for money?', icon: 'payments' },
      { label: 'summarize the trade-offs?', prompt: 'Summarize the trade-offs between these options.', icon: 'compare' },
    );
  }

  // Call/contact tasks
  if (hasPhone || titleLower.includes('call') || titleLower.includes('contact')) {
    actions.push(
      { label: 'draft what you should say?', prompt: 'Draft a script for what I should say when I call.', icon: 'edit_note' },
      { label: 'suggest questions to ask?', prompt: 'What questions should I ask when I call?', icon: 'help' },
    );
  }

  // Email/respond tasks
  if (titleLower.includes('email') || titleLower.includes('respond') || titleLower.includes('reply')) {
    actions.push(
      { label: 'draft a response?', prompt: 'Help me draft a response for this.', icon: 'edit' },
      { label: 'outline the key points?', prompt: 'Help me outline the key points I should include in my response.', icon: 'format_list_bulleted' },
    );
  }

  // Insurance tasks
  if (titleLower.includes('insurance') || titleLower.includes('coverage') || titleLower.includes('policy')) {
    actions.push(
      { label: 'suggest questions to ask?', prompt: 'What key questions should I ask about my coverage?', icon: 'help' },
      { label: 'explain your options?', prompt: 'Explain what options I have and what to consider.', icon: 'lightbulb' },
    );
  }

  // Generic fallbacks if no specific matches
  if (actions.length === 0 && task.research) {
    actions.push(
      { label: 'suggest what to do first?', prompt: 'What\'s the most important first step I should take?', icon: 'start' },
      { label: 'break this down into steps?', prompt: 'Break this task down into simple steps.', icon: 'checklist' },
    );
  }

  // Personal tasks without research
  if (task.status === 'personal') {
    return [
      { label: 'help you think through this?', prompt: 'Help me think through this task and what I need to do.', icon: 'psychology' },
      { label: 'break it into steps?', prompt: 'Help me break this task into manageable steps.', icon: 'checklist' },
    ];
  }

  return actions.slice(0, 2); // Max 2 suggestions for cleaner UI
}

interface ConversationPanelProps {
  task: Task;
  onClose: () => void;
}

export function ConversationPanel({ task, onClose }: ConversationPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestedActions = getSuggestedActions(task);

  // Reset state when task changes
  useEffect(() => {
    setMessages([]);
    setShowSources(false);
  }, [task.id]);

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
    } catch {
      const errorMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, task, isLoading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-outline-variant">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-headline-small font-display text-on-surface">
              {task.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8 transition-colors"
            aria-label="Close panel"
          >
            <MaterialIcon name="close" size={24} />
          </button>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Initial research summary as AI message */}
        {task.research && (
          <div className="mb-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
                <MaterialIcon name="auto_awesome" size="small" className="text-on-primary-container" />
              </div>
              <div className="flex-1">
                <div className="p-4 bg-surface-container rounded-lg space-y-3">
                  {/* Main summary with inline actions */}
                  <p className="text-body-medium text-on-surface">
                    {task.research.summary}
                    {/* Inline action links */}
                    {task.research.keyActions && task.research.keyActions.length > 0 && (
                      <>
                        {' '}
                        {task.research.keyActions.map((action, index, arr) => (
                          <span key={index}>
                            {index > 0 && (index === arr.length - 1 ? ' or ' : ', ')}
                            <a
                              href={action.value}
                              target={action.type === 'link' ? '_blank' : undefined}
                              rel={action.type === 'link' ? 'noopener noreferrer' : undefined}
                              className="text-primary hover:underline font-medium"
                            >
                              {action.label.toLowerCase()}
                            </a>
                          </span>
                        ))}
                        .
                      </>
                    )}
                  </p>

                  {/* Additional context */}
                  {task.research.quickInfo?.details && (
                    <p className="text-body-medium text-on-surface-variant">
                      {task.research.quickInfo.details}
                    </p>
                  )}

                  {/* Options presented conversationally */}
                  {task.research.options && task.research.options.length > 0 && (
                    <div>
                      <p className="text-body-medium text-on-surface-variant mb-2">
                        I found {task.research.options.length} options that might work:
                      </p>
                      <OptionList options={task.research.options} compact={false} />
                    </div>
                  )}

                  {/* Suggestions as natural continuation */}
                  {suggestedActions.length > 0 && messages.length === 0 && (
                    <p className="text-body-medium text-on-surface-variant">
                      Would you like me to {suggestedActions.map(a => a.label).join(' or ')}
                    </p>
                  )}
                </div>

                {/* Collapsible Sources */}
                {task.research.sources && task.research.sources.length > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowSources(!showSources)}
                      className="flex items-center gap-2 text-label-medium text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      <MaterialIcon name={showSources ? 'expand_less' : 'expand_more'} size={18} />
                      <MaterialIcon name="source" size={16} />
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
            <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
              <MaterialIcon name="progress_activity" size="small" className="text-on-primary-container animate-spin" />
            </div>
            <div className="flex-1">
              <div className="text-label-medium text-on-surface-variant mb-1">AI Research</div>
              <div className="p-4 bg-surface-container rounded-lg">
                <p className="text-body-medium text-on-surface-variant">
                  Researching this task...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Personal task */}
        {task.status === 'personal' && (
          <div className="flex items-start gap-3 mb-6">
            <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
              <MaterialIcon name="auto_awesome" size="small" className="text-on-primary-container" />
            </div>
            <div className="flex-1">
              <div className="p-4 bg-surface-container rounded-lg">
                <p className="text-body-medium text-on-surface">
                  Happy to help with this! I'll probably need a bit more context though. Want to tell me more about what you're trying to do, or I can help you think through it step by step.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg) => (
          <div key={msg.id} className="mb-4">
            <div className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                ${msg.role === 'user'
                  ? 'bg-primary text-on-primary'
                  : 'bg-primary-container text-on-primary-container'
                }
              `}>
                <MaterialIcon
                  name={msg.role === 'user' ? 'person' : 'auto_awesome'}
                  size="small"
                />
              </div>
              <div className={`flex-1 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                <div className={`
                  max-w-[85%] p-4 rounded-lg text-body-medium
                  ${msg.role === 'user'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface'
                  }
                `}>
                  {msg.content}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
              <MaterialIcon name="auto_awesome" size="small" className="text-on-primary-container" />
            </div>
            <div className="p-4 bg-surface-container rounded-lg">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-on-surface-variant rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat input */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-outline-variant bg-surface">
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
                text-body-medium text-on-surface
                bg-surface-container
                border-0 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-primary
                disabled:opacity-38
                placeholder:text-on-surface-variant
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
