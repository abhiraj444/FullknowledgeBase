'use client';

import { convertPdfToImages, isPdfFile } from './pdf-to-images';

export interface CompressionResult {
  dataUrl: string;
  base64: string;
  mimeType: string;
  sizeBytes: number;
  sizeKb: number;
  originalSizeBytes: number;
  originalSizeKb: number;
  reductionPercentage: number;
  width: number;
  height: number;
  imageCount?: number;
}

export interface CompressionOptions {
  targetKb?: number; // target max size in kilobytes (default: 50KB)
  maxDimension?: number; // max width/height in px (default: 1600px)
  minQuality?: number; // min jpeg quality before downscaling further (default: 0.3)
}

export interface StitchOptions {
  targetKb?: number; // target max size in kilobytes (default: 200KB)
  layout?: 'side-by-side' | 'grid' | 'vertical' | 'auto';
  addBadges?: boolean; // Draw subtle "[Page 1]", "[Page 2]" label headers
  maxDimension?: number; // max canvas dimension in px (default: 2400px)
  qualityPreset?: 'compact' | 'balanced' | 'high' | 'ultra';
}

/**
 * Formats byte size into human readable string (e.g., "1.2 MB", "48 KB", "850 B").
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Calculates raw byte size from a base64 string or data URL.
 */
export function getBase64ByteSize(base64OrDataUrl: string): number {
  if (!base64OrDataUrl) return 0;
  const base64 = base64OrDataUrl.includes('base64,')
    ? base64OrDataUrl.split('base64,')[1]
    : base64OrDataUrl;
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/**
 * Helper to load an image source into an HTMLImageElement with cleanup.
 * Removes crossOrigin='anonymous' for data/blob URIs to prevent canvas tainting/blank renders,
 * and ensures image is fully decoded before returning.
 */
async function loadHtmlImage(input: File | Blob | string): Promise<{ img: HTMLImageElement; byteSize: number; cleanup?: () => void }> {
  let src = '';
  let byteSize = 0;
  let cleanup: (() => void) | undefined;

  if (typeof input === 'string') {
    if (input.startsWith('data:') || input.startsWith('blob:') || input.startsWith('http://') || input.startsWith('https://')) {
      src = input;
    } else {
      src = `data:image/jpeg;base64,${input}`;
    }
    byteSize = getBase64ByteSize(src);
  } else if (input instanceof Blob || input instanceof File) {
    byteSize = input.size;
    // Use FileReader to get solid Data URI in memory
    src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file as data URI'));
      reader.readAsDataURL(input);
    });
  }

  const img = new Image();
  // Only set crossOrigin for external http(s) URLs. NEVER set on data: or blob: URIs
  if (src.startsWith('http://') || src.startsWith('https://')) {
    img.crossOrigin = 'anonymous';
  }

  await new Promise<void>((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) {
      resolve();
      return;
    }
    img.onload = async () => {
      try {
        if ('decode' in img) {
          await img.decode().catch(() => {});
        }
      } catch {
        // ignore decode fallback
      }
      resolve();
    };
    img.onerror = () => reject(new Error('Failed to load image element into DOM'));
    img.src = src;
  });

  return { img, byteSize, cleanup };
}

/**
 * Compresses an image (File, Blob, Data URI, or Base64) to a target size (default 50KB).
 * Uses iterative high-quality canvas resizing and JPEG quality optimization.
 * Maintains minimum resolution and contrast so medical text remains 100% legible for AI.
 */
