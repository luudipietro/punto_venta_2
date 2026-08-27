import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const STAGE_WIDTH = 440
const STAGE_HEIGHT = 320
const MIN_SIZE = 24
type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']

function clampRect(rect: Rect, bounds: Rect): Rect {
  const w = Math.min(Math.max(rect.w, MIN_SIZE), bounds.w)
  const h = Math.min(Math.max(rect.h, MIN_SIZE), bounds.h)
  const x = Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.w - w)
  const y = Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.h - h)
  return { x, y, w, h }
}

/** A minimal freeform image cropper — drag to move, drag a corner to
 * resize — so a logo that's too large/off-center can be trimmed down
 * before it's saved as the brand logo, without requiring the user to know
 * how to edit images themselves. Built on plain canvas/pointer events, same
 * "no extra dependency" approach the rest of this codebase's image handling
 * uses (see `priceTags.ts`'s logo rasterization). */
export function LogoCropDialog({
  file,
  open,
  onCancel,
  onConfirm,
}: {
  file: File | null
  open: boolean
  onCancel: () => void
  onConfirm: (file: File) => void
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [imageRect, setImageRect] = useState<Rect | null>(null)
  const [cropRect, setCropRect] = useState<Rect | null>(null)
  const dragState = useRef<{ mode: 'move' | Corner; startX: number; startY: number; startRect: Rect } | null>(
    null,
  )

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setObjectUrl(url)
    setImageRect(null)
    setCropRect(null)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handleImageLoad() {
    const img = imgRef.current
    if (!img) return
    const naturalRatio = img.naturalWidth / img.naturalHeight
    const stageRatio = STAGE_WIDTH / STAGE_HEIGHT
    let width: number
    let height: number
    if (naturalRatio > stageRatio) {
      width = STAGE_WIDTH
      height = STAGE_WIDTH / naturalRatio
    } else {
      height = STAGE_HEIGHT
      width = STAGE_HEIGHT * naturalRatio
    }
    const rect: Rect = {
      x: (STAGE_WIDTH - width) / 2,
      y: (STAGE_HEIGHT - height) / 2,
      w: width,
      h: height,
    }
    setImageRect(rect)
    setCropRect(rect)
  }

  function handlePointerDown(mode: 'move' | Corner, event: React.PointerEvent) {
    if (!cropRect) return
    event.preventDefault()
    dragState.current = { mode, startX: event.clientX, startY: event.clientY, startRect: cropRect }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  function handlePointerMove(event: PointerEvent) {
    const drag = dragState.current
    if (!drag || !imageRect) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    const { startRect } = drag
    let next: Rect
    if (drag.mode === 'move') {
      next = { ...startRect, x: startRect.x + dx, y: startRect.y + dy }
    } else {
      let { x, y, w, h } = startRect
      if (drag.mode === 'nw') {
        x = startRect.x + dx
        y = startRect.y + dy
        w = startRect.w - dx
        h = startRect.h - dy
      } else if (drag.mode === 'ne') {
        y = startRect.y + dy
        w = startRect.w + dx
        h = startRect.h - dy
      } else if (drag.mode === 'sw') {
        x = startRect.x + dx
        w = startRect.w - dx
        h = startRect.h + dy
      } else {
        w = startRect.w + dx
        h = startRect.h + dy
      }
      next = { x, y, w, h }
    }
    setCropRect(clampRect(next, imageRect))
  }

  function handlePointerUp() {
    dragState.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [])

  function handleConfirm() {
    const img = imgRef.current
    if (!img || !cropRect || !imageRect || !file) return
    const scale = img.naturalWidth / imageRect.w
    const sx = (cropRect.x - imageRect.x) * scale
    const sy = (cropRect.y - imageRect.y) * scale
    const sw = cropRect.w * scale
    const sh = cropRect.h * scale

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw))
    canvas.height = Math.max(1, Math.round(sh))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const croppedFile = new File([blob], file.name.replace(/\.\w+$/, '') + '-recortado.png', {
        type: 'image/png',
      })
      onConfirm(croppedFile)
    }, 'image/png')
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recortar logo</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Arrastrá para mover el recuadro, y las esquinas para ajustar el tamaño.
        </p>
        <div
          className="relative mx-auto overflow-hidden rounded-md border"
          style={{
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT,
            // Fixed light checkerboard regardless of the app's current
            // theme — same convention every image editor uses for
            // transparency, since a logo's own colors (often dark, for a
            // light background) would otherwise blend into a dark-mode
            // stage and become unreadable while cropping.
            backgroundColor: '#ffffff',
            backgroundImage:
              'repeating-conic-gradient(#d4d4d4 0% 25%, transparent 0% 50%)',
            backgroundSize: '16px 16px',
          }}
        >
          {objectUrl && (
            <img
              ref={imgRef}
              src={objectUrl}
              alt=""
              onLoad={handleImageLoad}
              className="pointer-events-none absolute"
              style={
                imageRect
                  ? { left: imageRect.x, top: imageRect.y, width: imageRect.w, height: imageRect.h }
                  : { opacity: 0 }
              }
            />
          )}
          {cropRect && (
            <div
              className="absolute cursor-move"
              style={{
                left: cropRect.x,
                top: cropRect.y,
                width: cropRect.w,
                height: cropRect.h,
                border: '2px solid #3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
              }}
              onPointerDown={(event) => handlePointerDown('move', event)}
            >
              {CORNERS.map((corner) => (
                <div
                  key={corner}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    handlePointerDown(corner, event)
                  }}
                  className="absolute size-3 rounded-full"
                  style={{
                    border: '2px solid #3b82f6',
                    backgroundColor: '#ffffff',
                    left: corner.includes('w') ? -6 : undefined,
                    right: corner.includes('e') ? -6 : undefined,
                    top: corner.includes('n') ? -6 : undefined,
                    bottom: corner.includes('s') ? -6 : undefined,
                    cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!cropRect}>
            Aplicar recorte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
