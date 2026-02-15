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
  const reviewInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Voice state machine: idle → permission → listening → review → idle
  type VoiceState = 'idle' | 'permission' | 'listening' | 'review';
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  // Mic permission tracking
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'prompt' | 'denied'>('unknown');
  const hasEverListenedRef = useRef(false);

  const isVoiceActive = voiceState !== 'idle';

  // Mount portal + check speech support + query mic permission
  useEffect(() => {
    setMounted(true);
    setSpeechSupported(hasSpeechRecognition());
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then((status) => {
          setMicPermission(status.state as 'granted' | 'prompt' | 'denied');
          status.onchange = () => {
            setMicPermission(status.state as 'granted' | 'prompt' | 'denied');
          };
        })
        .catch(() => {
          // Permissions API not supported for mic (e.g. Safari)
        });
    }
  }, []);

  // Auto-focus input when opening (only if not starting with voice)
  // Delay cleanup when closing so the slide-down animation (300ms) completes
  // before DOM changes (voice zone unmount, input clearing) that would cause reflow.
  useEffect(() => {
    if (isOpen && !startWithVoice) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else if (!isOpen) {
      const timer = setTimeout(() => {
        setValue('');
        setVoiceState('idle');
        setFinalTranscript('');
        setInterimTranscript('');
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, startWithVoice]);

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

  // Stop recognition when closing (but don't reset state — the delayed
  // cleanup in the isOpen effect handles that after the slide-down animation)
  useEffect(() => {
    if (!isOpen && recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
  }, [isOpen]);

  // Use a ref to track final transcript in speech callbacks (closures)
  const finalTranscriptRef = useRef('');

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    // Reset transcript state
    finalTranscriptRef.current = '';
    setFinalTranscript('');
    setInterimTranscript('');

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      hasEverListenedRef.current = true;
      setMicPermission('granted');
    };

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
      setFinalTranscript(final);
      setInterimTranscript(interim);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setInterimTranscript('');
      const text = finalTranscriptRef.current.trim();
      if (text) {
        setValue(text);
        setVoiceState('review');
      } else {
        setVoiceState('idle');
      }
    };

    recognition.onerror = (event: Event) => {
      const errorEvent = event as Event & { error?: string };
      if (errorEvent.error === 'not-allowed') {
        setMicPermission('denied');
      }
      setVoiceState('idle');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setVoiceState('listening');
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const handleMicTap = useCallback(() => {
    if (voiceState === 'listening') {
      stopListening();
    } else if (voiceState === 'review') {
      setValue('');
      startListening();
    } else if (micPermission === 'denied') {
      return;
    } else if (micPermission === 'granted' || hasEverListenedRef.current) {
      startListening();
    } else {
      // Need permission — show pre-prompt
      setVoiceState('permission');
    }
  }, [voiceState, micPermission, startListening, stopListening]);

  // Auto-focus review input when entering review state
  useEffect(() => {
    if (voiceState === 'review') {
      const timer = setTimeout(() => {
        const input = reviewInputRef.current;
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [voiceState]);

  // Auto-start voice when opened with startWithVoice
  const hasTriggeredVoiceRef = useRef(false);

  useEffect(() => {
    if (isOpen && startWithVoice && speechSupported && !hasTriggeredVoiceRef.current) {
      hasTriggeredVoiceRef.current = true;
      const timer = setTimeout(() => {
        if (micPermission === 'granted' || hasEverListenedRef.current) {
          startListening();
        } else {
          setVoiceState('permission');
        }
      }, 350);
      return () => clearTimeout(timer);
    }
    if (!isOpen) {
      hasTriggeredVoiceRef.current = false;
    }
  }, [isOpen, startWithVoice, speechSupported, startListening, micPermission]);

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

      {/* Input area — dims when voice is active */}
      <div
        className={`flex-1 flex items-start px-6 pt-12 transition-opacity duration-300 ${
          isVoiceActive ? 'opacity-30 pointer-events-none' : 'opacity-100'
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

              {!value && !isVoiceActive && (
                <p className="mt-3 text-xs font-normal text-inbox-text-tertiary/40 leading-relaxed">
                  Try: &quot;Reply to Sarah&quot; or &quot;Schedule dentist appointment&quot;
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Voice zone — slides up when voice is active */}
      {isVoiceActive && (
        <div
          className="border-t border-inbox-divider bg-inbox-bg-primary rounded-t-3xl shadow-[0_-4px_16px_rgba(60,64,67,0.08)] animate-slide-in-bottom"
          style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}
          role="region"
          aria-label="Voice input"
        >
          {/* Permission pre-prompt */}
          {voiceState === 'permission' && (
            <div className="px-6 pt-8 pb-6 flex flex-col items-center animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <MaterialIcon
                  name={micPermission === 'denied' ? 'mic_off' : 'mic'}
                  size={32}
                  className={micPermission === 'denied' ? 'text-inbox-error' : 'text-primary'}
                />
              </div>

              <p className="text-base font-medium text-inbox-text-primary text-center max-w-[260px] mt-4">
                {micPermission === 'denied'
                  ? 'Microphone access was blocked. You can enable it in your browser settings.'
                  : 'Todone needs your microphone to capture tasks by voice'}
              </p>

              <button
                onClick={() => {
                  if (micPermission === 'denied') {
                    setVoiceState('idle');
                  } else {
                    startListening();
                  }
                }}
                className="
                  w-full max-w-[240px] h-12 mt-5
                  rounded-full
                  bg-primary text-on-primary
                  text-base font-medium
                  active:scale-[0.98] transition-transform duration-100
                "
              >
                {micPermission === 'denied' ? 'Got it' : 'Enable microphone'}
              </button>

              {micPermission !== 'denied' && (
                <button
                  onClick={() => setVoiceState('idle')}
                  className="text-xs text-inbox-text-tertiary/50 mt-3 py-1"
                >
                  You can also just type above
                </button>
              )}
            </div>
          )}

          {/* Listening state */}
          {voiceState === 'listening' && (
            <div className="px-6 pt-6 pb-4 flex flex-col items-center">
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

          {/* Review state — inline editable transcript */}
          {voiceState === 'review' && (
            <div className="px-6 pt-5 pb-4 flex flex-col items-center animate-fade-in">
              {/* Editable transcript */}
              <div className="flex items-center gap-3 w-full max-w-md">
                <MaterialIcon
                  name="check_circle"
                  size={24}
                  fill
                  className="text-primary shrink-0"
                />
                <input
                  ref={reviewInputRef}
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="
                    flex-1
                    text-xl text-inbox-text-primary
                    bg-transparent
                    border-0 border-b-2 border-primary/40
                    outline-none
                    pb-1
                    placeholder:text-inbox-text-tertiary/40
                  "
                  placeholder="What can I help you with?"
                  autoComplete="off"
                  autoCapitalize="sentences"
                />
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={!value.trim()}
                className={`
                  w-full max-w-md h-12 mt-4
                  rounded-full
                  text-base font-medium
                  active:scale-[0.98] transition-all duration-150
                  ${value.trim()
                    ? 'bg-primary text-on-primary'
                    : 'bg-inbox-bg-secondary text-inbox-text-tertiary/40 cursor-not-allowed'
                  }
                `}
              >
                Save task
              </button>

              {/* Re-record option */}
              <button
                onClick={() => { setValue(''); startListening(); }}
                className="flex items-center gap-2 mt-3 py-1 active:scale-95 transition-transform duration-100"
                aria-label="Record again"
              >
                <div className="w-8 h-8 rounded-full bg-inbox-bg-secondary flex items-center justify-center">
                  <MaterialIcon name="mic" size={18} className="text-inbox-text-secondary" />
                </div>
                <span className="text-xs text-inbox-text-tertiary">Re-record</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mic FAB — only shown when voice is idle and mic not denied */}
      {speechSupported && !isVoiceActive && micPermission !== 'denied' && (
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
