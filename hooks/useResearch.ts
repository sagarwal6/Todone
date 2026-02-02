'use client';

import { useState, useCallback } from 'react';
import { Research, ResearchResponse, ProgressStatus, TASK_PROGRESS_STAGES } from '@/lib/types';

// Track progress per task
type ProgressMap = Record<string, ProgressStatus | null>;

// Detect task type from title keywords
function detectTaskType(title: string): string {
  const lowerTitle = title.toLowerCase();

  // Travel-related keywords
  if (/\b(flight|fly|airline|airport|hotel|booking|trip|travel|vacation|destination)\b/.test(lowerTitle)) {
    return 'travel';
  }

  // Insurance-related keywords
  if (/\b(insurance|policy|coverage|premium|claim|deductible)\b/.test(lowerTitle)) {
    return 'insurance';
  }

  // Shopping-related keywords
  if (/\b(buy|purchase|shop|product|price|deal|sale|order|amazon|store)\b/.test(lowerTitle)) {
    return 'shopping';
  }

  return 'default';
}

interface UseResearchReturn {
  progressMap: ProgressMap;
  error: string | null;
  research: (taskId: string, taskTitle: string) => Promise<{
    isPersonal: boolean;
    research: Research | null;
  }>;
  getProgress: (taskId: string) => ProgressStatus | null;
}

export function useResearch(): UseResearchReturn {
  const [progressMap, setProgressMap] = useState<ProgressMap>({});
  const [error, setError] = useState<string | null>(null);

  const getProgress = useCallback((taskId: string): ProgressStatus | null => {
    return progressMap[taskId] || null;
  }, [progressMap]);

  const research = useCallback(async (taskId: string, taskTitle: string): Promise<{
    isPersonal: boolean;
    research: Research | null;
  }> => {
    setError(null);

    // Detect task type and get appropriate progress stages
    const taskType = detectTaskType(taskTitle);
    const progressStages = TASK_PROGRESS_STAGES[taskType] || TASK_PROGRESS_STAGES.default;

    // Set initial progress for this task
    setProgressMap(prev => ({ ...prev, [taskId]: progressStages[0] }));

    // Simulate progressive stages while waiting for API
    const progressInterval = setInterval(() => {
      setProgressMap(prev => {
        const currentProgress = prev[taskId];
        if (!currentProgress) return prev;

        const currentIndex = progressStages.findIndex(s => s.stage === currentProgress.stage);
        const nextIndex = Math.min(currentIndex + 1, progressStages.length - 1);
        return { ...prev, [taskId]: progressStages[nextIndex] };
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
      // Clear progress for this task
      setProgressMap(prev => {
        const newMap = { ...prev };
        delete newMap[taskId];
        return newMap;
      });
    }
  }, []);

  return {
    progressMap,
    error,
    research,
    getProgress,
  };
}
