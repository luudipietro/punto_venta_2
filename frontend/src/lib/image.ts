const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82
// Below this, resizing/re-encoding isn't worth the CPU cost — the file is
// already small enough to upload as-is.
const SKIP_BELOW_BYTES = 400 * 1024

/** Resizes and re-encodes an image client-side before it's uploaded.
 * Found as a real bug in manual testing: an iPhone camera photo is
 * routinely 5-15MB (well past `/uploads/images`' 5MB cap — see
 * `app/routes/upload_route.py`), so taking a photo straight into a product/
 * logo/hero-image upload failed with a "too large" error every time. Fixing
 * it here (shrink to a sane max dimension, re-encode as JPEG) is the actual
 * fix — raising the backend's cap would only buy a bit more headroom before
 * hitting the same wall with an even newer, higher-megapixel phone camera.
 * Skips GIFs (canvas would flatten any animation) and anything already
 * small; falls back to the original file if the browser can't decode it
 * (e.g. an exotic format) rather than blocking the upload. */
export async function compressImageForUpload(file: File): Promise<File> {
  if (file.type === 'image/gif' || file.size <= SKIP_BELOW_BYTES) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob || blob.size >= file.size) return file

    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file
  }
}
