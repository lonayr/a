// Persistent local file storage using IndexedDB + in-memory cache so original
// invoice images & PDFs are preserved permanently at full resolution without
// exceeding localStorage quota.

const DB_NAME = 'alkafeel_inbox_files_v1';
const STORE_NAME = 'files';

const memoryVault = new Map<string, string>();

function openVaultDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveOriginalFileData(fileId: string, dataUrl: string): Promise<void> {
  memoryVault.set(fileId, dataUrl);
  const db = await openVaultDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(dataUrl, fileId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadOriginalFileData(
  fileId: string,
  fallbackInlineDataUrl?: string
): Promise<string | null> {
  const mem = memoryVault.get(fileId);
  if (mem) return mem;
  const db = await openVaultDB();
  if (db) {
    const stored = await new Promise<string | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(fileId);
        req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (stored) {
      memoryVault.set(fileId, stored);
      return stored;
    }
  }
  return fallbackInlineDataUrl || null;
}

export function getCachedFileDataSync(fileId: string, fallbackInline?: string): string | null {
  return memoryVault.get(fileId) || fallbackInline || null;
}

export function inferInvoiceMimeType(file: File): string {
  if (file.type && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
    return file.type;
  }
  const lower = (file.name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return file.type || '';
}

export function computeFastHash(content: string): string {
  // FNV-1a 64-bit-like two-lane hex hash for reliable duplicate-image detection
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const step = content.length > 80000 ? Math.floor(content.length / 20000) : 1;
  for (let i = 0; i < content.length; i += step) {
    const ch = content.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i & 255);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}_${content.length}`;
}

export function extractBase64Payload(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(',');
  return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
}

/**
 * Resizes/compresses large raster images ONLY for the API extraction payload
 * so mobile camera photos never exceed size limits or stall OCR, while keeping
 * the untouched full-resolution original safely in fileVault.
 */
export function prepareImageForApi(
  dataUrl: string,
  mimeType: string
): Promise<{ mimeType: string; base64Data: string }> {
  if (
    !mimeType.startsWith('image/') ||
    typeof document === 'undefined' ||
    dataUrl.length < 1_500_000
  ) {
    return Promise.resolve({
      mimeType,
      base64Data: extractBase64Payload(dataUrl),
    });
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 2000;
        const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(100, Math.round((img.width || maxSide) * scale));
        const h = Math.max(100, Math.round((img.height || maxSide) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ mimeType, base64Data: extractBase64Payload(dataUrl) });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.86);
        resolve({
          mimeType: 'image/jpeg',
          base64Data: extractBase64Payload(compressed),
        });
      } catch {
        resolve({ mimeType, base64Data: extractBase64Payload(dataUrl) });
      }
    };
    img.onerror = () => resolve({ mimeType, base64Data: extractBase64Payload(dataUrl) });
    img.src = dataUrl;
  });
}

export function createThumbnailFromDataUrl(dataUrl: string, mimeType: string): Promise<string> {
  if (!mimeType.startsWith('image/') || typeof document === 'undefined') {
    return Promise.resolve('');
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 160;
        const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(24, Math.round((img.width || maxSide) * scale));
        const h = Math.max(24, Math.round((img.height || maxSide) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('');
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      } catch {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

export function readFileAsDataUrl(file: File, resolvedMimeType?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        let res = reader.result;
        // Fix data URLs with generic application/octet-stream when inferred MIME is known
        if (
          resolvedMimeType &&
          res.startsWith('data:application/octet-stream')
        ) {
          res = res.replace('data:application/octet-stream', `data:${resolvedMimeType}`);
        }
        resolve(res);
      } else {
        reject(new Error('تعذر قراءة الملف المرفوع.'));
      }
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف المرفوع.'));
    reader.readAsDataURL(file);
  });
}
