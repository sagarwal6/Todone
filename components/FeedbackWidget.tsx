'use client';

import { useState, useCallback } from 'react';
import { Feedback, FeedbackType } from '@/lib/types';
import { MaterialIcon } from './ui/MaterialIcon';
import { Button } from './ui/Button';

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
      <div className="flex items-center gap-2 text-body-small text-on-surface-variant">
        {feedback.type === 'positive' ? (
          <>
            <MaterialIcon name="thumb_up" size="small" fill className="text-success" />
            <span>Thanks for the feedback!</span>
          </>
        ) : (
          <>
            <MaterialIcon name="thumb_down" size="small" fill className="text-on-surface-variant" />
            <span>Thanks, we&apos;ll improve</span>
          </>
        )}
      </div>
    );
  }

  if (showComment) {
    return (
      <div className="space-y-3">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What could be better? (optional)"
          className="
            w-full px-3 py-2
            text-body-medium text-on-surface
            bg-surface-container
            border-0 rounded-sm
            focus:outline-none focus:ring-2 focus:ring-primary
            placeholder:text-on-surface-variant
          "
          rows={2}
        />
        <div className="flex gap-2">
          <Button
            variant="filled"
            size="small"
            onClick={handleSubmitComment}
          >
            Submit
          </Button>
          <Button
            variant="text"
            size="small"
            onClick={() => setShowComment(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-body-small text-on-surface-variant">Was this helpful?</span>
      <button
        onClick={() => handleFeedback('positive')}
        className="p-2 rounded-full text-on-surface-variant hover:text-success hover:bg-success/8 transition-colors"
        aria-label="Helpful"
      >
        <MaterialIcon name="thumb_up" size="small" />
      </button>
      <button
        onClick={() => handleFeedback('negative')}
        className="p-2 rounded-full text-on-surface-variant hover:text-error hover:bg-error/8 transition-colors"
        aria-label="Not helpful"
      >
        <MaterialIcon name="thumb_down" size="small" />
      </button>
    </div>
  );
}
