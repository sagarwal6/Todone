'use client';

/**
 * EmailDraftCard Component - Inbox-style Clean Design
 *
 * Two modes based on threadId:
 * - New message (no threadId): To/Subject/Body editable + "Compose in Gmail" (pre-filled)
 * - Reply (has threadId): Original email + copyable draft + "Open Thread in Gmail"
 *
 * Follows Google Inbox principles: content-first, typography-driven hierarchy,
 * minimal chrome, no unnecessary boxes or borders.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import type { EmailDraft, PendingDraft } from '@/lib/ai/types';
import { openGmailCompose } from '@/lib/utils/gmail-compose';
import { openGmailThread } from '@/lib/email/gmail-links';

/**
 * Renders text with URLs and emails converted to subtle clickable links
 */
function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    // Combined regex for URLs and emails - subtle, non-intrusive styling
    const linkRegex = /(https?:\/\/[^\s<]+[^\s<.,;:!?'"\])>])|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const segments: { type: 'text' | 'url' | 'email'; content: string }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      // Determine if URL or email
      if (match[1]) {
        segments.push({ type: 'url', content: match[1] });
      } else if (match[2]) {
        segments.push({ type: 'email', content: match[2] });
      }
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      segments.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return segments;
  }, [text]);

  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (part.type === 'url') {
          return (
            <a
              key={i}
              href={part.content}
              onClick={(e) => {
                e.preventDefault();
                window.open(part.content, '_blank', 'noopener,noreferrer');
              }}
              className="text-inherit underline decoration-inbox-text-tertiary/40 hover:decoration-inbox-accent transition-colors break-all"
            >
              {part.content}
            </a>
          );
        }
        if (part.type === 'email') {
          return (
            <a
              key={i}
              href={`mailto:${part.content}`}
              className="text-inherit hover:text-inbox-accent transition-colors"
            >
              {part.content}
            </a>
          );
        }
        return <span key={i}>{part.content}</span>;
      })}
    </p>
  );
}

interface EmailDraftCardProps {
  draft: PendingDraft;
  taskId: string;
  onConfirm: (draftId: string, editedData?: EmailDraft) => Promise<void>;
  onReject: (draftId: string, feedback?: string) => Promise<void>;
  isLoading?: boolean;
  /** Called when user opens the draft in Gmail */
  onOpenInGmail?: (draftId: string) => void;
}

