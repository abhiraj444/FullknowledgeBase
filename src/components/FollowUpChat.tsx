'use client';

import React, { useState, useRef, useEffect, ChangeEvent, ClipboardEvent, DragEvent } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import {
  MessageSquare,
  Sparkles,
  Send,
  Loader2,
  Lightbulb,
  Copy,
  Check,
  Bot,
  User,
  Stethoscope,
  PenLine,
  HelpCircle,
  Paperclip,
  Image as ImageIcon,
  X,
  FileText,
  Square,
  Brain,
  Zap,
  BrainCircuit,
} from 'lucide-react';
import { VoiceInputButton } from './VoiceInputButton';
import { SpeechSynthesisButton } from './SpeechSynthesisButton';
import { useToast } from '@/hooks/use-toast';
import { isPdfFile, convertPdfToImages } from '@/lib/pdf-to-images';
import { prepareImagesForAiPrompt } from '@/lib/image-compressor';
import { useSettings } from '@/context/SettingsContext';
import { ClinicalMarkdownRenderer } from './ClinicalMarkdownRenderer';
import { AiStreamingRawLogBox } from './AiStreamingRawLogBox';
import type { FollowUpThread } from '@/types';

interface FollowUpChatProps {
  proactiveQuestions?: string[];
  threads?: FollowUpThread[];
  onAskFollowUp: (question: string, images?: string[]) => Promise<void>;
  onStop?: () => void;
  isLoading?: boolean;
  streamingText?: string;
  streamingThought?: string;
  title?: string;
  description?: string;
  sourceContext?: 'diagnosis' | 'slide';
  slideTitle?: string;
}

