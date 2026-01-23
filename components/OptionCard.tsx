'use client';

import { OptionCard as OptionCardType } from '@/lib/types';

interface OptionCardProps {
  option: OptionCardType;
  compact?: boolean;
}

export function OptionCard({ option, compact = false }: OptionCardProps) {
  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden ${
      compact ? 'p-3' : 'p-4'
    }`}>
      <div className="flex items-start justify-between gap-3">
        {/* Left side - info */}
        <div className="flex-1 min-w-0">
          {/* Title row with badge */}
          <div className="flex items-center gap-2">
            <h4 className={`font-medium text-gray-900 dark:text-white ${compact ? 'text-sm' : ''}`}>
              {option.title}
            </h4>
            {option.badge && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                option.badge === 'Best Price'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : option.badge === 'Fastest'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
              }`}>
                {option.badge}
              </span>
            )}
          </div>

          {/* Subtitle */}
          {option.subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {option.subtitle}
            </p>
          )}

          {/* Details */}
          {option.details.length > 0 && (
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-600 dark:text-gray-300 ${
              compact ? 'text-xs mt-1' : 'text-sm mt-2'
            }`}>
              {option.details.map((detail, index) => (
                <span key={index} className="flex items-center gap-1">
                  {index > 0 && <span className="text-gray-300 dark:text-gray-600">·</span>}
                  {detail}
                </span>
              ))}
            </div>
          )}

          {/* Provider */}
          {option.provider && !compact && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              via {option.provider}
            </p>
          )}
        </div>

        {/* Right side - price and action */}
        <div className="flex-shrink-0 text-right">
          {option.price && (
            <div className={`font-semibold text-gray-900 dark:text-white ${compact ? 'text-base' : 'text-lg'}`}>
              {option.price}
            </div>
          )}
          <a
            href={option.actionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center gap-1.5 font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors ${
              compact ? 'px-3 py-1.5 text-xs mt-1' : 'px-4 py-2 text-sm mt-2'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {option.actionLabel}
          </a>
        </div>
      </div>
    </div>
  );
}

interface OptionListProps {
  options: OptionCardType[];
  compact?: boolean;
  maxDisplay?: number;
}

export function OptionList({ options, compact = false, maxDisplay }: OptionListProps) {
  const displayOptions = maxDisplay ? options.slice(0, maxDisplay) : options;
  const remaining = maxDisplay && options.length > maxDisplay ? options.length - maxDisplay : 0;

  return (
    <div className={`space-y-${compact ? '2' : '3'}`}>
      {displayOptions.map((option) => (
        <OptionCard key={option.id} option={option} compact={compact} />
      ))}
      {remaining > 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          +{remaining} more option{remaining > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