export async function compressImageToTargetKb(
  input: File | Blob | string,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const targetKb = options.targetKb || 50;
  const targetBytes = targetKb * 1024;
  const initialMaxDim = options.maxDimension || 1600;

  if (typeof window === 'undefined') {
    throw new Error('Image compression must run in browser.');
  }

  const { img, byteSize: originalSizeBytes, cleanup } = await loadHtmlImage(input);

  const naturalWidth = img.naturalWidth || img.width || 800;
  const naturalHeight = img.naturalHeight || img.height || 600;

  // Preserve readable bounds (never shrink below 700px for text/medical reports)
  const minReadableDim = Math.min(700, Math.min(naturalWidth, naturalHeight));

  // Iterative canvas scaling & quality compression loop
  let currentMaxDim = Math.min(initialMaxDim, Math.max(naturalWidth, naturalHeight));
  let quality = 0.86;
  let bestDataUrl = '';
  let bestSizeBytes = Infinity;
  let bestWidth = naturalWidth;
  let bestHeight = naturalHeight;

  for (let pass = 0; pass < 8; pass++) {
    let width = naturalWidth;
    let height = naturalHeight;

    if (width > currentMaxDim || height > currentMaxDim) {
      if (width > height) {
        height = Math.round((height * currentMaxDim) / width);
        width = currentMaxDim;
      } else {
        width = Math.round((width * currentMaxDim) / height);
        height = currentMaxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) break;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Solid white background to prevent transparent JPEG blackening
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const candidateDataUrl = canvas.toDataURL('image/jpeg', quality);
    const candidateBytes = getBase64ByteSize(candidateDataUrl);

    if (candidateDataUrl && candidateDataUrl.length > 100) {
      bestDataUrl = candidateDataUrl;
      bestSizeBytes = candidateBytes;
      bestWidth = width;
      bestHeight = height;
    }

    if (candidateBytes <= targetBytes * 1.08) {
      break;
    }

    // Step-down tuning while safeguarding minimum visual sharpness
    if (quality > 0.65) {
      quality -= 0.12;
    } else if (currentMaxDim > 1100 && currentMaxDim > minReadableDim) {
      currentMaxDim = Math.max(minReadableDim, Math.round(currentMaxDim * 0.8));
      quality = 0.75;
    } else if (quality > 0.50) {
      quality -= 0.08;
    } else if (currentMaxDim > 800 && currentMaxDim > minReadableDim) {
      currentMaxDim = Math.max(minReadableDim, Math.round(currentMaxDim * 0.85));
      quality = 0.60;
    } else {
      quality = Math.max(0.40, quality - 0.05);
      break;
    }
  }

  if (cleanup) cleanup();

  // If compression failed to produce a valid image, fallback to raw input if string
  if (!bestDataUrl || bestDataUrl.length < 100) {
    if (typeof input === 'string') {
      const fbUrl = input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
      return {
        dataUrl: fbUrl,
        base64: fbUrl.includes('base64,') ? fbUrl.split('base64,')[1] : fbUrl,
        mimeType: 'image/jpeg',
        sizeBytes: originalSizeBytes || 50000,
        sizeKb: Math.round((originalSizeBytes || 50000) / 1024),
        originalSizeBytes: originalSizeBytes || 50000,
        originalSizeKb: Math.round((originalSizeBytes || 50000) / 1024),
        reductionPercentage: 0,
        width: naturalWidth,
        height: naturalHeight,
      };
    }
  }

  const base64 = bestDataUrl.includes('base64,')
    ? bestDataUrl.split('base64,')[1]
    : bestDataUrl;

  const reductionPercentage =
    originalSizeBytes > 0
      ? Math.max(0, Math.round(((originalSizeBytes - bestSizeBytes) / originalSizeBytes) * 100))
      : 0;

  return {
    dataUrl: bestDataUrl,
    base64,
    mimeType: 'image/jpeg',
    sizeBytes: bestSizeBytes,
    sizeKb: Math.round(bestSizeBytes / 1024),
    originalSizeBytes: originalSizeBytes || bestSizeBytes,
    originalSizeKb: Math.round((originalSizeBytes || bestSizeBytes) / 1024),
    reductionPercentage,
    width: bestWidth,
    height: bestHeight,
  };
}

/**
 * Merges/stitches multiple images into a single side-by-side or grid multi-panel image,
 * and compresses the combined canvas down to a target size (default 200KB) for AI vision prompts.
 */
export async function stitchImagesIntoSinglePanel(
  images: (File | Blob | string)[],
  options: StitchOptions = {}
): Promise<CompressionResult> {
  const targetKb = options.targetKb || 200;
  const targetBytes = targetKb * 1024;
  const addBadges = options.addBadges !== false;
  const maxDimTarget = options.maxDimension || (targetKb >= 350 ? 3000 : targetKb >= 250 ? 2500 : 2200);

  if (typeof window === 'undefined') {
    throw new Error('Image stitching must run in browser.');
  }

  // 1. Unpack any PDF documents into individual page image items first
  const normalizedInputs: (File | Blob | string)[] = [];
  for (const item of images) {
    if (typeof item === 'string') {
      if (item.startsWith('data:audio') || item.includes('audio/')) {
        continue;
      }
      if (isPdfFile(item)) {
        try {
          // Convert base64 PDF to blob
          const byteString = atob(item.split(',')[1]);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const pdfBlob = new Blob([ab], { type: 'application/pdf' });
          const pdfFile = new File([pdfBlob], 'document.pdf', { type: 'application/pdf' });
          const pages = await convertPdfToImages(pdfFile);
          pages.forEach((p) => normalizedInputs.push(p.dataUrl));
          continue;
        } catch (pdfErr) {
          console.warn('Could not unpack data URI PDF, skipping:', pdfErr);
        }
      }
      normalizedInputs.push(item);
    } else if (item instanceof File || item instanceof Blob) {
      if (item.type.startsWith('audio/')) {
        continue;
      }
      if (isPdfFile(item)) {
        try {
          const pdfFile = item instanceof File ? item : new File([item], 'document.pdf', { type: 'application/pdf' });
          const pages = await convertPdfToImages(pdfFile);
          pages.forEach((p) => normalizedInputs.push(p.dataUrl));
          continue;
        } catch (pdfErr) {
          console.warn('Could not unpack File PDF, skipping:', pdfErr);
        }
      }
      normalizedInputs.push(item);
    }
  }

  if (normalizedInputs.length === 0) {
    throw new Error('No valid images or PDF pages found for stitching.');
  }

  // If only 1 image, simply compress to targetKb
  if (normalizedInputs.length === 1) {
    const singleResult = await compressImageToTargetKb(normalizedInputs[0], { targetKb });
    return { ...singleResult, imageCount: 1 };
  }

  // 2. Load all images
  const loadedItems = await Promise.all(normalizedInputs.map(loadHtmlImage));
  const totalOriginalBytes = loadedItems.reduce((acc, curr) => acc + curr.byteSize, 0);

  // 3. Determine Layout (side-by-side for 2, 2x2 grid for 3-4, multi-column grid for 5+)
  const count = loadedItems.length;
  let cols = 2;
  let rows = 1;

  if (options.layout === 'side-by-side') {
    cols = count;
    rows = 1;
  } else if (options.layout === 'vertical') {
    cols = 1;
    rows = count;
  } else if (options.layout === 'grid' || options.layout === 'auto' || !options.layout) {
    if (count === 2) {
      cols = 2;
      rows = 1;
    } else if (count <= 4) {
      cols = 2;
      rows = Math.ceil(count / 2);
    } else if (count <= 6) {
      cols = 3;
      rows = Math.ceil(count / 3);
    } else {
      cols = 3;
      rows = Math.ceil(count / 3);
    }
  }

  // Normalize cell dimensions based on average aspect ratio of loaded images
  let avgAspect = 1.25; // default portrait aspect ratio (height / width)
  try {
    const aspects = loadedItems.map((item) => {
      const w = item.img.naturalWidth || item.img.width || 800;
      const h = item.img.naturalHeight || item.img.height || 1000;
      return h / Math.max(1, w);
    });
    avgAspect = aspects.reduce((a, b) => a + b, 0) / aspects.length;
  } catch {
    avgAspect = 1.25;
  }

  // Base cell size scaled for high-density document rendering
  const baseCellWidth = avgAspect > 1 ? 900 : 1100;
  const baseCellHeight = Math.round(baseCellWidth * Math.min(1.8, Math.max(0.6, avgAspect)));
  const gap = 16;
  const headerHeight = addBadges ? 36 : 8;
  const padding = 18;

  // Calculate master canvas size
  const masterWidth = padding * 2 + cols * baseCellWidth + (cols - 1) * gap;
  const masterHeight = padding * 2 + rows * (baseCellHeight + headerHeight) + (rows - 1) * gap;

  // 4. Render master high-resolution composition canvas
  const masterCanvas = document.createElement('canvas');
  masterCanvas.width = masterWidth;
  masterCanvas.height = masterHeight;
  const mCtx = masterCanvas.getContext('2d');

  if (!mCtx) {
    loadedItems.forEach((item) => item.cleanup?.());
    throw new Error('Could not create master canvas context');
  }

  mCtx.imageSmoothingEnabled = true;
  mCtx.imageSmoothingQuality = 'high';

  // Crisp light medical background
  mCtx.fillStyle = '#f8fafc';
  mCtx.fillRect(0, 0, masterWidth, masterHeight);

  // Draw outer border outline
  mCtx.strokeStyle = '#cbd5e1';
  mCtx.lineWidth = 2;
  mCtx.strokeRect(2, 2, masterWidth - 4, masterHeight - 4);

  // Place each image in its grid slot
  for (let idx = 0; idx < count; idx++) {
    const colIdx = idx % cols;
    const rowIdx = Math.floor(idx / cols);

    const cellX = padding + colIdx * (baseCellWidth + gap);
    const cellY = padding + rowIdx * (baseCellHeight + headerHeight + gap);

    // Draw document panel background & card border
    mCtx.fillStyle = '#ffffff';
    mCtx.fillRect(cellX, cellY, baseCellWidth, baseCellHeight + headerHeight);
    mCtx.strokeStyle = '#e2e8f0';
    mCtx.lineWidth = 1.5;
    mCtx.strokeRect(cellX, cellY, baseCellWidth, baseCellHeight + headerHeight);

    // Draw Page Badge / Header Banner
    if (addBadges) {
      mCtx.fillStyle = '#0f172a';
      mCtx.fillRect(cellX, cellY, baseCellWidth, 30);

      mCtx.fillStyle = '#0ea5e9';
      mCtx.fillRect(cellX, cellY + 28, baseCellWidth, 2);

      mCtx.fillStyle = '#ffffff';
      mCtx.font = 'bold 13px ui-sans-serif, system-ui, -apple-system, sans-serif';
      mCtx.textBaseline = 'middle';
      mCtx.fillText(`DOCUMENT PAGE ${idx + 1} OF ${count}`, cellX + 14, cellY + 15);
    }

    const { img } = loadedItems[idx];
    const nW = img.naturalWidth || img.width || 800;
    const nH = img.naturalHeight || img.height || 600;

    // Aspect ratio fit within cell preserving maximum legible area
    const targetW = baseCellWidth - 20;
    const targetH = baseCellHeight - 20;

    const scale = Math.min(targetW / nW, targetH / nH);
    const renderW = Math.max(10, Math.round(nW * scale));
    const renderH = Math.max(10, Math.round(nH * scale));

    const renderX = cellX + Math.round((baseCellWidth - renderW) / 2);
    const renderY = cellY + headerHeight + Math.round((baseCellHeight - renderH) / 2);

    // Fill white background for inner document area
    mCtx.fillStyle = '#ffffff';
    mCtx.fillRect(renderX, renderY, renderW, renderH);

    // Draw image safely onto canvas
    mCtx.drawImage(img, renderX, renderY, renderW, renderH);

    // Clean subtle boundary
    mCtx.strokeStyle = '#cbd5e1';
    mCtx.lineWidth = 1;
    mCtx.strokeRect(renderX, renderY, renderW, renderH);
  }

  // Clean up loaded image blobs
  loadedItems.forEach((item) => item.cleanup?.());

  // 5. Iterative scaling & compression to reach user's chosen target KB while preserving sharp OCR legibility
  let currentMaxDim = Math.min(maxDimTarget, Math.max(masterWidth, masterHeight));
  let quality = targetKb >= 300 ? 0.92 : targetKb >= 200 ? 0.88 : 0.82;
  let bestDataUrl = '';
  let bestSizeBytes = Infinity;
  let bestWidth = masterWidth;
  let bestHeight = masterHeight;

  // Minimum readable dimension for stitched composite
  const minCompositeDim = Math.min(1600, Math.max(masterWidth, masterHeight));

  for (let pass = 0; pass < 9; pass++) {
    let outW = masterWidth;
    let outH = masterHeight;

    if (outW > currentMaxDim || outH > currentMaxDim) {
      if (outW > outH) {
        outH = Math.round((outH * currentMaxDim) / outW);
        outW = currentMaxDim;
      } else {
        outW = Math.round((outW * currentMaxDim) / outH);
        outH = currentMaxDim;
      }
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = Math.max(1, outW);
    outCanvas.height = Math.max(1, outH);
    const oCtx = outCanvas.getContext('2d');
    if (!oCtx) break;

    oCtx.imageSmoothingEnabled = true;
    oCtx.imageSmoothingQuality = 'high';

    oCtx.fillStyle = '#ffffff';
    oCtx.fillRect(0, 0, outW, outH);
    oCtx.drawImage(masterCanvas, 0, 0, outW, outH);

    const candidateDataUrl = outCanvas.toDataURL('image/jpeg', quality);
    const candidateBytes = getBase64ByteSize(candidateDataUrl);

    if (candidateDataUrl && candidateDataUrl.length > 100) {
      bestDataUrl = candidateDataUrl;
      bestSizeBytes = candidateBytes;
      bestWidth = outW;
      bestHeight = outH;
    }

    if (candidateBytes <= targetBytes * 1.12) {
      break;
    }

    if (quality > 0.70) {
      quality -= 0.08;
    } else if (currentMaxDim > 1800 && currentMaxDim > minCompositeDim) {
      currentMaxDim = Math.max(minCompositeDim, Math.round(currentMaxDim * 0.88));
      quality = 0.80;
    } else if (quality > 0.55) {
      quality -= 0.06;
    } else {
      quality = Math.max(0.45, quality - 0.04);
      break;
    }
  }

  const base64 = bestDataUrl.includes('base64,')
    ? bestDataUrl.split('base64,')[1]
    : bestDataUrl;

  const reductionPercentage =
    totalOriginalBytes > 0
      ? Math.max(0, Math.round(((totalOriginalBytes - bestSizeBytes) / totalOriginalBytes) * 100))
      : 0;

  return {
    dataUrl: bestDataUrl,
    base64,
    mimeType: 'image/jpeg',
    sizeBytes: bestSizeBytes,
    sizeKb: Math.round(bestSizeBytes / 1024),
    originalSizeBytes: totalOriginalBytes || bestSizeBytes,
    originalSizeKb: Math.round((totalOriginalBytes || bestSizeBytes) / 1024),
    reductionPercentage,
    width: bestWidth,
    height: bestHeight,
    imageCount: count,
  };
}

/**
 * Compresses an array of files or data URIs to target size (default 50KB) for AI API calls.
 */
export async function compressImagesForAi(
  images: (File | Blob | string)[],
  targetKb = 50
): Promise<string[]> {
  if (!images || images.length === 0) return [];

  // Unpack any PDF items first
  const normalized: (File | Blob | string)[] = [];
  for (const img of images) {
    if (typeof img === 'string' && isPdfFile(img)) {
      try {
        const byteString = atob(img.split(',')[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const pdfBlob = new Blob([ab], { type: 'application/pdf' });
        const pages = await convertPdfToImages(new File([pdfBlob], 'doc.pdf', { type: 'application/pdf' }));
        pages.forEach((p) => normalized.push(p.dataUrl));
        continue;
      } catch (err) {
        console.warn('PDF unpack failed in compressImagesForAi:', err);
      }
    } else if ((img instanceof File || img instanceof Blob) && isPdfFile(img)) {
      try {
        const pdfFile = img instanceof File ? img : new File([img], 'doc.pdf', { type: 'application/pdf' });
        const pages = await convertPdfToImages(pdfFile);
        pages.forEach((p) => normalized.push(p.dataUrl));
        continue;
      } catch (err) {
        console.warn('PDF unpack failed in compressImagesForAi:', err);
      }
    }
    normalized.push(img);
  }

  const results = await Promise.all(
    normalized.map(async (img) => {
      // Audio or non-image items (like audio recorded webm) are kept as is
      if (typeof img === 'string' && (img.startsWith('data:audio') || img.includes('audio/'))) {
        return img;
      }
      if (img instanceof File && img.type.startsWith('audio/')) {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(img);
        });
      }

      try {
        const compressed = await compressImageToTargetKb(img, { targetKb });
        return compressed.dataUrl;
      } catch (err) {
        console.warn('Image compression fallback to original:', err);
        if (typeof img === 'string') return img;
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(img);
        });
      }
    })
  );

  return results;
}

