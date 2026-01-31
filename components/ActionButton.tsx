'use client';

import { useCallback, useState } from 'react';
import { Action } from '@/lib/types';
import { MaterialIcon } from './ui/MaterialIcon';

interface ActionButtonProps {
  action: Action;
}

export function ActionButton({ action }: ActionButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(() => {
    switch (action.type) {
      case 'link':
        window.open(action.value, '_blank', 'noopener,noreferrer');
        break;
      case 'phone':
        window.location.href = action.value.startsWith('tel:')
          ? action.value
          : `tel:${action.value}`;
        break;
      case 'email':
        window.location.href = action.value.startsWith('mailto:')
          ? action.value
          : `mailto:${action.value}`;
        break;
      case 'copy':
        navigator.clipboard.writeText(action.value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
        break;
    }
  }, [action]);

  const getIconName = (): string => {
    switch (action.type) {
      case 'link':
        return 'open_in_new';
      case 'phone':
        return 'call';
      case 'email':
        return 'mail';
      case 'copy':
        return copied ? 'check' : 'content_copy';
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`
        inline-flex items-center gap-1.5
        px-4 py-2
        text-label-large font-medium
        rounded-pill
        transition-all duration-200 ease-md-standard
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        state-layer
        ${
          action.isPrimary
            ? 'bg-primary text-on-primary hover:shadow-elevation-1'
            : 'bg-secondary-container text-on-secondary-container'
        }
      `}
    >
      <MaterialIcon name={getIconName()} size="small" />
      {copied ? 'Copied!' : action.label}
    </button>
  );
}
