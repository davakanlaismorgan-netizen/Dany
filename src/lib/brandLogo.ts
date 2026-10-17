// Logo de marque blanche : le serveur n'accepte que du JPEG (il l'embarque tel quel dans le PDF, sans le décoder).
// Le navigateur convertit donc PNG / WebP / JPEG en JPEG réduit, sur fond blanc (les logos transparents restent lisibles).
export const LOGO_MAX_INPUT_BYTES = 2 * 1024 * 1024;
export const LOGO_MAX_OUTPUT_BYTES = 300 * 1024; // même limite que le serveur (MAX_LOGO_BYTES)
export const LOGO_MAX_W = 480;
export const LOGO_MAX_H = 160;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const logoPath = (ownerId: string) => `${ownerId}/brand/logo.jpg`;

/** Dimensions réduites pour tenir dans le cadre, sans jamais agrandir ni déformer. */
export function fitSize(w: number, h: number, maxW = LOGO_MAX_W, maxH = LOGO_MAX_H): { width: number; height: number } {
  const k = Math.min(1, maxW / w, maxH / h);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

export type LogoError = 'type' | 'size' | 'decode' | 'too_big';

/** Convertit une image en JPEG ≤ 300 Ko, ou renvoie un code d'erreur. */
export async function toJpegLogo(file: File): Promise<{ blob: Blob } | { error: LogoError }> {
  if (!LOGO_TYPES.includes(file.type)) return { error: 'type' };
  if (file.size > LOGO_MAX_INPUT_BYTES) return { error: 'size' };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { error: 'decode' };
  }
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { error: 'decode' };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  for (const quality of [0.9, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob && blob.size <= LOGO_MAX_OUTPUT_BYTES) return { blob };
  }
  return { error: 'too_big' };
}
