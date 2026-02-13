'use client';

import { useEffect, useState } from 'react';
import { ProgressStatus, PROGRESS_STAGES } from '@/lib/types';
import { MaterialIcon } from './ui/MaterialIcon';

interface ProgressiveRevealProps {
  status: ProgressStatus | null;
}

export function ProgressiveReveal({ status }: ProgressiveRevealProps) {
  const [currentStage, setCurrentStage] = useState(0);

  useEffect(() => {
    if (!status) {
      setCurrentStage(0);
      return;
    }

    const stageIndex = PROGRESS_STAGES.findIndex(s => s.stage === status.stage);
    setCurrentStage(stageIndex >= 0 ? stageIndex : 0);
  }, [status]);

  if (!status) return null;

  // Compact progress indicator - fixed height, no expansion
  return (
    <div className="flex items-center gap-2 text-inbox-caption text-inbox-text-secondary">
      <MaterialIcon
        name="progress_activity"
        size={14}
        className="animate-spin text-inbox-accent"
      />
      <span>{status.message}</span>
      {/* Compact stage dots */}
      <div className="flex gap-1 ml-2">
        {PROGRESS_STAGES.map((stage, index) => (
          <div
            key={stage.stage}
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
              index <= currentStage
                ? 'bg-inbox-accent'
                : 'bg-inbox-divider-strong'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