export function EmailDraftCard({
  draft,
  onReject,
  isLoading = false,
  onOpenInGmail,
}: EmailDraftCardProps) {
  const { data: session } = useSession();
  const emailData = draft.data as EmailDraft;
  const userEmail = session?.user?.email || undefined;
  const isReply = !!emailData.threadId;

  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<EmailDraft>(emailData);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (bodyRef.current && isEditing) {
      bodyRef.current.style.height = 'auto';
      bodyRef.current.style.height = bodyRef.current.scrollHeight + 'px';
    }
  }, [editedData.body, isEditing]);

  const handleOpenInGmail = useCallback(() => {
    if (isReply) {
      openGmailThread(emailData.threadId!, userEmail);
    } else {
      const draftToOpen = isEditing ? editedData : emailData;
      openGmailCompose(draftToOpen);
    }
    onOpenInGmail?.(draft.id);
  }, [isReply, isEditing, editedData, emailData, userEmail, draft.id, onOpenInGmail]);

  const handleCopyReply = useCallback(async () => {
    const textToCopy = isEditing ? editedData.body : emailData.body;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [isEditing, editedData.body, emailData.body]);

  const handleReject = useCallback(async () => {
    await onReject(draft.id, rejectFeedback || undefined);
    setShowRejectInput(false);
    setRejectFeedback('');
  }, [draft.id, rejectFeedback, onReject]);

  const handleStartEdit = () => {
    setIsEditing(true);
    setTimeout(() => bodyRef.current?.focus(), 0);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedData(emailData);
  };

  return (
    <div className="space-y-0">
      {/* Original Email (Collapsible) — shown in both modes */}
      {emailData.originalEmail && (
        <div className="border-t border-black/[0.06] py-4">
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className="w-full flex items-center gap-3 text-left group"
          >
            <span className="material-symbols-rounded text-xl text-inbox-text-tertiary transition-transform">
              {showOriginal ? 'expand_less' : 'expand_more'}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-medium uppercase tracking-wider text-inbox-text-tertiary">
                Original email
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[14px] font-medium text-inbox-text-primary truncate">
                  {emailData.originalEmail.fromName || emailData.originalEmail.from}
                </span>
                <span className="text-[13px] text-inbox-text-tertiary truncate">
                  {emailData.originalEmail.subject}
                </span>
              </div>
            </div>
            {emailData.originalEmail.date && (
              <span className="text-[13px] text-inbox-text-tertiary flex-shrink-0">
                {emailData.originalEmail.date}
              </span>
            )}
          </button>

          {showOriginal && (
            <div className="mt-4 ml-8 animate-fade-in">
              <LinkifiedText
                text={emailData.originalEmail.body}
                className="text-[14px] leading-relaxed text-inbox-text-secondary whitespace-pre-wrap"
              />
            </div>
          )}
        </div>
      )}

      {/* Draft section — differs by mode */}
      <div className="border-t border-black/[0.06] py-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-inbox-text-tertiary">
            {isReply ? 'Suggested reply' : 'Your draft reply'}
          </span>
        </div>

        {/* To / CC / Subject — only for new compose (not replies) */}
        {!isReply && (
          <>
            {/* To field */}
            <div className="flex items-start gap-2 mb-2">
              <span className="text-[13px] text-inbox-text-tertiary w-16 pt-0.5 flex-shrink-0">To</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editedData.to.join(', ')}
                  onChange={(e) =>
                    setEditedData({
                      ...editedData,
                      to: e.target.value.split(',').map((s) => s.trim()),
                    })
                  }
                  className="flex-1 text-[14px] text-inbox-text-primary bg-transparent border-b border-inbox-accent outline-none py-0.5 -my-0.5"
                />
              ) : (
                <span className="text-[14px] text-inbox-text-primary">
                  {emailData.to.join(', ')}
                </span>
              )}
            </div>

            {/* CC field (only show if has values) */}
            {(emailData.cc?.length ?? 0) > 0 && (
              <div className="flex items-start gap-2 mb-2">
                <span className="text-[13px] text-inbox-text-tertiary w-16 pt-0.5 flex-shrink-0">Cc</span>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedData.cc?.join(', ') || ''}
                    onChange={(e) =>
                      setEditedData({
                        ...editedData,
                        cc: e.target.value.split(',').map((s) => s.trim()),
                      })
                    }
                    className="flex-1 text-[14px] text-inbox-text-primary bg-transparent border-b border-inbox-accent outline-none py-0.5 -my-0.5"
                  />
                ) : (
                  <span className="text-[14px] text-inbox-text-primary">
                    {emailData.cc?.join(', ')}
                  </span>
                )}
              </div>
            )}

            {/* Subject field */}
            <div className="flex items-start gap-2 mb-4">
              <span className="text-[13px] text-inbox-text-tertiary w-16 pt-0.5 flex-shrink-0">Subject</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editedData.subject}
                  onChange={(e) => setEditedData({ ...editedData, subject: e.target.value })}
                  className="flex-1 text-[14px] font-medium text-inbox-text-primary bg-transparent border-b border-inbox-accent outline-none py-0.5 -my-0.5"
                />
              ) : (
                <span className="text-[14px] font-medium text-inbox-text-primary">
                  {emailData.subject}
                </span>
              )}
            </div>
          </>
        )}

        {/* Body */}
        <div className="relative">
          {isEditing ? (
            <textarea
              ref={bodyRef}
              value={editedData.body}
              onChange={(e) => setEditedData({ ...editedData, body: e.target.value })}
              className="
                w-full text-[15px] leading-relaxed text-inbox-text-primary
                bg-transparent outline-none resize-none
                border-l-2 border-inbox-accent pl-4 -ml-4
                min-h-[120px]
              "
            />
          ) : (
            <div
              onClick={handleStartEdit}
              className="
                text-[15px] leading-relaxed text-inbox-text-primary
                whitespace-pre-wrap cursor-text
                hover:bg-black/[0.02] -mx-3 px-3 py-2 -my-2 rounded
                transition-colors duration-100
              "
            >
              {emailData.body}
            </div>
          )}
        </div>

        {/* Reply mode: explanation text */}
        {isReply && (
          <p className="text-[12px] text-inbox-text-tertiary mt-3">
            Todone can read but not send emails on your behalf. Copy the reply text, then open the thread in Gmail to paste and send it.
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-black/[0.06] pt-4">
        {showRejectInput ? (
          <div className="space-y-3 animate-fade-in">
            <textarea
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="What would you like changed? (optional)"
              className="
                w-full text-[14px] text-inbox-text-primary
                bg-inbox-bg-input rounded-lg
                px-3 py-2.5 outline-none
                focus:ring-2 focus:ring-inbox-accent focus:ring-offset-0
                placeholder:text-inbox-text-tertiary
                resize-none
              "
              rows={2}
              autoFocus
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRejectInput(false)}
                className="text-[14px] text-inbox-text-secondary hover:text-inbox-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isLoading}
                className="text-[14px] font-medium text-inbox-error hover:opacity-80 transition-opacity disabled:opacity-50"
              >
                Discard draft
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3">
            {isEditing && (
              <button
                onClick={handleCancelEdit}
                className="
                  px-4 py-2 text-[14px] text-inbox-text-secondary
                  hover:text-inbox-text-primary hover:bg-inbox-bg-hover
                  rounded-full transition-colors duration-100
                "
              >
                Cancel
              </button>
            )}
            {!isEditing && (
              <button
                onClick={() => setShowRejectInput(true)}
                disabled={isLoading}
                className="
                  px-4 py-2 text-[14px] text-inbox-text-tertiary
                  hover:text-inbox-error hover:bg-red-50
                  rounded-full transition-colors duration-100 disabled:opacity-50
                "
              >
                Reject
              </button>
            )}
            <button
              onClick={handleStartEdit}
              disabled={isLoading || isEditing}
              className="
                px-4 py-2 text-[14px] text-inbox-text-secondary
                hover:text-inbox-text-primary hover:bg-inbox-bg-hover
                rounded-full transition-colors duration-100
                disabled:opacity-50 disabled:pointer-events-none
              "
            >
              Edit
            </button>

            {isReply ? (
              <>
                {/* Reply mode: Copy + Open Thread */}
                <button
                  onClick={handleCopyReply}
                  disabled={isLoading}
                  className="
                    flex items-center gap-2
                    px-5 py-2.5 text-[14px] font-medium
                    border border-inbox-accent text-inbox-accent
                    rounded-full
                    hover:bg-inbox-accent/5
                    active:scale-[0.98]
                    transition-all duration-100
                    disabled:opacity-50 disabled:pointer-events-none
                  "
                >
                  <span className="material-symbols-rounded text-lg">
                    {copied ? 'check' : 'content_copy'}
                  </span>
                  <span>{copied ? 'Copied!' : 'Copy Reply'}</span>
                </button>
                <button
                  onClick={handleOpenInGmail}
                  disabled={isLoading}
                  className="
                    flex items-center gap-2
                    px-5 py-2.5 text-[14px] font-medium
                    bg-inbox-accent text-white
                    rounded-full
                    hover:bg-inbox-accent-hover hover:shadow-md
                    active:scale-[0.98]
                    transition-all duration-100
                    disabled:opacity-50 disabled:pointer-events-none
                  "
                >
                  <span>Open Thread in Gmail</span>
                  <span className="material-symbols-rounded text-lg">open_in_new</span>
                </button>
              </>
            ) : (
              /* New compose mode: single Compose in Gmail button */
              <button
                onClick={handleOpenInGmail}
                disabled={isLoading}
                className="
                  flex items-center gap-2
                  px-5 py-2.5 text-[14px] font-medium
                  bg-inbox-accent text-white
                  rounded-full
                  hover:bg-inbox-accent-hover hover:shadow-md
                  active:scale-[0.98]
                  transition-all duration-100
                  disabled:opacity-50 disabled:pointer-events-none
                "
              >
                <span>Compose in Gmail</span>
                <span className="material-symbols-rounded text-lg">open_in_new</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailDraftCard;
