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
  onReject: (draftId: string, feedback?: string) => Promise<void>;
  onRefine?: (draftId: string, feedback: string, editedDraft?: EmailDraft) => void;
  isLoading?: boolean;
  /** Called when user opens the draft in Gmail */
  onOpenInGmail?: (draftId: string) => void;
}

export function EmailDraftCard({
  draft,
  onReject,
  onRefine,
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
  const [instruction, setInstruction] = useState('');
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const instructionRef = useRef<HTMLInputElement>(null);

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
    await onReject(draft.id);
  }, [draft.id, onReject]);

  const handleStartEdit = () => {
    setIsEditing(true);
    setTimeout(() => bodyRef.current?.focus(), 0);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedData(emailData);
    setInstruction('');
  };

  const handleRedraft = useCallback(() => {
    const feedbackText = instruction.trim() || 'I\'ve edited the draft directly. Please refine based on my changes.';
    onRefine?.(draft.id, feedbackText, editedData);
    setInstruction('');
  }, [draft.id, instruction, editedData, onRefine]);

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
            <div className="border-l-2 border-inbox-accent pl-4 -ml-4">
              <textarea
                ref={bodyRef}
                value={editedData.body}
                onChange={(e) => setEditedData({ ...editedData, body: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleRedraft();
                  }
                }}
                className="
                  w-full text-[15px] leading-relaxed text-inbox-text-primary
                  bg-transparent outline-none resize-none
                  min-h-[120px]
                "
              />
              {/* Inline instruction bar + Redraft */}
              {onRefine && (
                <div className="flex items-center gap-2 pt-3 border-t border-black/[0.04]">
                  <span className="material-symbols-rounded text-lg text-inbox-accent flex-shrink-0">auto_fix_high</span>
                  <input
                    ref={instructionRef}
                    type="text"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleRedraft();
                      }
                    }}
                    placeholder="Add instructions (optional)..."
                    className="
                      flex-1 text-[13px] text-inbox-text-primary bg-transparent outline-none
                      placeholder:text-inbox-text-tertiary
                    "
                  />
                  <button
                    onClick={handleRedraft}
                    className="
                      px-4 py-1.5 text-[13px] font-medium
                      bg-inbox-accent text-white
                      rounded-full
                      hover:bg-inbox-accent-hover
                      active:scale-[0.98]
                      transition-all duration-100
                      flex-shrink-0
                    "
                  >
                    Redraft
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              onClick={handleStartEdit}
              className="
                text-[15px] leading-relaxed text-inbox-text-primary
                whitespace-pre-wrap cursor-text group relative
                hover:bg-black/[0.02] -mx-3 px-3 py-2 -my-2 rounded
                transition-colors duration-100
              "
            >
              <span
                className="material-symbols-rounded text-lg text-inbox-text-tertiary absolute top-2 right-2 opacity-0 group-hover:opacity-60 transition-opacity duration-150 hidden sm:block"
                aria-hidden="true"
              >
                edit
              </span>
              {emailData.body}
              <p className="text-[11px] text-inbox-text-tertiary mt-1 sm:hidden">Tap to edit</p>
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
        <div className="flex items-center gap-3">
          {/* Left: Discard + Cancel */}
          <button
            onClick={handleReject}
            disabled={isLoading}
            className="
              px-4 py-2 text-[14px] text-inbox-text-tertiary
              hover:text-inbox-error hover:bg-red-50
              rounded-full transition-colors duration-100 disabled:opacity-50
            "
          >
            Discard
          </button>
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

          <div className="flex-1" />

          {/* Right: Gmail actions */}
          {isReply ? (
            <>
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
                <span>{copied ? 'Copied!' : 'Copy'}</span>
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
                <span>Open in Gmail</span>
                <span className="material-symbols-rounded text-lg">open_in_new</span>
              </button>
            </>
          ) : (
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
      </div>
    </div>
  );
}

export default EmailDraftCard;
