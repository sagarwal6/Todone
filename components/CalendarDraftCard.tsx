'use client';

/**
 * CalendarDraftCard Component
 *
 * Displays a calendar event draft for user review and confirmation.
 * Supports editing, confirming, and rejecting drafts.
 */

import { useState, useCallback, useMemo } from 'react';
import type { CalendarEventDraft, PendingDraft } from '@/lib/ai/types';
import { generateCalendarEventUrl } from '@/lib/utils/gmail-compose';
import { openNativeAppWithFallback } from '@/lib/email/gmail-links';

interface CalendarDraftCardProps {
  draft: PendingDraft;
  taskId: string;
  onConfirm: (draftId: string, editedData?: CalendarEventDraft) => Promise<void>;
  onReject: (draftId: string, feedback?: string) => Promise<void>;
  isLoading?: boolean;
  /** Called when user opens the event in Google Calendar */
  onOpenInCalendar?: (draftId: string) => void;
}

export function CalendarDraftCard({
  draft,
  taskId,
  onConfirm,
  onReject,
  isLoading = false,
  onOpenInCalendar,
}: CalendarDraftCardProps) {
  const eventData = draft.data as CalendarEventDraft;

  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<CalendarEventDraft>(eventData);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');

  // Format dates for display
  const formattedStart = useMemo(() => {
    const date = new Date(eventData.start.dateTime);
    return {
      date: date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    };
  }, [eventData.start.dateTime]);

  const formattedEnd = useMemo(() => {
    const date = new Date(eventData.end.dateTime);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [eventData.end.dateTime]);

  const duration = useMemo(() => {
    const start = new Date(eventData.start.dateTime);
    const end = new Date(eventData.end.dateTime);
    const minutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));

    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (remainingMins === 0) {
      return `${hours} hr`;
    }
    return `${hours} hr ${remainingMins} min`;
  }, [eventData.start.dateTime, eventData.end.dateTime]);

  const handleConfirm = useCallback(async () => {
    if (isEditing) {
      await onConfirm(draft.id, editedData);
    } else {
      await onConfirm(draft.id);
    }
  }, [draft.id, isEditing, editedData, onConfirm]);

  const handleReject = useCallback(async () => {
    await onReject(draft.id, rejectFeedback || undefined);
    setShowRejectDialog(false);
    setRejectFeedback('');
  }, [draft.id, rejectFeedback, onReject]);

  const handleOpenInCalendar = useCallback(() => {
    const dataToOpen = isEditing ? editedData : eventData;
    const url = generateCalendarEventUrl({
      title: dataToOpen.summary,
      description: dataToOpen.description,
      startTime: new Date(dataToOpen.start.dateTime),
      endTime: new Date(dataToOpen.end.dateTime),
      location: dataToOpen.location,
      attendees: dataToOpen.attendees?.map(a => a.email),
    });
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      // Try Google Calendar app, fall back to web
      const calDeepLink = `googlecalendar://`;
      openNativeAppWithFallback(calDeepLink, url);
    } else {
      window.open(url, '_blank');
    }
    onOpenInCalendar?.(draft.id);
  }, [isEditing, editedData, eventData, draft.id, onOpenInCalendar]);

  // Convert datetime-local format
  const toDatetimeLocal = (isoString: string) => {
    const date = new Date(isoString);
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
  };

  const fromDatetimeLocal = (localString: string, timezone: string) => {
    return {
      dateTime: new Date(localString).toISOString(),
      timeZone: timezone,
    };
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-green-50 px-4 py-3 border-b border-green-100 flex items-center gap-2">
        <span className="material-symbols-rounded text-green-600">event</span>
        <span className="font-medium text-green-900">Calendar Event</span>
        <span className="text-xs text-green-600 ml-auto">
          Awaiting your confirmation
        </span>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Title */}
        <div>
          {isEditing ? (
            <input
              type="text"
              value={editedData.summary}
              onChange={(e) =>
                setEditedData({ ...editedData, summary: e.target.value })
              }
              className="w-full text-lg font-semibold border border-gray-300 rounded px-2 py-1"
              placeholder="Event title"
            />
          ) : (
            <h3 className="text-lg font-semibold text-gray-900">
              {eventData.summary}
            </h3>
          )}
        </div>

        {/* Date & Time */}
        <div className="flex items-center gap-3">
          <span className="material-symbols-rounded text-gray-400">
            schedule
          </span>
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={toDatetimeLocal(editedData.start.dateTime)}
                onChange={(e) =>
                  setEditedData({
                    ...editedData,
                    start: fromDatetimeLocal(e.target.value, editedData.start.timeZone),
                  })
                }
                className="text-sm border border-gray-300 rounded px-2 py-1"
              />
              <span className="text-gray-400">to</span>
              <input
                type="datetime-local"
                value={toDatetimeLocal(editedData.end.dateTime)}
                onChange={(e) =>
                  setEditedData({
                    ...editedData,
                    end: fromDatetimeLocal(e.target.value, editedData.end.timeZone),
                  })
                }
                className="text-sm border border-gray-300 rounded px-2 py-1"
              />
            </div>
          ) : (
            <div className="text-sm">
              <span className="font-medium text-gray-900">
                {formattedStart.date}
              </span>
              <span className="text-gray-600 ml-2">
                {formattedStart.time} - {formattedEnd}
              </span>
              <span className="text-gray-400 ml-2">({duration})</span>
            </div>
          )}
        </div>

        {/* Location */}
        {(eventData.location || isEditing) && (
          <div className="flex items-center gap-3">
            <span className="material-symbols-rounded text-gray-400">
              location_on
            </span>
            {isEditing ? (
              <input
                type="text"
                value={editedData.location || ''}
                onChange={(e) =>
                  setEditedData({ ...editedData, location: e.target.value })
                }
                className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                placeholder="Add location"
              />
            ) : (
              <span className="text-sm text-gray-700">{eventData.location}</span>
            )}
          </div>
        )}

        {/* Attendees */}
        {(eventData.attendees?.length ?? 0) > 0 && (
          <div className="flex items-start gap-3">
            <span className="material-symbols-rounded text-gray-400 mt-0.5">
              group
            </span>
            <div className="flex-1">
              {isEditing ? (
                <input
                  type="text"
                  value={editedData.attendees?.map((a) => a.email).join(', ') || ''}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      attendees: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((email) => ({ email })),
                    })
                  }
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                  placeholder="Attendee emails (comma-separated)"
                />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {eventData.attendees?.map((attendee, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full"
                    >
                      {attendee.displayName || attendee.email}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {(eventData.description || isEditing) && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <span className="material-symbols-rounded text-base">
                description
              </span>
              <span>Description</span>
            </div>
            {isEditing ? (
              <textarea
                value={editedData.description || ''}
                onChange={(e) =>
                  setEditedData({ ...editedData, description: e.target.value })
                }
                className="w-full text-sm border border-gray-300 rounded p-2 min-h-[80px] resize-y"
                placeholder="Add description"
              />
            ) : (
              <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                {eventData.description}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
        {isEditing ? (
          <>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditedData(eventData);
              }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              disabled={isLoading}
            >
              Cancel Edit
            </button>
            <div className="flex-1" />
            <button
              onClick={handleOpenInCalendar}
              disabled={isLoading}
              className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <span className="material-symbols-rounded text-sm">open_in_new</span>
              Open in Calendar
            </button>
          </>
        ) : showRejectDialog ? (
          <div className="w-full space-y-2">
            <textarea
              placeholder="Optional: Why are you rejecting this event? (helps improve future suggestions)"
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded p-2 resize-none"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isLoading}
                className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowRejectDialog(true)}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              disabled={isLoading}
            >
              Reject
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              disabled={isLoading}
            >
              Edit
            </button>
            <div className="flex-1" />
            <button
              onClick={handleOpenInCalendar}
              disabled={isLoading}
              className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <span className="material-symbols-rounded text-sm">open_in_new</span>
              Open in Calendar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default CalendarDraftCard;
