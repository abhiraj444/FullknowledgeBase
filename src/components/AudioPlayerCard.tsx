'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, X, FileText, Loader2, Copy, Check, Sparkles, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSettings } from '@/context/SettingsContext';
import { ClientSideAiService } from '@/lib/ClientSideAiService';

interface AudioPlayerCardProps {
  src: string; // url or dataUri
  fileName: string;
  duration?: number; // seconds
  transcript?: string;
  isTranscribing?: boolean;
  onRemove?: () => void;
  onInsertTranscript?: (text: string) => void;
  onTranscriptGenerated?: (text: string) => void;
  className?: string;
  isCompact?: boolean;
}

export function AudioPlayerCard({
  src,
  fileName,
  duration,
  transcript: initialTranscript,
  isTranscribing: initialIsTranscribing = false,
  onRemove,
  onInsertTranscript,
  onTranscriptGenerated,
  className = '',
  isCompact = false,
}: AudioPlayerCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showTranscript, setShowTranscript] = useState(true);
  const [copied, setCopied] = useState(false);
  const [localTranscript, setLocalTranscript] = useState<string | undefined>(initialTranscript);
  const [isTranscribingLocal, setIsTranscribingLocal] = useState(initialIsTranscribing);
  const { aiConfig, sttModel } = useSettings();
  const [audioDuration, setAudioDuration] = useState<number>(() => {
    if (duration && Number.isFinite(duration) && duration > 0) {
      return Math.round(duration);
    }
    return 0;
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (initialTranscript) {
      setLocalTranscript(initialTranscript);
    }
  }, [initialTranscript]);

  useEffect(() => {
    if (duration && Number.isFinite(duration) && duration > 0) {
      setAudioDuration(Math.round(duration));
    }
  }, [duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && Number.isFinite(audio.duration) && !isNaN(audio.duration) && audio.duration > 0) {
        setAudioDuration(Math.round(audio.duration));
      } else if (duration && Number.isFinite(duration) && duration > 0) {
        setAudioDuration(Math.round(duration));
      }
    };

    const handleTimeUpdate = () => {
      const cur = Math.round(audio.currentTime);
      setCurrentTime(cur);
      if (cur > audioDuration) {
        setAudioDuration(cur);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [src, duration, audioDuration]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.warn('Audio playback error:', e);
      });
    }
  };

  const formatTime = (secs: number | undefined | null) => {
    if (secs === undefined || secs === null || isNaN(secs) || !Number.isFinite(secs) || secs < 0) {
      return '0:00';
    }
    const safeSecs = Math.max(0, Math.floor(secs));
    const m = Math.floor(safeSecs / 60);
    const s = Math.floor(safeSecs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = Number(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleCopyTranscript = () => {
    const textToCopy = localTranscript || initialTranscript;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast({ title: 'Transcript Copied', description: 'Voice memo transcription copied to clipboard.' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTranscribeOnDemand = async () => {
    setIsTranscribingLocal(true);
    try {
      const mime = src.startsWith('data:') ? src.split(';')[0].replace('data:', '') : 'audio/webm';
      const text = await ClientSideAiService.transcribeAudio(aiConfig, src, mime);
      if (text) {
        setLocalTranscript(text);
        setShowTranscript(true);
        if (onTranscriptGenerated) {
          onTranscriptGenerated(text);
        }
        toast({
          title: 'Transcribed Successfully',
          description: `Voice converted using ${sttModel || 'Whisper'}.`,
        });
      }
    } catch (err: any) {
      console.error('On-demand transcription failed:', err);
      toast({
        title: 'Transcription Failed',
        description: err?.message || 'Could not transcribe this audio file.',
        variant: 'destructive',
      });
    } finally {
      setIsTranscribingLocal(false);
    }
  };

  const activeTranscript = localTranscript || initialTranscript;
  const isTranscribing = initialIsTranscribing || isTranscribingLocal;
  const safeDuration = audioDuration > 0 ? audioDuration : Math.max(1, currentTime);

  return (
    <div
      className={`relative flex flex-col rounded-xl border bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-950/30 dark:to-indigo-950/30 p-2.5 sm:p-3 shadow-xs border-blue-200 dark:border-blue-800/60 w-full max-w-full overflow-hidden space-y-2.5 ${className}`}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Top Player Row */}
      <div className="flex items-center gap-2.5 sm:gap-3 w-full">
        <Button
          type="button"
          size="icon"
          variant="default"
          onClick={togglePlay}
          className="h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white shrink-0 shadow-xs"
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </Button>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Volume2 className={`h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 ${isPlaying ? 'animate-bounce' : ''}`} />
              <span className="text-xs font-semibold text-foreground truncate block" title={fileName}>
                {fileName}
              </span>
              {isTranscribing && (
                <span className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-mono animate-pulse shrink-0">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  <span>Transcribing ({sttModel || 'Whisper'})...</span>
                </span>
              )}
              {activeTranscript && !isTranscribing && (
                <span className="stamp-badge stamp-confirmed text-[8px] py-0 px-1 shrink-0">
                  Transcribed
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono font-medium text-muted-foreground whitespace-nowrap shrink-0">
              {formatTime(currentTime)} / {formatTime(audioDuration > 0 ? audioDuration : duration || 0)}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full">
            <input
              type="range"
              min="0"
              max={safeDuration}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-blue-200 dark:bg-blue-900 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>
        </div>

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full p-1 text-muted-foreground hover:text-destructive hover:bg-muted/80 transition-colors shrink-0"
            title="Remove audio file"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Transcript Accordion / Box if available or On-demand Transcribe button */}
      {activeTranscript ? (
        <div className="pt-1.5 border-t border-blue-200/60 dark:border-blue-800/40 text-xs space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => setShowTranscript((prev) => !prev)}
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline"
            >
              <FileText className="h-3 w-3" />
              <span>{showTranscript ? 'Hide Transcript' : 'View AI Transcript'}</span>
            </button>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyTranscript}
                className="h-6 px-1.5 rounded-md text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-background/80"
                title="Copy transcript text"
              >
                {copied ? <Check className="h-2.5 w-2.5 text-emerald-500" /> : <Copy className="h-2.5 w-2.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              {onInsertTranscript && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onInsertTranscript(activeTranscript);
                      toast({ title: 'Transcript Inserted', description: 'Added to clinical prompt.' });
                    }}
                    className="h-6 px-2 rounded-md text-[10px] flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary/20 font-semibold"
                    title="Insert into patient notes and keep audio"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    <span>Insert into Notes</span>
                  </button>
                  {onRemove && (
                    <button
                      type="button"
                      onClick={() => {
                        onInsertTranscript(activeTranscript);
                        onRemove();
                        toast({ title: 'Transcript Inserted', description: 'Audio removed from attachments.' });
                      }}
                      className="h-6 px-2 rounded-md text-[10px] flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-2xs"
                      title="Insert into patient notes and remove audio recording"
                    >
                      <Check className="h-2.5 w-2.5" />
                      <span>Use Text & Remove Audio</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {showTranscript && (
            <div className="p-2.5 rounded-lg bg-background/90 border border-border text-[11px] text-foreground font-sans leading-relaxed break-words">
              {activeTranscript}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-blue-200/50 dark:border-blue-900/40">
          <span className="text-[10px] text-muted-foreground">
            Audio recording attached (optional for LLM).
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isTranscribing}
            onClick={handleTranscribeOnDemand}
            className="h-6 text-[11px] font-medium gap-1 text-primary border-primary/30 hover:bg-primary/5"
          >
            {isTranscribing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Transcribing...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3 text-primary" />
                <span>Transcribe with Whisper</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
