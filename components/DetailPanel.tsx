'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Task, ChatMessage, Feedback } from '@/lib/types';
import { SourceList } from './SourceBadge';
import { FeedbackWidget } from './FeedbackWidget';
import { OptionList } from './OptionCard';
import { MaterialIcon } from './ui/MaterialIcon';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { v4 as uuidv4 } from 'uuid';

interface DetailPanelProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onFeedback: (taskId: string, feedback: Feedback) => void;
  embedded?: boolean;
}

export function DetailPanel({ task, isOpen, onClose, onFeedback, embedded = false }: DetailPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Reset messages when task changes
  useEffect(() => {
    setMessages([]);
  }, [task?.id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || !task || isLoading) return;

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
    if (task) {
      onFeedback(task.id, feedback);
    }
  }, [task, onFeedback]);

  if (!task || !isOpen) return null;

  const quickInfo = task.research?.quickInfo;

  return (
    <div className={`h-full flex flex-col bg-surface ${embedded ? '' : 'border-l border-outline-variant'}`}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-outline-variant">
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
            aria-label="Close panel"
          >
            <MaterialIcon name="close" size={24} />
          </button>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto">
        {task.research && (
          <div className="p-4 space-y-6">
            {/* Quick contact info */}
            {(quickInfo?.phoneFormatted || quickInfo?.hours || quickInfo?.address || quickInfo?.website || quickInfo?.price || quickInfo?.details) && (
              <Card variant="filled" className="bg-primary-container/30 space-y-3">
                <h3 className="text-title-small font-medium text-on-surface">Quick Info</h3>
                <div className="space-y-2">
                  {quickInfo?.price && (
                    <div className="flex items-center gap-2 text-success font-medium">
                      <MaterialIcon name="payments" size="small" />
                      {quickInfo.price}
                    </div>
                  )}
                  {quickInfo?.details && (
                    <div className="text-body-medium text-on-surface-variant">
                      {quickInfo.details}
                    </div>
                  )}
                  {quickInfo?.phoneFormatted && (
                    <div className="flex items-center gap-2">
                      <MaterialIcon name="call" size="small" className="text-primary" />
                      <a href={quickInfo.phone} className="text-body-medium font-medium text-primary hover:underline">
                        {quickInfo.phoneFormatted}
                      </a>
                    </div>
                  )}
                  {quickInfo?.hours && (
                    <div className="flex items-center gap-2 text-on-surface-variant">
                      <MaterialIcon name="schedule" size="small" />
                      <span className="text-body-medium">{quickInfo.hours}</span>
                    </div>
                  )}
                  {quickInfo?.address && (
                    <div className="flex items-start gap-2 text-on-surface-variant">
                      <MaterialIcon name="location_on" size="small" className="mt-0.5" />
                      <span className="text-body-medium">{quickInfo.address}</span>
                    </div>
                  )}
                  {quickInfo?.website && (
                    <div className="flex items-center gap-2">
                      <MaterialIcon name="language" size="small" className="text-primary" />
                      <a href={quickInfo.website} target="_blank" rel="noopener noreferrer" className="text-body-medium text-primary hover:underline truncate">
                        {quickInfo.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Options list */}
            {task.research.options && task.research.options.length > 0 && (
              <div>
                <h3 className="text-title-small font-medium text-on-surface mb-3">
                  {task.research.options.length} Options Found
                </h3>
                <OptionList options={task.research.options} />
              </div>
            )}

            {/* Full briefing */}
            {task.research.rawMarkdown && (
              <div>
                <h3 className="text-title-small font-medium text-on-surface mb-2">Briefing</h3>
                <div className="prose prose-sm max-w-none text-body-medium text-on-surface-variant whitespace-pre-wrap">
                  {task.research.rawMarkdown}
                </div>
              </div>
            )}

            {/* Sources */}
            {task.research.sources.length > 0 && (
              <SourceList sources={task.research.sources} />
            )}

            {/* Feedback */}
            <div className="pt-4 border-t border-outline-variant">
              <FeedbackWidget feedback={task.feedback} onFeedback={handleFeedback} />
            </div>

            {/* Chat messages */}
            {messages.length > 0 && (
              <div className="pt-4 border-t border-outline-variant">
                <h3 className="text-title-small font-medium text-on-surface mb-3">Conversation</h3>
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] px-4 py-2 rounded-lg text-body-medium ${
                          msg.role === 'user'
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-high text-on-surface'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="px-4 py-2 bg-surface-container-high rounded-lg">
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat input - fixed at bottom */}
      <div className="flex-shrink-0 p-4 border-t border-outline-variant bg-surface">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up question..."
            disabled={isLoading}
            className="
              flex-1 px-4 py-2
              text-body-medium text-on-surface
              bg-surface-container
              border-0 rounded-pill
              focus:outline-none focus:ring-2 focus:ring-primary
              disabled:opacity-38
              placeholder:text-on-surface-variant
            "
          />
          <Button
            variant="filled"
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            icon="send"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
