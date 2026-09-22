// Browser-only. Resizes an image File down to at most 512px on its longest
// side and re-encodes it as WebP at ~80% quality before it ever reaches R2 —
// a typical 3-5MB phone photo lands well under 100KB. No server-side image
// library needed since this all happens client-side, before the presigned
// PUT.
const MAX_DIMENSION = 512
const QUALITY = 0.8

export async function compressImageToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', QUALITY))
  if (!blob) throw new Error('Failed to compress image')
  return blob
}
