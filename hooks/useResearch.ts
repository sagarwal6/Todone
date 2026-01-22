'use client';

import { useState, useCallback } from 'react';
import { Research, ResearchResponse, ProgressStatus, PROGRESS_STAGES } from '@/lib/types';

interface UseResearchReturn {
  isResearching: boolean;
  progress: ProgressStatus | null;
  error: string | null;
  research: (taskId: string, taskTitle: string) => Promise<{
    isPersonal: boolean;
    research: Research | null;
  }>;
}

export function useResearch(): UseResearchReturn {
  const [isResearching, setIsResearching] = useState(false);
  const [progress, setProgress] = useState<ProgressStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const research = useCallback(async (taskId: string, taskTitle: string): Promise<{
    isPersonal: boolean;
    research: Research | null;
  }> => {
    setIsResearching(true);
    setError(null);
    setProgress(PROGRESS_STAGES[0]);

    // Simulate progressive stages while waiting for API
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (!prev) return PROGRESS_STAGES[0];
        const currentIndex = PROGRESS_STAGES.findIndex(s => s.stage === prev.stage);
        const nextIndex = Math.min(currentIndex + 1, PROGRESS_STAGES.length - 1);
        return PROGRESS_STAGES[nextIndex];
      });
    }, 2000);

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId, taskTitle }),
      });

      const data: ResearchResponse = await response.json();

      clearInterval(progressInterval);

      if (!data.success) {
        setError(data.error || 'Research failed');
        return { isPersonal: false, research: null };
      }

      if (data.isPersonal) {
        return { isPersonal: true, research: null };
      }

      return { isPersonal: false, research: data.research || null };
    } catch (err) {
      clearInterval(progressInterval);
      const errorMessage = err instanceof Error ? err.message : 'Research request failed';
      setError(errorMessage);
      return { isPersonal: false, research: null };
    } finally {
      setIsResearching(false);
      setProgress(null);
    }
  }, []);

  return {
    isResearching,
    progress,
    error,
    research,
  };
}
