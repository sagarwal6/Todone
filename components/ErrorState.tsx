'use client';

/**
 * ErrorState Component
 *
 * Displays user-friendly error messages with retry options.
 * Handles different error types with appropriate UI.
 */

import { useMemo } from 'react';

export type ErrorType =
  | 'rate_limit'
  | 'permission'
  | 'network'
  | 'auth'
  | 'not_found'
  | 'server'
  | 'budget_exceeded'
  | 'cancelled'
  | 'generic';

interface ErrorStateProps {
  type: ErrorType;
  message?: string;
  details?: {
    limitType?: 'minute' | 'hour' | 'day';
    resetAt?: Date;
    missingScopes?: string[];
    partialResult?: unknown;
  };
  onRetry?: () => void;
  onDismiss?: () => void;
  onReconnect?: () => void;
}

export function ErrorState({
  type,
  message,
  details,
  onRetry,
  onDismiss,
  onReconnect,
}: ErrorStateProps) {
  const errorConfig = useMemo(() => {
    switch (type) {
      case 'rate_limit':
        return {
          icon: 'hourglass_top',
          iconColor: 'text-amber-600',
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          title: 'Rate Limit Reached',
          description: getRateLimitMessage(details?.limitType, details?.resetAt),
          showRetry: false,
          showDismiss: true,
        };

      case 'permission':
        return {
          icon: 'lock',
          iconColor: 'text-purple-600',
          bgColor: 'bg-purple-50',
          borderColor: 'border-purple-200',
          title: 'Permission Required',
          description: getPermissionMessage(details?.missingScopes),
          showRetry: false,
          showDismiss: true,
          showReconnect: true,
        };

      case 'network':
        return {
          icon: 'cloud_off',
          iconColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          title: 'Connection Error',
          description: message || 'Unable to connect to the server. Please check your internet connection.',
          showRetry: true,
          showDismiss: true,
        };

      case 'auth':
        return {
          icon: 'no_accounts',
          iconColor: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          title: 'Authentication Error',
          description: message || 'Your session has expired. Please sign in again.',
          showRetry: false,
          showDismiss: true,
          showReconnect: true,
        };

      case 'not_found':
        return {
          icon: 'search_off',
          iconColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          title: 'Not Found',
          description: message || 'The requested resource could not be found.',
          showRetry: false,
          showDismiss: true,
        };

      case 'server':
        return {
          icon: 'warning',
          iconColor: 'text-orange-600',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200',
          title: 'Server Error',
          description: message || 'Something went wrong on our end. Please try again.',
          showRetry: true,
          showDismiss: true,
        };

      case 'budget_exceeded':
        return {
          icon: 'savings',
          iconColor: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          title: 'Token Budget Exceeded',
          description: 'The task required more processing than expected. Some results may be partial.',
          showRetry: false,
          showDismiss: true,
        };

      case 'cancelled':
        return {
          icon: 'cancel',
          iconColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          title: 'Task Cancelled',
          description: message || 'The task was cancelled.',
          showRetry: true,
          showDismiss: true,
        };

      default:
        return {
          icon: 'error',
          iconColor: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          title: 'Something Went Wrong',
          description: message || 'An unexpected error occurred. Please try again.',
          showRetry: true,
          showDismiss: true,
        };
    }
  }, [type, message, details]);

  return (
    <div
      className={`rounded-xl border ${errorConfig.bgColor} ${errorConfig.borderColor} p-4`}
    >
      <div className="flex gap-3">
        <span
          className={`material-symbols-rounded ${errorConfig.iconColor} text-xl flex-shrink-0`}
        >
          {errorConfig.icon}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900">{errorConfig.title}</h4>
          <p className="text-sm text-gray-600 mt-1">{errorConfig.description}</p>

          {/* Actions */}
          <div className="flex gap-2 mt-3">
            {errorConfig.showRetry && onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="material-symbols-rounded text-base">refresh</span>
                Try Again
              </button>
            )}

            {errorConfig.showReconnect && onReconnect && (
              <button
                onClick={onReconnect}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <span className="material-symbols-rounded text-base">link</span>
                Reconnect
              </button>
            )}

            {errorConfig.showDismiss && onDismiss && (
              <button
                onClick={onDismiss}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getRateLimitMessage(
  limitType?: 'minute' | 'hour' | 'day',
  resetAt?: Date
): string {
  if (!limitType || !resetAt) {
    return 'You\'ve reached the rate limit. Please wait before trying again.';
  }

  const now = new Date();
  const diff = resetAt.getTime() - now.getTime();
  const minutes = Math.ceil(diff / (1000 * 60));
  const hours = Math.ceil(diff / (1000 * 60 * 60));

  switch (limitType) {
    case 'minute':
      return `Too many requests. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''}.`;
    case 'hour':
      return `Hourly limit reached. Please wait ${minutes > 60 ? `${hours} hour${hours !== 1 ? 's' : ''}` : `${minutes} minute${minutes !== 1 ? 's' : ''}`}.`;
    case 'day':
      return `Daily limit reached. You can try again tomorrow.`;
    default:
      return 'Rate limit reached. Please try again later.';
  }
}

function getPermissionMessage(missingScopes?: string[]): string {
  if (!missingScopes || missingScopes.length === 0) {
    return 'Additional permissions are required to complete this action.';
  }

  const scopeNames: Record<string, string> = {
    'https://www.googleapis.com/auth/gmail.readonly': 'Gmail (read)',
    'https://www.googleapis.com/auth/gmail.send': 'Gmail (send)',
    'https://www.googleapis.com/auth/gmail.compose': 'Gmail (compose)',
    'https://www.googleapis.com/auth/calendar': 'Google Calendar',
    'https://www.googleapis.com/auth/calendar.events': 'Calendar events',
    'https://www.googleapis.com/auth/contacts.readonly': 'Contacts',
  };

  const names = missingScopes.map((s) => scopeNames[s] || s.split('/').pop());
  return `Please grant access to: ${names.join(', ')}`;
}

/**
 * Compact inline error message
 */
export function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-red-600">
      <span className="material-symbols-rounded text-base">error</span>
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-red-700 hover:underline font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export default ErrorState;
