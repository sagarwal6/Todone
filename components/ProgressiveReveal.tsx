'use client';

import { useEffect, useState } from 'react';
import { ProgressStatus, PROGRESS_STAGES } from '@/lib/types';

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
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="relative w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {progress}%
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <LoadingSpinner />
        <span className="animate-pulse">{status.message}</span>
      </div>

      <div className="flex gap-1">
        {PROGRESS_STAGES.map((stage, index) => (
          <div
            key={stage.stage}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              index <= currentStage
                ? 'bg-blue-500'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-blue-500"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
