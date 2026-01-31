'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Task, ChatMessage, Feedback } from '@/lib/types';
import { FeedbackWidget } from './FeedbackWidget';
import { MaterialIcon } from './ui/MaterialIcon';
import { Button } from './ui/Button';
import { v4 as uuidv4 } from 'uuid';

interface ConversationPanelProps {
  task: Task;
  onClose: () => void;
  onFeedback: (taskId: string, feedback: Feedback) => void;
}

export function ConversationPanel({ task, onClose, onFeedback }: ConversationPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Reset messages when task changes
  useEffect(() => {
    setMessages([]);
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

  const handleFeedback = useCallback((feedback: Feedback) => {
    onFeedback(task.id, feedback);
  }, [task, onFeedback]);

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-outline-variant">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-headline-small font-display text-on-surface">
              {task.title}
            </h2>
            {task.research?.taskType && (
              <span className="inline-block mt-2 px-3 py-1 text-label-small font-medium text-on-surface-variant bg-surface-container-high rounded-pill">
                {task.research.taskType}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-on-surface/8 transition-colors"
            aria-label="Close"
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
                <div className="text-label-medium text-on-surface-variant mb-1">AI Research</div>
                <div className="p-4 bg-surface-container rounded-lg">
                  <p className="text-body-medium text-on-surface">
                    {task.research.summary}
                  </p>
                  {task.research.quickInfo?.details && (
                    <p className="mt-2 text-body-medium text-on-surface-variant">
                      {task.research.quickInfo.details}
                    </p>
                  )}
                </div>

                {/* Key actions */}
                {task.research.keyActions && task.research.keyActions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {task.research.keyActions.map((action, index) => (
                      <a
                        key={index}
                        href={action.value}
                        target={action.type === 'link' ? '_blank' : undefined}
                        rel={action.type === 'link' ? 'noopener noreferrer' : undefined}
                        className={`
                          inline-flex items-center gap-1.5 px-4 py-2
                          text-label-large font-medium rounded-pill
                          transition-all duration-200
                          ${action.isPrimary
                            ? 'bg-primary text-on-primary hover:shadow-elevation-1'
                            : 'bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80'
                          }
                        `}
                      >
                        <MaterialIcon
                          name={action.type === 'phone' ? 'call' : action.type === 'email' ? 'mail' : 'open_in_new'}
                          size="small"
                        />
                        {action.label}
                      </a>
                    ))}
                  </div>
                )}

                {/* Feedback */}
                <div className="mt-4">
                  <FeedbackWidget feedback={task.feedback} onFeedback={handleFeedback} />
                </div>
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
            <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0">
              <MaterialIcon name="person" size="small" className="text-on-surface-variant" />
            </div>
            <div className="flex-1">
              <div className="p-4 bg-surface-container rounded-lg">
                <p className="text-body-medium text-on-surface-variant italic">
                  This is a personal task - no research needed.
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
