'use client';

import { SourceReference } from '@/lib/types';
import { MaterialIcon } from './ui/MaterialIcon';

interface SourceBadgeProps {
  source: SourceReference;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const confidenceColors = {
    high: 'bg-success-container text-on-success-container',
    medium: 'bg-tertiary-container text-on-tertiary-container',
    low: 'bg-error-container text-on-error-container',
  };

  return (
    <div className="flex items-start gap-3 p-3 bg-surface-container rounded-md">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-label-small font-medium rounded-xs capitalize ${confidenceColors[source.confidence]}`}>
            {source.confidence}
          </span>
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-label-large font-medium text-primary hover:text-primary/80 truncate transition-colors"
            >
              {source.title}
            </a>
          ) : (
            <span className="text-label-large font-medium text-on-surface truncate">
              {source.title}
            </span>
          )}
        </div>
        {source.snippet && (
          <p className="mt-1 text-body-small text-on-surface-variant line-clamp-2">
            {source.snippet}
          </p>
        )}
      </div>
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="
            flex-shrink-0
            inline-flex items-center gap-1
            px-3 py-1.5
            text-label-medium font-medium
            text-primary
            border border-outline
            rounded-pill
            hover:bg-primary/8
            transition-colors duration-200
          "
        >
          <MaterialIcon name="open_in_new" size={16} />
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
    <div className="space-y-3">
      <h4 className="text-label-medium font-medium text-on-surface-variant uppercase tracking-wider">
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
