'use client';

import { MaterialIcon } from './ui/MaterialIcon';
import type { AgentQuickInfo } from '@/lib/ai/types';

interface KeyFactsLineProps {
  quickInfo: AgentQuickInfo;
}

/**
 * KeyFactsLine - Inline display of key extracted facts
 *
 * Shows phone, email, deadline, contact in a horizontal line with icons.
 * Replaces the boxed QuickReferenceCard with a cleaner inline format.
 */
export function KeyFactsLine({ quickInfo }: KeyFactsLineProps) {
  // Check if we have any displayable facts (exclude summary since it's shown elsewhere)
  const hasFacts = quickInfo.phone || quickInfo.email || quickInfo.deadline ||
                   quickInfo.contactName || quickInfo.hours || quickInfo.accountNumber ||
                   quickInfo.website;

  if (!hasFacts) return null;

  // Check if deadline is within 7 days for warning styling
  const isDeadlineUrgent = (() => {
    if (!quickInfo.deadline) return false;
    // Simple check - if it contains a date that's soon
    const text = quickInfo.deadline.toLowerCase();
    if (text.includes('today') || text.includes('tomorrow')) return true;
    // Could add more sophisticated date parsing here
    return false;
  })();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 mt-3 border-t border-inbox-divider text-[14px]">
      {/* Phone */}
      {(quickInfo.phoneFormatted || quickInfo.phone) && (
        <div className="flex items-center gap-1.5 text-inbox-text-secondary">
          <MaterialIcon name="call" size={16} weight={300} className="text-inbox-text-tertiary" />
          <a
            href={`tel:${quickInfo.phone}`}
            className="text-inbox-text-primary hover:text-inbox-accent transition-colors"
            aria-label={`Call ${quickInfo.phoneFormatted || quickInfo.phone}`}
          >
            {quickInfo.phoneFormatted || quickInfo.phone}
          </a>
        </div>
      )}

      {/* Email */}
      {quickInfo.email && (
        <div className="flex items-center gap-1.5 text-inbox-text-secondary">
          <MaterialIcon name="mail" size={16} weight={300} className="text-inbox-text-tertiary" />
          <a
            href={`mailto:${quickInfo.email}`}
            className="text-inbox-text-primary hover:text-inbox-accent transition-colors"
          >
            {quickInfo.email}
          </a>
        </div>
      )}

      {/* Hours */}
      {quickInfo.hours && (
        <div className="flex items-center gap-1.5 text-inbox-text-secondary">
          <MaterialIcon name="schedule" size={16} weight={300} className="text-inbox-text-tertiary" />
          <span>{quickInfo.hours}</span>
        </div>
      )}

      {/* Deadline */}
      {quickInfo.deadline && (
        <div className={`flex items-center gap-1.5 ${isDeadlineUrgent ? 'text-inbox-warning' : 'text-inbox-text-secondary'}`}>
          <MaterialIcon
            name="event"
            size={16}
            weight={300}
            className={isDeadlineUrgent ? 'text-inbox-warning' : 'text-inbox-text-tertiary'}
          />
          <span className={isDeadlineUrgent ? 'font-medium' : ''}>{quickInfo.deadline}</span>
        </div>
      )}

      {/* Contact person */}
      {quickInfo.contactName && (
        <div className="flex items-center gap-1.5 text-inbox-text-secondary">
          <MaterialIcon name="person" size={16} weight={300} className="text-inbox-text-tertiary" />
          <span className="text-inbox-text-primary">{quickInfo.contactName}</span>
          {quickInfo.contactTitle && (
            <span className="text-inbox-text-tertiary">({quickInfo.contactTitle})</span>
          )}
        </div>
      )}

      {/* Account number */}
      {quickInfo.accountNumber && (
        <div className="flex items-center gap-1.5 text-inbox-text-secondary">
          <MaterialIcon name="tag" size={16} weight={300} className="text-inbox-text-tertiary" />
          <span className="font-mono text-inbox-text-primary">#{quickInfo.accountNumber}</span>
        </div>
      )}

      {/* Website */}
      {quickInfo.website && (
        <div className="flex items-center gap-1.5 text-inbox-text-secondary min-w-0">
          <MaterialIcon name="language" size={16} weight={300} className="text-inbox-text-tertiary flex-shrink-0" />
          <a
            href={quickInfo.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-inbox-accent hover:underline truncate"
          >
            {quickInfo.website.replace(/^https?:\/\//, '')}
          </a>
        </div>
      )}
    </div>
  );
}

export default KeyFactsLine;
