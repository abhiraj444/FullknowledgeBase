'use client';

import React from 'react';
import { Volume2, VolumeX, Pause, Play, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface SpeechSynthesisButtonProps {
  text: string;
  label?: string;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  showLabel?: boolean;
}

export function SpeechSynthesisButton({
  text,
  label = 'Listen with Voice',
  className = '',
  size = 'sm',
  variant = 'outline',
  showLabel = false,
}: SpeechSynthesisButtonProps) {
  const { isSpeaking, isPaused, isSupported, toggleSpeak, stop, activeText } = useSpeechSynthesis();

  if (!isSupported || !text) {
    return null;
  }

  const isCurrentActive = isSpeaking && activeText === text;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSpeak(text);
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    stop();
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1">
            <Button
              type="button"
              variant={isCurrentActive ? 'default' : variant}
              size={size}
              onClick={handleClick}
              className={`transition-all duration-200 ${
                isCurrentActive
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs animate-pulse ring-2 ring-blue-400/50'
                  : 'text-muted-foreground hover:text-foreground'
              } ${className}`}
              aria-label={isCurrentActive ? (isPaused ? 'Resume voice reading' : 'Pause voice reading') : 'Read aloud with AI voice'}
            >
              {isCurrentActive ? (
                isPaused ? (
                  <Play className="h-3.5 w-3.5 shrink-0 ml-0.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 shrink-0 animate-bounce text-white" />
                )
              ) : (
                <Volume2 className="h-3.5 w-3.5 shrink-0" />
              )}

              {showLabel && (
                <span className="text-xs font-medium ml-1.5 whitespace-nowrap">
                  {isCurrentActive ? (isPaused ? 'Paused' : 'Reading aloud...') : label}
                </span>
              )}
            </Button>

            {isCurrentActive && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleStop}
                className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                title="Stop voice synthesis"
              >
                <VolumeX className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>
            {isCurrentActive
              ? isPaused
                ? 'Click to resume AI reading'
                : 'Click to pause AI reading'
              : 'Listen to clinical analysis via Voice Synthesis'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
