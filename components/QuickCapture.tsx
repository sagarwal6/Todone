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
          border border-inbox-divider-strong
          rounded-2xl
          shadow-inbox-elevated
          ring-1 ring-primary/[0.07]
        "
      >
        {/* Main tap zone: opens typing capture */}
        <button
          onClick={onTap}
          className="
            flex-1 flex items-center gap-3
            px-4 py-3.5
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
          <span className="text-inbox-body-medium text-inbox-text-secondary">
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
  const [value, _setValue] = useState('');
  const inputRef = useRef<HTMLDivElement>(null);

  // Wrapper to keep contentEditable div in sync with state
  const setValue = useCallback((v: string, fromInput = false) => {
    _setValue(v);
    // Update contentEditable div if change came from outside (e.g., voice, clear)
    if (!fromInput && inputRef.current) {
      inputRef.current.textContent = v;
    }
  }, []);
  const doneTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [mounted, setMounted] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Voice state machine: idle → listening → done → idle
  // (permission prompt removed — browser handles its own prompt on first use,
  //  and we handle the denied case in onerror)
  type VoiceState = 'idle' | 'listening' | 'done';
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  const isVoiceActive = voiceState !== 'idle';

  // Mount portal + check speech support
  useEffect(() => {
    setMounted(true);
    setSpeechSupported(hasSpeechRecognition());
  }, []);

  // ── Single entry point for ALL voice activation ──
  // Every mic tap, FAB press, and auto-start goes through this one function.
  // No duplicate logic, no divergent code paths.
  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    // If already listening, ignore (prevents double-start)
    if (recognitionRef.current) return;

    // Reset transcript state
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    bestTextRef.current = '';
    setFinalTranscript('');
    setInterimTranscript('');

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      finalTranscriptRef.current = final;
      interimTranscriptRef.current = interim;
      // Track the best (longest) text we've seen — survives any later clearing
      const currentBest = (final || interim).trim();
      if (currentBest.length > bestTextRef.current.length) {
        bestTextRef.current = currentBest;
      }
      setFinalTranscript(final);
      setInterimTranscript(interim);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setInterimTranscript('');
      // Triple fallback for iOS Safari quirks:
      // 1. Final transcript (normal path — engine finalized results)
      // 2. Interim transcript (stop() fired before finalization)
      // 3. Best text seen (safety net — survives any clearing by late events)
      const text = (
        finalTranscriptRef.current ||
        interimTranscriptRef.current ||
        bestTextRef.current
      ).trim();
      if (text) {
        setValue(text);
        setVoiceState('done');
      } else {
        // Truly no text captured — return to idle
        setVoiceState('idle');
      }
    };

    recognition.onerror = (event: Event) => {
      // Don't set state here — onend always fires after onerror and handles
      // the state transition. Setting idle here would race with onend's done
      // transition if text was already captured.
      // Exception: 'not-allowed' means mic permission denied, no onend may follow
      // on some browsers, so handle it explicitly.
      const errorEvent = event as Event & { error?: string };
      if (errorEvent.error === 'not-allowed' || errorEvent.error === 'service-not-allowed') {
        recognitionRef.current = null;
        setVoiceState('idle');
      }
      // For all other errors (no-speech, network, aborted), let onend handle it
    };

    recognitionRef.current = recognition;
    recognition.start();
    setVoiceState('listening');
  }, []);

  // Refs to track transcript in speech callbacks (closures capture stale state).
  // bestTextRef is a "high-water mark" — the best text we've seen from any onresult,
  // never cleared by subsequent events, only by a fresh startListening() call.
  // This protects against iOS Safari edge cases where onend fires before finalization,
  // or a final onresult comes through with empty transcript.
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const bestTextRef = useRef('');

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      // onend callback will handle state transition to done or idle
    }
  }, []);

  // ── Single handler for all mic interactions ──
  const handleMicTap = useCallback(() => {
    if (voiceState === 'listening') {
      stopListening();
    } else {
      // From idle or done — always start fresh
      setValue('');
      startListening();
    }
  }, [voiceState, startListening, stopListening]);

  // ── Open/close lifecycle ──

  // When opening: focus input OR auto-start voice (single path)
  // When closing: delayed cleanup so slide-down animation completes
  useEffect(() => {
    if (isOpen) {
      if (startWithVoice && speechSupported) {
        // Voice path: start listening after slide-up animation
        const timer = setTimeout(() => startListening(), 350);
        return () => clearTimeout(timer);
      } else {
        // Text path: focus the input
        const timer = setTimeout(() => inputRef.current?.focus(), 100);
        return () => clearTimeout(timer);
      }
    } else {
      // Closing: delay state reset until after 300ms slide-down animation
      const timer = setTimeout(() => {
        setValue('');
        setVoiceState('idle');
        setFinalTranscript('');
        setInterimTranscript('');
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, startWithVoice, speechSupported, startListening]);

  // Stop recognition when closing
  useEffect(() => {
    if (!isOpen && recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
  }, [isOpen]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const handleSave = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSave(trimmed);
      onClose();
    }
  }, [value, onSave, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') { onClose(); }
  }, [handleSave, onClose]);

  // Auto-resize textarea in done state
  const autoResizeTextarea = useCallback(() => {
    const ta = doneTextareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
  }, []);

  useEffect(() => {
    if (voiceState === 'done') {
      autoResizeTextarea();
    }
  }, [voiceState, value, autoResizeTextarea]);

  if (!mounted) return null;

  const hasTranscript = finalTranscript.trim() || interimTranscript.trim();

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

      {/* Input area — hidden when voice is active */}
      <div
        className={`flex-1 flex items-start px-6 pt-12 ${
          isVoiceActive ? 'hidden' : ''
        }`}
      >
        <div className="w-full max-w-2xl mx-auto">
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

            <div className="flex-1 relative">
              <div
                ref={inputRef}
                contentEditable
                role="textbox"
                aria-label="Task title"
                onInput={(e) => setValue(e.currentTarget.textContent || '', true)}
                onKeyDown={handleKeyDown}
                onPaste={(e) => {
                  e.preventDefault();
                  const text = e.clipboardData.getData('text/plain');
                  const sel = window.getSelection();
                  if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(document.createTextNode(text));
                    range.collapse(false);
                  } else if (inputRef.current) {
                    inputRef.current.textContent = (inputRef.current.textContent || '') + text;
                  }
                  setValue(inputRef.current?.textContent || '', true);
                }}
                data-placeholder="What can I help you with?"
                className="
                  w-full
                  text-2xl text-inbox-text-primary
                  bg-transparent
                  border-0 outline-none
                  pb-2
                  border-b-2 border-transparent
                  focus:border-primary/40
                  transition-colors duration-200
                  empty:before:content-[attr(data-placeholder)]
                  empty:before:text-inbox-text-tertiary/40
                "
              />

              {!value && !isVoiceActive && (
                <p className="mt-3 text-xs font-normal text-inbox-text-tertiary/40 leading-relaxed">
                  Try: &quot;Reply to Sarah&quot; or &quot;Schedule dentist appointment&quot;
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Voice zone — fills full area when voice is active */}
      {isVoiceActive && (
        <div
          className="flex-1 flex flex-col bg-surface-bright"
          style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
          role="region"
          aria-label="Voice input"
        >
          {/* Listening state */}
          {voiceState === 'listening' && (
            <div className="flex-1 px-6 pt-6 pb-4 flex flex-col items-center justify-center">
              {/* Transcript display */}
              <div className="min-h-[64px] flex items-center justify-center mb-4 w-full max-w-xs">
                {hasTranscript ? (
                  <p className="text-2xl text-center leading-relaxed">
                    <span className="text-inbox-text-primary">{finalTranscript}</span>
                    {interimTranscript && (
                      <span className="text-inbox-text-tertiary/50 transition-opacity duration-150">
                        {finalTranscript ? ' ' : ''}{interimTranscript}
                      </span>
                    )}
                    <span className="inline-block w-0.5 h-6 bg-primary ml-0.5 align-middle animate-[voice-cursor-blink_1s_infinite]" />
                  </p>
                ) : (
                  <p className="text-inbox-text-tertiary/40 text-lg">Speak now...</p>
                )}
              </div>

              {/* Waveform dots */}
              <div className="flex flex-col items-center mb-4">
                <div className="flex items-end gap-1.5 h-5">
                  <span className="w-2 h-2 rounded-full bg-inbox-error animate-[voice-dot-bounce_1.2s_infinite_0ms]" />
                  <span className="w-2 h-2 rounded-full bg-inbox-error animate-[voice-dot-bounce_1.2s_infinite_150ms]" />
                  <span className="w-2 h-2 rounded-full bg-inbox-error animate-[voice-dot-bounce_1.2s_infinite_300ms]" />
                </div>
                <span className="text-xs font-medium text-inbox-text-tertiary mt-2">Listening...</span>
              </div>

              {/* Stop button */}
              <button
                onClick={stopListening}
                className="w-16 h-16 rounded-full bg-inbox-error flex items-center justify-center animate-[voice-ring-pulse_1.8s_ease-out_infinite]"
                aria-label="Stop recording"
              >
                <MaterialIcon name="mic" size={28} className="text-on-primary" />
              </button>
            </div>
          )}

          {/* Done state — iMessage-style editable transcript with send */}
          {voiceState === 'done' && (
            <div className="mt-auto px-6 pt-5 pb-4 animate-fade-in">
              {/* Editable textarea — auto-grows, wraps text, tap to edit */}
              <div className="flex items-end gap-3 w-full">
                <div className="flex-1 relative">
                  <textarea
                    ref={doneTextareaRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    className="
                      w-full
                      text-lg text-inbox-text-primary leading-relaxed
                      bg-inbox-bg-secondary
                      rounded-2xl
                      px-4 py-3
                      border-0 outline-none
                      resize-none
                      overflow-hidden
                      placeholder:text-inbox-text-tertiary/40
                    "
                    placeholder="What can I help you with?"
                    autoComplete="off"
                    autoCapitalize="sentences"
                  />
                </div>
                {/* Send button — like iMessage arrow */}
                <button
                  onClick={handleSave}
                  disabled={!value.trim()}
                  className={`
                    shrink-0 w-10 h-10 rounded-full
                    flex items-center justify-center
                    transition-all duration-150
                    ${value.trim()
                      ? 'bg-primary active:scale-90'
                      : 'bg-inbox-bg-secondary cursor-not-allowed'
                    }
                  `}
                  aria-label="Save task"
                >
                  <MaterialIcon
                    name="arrow_upward"
                    size={22}
                    className={value.trim() ? 'text-on-primary' : 'text-inbox-text-tertiary/40'}
                  />
                </button>
              </div>

              {/* Re-record option */}
              <div className="flex items-center justify-center mt-3">
                <button
                  onClick={handleMicTap}
                  className="flex items-center gap-2 py-1 active:scale-95 transition-transform duration-100"
                  aria-label="Record again"
                >
                  <div className="w-8 h-8 rounded-full bg-inbox-bg-secondary flex items-center justify-center">
                    <MaterialIcon name="mic" size={18} className="text-inbox-text-secondary" />
                  </div>
                  <span className="text-xs text-inbox-text-tertiary">Re-record</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mic FAB — only shown when voice is idle */}
      {speechSupported && !isVoiceActive && (
        <div
          className="px-6 pb-6 flex justify-end"
          style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handleMicTap}
            className="
              w-14 h-14 rounded-full
              flex items-center justify-center
              shadow-inbox-elevated
              bg-primary hover:bg-inbox-accent-hover
              active:scale-95 transition-all duration-150
            "
            aria-label="Voice input"
          >
            <MaterialIcon name="mic" size={24} className="text-on-primary" />
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
