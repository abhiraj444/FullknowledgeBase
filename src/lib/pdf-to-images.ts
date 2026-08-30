'use client';

export interface PdfPageImage {
  file: File;
  dataUrl: string;
  pageNumber: number;
  totalPages: number;
}

/**
 * Checks if a file or URL represents a PDF document.
 */
export function isPdfFile(item: File | string): boolean {
  if (typeof item === 'string') {
    return item.startsWith('data:application/pdf') || /\.pdf(\?.*)?$/i.test(item);
  }
  return item.type === 'application/pdf' || /\.pdf$/i.test(item.name);
}

/**
 * Converts a PDF File into an array of individual high-resolution JPEG image files and data URLs.
 * Every page is rendered separately so it can be viewed as an image and sent to vision AI models.
 */
export async function convertPdfToImages(pdfFile: File, scale = 1.6): Promise<PdfPageImage[]> {
  if (typeof window === 'undefined') {
    throw new Error('PDF conversion can only run in a browser environment.');
  }

  // Dynamically import pdfjs-dist on client side to avoid SSR issues
  const pdfjsLib = await import('pdfjs-dist');

  // Configure worker
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const pageImages: PdfPageImage[] = [];

  const baseFileName = pdfFile.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) continue;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Fill white background to prevent transparent PDF layers from rendering black in JPEG
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport,
      canvas,
    } as any).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Convert dataUrl to a standard File object
    const byteString = atob(dataUrl.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: 'image/jpeg' });
    const imageFile = new File(
      [blob],
      `${baseFileName}_page_${pageNum}.jpg`,
      { type: 'image/jpeg', lastModified: Date.now() }
    );

    pageImages.push({
      file: imageFile,
      dataUrl,
      pageNumber: pageNum,
      totalPages: numPages,
    });
  }

  return pageImages;
}