export interface PrepareImagesOptions {
  images?: (File | Blob | string)[];
  compressEnabled?: boolean;
  mergeIntoSingle?: boolean;
  targetKb?: number;
  mergeTargetKb?: number;
}

/**
 * Master dispatcher: Prepares images for AI prompts based on compression & stitch settings.
 * Accepts either:
 *  - prepareImagesForAiPrompt(imagesArray, options)
 *  - prepareImagesForAiPrompt(optionsObject)
 * If mergeIntoSingle is enabled and there are >= 2 images, it stitches them into 1 single image.
 * Otherwise, it applies individual compression (~50KB) or returns originals.
 */
export async function prepareImagesForAiPrompt(
  inputOrOptions: (File | Blob | string)[] | PrepareImagesOptions,
  maybeOptions?: Omit<PrepareImagesOptions, 'images'>
): Promise<{
  processedImages: string[];
  isMerged: boolean;
  imageCount: number;
  summaryText: string;
}> {
  let images: (File | Blob | string)[] = [];
  let compressEnabled = true;
  let mergeIntoSingle = false;
  let targetKb = 50;
  let mergeTargetKb = 200;

  if (Array.isArray(inputOrOptions)) {
    images = inputOrOptions;
    if (maybeOptions) {
      if (maybeOptions.compressEnabled !== undefined) compressEnabled = maybeOptions.compressEnabled;
      if (maybeOptions.mergeIntoSingle !== undefined) mergeIntoSingle = maybeOptions.mergeIntoSingle;
      if (maybeOptions.targetKb !== undefined) targetKb = maybeOptions.targetKb;
      if (maybeOptions.mergeTargetKb !== undefined) mergeTargetKb = maybeOptions.mergeTargetKb;
    }
  } else if (inputOrOptions && typeof inputOrOptions === 'object') {
    images = inputOrOptions.images || [];
    if (inputOrOptions.compressEnabled !== undefined) compressEnabled = inputOrOptions.compressEnabled;
    if (inputOrOptions.mergeIntoSingle !== undefined) mergeIntoSingle = inputOrOptions.mergeIntoSingle;
    if (inputOrOptions.targetKb !== undefined) targetKb = inputOrOptions.targetKb;
    if (inputOrOptions.mergeTargetKb !== undefined) mergeTargetKb = inputOrOptions.mergeTargetKb;
  }

  if (!images || images.length === 0) {
    return { processedImages: [], isMerged: false, imageCount: 0, summaryText: '' };
  }

  // 1. Separate audio from image/PDF items
  const imageAndPdfItems: (File | Blob | string)[] = [];
  const audioDataUrls: string[] = [];

  for (const item of images) {
    if (typeof item === 'string') {
      if (item.startsWith('data:audio') || item.includes('audio/')) {
        audioDataUrls.push(item);
      } else {
        imageAndPdfItems.push(item);
      }
    } else if (item instanceof File || item instanceof Blob) {
      if (item.type.startsWith('audio/')) {
        const audioUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(item);
        });
        audioDataUrls.push(audioUrl);
      } else {
        imageAndPdfItems.push(item);
      }
    }
  }

  // 2. Unpack any PDF pages so we have true image count
  const unpackedImageItems: (File | Blob | string)[] = [];
  for (const item of imageAndPdfItems) {
    if (isPdfFile(item)) {
      try {
        let pdfFile: File;
        if (typeof item === 'string') {
          const byteString = atob(item.split(',')[1]);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          pdfFile = new File([new Blob([ab], { type: 'application/pdf' })], 'doc.pdf', { type: 'application/pdf' });
        } else {
          pdfFile = item instanceof File ? item : new File([item], 'doc.pdf', { type: 'application/pdf' });
        }
        const pages = await convertPdfToImages(pdfFile);
        pages.forEach((p) => unpackedImageItems.push(p.dataUrl));
      } catch (err) {
        console.warn('PDF unpack error, passing as is:', err);
        unpackedImageItems.push(item);
      }
    } else {
      unpackedImageItems.push(item);
    }
  }

  // Case A: User enabled "Merge all into 1 image" and we have >= 2 images
  if (mergeIntoSingle && unpackedImageItems.length > 1) {
    try {
      const stitched = await stitchImagesIntoSinglePanel(unpackedImageItems, { targetKb: mergeTargetKb });
      console.log(`[AI Image Prep] Stitched ${unpackedImageItems.length} pages into 1 panel (${stitched.sizeKb}KB, ${stitched.width}x${stitched.height}px)`);
      return {
        processedImages: [stitched.dataUrl, ...audioDataUrls],
        isMerged: true,
        imageCount: unpackedImageItems.length,
        summaryText: `Merged ${unpackedImageItems.length} pages into 1 composite panel (${stitched.sizeKb}KB, ${stitched.width}x${stitched.height}px)`,
      };
    } catch (err) {
      console.warn('Image stitching failed, falling back to individual compression:', err);
    }
  }

  // Case B: Individual compression (~50KB per page)
  if (compressEnabled && unpackedImageItems.length > 0) {
    const compressedImages = await compressImagesForAi(unpackedImageItems, targetKb);
    console.log(`[AI Image Prep] Compressed ${unpackedImageItems.length} images to ~${targetKb}KB each`);
    return {
      processedImages: [...compressedImages, ...audioDataUrls],
      isMerged: false,
      imageCount: unpackedImageItems.length,
      summaryText: `Optimized ${unpackedImageItems.length} image(s) to ~${targetKb}KB each`,
    };
  }

  // Case C: Raw original images
  const rawUrls = await Promise.all(
    unpackedImageItems.map((img) => {
      if (typeof img === 'string') return Promise.resolve(img);
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(img);
      });
    })
  );

  return {
    processedImages: [...rawUrls, ...audioDataUrls],
    isMerged: false,
    imageCount: unpackedImageItems.length,
    summaryText: `Sent ${unpackedImageItems.length} document image(s) in original quality`,
  };
}

