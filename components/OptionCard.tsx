'use client';

import { OptionCard as OptionCardType } from '@/lib/types';
import { Card } from './ui/Card';
import { MaterialIcon } from './ui/MaterialIcon';
import { Button } from './ui/Button';

interface OptionCardProps {
  option: OptionCardType;
  compact?: boolean;
}

export function OptionCard({ option, compact = false }: OptionCardProps) {
  const getBadgeStyles = (badge: string) => {
    switch (badge) {
      case 'Best Price':
        return 'bg-success-container text-on-success-container';
      case 'Fastest':
        return 'bg-primary-container text-on-primary-container';
      default:
        return 'bg-tertiary-container text-on-tertiary-container';
    }
  };

  return (
    <Card variant="outlined" className={compact ? 'p-3' : 'p-4'}>
      <div className="flex items-start justify-between gap-3">
        {/* Left side - info */}
        <div className="flex-1 min-w-0">
          {/* Title row with badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className={`font-medium text-on-surface ${compact ? 'text-body-medium' : 'text-title-medium'}`}>
              {option.title}
            </h4>
            {option.badge && (
              <span className={`px-2 py-0.5 text-label-small font-medium rounded-pill ${getBadgeStyles(option.badge)}`}>
                {option.badge}
              </span>
            )}
          </div>

          {/* Subtitle */}
          {option.subtitle && (
            <p className="text-body-small text-on-surface-variant mt-0.5">
              {option.subtitle}
            </p>
          )}

          {/* Details */}
          {option.details.length > 0 && (
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-on-surface-variant ${
              compact ? 'text-body-small mt-1' : 'text-body-medium mt-2'
            }`}>
              {option.details.map((detail, index) => (
                <span key={index} className="flex items-center gap-1">
                  {index > 0 && <span className="text-outline">·</span>}
                  {detail}
                </span>
              ))}
            </div>
          )}

          {/* Provider */}
          {option.provider && !compact && (
            <p className="text-body-small text-on-surface-variant/60 mt-2">
              via {option.provider}
            </p>
          )}
        </div>

        {/* Right side - price and action */}
        <div className="flex-shrink-0 text-right">
          {option.price && (
            <div className={`font-semibold text-on-surface ${compact ? 'text-title-medium' : 'text-title-large'}`}>
              {option.price}
            </div>
          )}
          <a
            href={option.actionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`
              inline-flex items-center justify-center gap-1.5
              font-medium
              bg-primary text-on-primary
              rounded-pill
              hover:shadow-elevation-1
              transition-all duration-200 ease-md-standard
              ${compact ? 'px-3 py-1.5 text-label-small mt-1' : 'px-4 py-2 text-label-large mt-2'}
            `}
          >
            <MaterialIcon name="open_in_new" size={compact ? 16 : 18} />
            {option.actionLabel}
          </a>
        </div>
      </div>
    </Card>
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
        <p className="text-body-small text-on-surface-variant text-center py-2">
          +{remaining} more option{remaining > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
