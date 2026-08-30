'use client';

import React, { useState } from 'react';
import { Mic, Square, Trash2, Check, AlertCircle, Radio, Volume2, RotateCcw, Sparkles, Loader2, Copy, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { useAudioRecorder, RecordedAudio } from '@/hooks/useAudioRecorder';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { useSettings } from '@/context/SettingsContext';
import { ClientSideAiService, isAbortError } from '@/lib/ClientSideAiService';
import { useToast } from '@/hooks/use-toast';

interface AudioRecorderProps {
  onAudioRecorded: (audio: RecordedAudio) => void;
  onTranscribe?: (text: string) => void;
  className?: string;
  buttonText?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function AudioRecorder({
  onAudioRecorded,
  onTranscribe,
  className = '',
  buttonText = 'Record Voice Note',
  size = 'sm',
}: AudioRecorderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const transcribeAbortControllerRef = React.useRef<AbortController | null>(null);
  const { aiConfig, sttModel, sttProvider } = useSettings();
  const { toast } = useToast();

  const handleStopTranscribe = () => {
    if (transcribeAbortControllerRef.current) {
      transcribeAbortControllerRef.current.abort();
      transcribeAbortControllerRef.current = null;
    }
  };

  const {
    isRecording,
    recordingTime,
    audioLevel,
    error,
    lastRecording,
    startRecording,
    stopRecording,
    cancelRecording,
    clearLastRecording,
  } = useAudioRecorder({
    onRecordingComplete: () => {
      // Audio is stored in lastRecording for preview
    },
  });

  const formatTime = (secs: number | undefined | null) => {
    if (secs === undefined || secs === null || isNaN(secs) || !Number.isFinite(secs) || secs < 0) {
      return '0:00';
    }
    const safeSecs = Math.max(0, Math.floor(secs));
    const m = Math.floor(safeSecs / 60);
    const s = Math.floor(safeSecs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleStart = async () => {
    setIsOpen(true);
    setTranscript(null);
    setTranscribeError(null);
    await startRecording();
  };

  const handleTranscribeSpeech = async () => {
    if (!lastRecording) return;
    const controller = new AbortController();
    transcribeAbortControllerRef.current = controller;
    setIsTranscribing(true);
    setTranscribeError(null);
    try {
      const text = await ClientSideAiService.transcribeAudio(
        aiConfig,
        lastRecording.dataUri,
        lastRecording.blob.type || 'audio/webm',
        { signal: controller.signal }
      );
      if (!text || text.trim() === '') {
        throw new Error('No clear speech was detected in this recording.');
      }
      setTranscript(text);
      toast({
        title: 'Voice Transcribed',
        description: `Transcribed successfully using ${sttModel || 'Whisper'}.`,
      });
    } catch (err: any) {
      if (isAbortError(err)) {
        toast({ title: 'Cancelled', description: 'Audio transcription stopped by user.' });
        return;
      }
      console.error('Transcription error:', err);
      const errMsg = err?.message || 'Failed to convert audio to text.';
      setTranscribeError(errMsg);
      toast({
        title: 'Transcription Failed',
        description: errMsg,
        variant: 'destructive',
      });
    } finally {
      setIsTranscribing(false);
      transcribeAbortControllerRef.current = null;
    }
  };

  const handleUseTextOnly = () => {
    if (transcript && onTranscribe) {
      onTranscribe(transcript);
      toast({
        title: 'Transcribed Text Added',
        description: 'Audio recording removed from attachments.',
      });
    }
    clearLastRecording();
    setTranscript(null);
    setIsOpen(false);
  };

  const handleAttachBoth = () => {
    if (transcript && onTranscribe) {
      onTranscribe(transcript);
    }
    if (lastRecording) {
      onAudioRecorded(lastRecording);
    }
    clearLastRecording();
    setTranscript(null);
    setIsOpen(false);
  };

  const handleConfirmAttachAudioOnly = () => {
    if (lastRecording) {
      onAudioRecorded(lastRecording);
      clearLastRecording();
      setTranscript(null);
      setIsOpen(false);
    }
  };

  const handleDiscard = () => {
    cancelRecording();
    clearLastRecording();
    setTranscript(null);
    setTranscribeError(null);
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size={size}
              onClick={handleStart}
              className={`gap-1.5 text-xs font-medium border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 shrink-0 ${className}`}
            >
              <Mic className="h-3.5 w-3.5 text-primary" />
              <span>{buttonText}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Record a spoken clinical case or question to transcribe or attach</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const modelLabel = sttModel || 'whisper-large-v3-turbo';

  return (
    <div className={`p-3.5 rounded-xl border bg-card text-card-foreground shadow-sm space-y-3.5 w-full max-w-full overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isRecording ? (
            <div className="flex items-center gap-1.5 text-red-500 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider truncate">Recording Voice Note</span>
            </div>
          ) : lastRecording ? (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 min-w-0">
              <Volume2 className="h-4 w-4 shrink-0" />
              <span className="text-xs font-bold truncate">Voice Memo Ready ({formatTime(lastRecording.duration)})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
              <Radio className="h-4 w-4 shrink-0" />
              <span className="text-xs font-medium truncate">Ready to record</span>
            </div>
          )}
        </div>

        <span className="font-mono text-xs font-bold text-foreground bg-muted px-2 py-0.5 rounded shrink-0">
          {formatTime(isRecording ? recordingTime : lastRecording?.duration || 0)}
        </span>
      </div>

      {(error || transcribeError) && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-2.5 rounded-lg border border-red-200 dark:border-red-900/40">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error || transcribeError}</span>
        </div>
      )}

      {/* Visual Audio Wave Meter during active recording */}
      {isRecording && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-center gap-1 h-8 bg-muted/40 rounded-md px-2 overflow-hidden">
            {Array.from({ length: 16 }).map((_, i) => {
              const heightMultiplier = Math.sin((i / 16) * Math.PI) * (audioLevel * 100);
              const barHeight = Math.max(4, Math.min(28, heightMultiplier + Math.random() * 6));
              return (
                <div
                  key={i}
                  className="w-1 sm:w-1.5 bg-red-500 rounded-full transition-all duration-75 shrink-0"
                  style={{ height: `${barHeight}px` }}
                />
              );
            })}
          </div>
          <p className="text-[11px] text-center text-muted-foreground animate-pulse">
            Speak clearly into your microphone...
          </p>
        </div>
      )}

      {/* Playback Audio element when recording is stopped */}
      {lastRecording && !isRecording && (
        <div className="space-y-2.5 w-full max-w-full overflow-hidden">
          <audio controls src={lastRecording.url} className="w-full h-9 rounded" />

          {/* Transcribed Text Box */}
          {transcript ? (
            <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Transcribed with {modelLabel}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(transcript);
                    toast({ title: 'Copied', description: 'Transcript copied to clipboard.' });
                  }}
                  className="h-6 px-2 text-[10px] gap-1 text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
              </div>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={2}
                className="w-full text-xs bg-card/80 rounded border p-2 text-foreground focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                placeholder="Review and edit transcribed clinical notes..."
              />
              <p className="text-[10px] text-muted-foreground">
                You can remove the audio recording and use text only, or keep both.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <span className="text-[11px] text-muted-foreground">
                Convert directly to text using Whisper STT or attach audio directly:
              </span>
              {isTranscribing ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={handleStopTranscribe}
                  className="h-7 text-xs font-medium gap-1.5 shadow-2xs"
                  title="Stop audio transcription"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>Stop Transcribing</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleTranscribeSpeech}
                  className="h-7 text-xs font-medium gap-1.5 border-primary/40 hover:border-primary text-primary hover:bg-primary/5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Convert to Text ({modelLabel.replace('-large-v3-turbo', ' Turbo')})</span>
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleDiscard}
          className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Discard
        </Button>

        {isRecording ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={stopRecording}
            className="h-8 text-xs font-semibold gap-1.5 shadow-xs"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop & Review
          </Button>
        ) : lastRecording ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleStart}
              className="h-8 text-xs gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Re-record
            </Button>

            {transcript && onTranscribe ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAttachBoth}
                  className="h-8 text-xs gap-1"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Keep Both (Text + Audio)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={handleUseTextOnly}
                  className="h-8 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground shadow-xs"
                >
                  <Check className="h-3.5 w-3.5" />
                  Use Text & Remove Audio
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={handleConfirmAttachAudioOnly}
                className="h-8 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              >
                <Check className="h-3.5 w-3.5" />
                Attach Audio Note
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
