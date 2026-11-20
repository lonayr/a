import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

interface ExtractFileInput {
  name?: string;
  mimeType: string;
  base64Data: string;
}

interface ExtractRequestBody {
  files?: ExtractFileInput[];
  knownSuppliers?: string[];
  defaultCurrency?: 'USD' | 'IQD';
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isSupportedInvoiceMime(mime: string): boolean {
  const normalized = (mime || '').toLowerCase();
  return normalized.startsWith('image/') || normalized === 'application/pdf';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientUpstreamError(rawMsg: string): boolean {
  const lower = rawMsg.toLowerCase();
  return (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('timeout') ||
    lower.includes('econnreset')
  );
}

function toArabicGeminiError(rawMsg: string): { status: number; message: string } {
  const lower = rawMsg.toLowerCase();
  if (lower.includes('unable to process input image') || lower.includes('invalid_argument')) {
    return {
      status: 422,
      message: 'تعذر معالجة الصورة المرفوعة: الصورة تالفة أو غير صالحة للقراءة.',
    };
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand')) {
    return {
      status: 503,
      message: 'خادم القراءة مزدحم مؤقتاً. تم حفظ الصورة في صندوق الفواتير ويمكنك الضغط على "إعادة القراءة" أو إدخالها يدوياً.',
    };
  }
  if (lower.includes('429') || lower.includes('resource_exhausted')) {
    return {
      status: 429,
      message: 'تم تجاوز حد الطلبات المؤقت لمحرك القراءة. يرجى المحاولة بعد قليل.',
    };
  }
  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return {
      status: 403,
      message: 'مفتاح خدمة قراءة الفواتير غير صالح أو غير مفعّل في الإعدادات.',
    };
  }
  return {
    status: 500,
    message: rawMsg || 'حدث خطأ غير متوقع أثناء قراءة الفاتورة.',
  };
}

async function callExtractionWithRetry(
  ai: GoogleGenAI,
  parts: ({ inlineData: { mimeType: string; data: string } } | { text: string })[]
) {
  const attempts: { model: string; delayMs: number }[] = [
    { model: 'gemini-4-hydrogen', delayMs: 0 },
    { model: 'gemini-4-hydrogen', delayMs: 900 },
    { model: 'gemini-3.1-flash-lite', delayMs: 1200 },
  ];

  let lastError: unknown;

  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i];
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              unreadable: {
                type: Type.BOOLEAN,
                description: 'True if image/document is unreadable, blank, blurry, or not an invoice.',
              },
              unreadableReason: {
                type: Type.STRING,
                description: 'Arabic explanation when unreadable is true.',
              },
              supplierName: {
                type: Type.STRING,
                description: 'Supplier or company name printed on the invoice.',
              },
              invoiceNumber: {
                type: Type.STRING,
                description: 'Invoice number or receipt number.',
              },
              invoiceDate: {
                type: Type.STRING,
                description: 'Invoice date in YYYY-MM-DD format if found, else empty string.',
              },
              currency: {
                type: Type.STRING,
                description: 'IQD or USD.',
              },
              discount: {
                type: Type.NUMBER,
                description: 'Total discount on the invoice (0 if none).',
              },
              declaredTotal: {
                type: Type.NUMBER,
                description: 'Final net total printed on the invoice.',
              },
              notes: {
                type: Type.STRING,
                description: 'Any extra invoice notes.',
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: 'Product or material name.' },
                    sku: { type: Type.STRING, description: 'Barcode or SKU if present.' },
                    specs: { type: Type.STRING, description: 'Specs, color, storage, or model details.' },
                    quantity: { type: Type.NUMBER, description: 'Quantity purchased.' },
                    unitCost: { type: Type.NUMBER, description: 'Purchase unit cost.' },
                    sellPrice: { type: Type.NUMBER, description: 'Suggested retail price if shown, else 0.' },
                  },
                },
              },
            },
          },
        },
      });
      return response;
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isTransientUpstreamError(msg) || i === attempts.length - 1) {
        throw err;
      }
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '60mb' }));

  // Ensure JSON parser errors (like payload too large) return clean JSON instead of HTML
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err && typeof err === 'object' && 'status' in err) {
        const status = Number((err as { status?: number }).status) || 400;
        const message =
          status === 413
            ? 'حجم الصور المرفوعة كبير جداً. يرجى تقليل عدد الصفحات أو ضغط الصورة.'
            : 'تنسيق الطلب غير صالح.';
        res.status(status).json({ ok: false, error: message });
        return;
      }
      next(err);
    }
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  app.post('/api/invoices/extract', async (req, res) => {
    try {
      const body = (req.body || {}) as ExtractRequestBody;
      const files = Array.isArray(body.files) ? body.files : [];

      if (files.length === 0) {
        res.status(400).json({ ok: false, error: 'لم يتم إرسال أي ملفات أو صور للفاتورة.' });
        return;
      }

      for (const file of files) {
        if (!file.base64Data || !file.base64Data.trim()) {
          res.status(400).json({
            ok: false,
            error: `الملف (${file.name || 'غير معروف'}) فارغ أو تالف ولا يمكن قراءته.`,
          });
          return;
        }
        if (!isSupportedInvoiceMime(file.mimeType)) {
          res.status(400).json({
            ok: false,
            error: `صيغة الملف (${file.mimeType || 'غير مدعومة'}) غير مدعومة. يرجى رفع صورة أو PDF.`,
          });
          return;
        }
        if (file.base64Data.length < 160) {
          res.status(422).json({
            ok: false,
            error: `الصورة (${file.name || 'المرفوعة'}) صغيرة جداً أو تالفة ولا تحتوي على بيانات فاتورة واضحة.`,
          });
          return;
        }
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          ok: false,
          error: 'خدمة قراءة الفواتير غير مفعلة حالياً (مفتاح GEMINI_API_KEY غير مضبوط في الإعدادات).',
        });
        return;
      }

      const suppliersHint =
        Array.isArray(body.knownSuppliers) && body.knownSuppliers.length > 0
          ? `الموردون المعروفون في النظام: ${body.knownSuppliers.slice(0, 40).join('، ')}.`
          : '';

      const promptText = `أنت نظام محاسبي دقيق لاستخراج بيانات فواتير الشراء والموردين لبرنامج "الكفيل" في العراق.
اقرأ جميع صفحات الفاتورة المرفقة بدقة واستخرج البيانات التالية بصيغة JSON مطابقة للمخطط:
- إذا كانت الصورة غير واضحة تماماً أو تالفة أو ليست فاتورة، ضع unreadable=true واكتب السبب بالعربية في unreadableReason.
- حوّل الأرقام العربية (٠-٩) إلى أرقام لاتينية صحيحة.
- حدد العملة (IQD للدينار العراقي أو USD للدولار الأمريكي)؛ الافتراضي ${body.defaultCurrency || 'IQD'} إذا لم تُذكر.
- استخرج اسم المورد، رقم الفاتورة، تاريخ الفاتورة (YYYY-MM-DD)، الخصم، والإجمالي النهائي المكتوب في الفاتورة (declaredTotal).
- استخرج جدول الأصناف كاملاً: اسم المادة، الباركود/الكود إن وجد، المواصفات، الكمية، سعر الشراء للوحدة، وسعر البيع المقترح (0 إذا لم يُذكر).
${suppliersHint}`;

      const parts = [
        ...files.map((f) => ({
          inlineData: {
            mimeType: f.mimeType,
            data: f.base64Data,
          },
        })),
        { text: promptText },
      ];

      const response = await callExtractionWithRetry(ai, parts);

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({
          ok: false,
          error: 'لم يُرجع محرك القراءة أي نص من الفاتورة. يرجى إعادة المحاولة أو إدخالها يدوياً.',
        });
        return;
      }

      let parsed: {
        unreadable?: boolean;
        unreadableReason?: string;
        supplierName?: string;
        invoiceNumber?: string;
        invoiceDate?: string;
        currency?: string;
        discount?: number;
        declaredTotal?: number;
        notes?: string;
        items?: {
          name?: string;
          sku?: string;
          specs?: string;
          quantity?: number;
          unitCost?: number;
          sellPrice?: number;
        }[];
      };

      try {
        parsed = JSON.parse(rawText);
      } catch {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          res.status(502).json({
            ok: false,
            error: 'تعذر تحليل استجابة القراءة الآلية. يرجى إعادة القراءة أو إدخال الأصناف يدوياً.',
          });
          return;
        }
        parsed = JSON.parse(jsonMatch[0]);
      }

      if (parsed.unreadable) {
        res.status(422).json({
          ok: false,
          error: parsed.unreadableReason?.trim() || 'الصورة غير واضحة أو لا تحتوي على فاتورة قابلة للقراءة.',
        });
        return;
      }

      const items = Array.isArray(parsed.items)
        ? parsed.items
            .map((it) => ({
              name: String(it.name || '').trim(),
              sku: String(it.sku || '').trim(),
              specs: String(it.specs || '').trim(),
              quantity: Number(it.quantity) || 0,
              unitCost: Number(it.unitCost) || 0,
              sellPrice: Number(it.sellPrice) || 0,
            }))
            .filter((it) => it.name.length > 0 || it.quantity > 0 || it.unitCost > 0)
        : [];

      if (items.length === 0 && !parsed.supplierName && !(Number(parsed.declaredTotal) > 0)) {
        res.status(422).json({
          ok: false,
          error: 'تعذر استخراج أصناف أو مبالغ واضحة من الصورة. يرجى المراجعة يدوياً أو إعادة التصوير.',
        });
        return;
      }

      res.json({
        ok: true,
        extracted: {
          supplierName: String(parsed.supplierName || '').trim(),
          invoiceNumber: String(parsed.invoiceNumber || '').trim(),
          invoiceDate: String(parsed.invoiceDate || '').trim(),
          currency: parsed.currency === 'USD' ? 'USD' : 'IQD',
          discount: Math.max(0, Number(parsed.discount) || 0),
          declaredTotal: Math.max(0, Number(parsed.declaredTotal) || 0),
          notes: String(parsed.notes || '').trim(),
          items,
        },
      });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'خطأ غير متوقع أثناء قراءة الفاتورة.';
      const mapped = toArabicGeminiError(rawMsg);
      res.status(mapped.status).json({ ok: false, error: mapped.message });
    }
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('/{*splat}', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
