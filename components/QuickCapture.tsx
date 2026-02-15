'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MaterialIcon } from './ui/MaterialIcon';

// Check if Web Speech API is available
function hasSpeechRecognition(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

interface QuickCaptureBarProps {
  onTap: () => void;
  onMicTap?: () => void;
}

/**
 * Persistent pill-shaped bar docked above BottomNav.
 * Always visible on all mobile tabs. Tapping opens FullScreenCapture.
 * Mic icon on the right opens capture with voice already active.
 */
export function QuickCaptureBar({ onTap, onMicTap }: QuickCaptureBarProps) {
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    setSpeechSupported(hasSpeechRecognition());
  }, []);

  return (
    <div
      className="
        fixed left-4 right-4 z-40
        bottom-[calc(4rem+env(safe-area-inset-bottom))]
        mb-2
      "
    >
      <div
        className="
          w-full flex items-center
          bg-inbox-bg-primary
          border border-inbox-divider
          rounded-2xl
          shadow-inbox-subtle
        "
      >
        {/* Main tap zone: opens typing capture */}
        <button
          onClick={onTap}
          className="
            flex-1 flex items-center gap-3
            px-4 py-3
            rounded-2xl
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

        {/* Mic tap zone: opens capture with voice active */}
        {speechSupported && onMicTap && (
          <>
            <button
              onClick={onMicTap}
              className="
                px-4 py-3
                rounded-r-2xl
                active:scale-95 transition-transform duration-100
              "
              aria-label="Add task with voice"
            >
              <MaterialIcon
                name="mic"
                size={22}
                className="text-primary"
              />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface FullScreenCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string) => void;
  startWithVoice?: boolean;
}

/**
 * Full-screen overlay that slides up from bottom.
 * Clean, focused input with subtle encouragement.
 */
export function FullScreenCapture({ isOpen, onClose, onSave, startWithVoice = false }: FullScreenCaptureProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Mount portal + check speech support
  useEffect(() => {
    setMounted(true);
    setSpeechSupported(hasSpeechRecognition());
  }, []);

  // Auto-focus input when opening
  useEffect(() => {
    if (isOpen) {
      // Small delay to let the animation start, then focus
      const timer = setTimeout(() => {
        inputRef.current?.focus();
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
    // Enter to save (natural for single-line input)
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      onClose();
    }
  }, [handleSave, onClose]);

  // Stop listening when closing
  useEffect(() => {
    if (!isOpen && recognitionRef.current) {
      recognitionRef.current.abort();
      setIsListening(false);
    }
  }, [isOpen]);

  const toggleVoice = useCallback(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim = transcript;
        }
      }
      // Show interim results in real-time
      setValue(prev => {
        const base = prev.endsWith(interim) ? prev.slice(0, -interim.length) : prev;
        return (finalTranscript || base) + (interim ? interim : '');
      });
    };

    recognition.onend = () => {
      setIsListening(false);
      if (finalTranscript) {
        setValue(finalTranscript);
      }
      recognitionRef.current = null;
      // Focus the input after voice
      inputRef.current?.focus();
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // Auto-start voice when opened with startWithVoice
  const hasTriggeredVoiceRef = useRef(false);

  useEffect(() => {
    if (isOpen && startWithVoice && speechSupported && !hasTriggeredVoiceRef.current) {
      hasTriggeredVoiceRef.current = true;
      // Delay to let overlay animate in before mic permission prompt
      const timer = setTimeout(() => {
        toggleVoice();
      }, 350);
      return () => clearTimeout(timer);
    }
    if (!isOpen) {
      hasTriggeredVoiceRef.current = false;
    }
  }, [isOpen, startWithVoice, speechSupported, toggleVoice]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`
        fixed inset-0 z-50
        bg-surface-bright
        flex flex-col
        transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)]
        ${isOpen ? 'translate-y-0' : 'translate-y-full'}
      `}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-inbox-divider bg-inbox-bg-secondary/50">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-full text-inbox-text-secondary hover:bg-inbox-bg-hover active:bg-inbox-bg-hover/80 transition-colors"
          aria-label="Close"
        >
          <MaterialIcon name="close" size={24} />
        </button>
        <span className="text-inbox-body font-medium text-primary">
          New task
        </span>
        <button
          onClick={handleSave}
          disabled={!value.trim()}
          className={`
            px-4 py-1.5 rounded-full
            text-inbox-body font-medium
            transition-all duration-150
            ${value.trim()
              ? 'bg-primary text-on-primary active:scale-95 scale-100'
              : 'text-inbox-text-tertiary/40 bg-inbox-bg-secondary cursor-not-allowed scale-95'
            }
          `}
        >
          Save
        </button>
      </div>

      {/* Input area - centered vertically for focus */}
      <div className="flex-1 flex items-start px-6 pt-12">
        <div className="w-full max-w-2xl mx-auto">
          {/* Checkmark icon for subtle encouragement */}
          <div className="flex items-start gap-4">
            <div className="mt-2 shrink-0">
              <MaterialIcon
                name="check_circle"
                size={28}
                className={`transition-all duration-300 ${
                  value.trim()
                    ? 'text-primary scale-110'
                    : 'text-primary/25 scale-100'
                }`}
              />
            </div>

            {/* Auto-sizing input */}
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What can I help you with?"
                className="
                  w-full
                  text-2xl text-inbox-text-primary
                  bg-transparent
                  border-0 outline-none
                  placeholder:text-inbox-text-tertiary/40
                  pb-2
                  border-b-2 border-transparent
                  focus:border-primary/40
                  transition-colors duration-200
                "
                autoComplete="off"
                autoCapitalize="sentences"
              />

              {/* Hint text when empty */}
              {!value && (
                <p className="mt-3 text-xs font-normal text-inbox-text-tertiary/40 leading-relaxed">
                  Try: &quot;Reply to Sarah&quot; or &quot;Schedule dentist appointment&quot;
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Voice input FAB */}
      {speechSupported && (
        <div
          className="px-6 pb-6 flex justify-end"
          style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={toggleVoice}
            className={`
              w-14 h-14 rounded-full
              flex items-center justify-center
              shadow-inbox-elevated
              active:scale-95 transition-all duration-150
              ${isListening
                ? 'bg-inbox-error animate-[mic-pulse_1.5s_ease-in-out_infinite]'
                : 'bg-primary hover:bg-inbox-accent-hover'
              }
            `}
            aria-label={isListening ? 'Stop recording' : 'Voice input'}
          >
            <MaterialIcon
              name={isListening ? 'stop' : 'mic'}
              size={24}
              className="text-on-primary"
            />
          </button>
          {isListening && (
            <div className="absolute bottom-24 right-6 flex justify-center" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
              <span className="text-inbox-caption font-medium text-primary bg-inbox-accent-light px-3 py-1 rounded-full">
                Listening...
              </span>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
