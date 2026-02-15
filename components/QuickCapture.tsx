'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MaterialIcon } from './ui/MaterialIcon';

interface QuickCaptureBarProps {
  onTap: () => void;
}

/**
 * Persistent pill-shaped bar docked above BottomNav.
 * Always visible on all mobile tabs. Tapping opens FullScreenCapture.
 */
export function QuickCaptureBar({ onTap }: QuickCaptureBarProps) {
  return (
    <div
      className="
        fixed left-4 right-4 z-40
        bottom-[calc(4rem+env(safe-area-inset-bottom))]
        mb-2
      "
    >
      <button
        onClick={onTap}
        className="
          w-full flex items-center gap-3
          px-4 py-3
          bg-surface-container-high
          rounded-xl
          shadow-md
          active:scale-[0.98] transition-transform duration-100
        "
      >
        <MaterialIcon
          name="add_circle"
          size={24}
          fill
          className="text-primary"
        />
        <span className="text-inbox-body text-inbox-text-tertiary">
          Add a task...
        </span>
      </button>
    </div>
  );
}

interface FullScreenCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string) => void;
}

/**
 * Full-screen overlay that slides up from bottom.
 * Large textarea, auto-focused, keyboard opens immediately.
 */
export function FullScreenCapture({ isOpen, onClose, onSave }: FullScreenCaptureProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mounted, setMounted] = useState(false);

  // Mount portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-focus textarea when opening
  useEffect(() => {
    if (isOpen) {
      // Small delay to let the animation start, then focus
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      // Reset value when closing
      setValue('');
    }
  }, [isOpen]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  const handleSave = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSave(trimmed);
      setValue('');
      onClose();
    }
  }, [value, onSave, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Cmd+Enter or Ctrl+Enter to save (useful on iPad with keyboard)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`
        fixed inset-0 z-50
        bg-inbox-bg-primary
        flex flex-col
        transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)]
        ${isOpen ? 'translate-y-0' : 'translate-y-full'}
      `}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-inbox-divider">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-full text-inbox-text-secondary hover:bg-inbox-bg-hover transition-colors"
          aria-label="Close"
        >
          <MaterialIcon name="arrow_back" size={24} />
        </button>
        <span className="text-inbox-body font-medium text-inbox-text-primary">
          New task
        </span>
        <button
          onClick={handleSave}
          disabled={!value.trim()}
          className="
            px-4 py-1.5 rounded-full
            text-inbox-body font-medium
            bg-primary text-on-primary
            disabled:opacity-38 disabled:cursor-not-allowed
            transition-colors duration-100
          "
        >
          Save
        </button>
      </div>

      {/* Input area */}
      <div className="flex-1 px-4 pt-6">
        <label className="text-inbox-caption text-inbox-text-tertiary mb-2 block">
          What do you need to get done?
        </label>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='e.g. "Reply to Sarah about the Q3 budget review"'
          className="
            w-full h-40
            text-2xl text-inbox-text-primary
            bg-transparent
            border-0 outline-none
            resize-none
            placeholder:text-inbox-text-tertiary/50
            placeholder:text-lg
          "
        />
      </div>
    </div>,
    document.body
  );
}
