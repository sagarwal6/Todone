'use client';

import ReactMarkdown from 'react-markdown';

interface MarkdownProps {
  content: string;
  className?: string;
}

/**
 * Markdown renderer with Claude.ai-style formatting
 */
export function Markdown({ content, className = '' }: MarkdownProps) {
  return (
    <div className={`prose prose-sm max-w-none overflow-hidden break-words ${className}`}>
      <ReactMarkdown
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
        // Links - use window.open() to prevent PWA standalone mode from navigating away
        a: ({ href, children }) => (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              if (href) window.open(href, '_blank', 'noopener,noreferrer');
            }}
            className="text-inbox-accent hover:underline"
          >
            {children}
          </a>
        ),
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
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
