'use client';

import { SourceReference } from '@/lib/types';

interface SourceBadgeProps {
  source: SourceReference;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const confidenceColors = {
    high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    low: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  return (
    <div className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-md text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${confidenceColors[source.confidence]}`}>
            {source.confidence}
          </span>
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 truncate"
            >
              {source.title}
            </a>
          ) : (
            <span className="font-medium text-gray-700 dark:text-gray-300 truncate">
              {source.title}
            </span>
          )}
        </div>
        {source.snippet && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {source.snippet}
          </p>
        )}
      </div>
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
        >
          Verify
        </a>
      )}
    </div>
  );
}

interface SourceListProps {
  sources: SourceReference[];
}

export function SourceList({ sources }: SourceListProps) {
  if (sources.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        Sources
      </h4>
      <div className="space-y-2">
        {sources.map((source, index) => (
          <SourceBadge key={index} source={source} />
        ))}
      </div>
    </div>
  );
}
