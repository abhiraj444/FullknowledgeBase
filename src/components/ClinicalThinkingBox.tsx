'use client';

import React from 'react';
import { AiStreamingRawLogBox, type AiStreamingRawLogBoxProps } from './AiStreamingRawLogBox';

export interface ClinicalThinkingBoxProps extends AiStreamingRawLogBoxProps {
  thinkingText?: string;
  thought?: string;
  streamText?: string;
  showLiveThinking?: boolean;
  showStreamingOutput?: boolean;
}

export function ClinicalThinkingBox(props: ClinicalThinkingBoxProps) {
  return <AiStreamingRawLogBox {...props} />;
}

export default ClinicalThinkingBox;
