'use client';

import { MaterialIcon } from './ui/MaterialIcon';

interface EmptyStateProps {
  viewMode: 'active' | 'completed' | 'someday';
  compact?: boolean;
}

export function EmptyState({ viewMode, compact = false }: EmptyStateProps) {
  if (viewMode === 'active') {
    // Celebratory "all done" state
    return (
      <div className={`text-center ${compact ? 'py-8' : 'py-16'}`}>
        {/* Sun icon - inspired by Inbox's famous "You're all done" */}
        <div className="relative inline-block mb-4">
          <div className="celebrate">
            <svg
              width={compact ? 64 : 80}
              height={compact ? 64 : 80}
              viewBox="0 0 80 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mx-auto"
            >
              {/* Sun rays */}
              <g className="text-inbox-warning opacity-60">
                <line x1="40" y1="4" x2="40" y2="14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <line x1="40" y1="66" x2="40" y2="76" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <line x1="4" y1="40" x2="14" y2="40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <line x1="66" y1="40" x2="76" y2="40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <line x1="14.5" y1="14.5" x2="21.6" y2="21.6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <line x1="58.4" y1="58.4" x2="65.5" y2="65.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <line x1="14.5" y1="65.5" x2="21.6" y2="58.4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <line x1="58.4" y1="21.6" x2="65.5" y2="14.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </g>
              {/* Sun circle */}
              <circle cx="40" cy="40" r="18" fill="#FBBC04" />
              {/* Happy face */}
              <circle cx="34" cy="37" r="2" fill="#EA8600" />
              <circle cx="46" cy="37" r="2" fill="#EA8600" />
              <path d="M34 46 Q40 50 46 46" stroke="#EA8600" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        </div>

        <h3 className={`font-medium text-inbox-text-primary mb-2 ${compact ? 'text-lg' : 'text-xl'}`}>
          You're all done!
        </h3>
        <p className={`text-inbox-text-secondary ${compact ? 'text-sm' : 'text-base'}`}>
          Enjoy the rest of your day
        </p>
      </div>
    );
  }

  if (viewMode === 'completed') {
    return (
      <div className={`text-center ${compact ? 'py-8' : 'py-12'}`}>
        <MaterialIcon
          name="task_alt"
          size={compact ? 40 : 48}
          weight={200}
          className="text-inbox-text-tertiary mx-auto mb-4"
        />
        <p className={`text-inbox-text-secondary ${compact ? 'text-sm' : 'text-base'}`}>
          No completed tasks yet
        </p>
      </div>
    );
  }

  // Someday
  return (
    <div className={`text-center ${compact ? 'py-8' : 'py-12'}`}>
      <MaterialIcon
        name="schedule"
        size={compact ? 40 : 48}
        weight={200}
        className="text-inbox-text-tertiary mx-auto mb-4"
      />
      <p className={`text-inbox-text-secondary ${compact ? 'text-sm' : 'text-base'}`}>
        Nothing here yet — tasks you set aside will appear here
      </p>
    </div>
  );
}
