'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  content: string;
  className?: string;
}

/**
 * Auto-link bare phone numbers in text.
 * Matches formats: (123) 456-7890, 123-456-7890, +1 123-456-7890, 1-800-207-7847
 * Skips numbers inside markdown links [text](url) by splitting on link boundaries first.
 */
function autoLinkPhones(text: string): string {
  // Split text into markdown links and non-link segments
  // This prevents matching phone numbers inside [link text](url)
  const linkPattern = /\[[^\]]*\]\([^)]*\)/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match;

  while ((match = linkPattern.exec(text)) !== null) {
    // Add non-link text before this match (will be processed)
    if (match.index > lastIndex) {
      parts.push(processPhones(text.slice(lastIndex, match.index)));
    }
    // Add the link as-is (no processing)
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }

  // Add remaining non-link text
  if (lastIndex < text.length) {
    parts.push(processPhones(text.slice(lastIndex)));
  }

  return parts.join('');
}

/** Wrap bare phone numbers in tel: links */
function processPhones(text: string): string {
  return text.replace(
    /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g,
    (match) => {
      const digits = match.replace(/\D/g, '');
      return `[${match}](tel:${digits})`;
    }
  );
}

/**
 * Markdown renderer with Claude.ai-style formatting
 */
export function Markdown({ content, className = '' }: MarkdownProps) {
  const processed = autoLinkPhones(content);

  return (
    <div className={`prose prose-sm max-w-none overflow-hidden break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => {
          // Allow tel: and sms: protocols (blocked by default sanitization)
          if (url.startsWith('tel:') || url.startsWith('sms:')) return url;
          // Keep default behavior for everything else (allows http, https, mailto)
          return url;
        }}
        components={{
        // Headers
        h1: ({ children }) => (
          <h1 className="text-lg font-semibold text-inbox-text-primary mt-4 mb-2 first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-semibold text-inbox-text-primary mt-4 mb-2 first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold text-inbox-text-primary mt-3 mb-1 first:mt-0">
            {children}
          </h3>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="text-inbox-body text-inbox-text-primary leading-relaxed mb-3 last:mb-0">
            {children}
          </p>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="list-disc list-outside ml-4 mb-3 space-y-1 text-inbox-body text-inbox-text-primary">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside ml-4 mb-3 space-y-1 text-inbox-body text-inbox-text-primary">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed pl-1">
            {children}
          </li>
        ),
        // Strong/Bold
        strong: ({ children }) => (
          <strong className="font-semibold text-inbox-text-primary">
            {children}
          </strong>
        ),
        // Emphasis/Italic
        em: ({ children }) => (
          <em className="italic">
            {children}
          </em>
        ),
        // Links - tel:/sms: let browser handle natively, others open in new tab
        a: ({ href, children }) => {
          const isProtocolLink = href?.startsWith('tel:') || href?.startsWith('sms:');
          return (
            <a
              href={href}
              onClick={isProtocolLink ? undefined : (e) => {
                e.preventDefault();
                if (href) window.open(href, '_blank', 'noopener,noreferrer');
              }}
              className="text-inbox-accent hover:underline"
            >
              {children}
            </a>
          );
        },
        // Code
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 bg-inbox-bg-hover rounded text-sm font-mono text-inbox-text-primary">
                {children}
              </code>
            );
          }
          return (
            <code className={`block p-3 bg-inbox-bg-hover rounded-lg text-sm font-mono overflow-x-auto ${className}`} {...props}>
              {children}
            </code>
          );
        },
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-inbox-accent pl-4 italic text-inbox-text-secondary my-3">
            {children}
          </blockquote>
        ),
        // Horizontal rule
        hr: () => (
          <hr className="border-inbox-divider my-4" />
        ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
