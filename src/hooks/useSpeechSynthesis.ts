'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseSpeechSynthesisOptions {
  rate?: number; // 0.1 to 10 (default: 1.0)
  pitch?: number; // 0 to 2 (default: 1.0)
  volume?: number; // 0 to 1 (default: 1.0)
  lang?: string; // e.g. 'en-US'
  onEnd?: () => void;
  onError?: (error: any) => void;
}

export function useSpeechSynthesis(options: UseSpeechSynthesisOptions = {}) {
  const { rate = 1.0, pitch = 1.0, volume = 1.0, lang = 'en-US', onEnd, onError } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [activeText, setActiveText] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onEndRef.current = onEnd;
    onErrorRef.current = onError;
  }, [onEnd, onError]);

  // Initialize and load voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    const updateVoices = () => {
      try {
        const available = window.speechSynthesis.getVoices();
        if (available && available.length > 0) {
          setVoices(available);
        }
      } catch {
        // ignore
      }
    };

    updateVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Clean Markdown & HTML tags for natural speech synthesis
  const cleanTextForSpeech = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/```[\s\S]*?```/g, '') // remove code blocks
      .replace(/`([^`]+)`/g, '$1') // remove inline code
      .replace(/[*_~#>[\]()]/g, ' ') // remove markdown syntax
      .replace(/<[^>]*>/g, ' ') // remove html tags
      .replace(/\s+/g, ' ') // collapse whitespace
      .trim();
  };

  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    setActiveText(null);
    utteranceRef.current = null;
  }, []);

  const pause = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, []);

  const speak = useCallback(
    (textToSpeak: string, customLang?: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

      // Stop any current speech
      stop();

      const cleaned = cleanTextForSpeech(textToSpeak);
      if (!cleaned) return;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = Math.max(0.7, Math.min(1.5, rate));
      utterance.pitch = Math.max(0.5, Math.min(1.5, pitch));
      utterance.volume = Math.max(0, Math.min(1, volume));

      const targetLang = customLang || lang || 'en-US';
      utterance.lang = targetLang;

      // Select best voice if available (prefer natural or high quality English/Indian voice)
      if (voices.length > 0) {
        const matchingVoice =
          voices.find((v) => v.lang === targetLang && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural'))) ||
          voices.find((v) => v.lang.startsWith(targetLang.slice(0, 2))) ||
          voices.find((v) => v.lang.startsWith('en')) ||
          voices[0];

        if (matchingVoice) {
          utterance.voice = matchingVoice;
        }
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
        setActiveText(textToSpeak);
      };

      utterance.onend = () => {
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
        setIsSpeaking(false);
        setIsPaused(false);
        setActiveText(null);
        utteranceRef.current = null;
        onEndRef.current?.();
      };

      utterance.onerror = (e) => {
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
        setIsSpeaking(false);
        setIsPaused(false);
        setActiveText(null);
        utteranceRef.current = null;
        onErrorRef.current?.(e);
      };

      utteranceRef.current = utterance;

      // Workaround for Chrome/Safari browser bug where SpeechSynthesis stops after 15s:
      // Keep utterance alive with periodic resume heartbeat
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);

      window.speechSynthesis.speak(utterance);
    },
    [rate, pitch, volume, lang, voices, stop]
  );

  const toggleSpeak = useCallback(
    (textToSpeak: string, customLang?: string) => {
      if (isSpeaking && activeText === textToSpeak) {
        if (isPaused) {
          resume();
        } else {
          pause();
        }
      } else if (isSpeaking && activeText !== textToSpeak) {
        speak(textToSpeak, customLang);
      } else {
        speak(textToSpeak, customLang);
      }
    },
    [isSpeaking, isPaused, activeText, pause, resume, speak]
  );

  return {
    isSpeaking,
    isPaused,
    isSupported,
    activeText,
    voices,
    speak,
    pause,
    resume,
    stop,
    toggleSpeak,
  };
}
