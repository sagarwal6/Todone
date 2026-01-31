'use client';

import { useState } from 'react';
import { Task } from '@/lib/types';
import { MaterialIcon } from './ui/MaterialIcon';
import { SourceList } from './SourceBadge';

interface TaskContextPanelProps {
  task: Task;
  className?: string;
}

interface CollapsibleSectionProps {
  title: string;
  icon: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string | number;
}

function CollapsibleSection({ title, icon, defaultOpen = true, children, badge }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-outline-variant last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-on-surface/4 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MaterialIcon name={icon} size="small" className="text-on-surface-variant" />
          <span className="text-title-small font-medium text-on-surface">{title}</span>
          {badge !== undefined && (
            <span className="px-2 py-0.5 text-label-small bg-primary-container text-on-primary-container rounded-pill">
              {badge}
            </span>
          )}
        </div>
        <MaterialIcon
          name={isOpen ? 'expand_less' : 'expand_more'}
          size="small"
          className="text-on-surface-variant"
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

export function TaskContextPanel({ task, className = '' }: TaskContextPanelProps) {
  const research = task.research;
  const quickInfo = research?.quickInfo;

  // Define progress steps based on task status
  const getProgressSteps = () => {
    const steps = [
      { label: 'Research task', completed: task.status !== 'researching' && task.status !== 'pending' },
      { label: 'Review information', completed: task.status === 'completed' || task.status === 'archived' },
      { label: 'Take action', completed: task.status === 'completed' || task.status === 'archived' },
    ];

    // Add current step indicator
    if (task.status === 'researching') {
      steps[0].label = 'Researching...';
    }

    return steps;
  };

  const progressSteps = getProgressSteps();
  const completedSteps = progressSteps.filter(s => s.completed).length;

  return (
    <div className={`h-full flex flex-col bg-surface border-l border-outline-variant ${className}`}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-outline-variant">
        <h2 className="text-title-medium font-medium text-on-surface">Task Details</h2>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Progress Section */}
        <CollapsibleSection
          title="Progress"
          icon="checklist"
          badge={`${completedSteps}/${progressSteps.length}`}
        >
          <div className="space-y-2">
            {/* Progress bar */}
            <div className="h-1 bg-surface-container-high rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${(completedSteps / progressSteps.length) * 100}%` }}
              />
            </div>

            {progressSteps.map((step, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className={`
                  w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                  ${step.completed
                    ? 'bg-primary text-on-primary'
                    : 'border-2 border-outline text-transparent'
                  }
                `}>
                  {step.completed && <MaterialIcon name="check" size={14} />}
                </div>
                <span className={`text-body-medium ${
                  step.completed ? 'text-on-surface line-through opacity-60' : 'text-on-surface'
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* Quick Info Section */}
        {quickInfo && (quickInfo.phone || quickInfo.hours || quickInfo.address || quickInfo.website || quickInfo.price) && (
          <CollapsibleSection title="Quick Info" icon="info">
            <div className="space-y-3">
              {quickInfo.price && (
                <div className="flex items-center gap-3">
                  <MaterialIcon name="payments" size="small" className="text-success" />
                  <span className="text-body-medium font-medium text-success">{quickInfo.price}</span>
                </div>
              )}
              {quickInfo.phoneFormatted && (
                <a
                  href={quickInfo.phone}
                  className="flex items-center gap-3 text-primary hover:underline"
                >
                  <MaterialIcon name="call" size="small" />
                  <span className="text-body-medium">{quickInfo.phoneFormatted}</span>
                </a>
              )}
              {quickInfo.hours && (
                <div className="flex items-center gap-3 text-on-surface-variant">
                  <MaterialIcon name="schedule" size="small" />
                  <span className="text-body-medium">{quickInfo.hours}</span>
                </div>
              )}
              {quickInfo.address && (
                <div className="flex items-start gap-3 text-on-surface-variant">
                  <MaterialIcon name="location_on" size="small" className="mt-0.5" />
                  <span className="text-body-medium">{quickInfo.address}</span>
                </div>
              )}
              {quickInfo.website && (
                <a
                  href={quickInfo.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-primary hover:underline"
                >
                  <MaterialIcon name="language" size="small" />
                  <span className="text-body-medium truncate">{quickInfo.website.replace(/^https?:\/\//, '')}</span>
                </a>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Sources Section */}
        {research?.sources && research.sources.length > 0 && (
          <CollapsibleSection
            title="Sources"
            icon="source"
            badge={research.sources.length}
          >
            <SourceList sources={research.sources} />
          </CollapsibleSection>
        )}

        {/* Briefing Section */}
        {research?.rawMarkdown && (
          <CollapsibleSection title="Briefing" icon="article" defaultOpen={false}>
            <div className="prose prose-sm max-w-none text-body-medium text-on-surface-variant whitespace-pre-wrap">
              {research.rawMarkdown}
            </div>
          </CollapsibleSection>
        )}

        {/* Options Section */}
        {research?.options && research.options.length > 0 && (
          <CollapsibleSection
            title="Options"
            icon="list"
            badge={research.options.length}
            defaultOpen={false}
          >
            <div className="space-y-2">
              {research.options.map((option) => (
                <div
                  key={option.id}
                  className="p-3 bg-surface-container rounded-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-body-medium font-medium text-on-surface">{option.title}</div>
                      {option.subtitle && (
                        <div className="text-body-small text-on-surface-variant">{option.subtitle}</div>
                      )}
                    </div>
                    {option.price && (
                      <div className="text-body-medium font-medium text-on-surface">{option.price}</div>
                    )}
                  </div>
                  {option.details.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {option.details.map((detail, i) => (
                        <span key={i} className="text-body-small text-on-surface-variant">
                          {i > 0 && '·'} {detail}
                        </span>
                      ))}
                    </div>
                  )}
                  <a
                    href={option.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-label-medium text-primary hover:underline"
                  >
                    {option.actionLabel}
                    <MaterialIcon name="open_in_new" size={14} />
                  </a>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Personal Task Message */}
        {task.status === 'personal' && (
          <CollapsibleSection title="Info" icon="info">
            <p className="text-body-medium text-on-surface-variant italic">
              This is a personal task - no research needed.
            </p>
          </CollapsibleSection>
        )}

        {/* Researching State */}
        {task.status === 'researching' && (
          <CollapsibleSection title="Status" icon="hourglass_empty">
            <div className="flex items-center gap-2 text-body-medium text-on-surface-variant">
              <MaterialIcon name="progress_activity" size="small" className="animate-spin text-primary" />
              <span>Researching this task...</span>
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
