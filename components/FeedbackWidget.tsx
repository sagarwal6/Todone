'use client';

import { useState, useCallback } from 'react';
import { Feedback, FeedbackType } from '@/lib/types';

interface FeedbackWidgetProps {
  feedback: Feedback | null;
  onFeedback: (feedback: Feedback) => void;
}

export function FeedbackWidget({ feedback, onFeedback }: FeedbackWidgetProps) {
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');

  const handleFeedback = useCallback((type: FeedbackType) => {
    if (type === 'negative') {
      setShowComment(true);
    } else {
      onFeedback({ type, createdAt: Date.now() });
    }
  }, [onFeedback]);

  const handleSubmitComment = useCallback(() => {
    onFeedback({
      type: 'negative',
      comment: comment.trim() || undefined,
      createdAt: Date.now(),
    });
    setShowComment(false);
    setComment('');
  }, [comment, onFeedback]);

  if (feedback) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {feedback.type === 'positive' ? (
          <>
            <ThumbsUpIcon filled />
            <span>Thanks for the feedback!</span>
          </>
        ) : (
          <>
            <ThumbsDownIcon filled />
            <span>Thanks, we&apos;ll improve</span>
          </>
        )}
      </div>
    );
  }

  if (showComment) {
    return (
      <div className="space-y-2">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What could be better? (optional)"
          className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
        />
        <div className="flex gap-2">
          <button
            onClick={handleSubmitComment}
            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            Submit
          </button>
          <button
            onClick={() => setShowComment(false)}
            className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 dark:text-gray-400">Was this helpful?</span>
      <button
        onClick={() => handleFeedback('positive')}
        className="p-1 text-gray-400 hover:text-green-500 transition-colors"
        aria-label="Helpful"
      >
        <ThumbsUpIcon />
      </button>
      <button
        onClick={() => handleFeedback('negative')}
        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
        aria-label="Not helpful"
      >
        <ThumbsDownIcon />
      </button>
    </div>
  );
}

function ThumbsUpIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      className="w-4 h-4"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"
      />
    </svg>
  );
}

function ThumbsDownIcon({ filled }: { filled?: boolean }) {
  return (
    <svg
      className="w-4 h-4"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"
      />
    </svg>
  );
}
