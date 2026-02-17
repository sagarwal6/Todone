'use client';

import { MaterialIcon } from './ui/MaterialIcon';
import type { AgentQuickInfo, QuickInfoSource } from '@/lib/ai/types';

interface QuickReferenceCardProps {
  quickInfo: AgentQuickInfo;
  compact?: boolean;
}

/**
 * Get icon name for a source type
 */
function getSourceIcon(source: QuickInfoSource): string {
  switch (source) {
    case 'email': return 'mail';
    case 'web': return 'language';
    case 'calendar': return 'event';
    case 'contacts': return 'contacts';
    default: return 'info';
  }
}

/**
 * Source indicator component - subtle icon showing where info came from
 */
function SourceIndicator({ source }: { source?: QuickInfoSource }) {
  if (!source) return null;
  return (
    <span title={`Found via ${source}`} className="ml-1 flex-shrink-0">
      <MaterialIcon
        name={getSourceIcon(source)}
        size={14}
        weight={300}
        className="text-inbox-text-tertiary"
      />
    </span>
  );
}

export function QuickReferenceCard({ quickInfo, compact = false }: QuickReferenceCardProps) {
  // Only render if there's meaningful content
  const hasContent = quickInfo.phone || quickInfo.hours || quickInfo.contactName ||
                     quickInfo.accountNumber || quickInfo.email || quickInfo.deadline;

  if (!hasContent) return null;

  if (compact) {
    // Compact version for task list - single line with most important info
    const items: string[] = [];
    if (quickInfo.phoneFormatted || quickInfo.phone) {
      items.push(quickInfo.phoneFormatted || quickInfo.phone!);
    }
    if (quickInfo.contactName) {
      items.push(quickInfo.contactName);
    }
    if (quickInfo.hours) {
      items.push(quickInfo.hours);
    }
    if (quickInfo.accountNumber) {
      items.push(`#${quickInfo.accountNumber}`);
    }

    if (items.length === 0) return null;

    return (
      <div className="flex items-center gap-2 text-inbox-caption text-inbox-text-secondary">
        <MaterialIcon name="info" size={14} weight={300} className="text-inbox-accent flex-shrink-0" />
        <span className="truncate">{items.join(' • ')}</span>
      </div>
    );
  }

  // Full card version for detail view
  return (
    <div className="bg-inbox-accent-light/50 rounded-lg p-4 border border-inbox-accent/20">
      {/* Executive summary */}
      {quickInfo.summary && (
        <p className="text-inbox-body font-medium text-inbox-text-primary mb-3">
          {quickInfo.summary}
        </p>
      )}

      {/* Key facts grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Phone */}
        {(quickInfo.phoneFormatted || quickInfo.phone) && (
          <div className="flex items-center gap-2">
            <MaterialIcon name="call" size={18} className="text-inbox-accent" />
            <div className="flex items-center">
              <a
                href={`tel:${quickInfo.phone}`}
                className="text-inbox-body text-inbox-text-primary hover:text-inbox-accent transition-colors font-medium"
              >
                {quickInfo.phoneFormatted || quickInfo.phone}
              </a>
              <SourceIndicator source={quickInfo.sources?.phone} />
            </div>
          </div>
        )}

        {/* Hours */}
        {quickInfo.hours && (
          <div className="flex items-center gap-2">
            <MaterialIcon name="schedule" size={18} className="text-inbox-accent" />
            <div className="flex items-center">
              <span className="text-inbox-body text-inbox-text-secondary">{quickInfo.hours}</span>
              <SourceIndicator source={quickInfo.sources?.hours} />
            </div>
          </div>
        )}

        {/* Contact person */}
        {quickInfo.contactName && (
          <div className="flex items-center gap-2">
            <MaterialIcon name="person" size={18} className="text-inbox-accent" />
            <div className="flex items-center">
              <span className="text-inbox-body text-inbox-text-primary">{quickInfo.contactName}</span>
              {quickInfo.contactTitle && (
                <span className="text-inbox-caption text-inbox-text-tertiary ml-1">
                  ({quickInfo.contactTitle})
                </span>
              )}
              <SourceIndicator source={quickInfo.sources?.contactName} />
            </div>
          </div>
        )}

        {/* Account/Policy number */}
        {quickInfo.accountNumber && (
          <div className="flex items-center gap-2">
            <MaterialIcon name="tag" size={18} className="text-inbox-accent" />
            <div className="flex items-center">
              <span className="text-inbox-caption text-inbox-text-tertiary">Account: </span>
              <span className="text-inbox-body text-inbox-text-primary font-mono">{quickInfo.accountNumber}</span>
              <SourceIndicator source={quickInfo.sources?.accountNumber} />
            </div>
          </div>
        )}

        {/* Email */}
        {quickInfo.email && (
          <div className="flex items-center gap-2">
            <MaterialIcon name="mail" size={18} className="text-inbox-accent" />
            <div className="flex items-center">
              <a
                href={`mailto:${quickInfo.email}`}
                className="text-inbox-body text-inbox-text-primary hover:text-inbox-accent transition-colors"
              >
                {quickInfo.email}
              </a>
              <SourceIndicator source={quickInfo.sources?.email} />
            </div>
          </div>
        )}

        {/* Deadline */}
        {quickInfo.deadline && (
          <div className="flex items-center gap-2">
            <MaterialIcon name="event" size={18} className="text-inbox-warning" />
            <div className="flex items-center">
              <span className="text-inbox-body text-inbox-warning font-medium">{quickInfo.deadline}</span>
              <SourceIndicator source={quickInfo.sources?.deadline} />
            </div>
          </div>
        )}

        {/* Website */}
        {quickInfo.website && (
          <div className="flex items-center gap-2">
            <MaterialIcon name="language" size={18} className="text-inbox-accent" />
            <div className="flex items-center min-w-0">
              <a
                href={quickInfo.website}
                onClick={(e) => {
                  e.preventDefault();
                  window.open(quickInfo.website!, '_blank', 'noopener,noreferrer');
                }}
                className="text-inbox-body text-inbox-accent hover:underline truncate"
              >
                {quickInfo.website.replace(/^https?:\/\//, '')}
              </a>
              <SourceIndicator source={quickInfo.sources?.website} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
