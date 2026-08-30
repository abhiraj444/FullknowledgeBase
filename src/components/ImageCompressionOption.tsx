'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap,
  ShieldCheck,
  FileImage,
  Sparkles,
  Layers,
  Info,
  Combine,
  Eye,
  CheckCircle2,
  Minimize2,
  Maximize2,
  Loader2,
  Sliders,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { stitchImagesIntoSinglePanel, CompressionResult, formatFileSize } from '@/lib/image-compressor';

interface ImageCompressionOptionProps {
  // Compression options
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  targetKb?: number;
  onTargetKbChange?: (kb: number) => void;

  // Merge into single image options
  mergeIntoSingle?: boolean;
  onMergeToggle?: (enabled: boolean) => void;
  mergeTargetKb?: number;
  onMergeTargetKbChange?: (kb: number) => void;

  // Attached files for preview
  attachedImages?: (File | Blob | string)[];
  attachedCount?: number;

  className?: string;
  compact?: boolean;
}

export function ImageCompressionOption({
  enabled,
  onToggle,
  targetKb = 50,
  onTargetKbChange,
  mergeIntoSingle = false,
  onMergeToggle,
  mergeTargetKb = 200,
  onMergeTargetKbChange,
  attachedImages = [],
  attachedCount = 0,
  className = '',
  compact = false,
}: ImageCompressionOptionProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isStitching, setIsStitching] = useState(false);
  const [stitchedResult, setStitchedResult] = useState<CompressionResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewQualityKb, setPreviewQualityKb] = useState<number>(mergeTargetKb);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const actualCount = attachedCount || attachedImages.length;
  const canMerge = actualCount >= 2;

  // Update preview quality when prop changes
  useEffect(() => {
    setPreviewQualityKb(mergeTargetKb);
  }, [mergeTargetKb]);

  const generateStitchedPreview = async (customKb: number) => {
    if (!attachedImages || attachedImages.length < 2) return;
    setIsStitching(true);
    setPreviewError(null);

    try {
      const result = await stitchImagesIntoSinglePanel(attachedImages, {
        targetKb: customKb,
        layout: 'auto',
        addBadges: true,
      });
      setStitchedResult(result);
    } catch (err: any) {
      console.error('Failed to generate preview of stitched image:', err);
      setPreviewError(err?.message || 'Failed to stitch images for preview.');
    } finally {
      setIsStitching(false);
    }
  };

  const handleOpenPreview = async () => {
    if (!attachedImages || attachedImages.length < 2) return;
    setIsPreviewOpen(true);
    setZoomLevel(1);
    await generateStitchedPreview(previewQualityKb);
  };

  const handleModalQualityChange = async (newVal: number) => {
    setPreviewQualityKb(newVal);
    if (onMergeTargetKbChange) {
      onMergeTargetKbChange(newVal);
    }
    await generateStitchedPreview(newVal);
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* 1. Main Compression / Multi-Image Optimization Container */}
      <div
        className={`p-3.5 rounded-2xl border transition-all ${
          enabled || (mergeIntoSingle && canMerge)
            ? 'bg-emerald-500/5 border-emerald-500/30 dark:bg-emerald-950/15'
            : 'bg-muted/40 border-border/70'
        }`}
      >
        {/* Top Row: Standard Individual Compression */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div
              className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                enabled
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Zap className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Label
                  htmlFor="compress-image-toggle"
                  className="text-xs sm:text-sm font-semibold text-foreground cursor-pointer"
                >
                  Compress individual images
                </Label>

                <Badge
                  variant="secondary"
                  className="text-[10px] font-mono px-1.5 py-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                >
                  ~{targetKb} KB / page
                </Badge>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground inline-flex items-center"
                        aria-label="Image compression info"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
                      <p className="font-semibold text-foreground">Smart Document Compression</p>
                      <p>
                        Each uploaded page is optimized before sending to AI, dramatically saving tokens and speeding up inference.
                      </p>
                      <p className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 pt-1 font-medium">
                        <ShieldCheck className="h-3.5 w-3.5 inline shrink-0" />
                        Full-resolution original images are always preserved in your saved Case History!
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {!compact && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {enabled ? (
                    <span>
                      Reduces each page to ~{targetKb}KB for fast AI reasoning • Original files preserved in history
                      {actualCount > 0 ? ` (${actualCount} file${actualCount > 1 ? 's' : ''} ready)` : ''}
                    </span>
                  ) : (
                    <span>Original file sizes will be sent to AI (higher token consumption)</span>
                  )}
                </p>
              )}

              {/* Individual Image Quality Slider when enabled */}
              {enabled && onTargetKbChange && (
                <div className="mt-2 pt-2 border-t border-border/40 flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
                    <Sliders className="h-3 w-3" />
                    Quality target:
                  </span>
                  <div className="flex-1 max-w-[200px]">
                    <Slider
                      value={[targetKb]}
                      min={30}
                      max={180}
                      step={10}
                      onValueChange={(val) => onTargetKbChange(val[0])}
                      className="cursor-pointer"
                    />
                  </div>
                  <span className="text-[11px] font-mono font-bold text-foreground shrink-0 min-w-[50px]">
                    {targetKb} KB
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start mt-0.5">
            <Switch
              id="compress-image-toggle"
              checked={enabled}
              onCheckedChange={onToggle}
              aria-label="Toggle image compression for AI"
            />
          </div>
        </div>

        {/* 2. Stitch All Images into 1 Single Multi-Panel Image with Quality Slider */}
        {onMergeToggle && (
          <div className="mt-3.5 pt-3 border-t border-border/60">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div
                  className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                    mergeIntoSingle && canMerge
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Combine className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Label
                      htmlFor="merge-images-toggle"
                      className="text-xs sm:text-sm font-semibold text-foreground cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Merge all pages into 1 single image for AI</span>
                    </Label>

                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono px-1.5 py-0 ${
                        mergeIntoSingle && canMerge
                          ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                          : 'bg-muted/60 text-muted-foreground'
                      }`}
                    >
                      ~{mergeTargetKb} KB Total
                    </Badge>

                    {canMerge && mergeIntoSingle && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                        <CheckCircle2 className="h-3 w-3 inline" />
                        {actualCount} pages → 1 composite panel
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Merges all attached documents &amp; PDFs side-by-side into a single high-clarity canvas for AI vision.
                    <span className="text-foreground/80 font-medium"> Original files remain saved in Case History.</span>
                  </p>

                  {/* Quality Slider for Merged Canvas */}
                  {mergeIntoSingle && canMerge && (
                    <div className="mt-3 p-2.5 rounded-xl bg-background/80 border border-blue-500/20 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          <Sliders className="h-3.5 w-3.5 text-blue-500" />
                          Merged Image Quality &amp; Target Size
                        </span>
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md">
                          {mergeTargetKb} KB
                        </span>
                      </div>

                      <div className="pt-1">
                        <Slider
                          value={[mergeTargetKb]}
                          min={80}
                          max={450}
                          step={20}
                          onValueChange={(val) => {
                            if (onMergeTargetKbChange) {
                              onMergeTargetKbChange(val[0]);
                            }
                          }}
                          className="cursor-pointer"
                        />
                      </div>

                      {/* Quality presets */}
                      <div className="flex items-center justify-between pt-1 text-[10px]">
                        <span className="text-muted-foreground">80 KB (Compact)</span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => onMergeTargetKbChange?.(120)}
                            className={`px-2 py-0.5 rounded border transition-all ${
                              mergeTargetKb === 120
                                ? 'bg-blue-500 text-white border-blue-600'
                                : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Fast (120K)
                          </button>
                          <button
                            type="button"
                            onClick={() => onMergeTargetKbChange?.(200)}
                            className={`px-2 py-0.5 rounded border transition-all ${
                              mergeTargetKb === 200
                                ? 'bg-blue-500 text-white border-blue-600'
                                : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Balanced (200K)
                          </button>
                          <button
                            type="button"
                            onClick={() => onMergeTargetKbChange?.(350)}
                            className={`px-2 py-0.5 rounded border transition-all ${
                              mergeTargetKb === 350
                                ? 'bg-blue-500 text-white border-blue-600'
                                : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            Ultra HD (350K)
                          </button>
                        </div>
                        <span className="text-muted-foreground">450 KB (High-Res)</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-start mt-0.5">
                {canMerge && attachedImages.length >= 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleOpenPreview}
                    className="h-7 text-xs gap-1 px-2.5 rounded-lg border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                  >
                    <Eye className="h-3 w-3" />
                    <span>Inspect Quality</span>
                  </Button>
                )}

                <Switch
                  id="merge-images-toggle"
                  checked={mergeIntoSingle}
                  onCheckedChange={onMergeToggle}
                  aria-label="Toggle merging all images into 1 single image for AI"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Live Preview & Quality Inspection Dialog for Merged Multi-Panel Image */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-5 rounded-2xl">
          <DialogHeader className="pb-3 border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600">
                  <Combine className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground">
                    Inspect Merged AI Image Quality
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Verify the exact resolution, text sharpness, and legibility that will be sent to the Gemini AI model.
                  </DialogDescription>
                </div>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg border border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[11px] font-mono px-1 font-medium">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setZoomLevel(1)}
                  aria-label="Reset zoom"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Real-time Quality Slider directly inside the modal */}
            <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Sliders className="h-4 w-4 text-blue-500" />
                  Adjust Output Quality &amp; Re-render
                </span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md">
                  Target: {previewQualityKb} KB
                </span>
              </div>

              <Slider
                value={[previewQualityKb]}
                min={80}
                max={450}
                step={20}
                onValueChange={(val) => handleModalQualityChange(val[0])}
                className="cursor-pointer"
              />

              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Fast / Low Tokens (80 KB)</span>
                <span className="font-medium text-foreground/80">Slide to increase sharpness for fine lab table text</span>
                <span>Ultra Sharp (450 KB)</span>
              </div>
            </div>

            {isStitching && (
              <div className="flex flex-col items-center justify-center py-16 space-y-3 bg-muted/20 rounded-xl border border-dashed border-border">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-xs font-medium text-muted-foreground">
                  Stitching &amp; re-compressing {actualCount} documents to {previewQualityKb} KB...
                </p>
              </div>
            )}

            {previewError && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {previewError}
              </div>
            )}

            {!isStitching && stitchedResult && (
              <div className="space-y-3">
                {/* Stats Header */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-muted/50 border border-border">
                    <p className="text-[10px] text-muted-foreground">Original Total</p>
                    <p className="font-bold text-foreground font-mono">{formatFileSize(stitchedResult.originalSizeBytes)}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-300">Generated AI Size</p>
                    <p className="font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                      {formatFileSize(stitchedResult.sizeBytes)} ({stitchedResult.sizeKb} KB)
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <p className="text-[10px] text-blue-700 dark:text-blue-300">Token Reduction</p>
                    <p className="font-bold text-blue-700 dark:text-blue-300 font-mono">
                      {stitchedResult.reductionPercentage}% smaller
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted/50 border border-border">
                    <p className="text-[10px] text-muted-foreground">AI Canvas Size</p>
                    <p className="font-bold text-foreground font-mono">
                      {stitchedResult.width} × {stitchedResult.height} px
                    </p>
                  </div>
                </div>

                {/* Stitched Image Canvas Display with Zoom */}
                <div className="rounded-xl border border-border bg-slate-900/5 dark:bg-slate-900/40 p-3 overflow-auto max-h-[55vh] flex justify-center items-center">
                  <div
                    style={{
                      transform: `scale(${zoomLevel})`,
                      transformOrigin: 'center center',
                      transition: 'transform 0.15s ease-out',
                    }}
                    className="flex justify-center"
                  >
                    <img
                      src={stitchedResult.dataUrl}
                      alt="Merged Composite for AI"
                      className="max-h-[50vh] w-auto object-contain rounded-lg shadow-md border border-slate-200 dark:border-slate-800"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-800 dark:text-emerald-300">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                  <p>
                    <strong>Full Fidelity Assurance:</strong> This single merged panel will be sent to the AI vision endpoint with all text headers and labels. All <strong>{actualCount} original high-resolution files</strong> remain saved and accessible in your Patient Case History!
                  </p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