export function FollowUpChat({
  proactiveQuestions = [],
  threads = [],
  onAskFollowUp,
  onStop,
  isLoading = false,
  streamingText = '',
  streamingThought = '',
  title = 'Clinical Inquiries & Case Consultation',
  description = 'Explore diagnostic blind spots, guideline updates, or ask custom clinical questions with attached documents.',
  sourceContext = 'diagnosis',
  slideTitle,
}: FollowUpChatProps) {
  const [customQuestion, setCustomQuestion] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [attachedPreviews, setAttachedPreviews] = useState<string[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const {
    compressImagesForAi: compressEnabled,
    targetImageKb,
    mergeImagesIntoSingle,
    mergeTargetKb,
    enableReasoning,
    setEnableReasoning,
  } = useSettings();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [threads.length]);

  const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processIncomingFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setIsProcessingFiles(true);

    try {
      const newFiles: File[] = [];
      const newPreviews: string[] = [];

      for (const file of files) {
        if (isPdfFile(file)) {
          try {
            const pages = await convertPdfToImages(file);
            for (const page of pages) {
              newFiles.push(page.file);
              newPreviews.push(page.dataUrl);
            }
            toast({
              title: 'PDF Unpacked',
              description: `Unpacked "${file.name}" into ${pages.length} page image${pages.length > 1 ? 's' : ''}.`,
            });
          } catch (err) {
            console.warn('PDF conversion in chat failed:', err);
            newFiles.push(file);
            newPreviews.push(URL.createObjectURL(file));
          }
        } else {
          newFiles.push(file);
          newPreviews.push(URL.createObjectURL(file));
        }
      }

      setAttachedFiles((prev) => [...prev, ...newFiles]);
      setAttachedPreviews((prev) => [...prev, ...newPreviews]);
      toast({
        title: 'Document Attached',
        description: `Attached ${newFiles.length} file(s) to clinical question.`,
      });
    } catch (err: any) {
      console.error('File attach error:', err);
      toast({ title: 'Error', description: 'Could not process attached file.', variant: 'destructive' });
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processIncomingFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const pasted: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const f = items[i].getAsFile();
        if (f) pasted.push(f);
      }
    }
    if (pasted.length > 0) {
      await processIncomingFiles(pasted);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processIncomingFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeFile = (idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
    setAttachedPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
    if ((!customQuestion.trim() && attachedFiles.length === 0) || isLoading) return;
    const q = customQuestion.trim() || 'Please analyze the attached clinical document/image in relation to this case.';
    setCustomQuestion('');

    let processedUris: string[] = [];
    if (attachedFiles.length > 0) {
      try {
        const rawUris = await Promise.all(attachedFiles.map(fileToDataUri));
        const { processedImages } = await prepareImagesForAiPrompt({
          images: rawUris,
          compressEnabled,
          targetKb,
          mergeIntoSingle,
          mergeTargetKb,
        });
        processedUris = processedImages;
      } catch (err) {
        console.warn('Image prep in FollowUpChat failed:', err);
      }
    }

    setAttachedFiles([]);
    setAttachedPreviews([]);
    await onAskFollowUp(q, processedUris);
  };

  const handleChipClick = async (question: string) => {
    if (isLoading) return;
    await onAskFollowUp(question);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({ title: 'Copied', description: 'Consultation note copied to clipboard.' });
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Card className="border border-border shadow-xs overflow-hidden bg-card rounded-2xl">
      {/* Top Subtle Journal Ruler Accent */}
      <div className="h-1 w-full bg-gradient-to-r from-primary/30 via-amber-400/40 to-blue-500/30" />

      <CardHeader className="bg-muted/30 border-b border-border/70 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="stamp-badge text-[9px] stamp-inquiry">
                CONSULTATION LOG
              </span>
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                <MessageSquare className="h-4 w-4 text-primary" />
                {title}
              </CardTitle>
            </div>
            <CardDescription className="text-xs sm:text-sm text-muted-foreground">
              {slideTitle ? `Teaching Slide Context: ${slideTitle}` : description}
            </CardDescription>
          </div>

          {threads.length > 0 && (
            <span className="font-mono text-xs text-muted-foreground px-2.5 py-1 rounded-md border border-border bg-card">
              {threads.length} {threads.length === 1 ? 'Note' : 'Notes'}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Proactive Clinical Question Chips */}
        {proactiveQuestions && proactiveQuestions.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Recommended Bedside Inquiries</span>
              </div>
              <span className="text-[11px] font-handwriting text-muted-foreground text-xs">
                tap to query preceptor
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {proactiveQuestions.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleChipClick(q)}
                  disabled={isLoading}
                  className="text-left text-xs bg-background hover:bg-card text-foreground border border-border hover:border-primary/40 rounded-xl px-3.5 py-2 transition-all duration-150 shadow-2xs hover:shadow-xs active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
                >
                  <span className="text-primary font-mono text-xs">💡</span>
                  <span className="font-medium font-sans">{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Existing Thread Q&As */}
        {threads.length > 0 && (
          <div className="space-y-4 pt-1">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <PenLine className="h-3.5 w-3.5" />
              <span>Rounding Dialogue &amp; Notes</span>
            </div>

            <div className="space-y-4">
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  className="rounded-xl border border-border bg-background p-4 sm:p-5 space-y-3.5 shadow-2xs"
                >
                  {/* Doctor's Inquiry */}
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {thread.slideTitle ? `Question on [${thread.slideTitle}]` : 'Doctor Inquiry'}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {new Date(thread.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-sm sm:text-base font-bold text-foreground font-sans">
                        {thread.question}
                      </p>

                      {/* Render attached images if any */}
                      {thread.images && thread.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {thread.images.map((imgSrc, imgIdx) => (
                            <div
                              key={imgIdx}
                              className="relative rounded-lg overflow-hidden border border-border bg-muted/30 max-w-[120px] max-h-[90px]"
                            >
                              <img
                                src={imgSrc}
                                alt={`Attached doc ${imgIdx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Consultant Attending Preceptor Response */}
                  <div className="flex items-start gap-3 pl-2 sm:pl-4 border-l-2 border-primary/40 pt-1">
                    <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary mt-0.5 shrink-0">
                      <Stethoscope className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary">
                          Clinical Synthesis &amp; Management Rationale
                        </span>
                        <div className="flex items-center gap-1">
                          <SpeechSynthesisButton
                            text={`${thread.answer}. ${thread.reasoning || ''}`}
                            size="icon"
                            className="h-7 w-7"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => handleCopy(thread.answer, thread.id)}
                            aria-label="Copy response"
                          >
                            {copiedId === thread.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <ClinicalMarkdownRenderer content={thread.answer} />

                      {thread.reasoning && (
                        <Accordion type="single" collapsible className="w-full pt-1">
                          <AccordionItem value="reasoning" className="border-none">
                            <AccordionTrigger className="py-1 text-xs font-semibold text-muted-foreground hover:text-primary">
                              <div className="flex items-center gap-1.5">
                                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                                <span>Evidence &amp; Clinical Guidelines</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="mt-2 rounded-xl bg-muted/40 p-3 sm:p-3.5 text-xs leading-relaxed text-muted-foreground border border-border font-sans">
                                <ClinicalMarkdownRenderer content={thread.reasoning} />
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}

                      {thread.thinkingProcess && (
                        <Accordion type="single" collapsible className="w-full pt-1">
                          <AccordionItem value="thinking" className="border-none">
                            <AccordionTrigger className="py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-800">
                              <div className="flex items-center gap-1.5">
                                <Brain className="h-3.5 w-3.5 text-amber-500" />
                                <span>AI Thinking &amp; Reasoning Process</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="mt-2 rounded-xl bg-amber-500/10 dark:bg-amber-950/30 p-3 sm:p-3.5 text-xs leading-relaxed text-foreground border border-amber-500/20 font-mono whitespace-pre-wrap">
                                {thread.thinkingProcess}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        {/* Loading State with Raw Stream & Stop Button */}
        {(isLoading || streamingText || streamingThought) && (
          <div className="space-y-3">
            {isLoading && !streamingText && !streamingThought && (
              <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5 animate-pulse">
                <div className="flex items-center gap-3 min-w-0">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-primary truncate">
                      Preceptor AI consulting clinical evidence &amp; guidelines...
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Analyzing drug interactions, renal adjustments, attached documents, and management algorithms
                    </p>
                  </div>
                </div>
                {onStop && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={onStop}
                    className="h-7 px-2.5 text-xs gap-1.5 shrink-0 shadow-xs"
                    title="Stop AI consultation"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    <span>Stop</span>
                  </Button>
                )}
              </div>
            )}

            <AiStreamingRawLogBox
              isLoading={isLoading}
              streamText={streamingText}
              thinkingText={streamingThought}
              currentStep="Preceptor AI synthesizing evidence & answering follow-up..."
              title="Clinical Inquiry Live Reasoning & Synthesis"
              onStop={onStop}
              defaultExpanded={true}
              defaultThinkingExpanded={true}
              defaultRawExpanded={false}
            />
          </div>
        )}

        {/* Input Bar with File Attachment, Drag-Drop, and Voice Dictation */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`space-y-2 pt-1 rounded-xl transition-all ${
            isDragging ? 'ring-2 ring-primary bg-primary/5' : ''
          }`}
        >
          {/* File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Attached Files Thumbnail Previews */}
          {attachedPreviews.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2.5 rounded-xl bg-muted/40 border border-border">
              {attachedPreviews.map((src, idx) => (
                <div
                  key={idx}
                  className="relative group rounded-lg overflow-hidden border border-border bg-background w-16 h-16 flex items-center justify-center shrink-0 shadow-2xs"
                >
                  <img src={src} alt="Attached preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-xs transition-colors z-10"
                    aria-label="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <span className="text-[11px] text-muted-foreground self-center pl-1 font-medium">
                {attachedPreviews.length} attached document{attachedPreviews.length > 1 ? 's' : ''} ready to send with question
              </span>
            </div>
          )}

          <div className="relative rounded-xl border border-border bg-background shadow-2xs focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
            <Textarea
              placeholder="Ask a custom follow-up (e.g. 2nd line therapy, dosing in renal failure, pediatric considerations) or paste/drop lab images..."
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              className="w-full resize-none border-0 bg-transparent p-3 text-xs sm:text-sm focus-visible:ring-0 focus-visible:outline-hidden placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center justify-between p-2 pt-0 border-t border-border/40">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isProcessingFiles}
                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                  title="Attach image or PDF document"
                  aria-label="Attach file"
                >
                  {isProcessingFiles ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </Button>

                <VoiceInputButton
                  onTranscript={(text) => {
                    setCustomQuestion((prev) => (prev ? `${prev} ${text}` : text));
                  }}
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                />

                {/* Speed / Reasoning Quick Switch */}
                <button
                  type="button"
                  onClick={() => setEnableReasoning(!enableReasoning)}
                  className={`h-7 px-2 rounded-lg text-[10px] font-bold transition-all border flex items-center gap-1 shrink-0 ${
                    !enableReasoning
                      ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40'
                      : 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-500/40'
                  }`}
                  title={!enableReasoning ? 'Fast mode active (Reasoning OFF): click to enable deep reasoning' : 'Clinical reasoning active (ON): click to turn off reasoning for instant answers'}
                >
                  {!enableReasoning ? (
                    <>
                      <Zap className="h-3 w-3 fill-amber-500 text-amber-500" />
                      <span>Fast</span>
                    </>
                  ) : (
                    <>
                      <BrainCircuit className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                      <span>Reasoning</span>
                    </>
                  )}
                </button>

                <span className="text-[11px] font-handwriting text-muted-foreground hidden sm:inline text-xs pl-1">
                  attach docs or paste images
                </span>
              </div>

              {isLoading && onStop ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={onStop}
                  className="h-8 px-3 text-xs gap-1.5 shadow-2xs font-semibold"
                  title="Stop ongoing request"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>Stop</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSend}
                  disabled={isLoading || (!customQuestion.trim() && attachedFiles.length === 0)}
                  className="h-8 px-3 text-xs gap-1.5 shadow-2xs font-semibold"
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>Ask Preceptor</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


