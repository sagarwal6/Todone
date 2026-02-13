/**
 * Error Handling Utilities
 *
 * Provides consistent error handling across the application.
 * Parses errors from various sources and returns user-friendly messages.
 */

import type { ErrorType } from '@/components/ErrorState';

export interface ParsedError {
  type: ErrorType;
  message: string;
  details?: {
    limitType?: 'minute' | 'hour' | 'day';
    resetAt?: Date;
    missingScopes?: string[];
    partialResult?: unknown;
  };
  recoverable: boolean;
}

/**
 * Parse an API response error
 */
export function parseApiError(response: Response, body?: unknown): ParsedError {
  const status = response.status;

  // Rate limit
  if (status === 429) {
    const errorBody = body as {
      limitType?: string;
      resetAt?: string;
    } | undefined;

    return {
      type: 'rate_limit',
      message: 'Rate limit exceeded',
      details: {
        limitType: errorBody?.limitType as 'minute' | 'hour' | 'day' | undefined,
        resetAt: errorBody?.resetAt ? new Date(errorBody.resetAt) : undefined,
      },
      recoverable: true,
    };
  }

  // Auth errors
  if (status === 401) {
    return {
      type: 'auth',
      message: 'Authentication required. Please sign in again.',
      recoverable: true,
    };
  }

  // Permission errors
  if (status === 403) {
    return {
      type: 'permission',
      message: 'You don\'t have permission to perform this action.',
      recoverable: false,
    };
  }

  // Not found
  if (status === 404) {
    return {
      type: 'not_found',
      message: 'The requested resource was not found.',
      recoverable: false,
    };
  }

  // Conflict (e.g., task already running)
  if (status === 409) {
    const errorBody = body as { error?: string } | undefined;
    return {
      type: 'generic',
      message: errorBody?.error || 'Conflict occurred. Please try again.',
      recoverable: true,
    };
  }

  // Server errors
  if (status >= 500) {
    return {
      type: 'server',
      message: 'A server error occurred. Please try again later.',
      recoverable: true,
    };
  }

  // Default
  const errorBody = body as { error?: string } | undefined;
  return {
    type: 'generic',
    message: errorBody?.error || 'An error occurred. Please try again.',
    recoverable: true,
  };
}

/**
 * Parse a JavaScript error
 */
export function parseError(error: unknown): ParsedError {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: 'network',
      message: 'Unable to connect to the server. Please check your internet connection.',
      recoverable: true,
    };
  }

  // Abort errors
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      type: 'cancelled',
      message: 'The operation was cancelled.',
      recoverable: true,
    };
  }

  // Timeout errors
  if (error instanceof Error && error.message.includes('timeout')) {
    return {
      type: 'network',
      message: 'The request timed out. Please try again.',
      recoverable: true,
    };
  }

  // Default
  const message = error instanceof Error ? error.message : String(error);
  return {
    type: 'generic',
    message,
    recoverable: true,
  };
}

/**
 * Parse agent failure state
 */
export function parseAgentFailure(failureState: {
  status: 'failed';
  attempted: string[];
  succeeded: string[];
  failed: { tool: string; error: string }[];
  reason: string;
  partialResult?: unknown;
}): ParsedError {
  // Check for specific failure patterns
  const firstFailedTool = failureState.failed[0];

  if (firstFailedTool?.error.includes('token expired') ||
      firstFailedTool?.error.includes('unauthorized')) {
    return {
      type: 'auth',
      message: 'Your session has expired. Please sign in again.',
      recoverable: true,
    };
  }

  if (firstFailedTool?.error.includes('permission') ||
      firstFailedTool?.error.includes('forbidden')) {
    return {
      type: 'permission',
      message: 'Missing permissions. Please reconnect your Google account.',
      details: {
        missingScopes: extractMissingScopes(firstFailedTool.error),
      },
      recoverable: true,
    };
  }

  if (firstFailedTool?.error.includes('rate limit')) {
    return {
      type: 'rate_limit',
      message: 'API rate limit reached.',
      recoverable: true,
    };
  }

  // Default failure
  return {
    type: 'generic',
    message: failureState.reason,
    details: {
      partialResult: failureState.partialResult,
    },
    recoverable: failureState.succeeded.length > 0, // Some progress was made
  };
}

/**
 * Extract missing scopes from error message
 */
function extractMissingScopes(error: string): string[] | undefined {
  // Simple extraction - could be improved
  const scopePatterns = [
    'gmail.readonly',
    'gmail.send',
    'gmail.compose',
    'calendar',
    'calendar.events',
    'contacts.readonly',
  ];

  const found = scopePatterns.filter((scope) =>
    error.toLowerCase().includes(scope)
  );

  if (found.length > 0) {
    return found.map((s) => `https://www.googleapis.com/auth/${s}`);
  }

  return undefined;
}

/**
 * Check if error is recoverable by retrying
 */
export function isRetryable(error: ParsedError): boolean {
  return (
    error.type === 'network' ||
    error.type === 'server' ||
    error.type === 'rate_limit' ||
    error.type === 'cancelled'
  );
}

/**
 * Get user-friendly action text for error type
 */
export function getErrorActionText(error: ParsedError): string | null {
  switch (error.type) {
    case 'rate_limit':
      return 'Wait and try again';
    case 'permission':
      return 'Grant permissions';
    case 'auth':
      return 'Sign in again';
    case 'network':
      return 'Check connection and retry';
    case 'server':
      return 'Try again later';
    case 'cancelled':
      return 'Start again';
    default:
      return error.recoverable ? 'Try again' : null;
  }
}
