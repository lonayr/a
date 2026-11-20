import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function dataUrlToUint8Array(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const commaIdx = dataUrl.indexOf(',');
  const header = commaIdx >= 0 ? dataUrl.slice(0, commaIdx) : '';
  const payload = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const mimeMatch = header.match(/^data:([^;]+)/i);
  const mimeType = mimeMatch?.[1] || 'application/octet-stream';

  const isBase64 = /;base64/i.test(header) || commaIdx < 0;
  if (!isBase64) {
    const decoded = decodeURIComponent(payload);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return { mimeType, bytes };
  }

  const cleanBase64 = payload.replace(/\s+/g, '');
  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { mimeType, bytes };
}

export function dataUrlToBlobUrl(dataUrl: string, fallbackMime = 'application/pdf'): string {
  const { mimeType, bytes } = dataUrlToUint8Array(dataUrl);
  const effectiveMime =
    mimeType && mimeType !== 'application/octet-stream' ? mimeType : fallbackMime;
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: effectiveMime });
  return URL.createObjectURL(blob);
}

export async function renderPdfDataUrlToImages(
  dataUrl: string,
  maxPages = 20
): Promise<string[]> {
  const { bytes } = dataUrlToUint8Array(dataUrl);
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages || 0, maxPages);
  const rendered: string[] = [];

  for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1.75 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    rendered.push(canvas.toDataURL('image/png'));
  }

  await pdf.destroy();
  return rendered;
}
