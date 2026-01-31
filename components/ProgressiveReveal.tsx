'use client';

import { useEffect, useState } from 'react';
import { ProgressStatus, PROGRESS_STAGES } from '@/lib/types';
import { Skeleton, ResearchSkeleton } from './ui/Skeleton';
import { MaterialIcon } from './ui/MaterialIcon';

interface ProgressiveRevealProps {
  status: ProgressStatus | null;
}

export function ProgressiveReveal({ status }: ProgressiveRevealProps) {
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!status) {
      setCurrentStage(0);
      setProgress(0);
      return;
    }

    const stageIndex = PROGRESS_STAGES.findIndex(s => s.stage === status.stage);
    setCurrentStage(stageIndex >= 0 ? stageIndex : 0);
    setProgress(status.progress);
  }, [status]);

  if (!status) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Progress bar with shimmer */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 h-1 bg-surface-container-high rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all duration-500 ease-md-standard"
            style={{ width: `${progress}%` }}
          />
          {/* Shimmer overlay */}
          <div
            className="absolute left-0 top-0 h-full skeleton-shimmer rounded-full"
            style={{ width: `${Math.min(progress + 10, 100)}%` }}
          />
        </div>
        <span className="text-label-small text-on-surface-variant whitespace-nowrap min-w-[3rem] text-right">
          {progress}%
        </span>
      </div>

      {/* Status message with icon */}
      <div className="flex items-center gap-2 text-body-medium text-on-surface-variant">
        <MaterialIcon
          name="progress_activity"
          size="small"
          className="animate-spin text-primary"
        />
        <span className="animate-pulse">{status.message}</span>
      </div>

      {/* Stage indicators */}
      <div className="flex gap-1">
        {PROGRESS_STAGES.map((stage, index) => (
          <div
            key={stage.stage}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              index <= currentStage
                ? 'bg-primary'
                : 'bg-surface-container-high'
            }`}
          />
        ))}
      </div>

      {/* Research skeleton preview */}
      {progress > 20 && (
        <div className="mt-4 opacity-50">
          <ResearchSkeleton />
        </div>
      )}
    </div>
  );
}
