'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Sparkles,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Activity,
  FileText,
  Copy,
  Check,
  Square,
  Terminal,
  ArrowDownCircle,
  Code2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/context/SettingsContext';
import { formatModelDisplayName } from '@/lib/ClientSideAiService';

export interface AiStreamingRawLogBoxProps {
  isLoading?: boolean;
  isStreaming?: boolean;
  streamText?: string;
  thinkingText?: string;
  thought?: string;
  currentStep?: string;
  steps?: string[];
  activeStepIndex?: number;
  modelName?: string;
  title?: string;
  onStop?: () => void;
  defaultExpanded?: boolean;
  defaultThinkingExpanded?: boolean;
  defaultRawExpanded?: boolean;
  className?: string;
  compact?: boolean;
}

export function AiStreamingRawLogBox({
  isLoading,
  isStreaming,
  streamText = '',
  thinkingText = '',
  thought = '',
  currentStep = 'AI processing request...',
  steps = [],
  activeStepIndex = 0,
  modelName,
  title = 'AI Diagnostics & Stream Console',
  onStop,
  defaultExpanded = true,
  defaultThinkingExpanded = true,
  defaultRawExpanded = true,
  className = '',
  compact = false,
}: AiStreamingRawLogBoxProps) {
  const { activeModel, aiConfig } = useSettings();
  const effectiveLoading = isLoading !== undefined ? isLoading : (isStreaming !== undefined ? isStreaming : false);
  const effectiveThinking = (thinkingText || thought || '').trim();

  const effectiveModelName = modelName
    ? formatModelDisplayName(modelName)
    : formatModelDisplayName(activeModel || aiConfig?.customModel || aiConfig?.geminiModel || 'Gemini');

  // Overall container expansion
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  // Independent collapsible sections
  const [isThinkingOpen, setIsThinkingOpen] = useState(defaultThinkingExpanded);
  const [isRawOpen, setIsRawOpen] = useState(defaultRawExpanded);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [copiedThinking, setCopiedThinking] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [autoScrollRaw, setAutoScrollRaw] = useState(true);
  const [autoScrollThinking, setAutoScrollThinking] = useState(true);

  const streamScrollRef = useRef<HTMLDivElement>(null);
  const thinkingScrollRef = useRef<HTMLDivElement>(null);

  // Timer while loading
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (effectiveLoading) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [effectiveLoading]);

  // Auto-scroll when new text arrives
  useEffect(() => {
    if (autoScrollRaw && streamScrollRef.current && isExpanded && isRawOpen) {
      streamScrollRef.current.scrollTop = streamScrollRef.current.scrollHeight;
    }
  }, [streamText, autoScrollRaw, isExpanded, isRawOpen]);

  useEffect(() => {
    if (autoScrollThinking && thinkingScrollRef.current && isExpanded && isThinkingOpen) {
      thinkingScrollRef.current.scrollTop = thinkingScrollRef.current.scrollHeight;
    }
  }, [effectiveThinking, autoScrollThinking, isExpanded, isThinkingOpen]);

  // Automatically expand when generation starts
  useEffect(() => {
    if (effectiveLoading) {
      setIsExpanded(true);
      setIsThinkingOpen(true);
    }
  }, [effectiveLoading]);

  // If not loading and no content received yet, do not render
  if (!effectiveLoading && !effectiveThinking && !streamText) {
    return null;
  }

  const handleCopyThinking = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (effectiveThinking) {
      navigator.clipboard.writeText(effectiveThinking);
      setCopiedThinking(true);
      setTimeout(() => setCopiedThinking(false), 2000);
    }
  };

  const handleCopyRaw = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (streamText) {
      navigator.clipboard.writeText(streamText);
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    }
  };

  const handleCopyAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const fullContent = [
      effectiveThinking ? `=== 1. AI THINKING & REASONING ===\n${effectiveThinking}` : '',
      streamText ? `=== 2. RAW STREAM OUTPUT ===\n${streamText}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    if (fullContent) {
      navigator.clipboard.writeText(fullContent);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s < 10 ? '0' : ''}${s}s` : `${s}s`;
  };

  const charCount = streamText.length;
  const estimatedTokens = Math.round(charCount / 4);
  const thinkingCharCount = effectiveThinking.length;
  const estimatedThinkingTokens = Math.round(thinkingCharCount / 4);

  return (
    <div
      id="ai-streaming-raw-log-box"
      className={`rounded-2xl border border-primary/20 bg-card shadow-sm overflow-hidden transition-all duration-300 ${
        effectiveLoading ? 'ring-1 ring-primary/30 shadow-primary/5' : ''
      } ${className}`}
    >
      {/* Primary Top Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/40 border-b border-border/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`p-1.5 rounded-lg shrink-0 transition-colors ${
              effectiveLoading
                ? 'bg-primary/20 text-primary animate-pulse'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {effectiveLoading ? (
              <Terminal className="h-4 w-4 animate-pulse" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-foreground truncate">{title}</span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 font-mono bg-background/80 border-primary/20 text-primary shrink-0"
              >
                {effectiveModelName}
              </Badge>
              {effectiveLoading ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold animate-pulse">
                  <Activity className="h-3 w-3" />
                  Streaming Live...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3 w-3" />
                  Execution Complete
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {effectiveLoading && (
            <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1 bg-background px-2 py-0.5 rounded-md border border-border">
              <Clock className="h-3 w-3 text-muted-foreground" />
              {formatElapsed(elapsedSeconds)}
            </span>
          )}

          {(streamText || effectiveThinking) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopyAll}
              className="h-7 px-2 text-[11px] font-medium gap-1 text-muted-foreground hover:text-foreground hidden sm:inline-flex"
              title="Copy All Stream & Reasoning Logs"
            >
              {copiedAll ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Logs</span>
                </>
              )}
            </Button>
          )}

          {effectiveLoading && onStop && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onStop}
              className="h-7 px-2.5 text-[11px] font-semibold gap-1 shrink-0"
              title="Stop AI Generation"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Stop</span>
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title={isExpanded ? 'Collapse Stream Console' : 'Expand Stream Console'}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Expandable Body */}
      {isExpanded && (
        <div className="p-3.5 space-y-3.5 text-xs bg-background/60">
          {/* Step Progress Checklist if steps provided */}
          {steps.length > 0 && (
            <div className="space-y-1.5 pb-2 border-b border-border/40">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Clinical Synthesis Steps
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {steps.map((step, idx) => {
                  const isDone = !effectiveLoading || idx < activeStepIndex;
                  const isCurrent = effectiveLoading && idx === activeStepIndex;
                  return (
                    <div
                      key={step}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-[11px] transition-all ${
                        isCurrent
                          ? 'bg-primary/10 border-primary/30 text-primary font-semibold shadow-2xs'
                          : isDone
                          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                          : 'bg-muted/30 border-border/40 text-muted-foreground'
                      }`}
                    >
                      {isDone && !isCurrent ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : isCurrent ? (
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                      )}
                      <span className="truncate">{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current Active Status Pill */}
          {effectiveLoading && currentStep && (
            <div className="flex items-center gap-2 text-xs font-medium text-foreground bg-primary/5 p-2.5 rounded-xl border border-primary/15">
              <Sparkles className="h-4 w-4 text-primary shrink-0 animate-spin" />
              <span className="truncate">{currentStep}</span>
            </div>
          )}

          {/* =========================================================
              PRIMARY STREAM: LIVE CLINICAL REASONING (CHAIN OF THOUGHT)
              ========================================================= */}
          {(effectiveThinking || effectiveLoading) && (
            <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 dark:bg-amber-950/20 overflow-hidden transition-all shadow-2xs">
              {/* Header / Toggle */}
              <div
                onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                className="flex items-center justify-between px-3 py-2 bg-amber-500/10 dark:bg-amber-900/30 cursor-pointer hover:bg-amber-500/15 select-none transition-colors border-b border-amber-500/20"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Brain className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 truncate">
                    Live Clinical Reasoning &amp; Evidence Deliberation
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 border-amber-500/40 text-amber-700 dark:text-amber-300 font-mono hidden sm:inline-flex"
                  >
                    {effectiveLoading ? 'Streaming CoT' : 'Chain of Thought'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {thinkingCharCount > 0 && (
                    <span className="text-[10px] font-mono text-amber-700/80 dark:text-amber-300/80">
                      {thinkingCharCount} chars (~{estimatedThinkingTokens} tok)
                    </span>
                  )}
                  {effectiveThinking && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyThinking}
                      className="h-6 w-6 p-0 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
                      title="Copy Thinking Chain"
                    >
                      {copiedThinking ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                  <button
                    type="button"
                    className="p-0.5 text-amber-700 dark:text-amber-300"
                    aria-label={isThinkingOpen ? 'Collapse Thinking' : 'Expand Thinking'}
                  >
                    {isThinkingOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible Reasoning Content */}
              {isThinkingOpen && (
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-amber-800/80 dark:text-amber-300/80">
                    <span>Guideline checks, differential probabilities &amp; mechanism analysis:</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAutoScrollThinking(!autoScrollThinking);
                      }}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                        autoScrollThinking
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-900 dark:text-amber-200 font-semibold'
                          : 'bg-background/50 border-border text-muted-foreground'
                      }`}
                    >
                      <ArrowDownCircle className="h-2.5 w-2.5" />
                      Auto-scroll: {autoScrollThinking ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div
                    ref={thinkingScrollRef}
                    className="p-3 rounded-lg bg-background/95 border border-amber-500/20 text-foreground text-[11px] leading-relaxed max-h-52 overflow-y-auto font-mono whitespace-pre-wrap select-text"
                  >
                    {effectiveThinking || (
                      <span className="text-amber-700/70 dark:text-amber-400/70 italic flex items-center gap-2">
                        <Brain className="h-3.5 w-3.5 animate-pulse text-amber-500" />
                        Deliberating clinical hypotheses, pre-test likelihoods, and guideline indications...
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              SECONDARY STREAM: DEVELOPER RAW LOG INSPECTOR (COLLAPSIBLE)
              ========================================================= */}
          <div className="rounded-xl border border-border/80 bg-muted/20 overflow-hidden transition-all">
            {/* Header / Toggle */}
            <div
              onClick={() => setIsRawOpen(!isRawOpen)}
              className="flex items-center justify-between px-3 py-1.5 bg-muted/40 cursor-pointer hover:bg-muted/60 select-none transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Code2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] font-semibold text-muted-foreground truncate">
                  Developer Stream &amp; Raw Output Inspector
                </span>
                {charCount > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 border-border text-muted-foreground font-mono"
                  >
                    {charCount} chars (~{estimatedTokens} tok)
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {streamText && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyRaw}
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                    title="Copy Raw Output"
                  >
                    {copiedRaw ? (
                      <Check className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                )}
                <button
                  type="button"
                  className="p-0.5 text-muted-foreground"
                  aria-label={isRawOpen ? 'Collapse Raw Stream' : 'Expand Raw Stream'}
                >
                  {isRawOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Collapsible Raw Terminal Content */}
            {isRawOpen && (
              <div className="p-3 border-t border-border/60 bg-neutral-950 text-neutral-200">
                <div className="flex items-center justify-between pb-2 text-[10px] text-neutral-400">
                  <span>Raw model stream chunks:</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAutoScrollRaw(!autoScrollRaw);
                    }}
                    className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                      autoScrollRaw
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    <ArrowDownCircle className="h-2.5 w-2.5" />
                    Auto-scroll: {autoScrollRaw ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div
                  ref={streamScrollRef}
                  className={`p-2.5 rounded-md bg-black/80 text-[11px] leading-relaxed font-mono whitespace-pre-wrap select-text overflow-y-auto ${
                    compact ? 'max-h-36' : 'max-h-48'
                  }`}
                >
                  {streamText || (
                    <span className="text-neutral-500 italic">
                      {effectiveLoading
                        ? 'Waiting for first stream tokens...'
                        : 'No raw stream data recorded.'}
                    </span>
                  )}
                  {effectiveLoading && (
                    <span className="inline-block w-1.5 h-3 bg-emerald-400 ml-1 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AiStreamingRawLogBox;

