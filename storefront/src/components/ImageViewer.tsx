import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { isVideoUrl } from '@/api/client'
import { VideoPlayer } from '@/components/VideoPlayer'

interface Props {
  images: string[]
  index: number
  onIndexChange: (index: number) => void
  alt: string
}

const SWIPE_THRESHOLD_PX = 40
// Bottom strip of a playing video where the native seek bar lives.
const VIDEO_CONTROLS_HEIGHT_PX = 80

/** Product photo and video viewer: a sliding track (same `translateX`
 * approach as `HeroCarousel`) with side arrows, ←/→ keyboard keys and touch
 * swipe. Arrows only render with 2+ items. Index is controlled so the
 * thumbnail strip below stays in sync. */
export function ImageViewer({ images, index, onIndexChange, alt }: Props) {
  const touchStartX = useRef<number | null>(null)
  const count = images.length

  function goTo(next: number) {
    if (count > 1) onIndexChange((next + count) % count)
  }

  useEffect(() => {
    if (count <= 1) return
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO'].includes(target.tagName)) return
      if (event.key === 'ArrowLeft') onIndexChange((index - 1 + count) % count)
      if (event.key === 'ArrowRight') onIndexChange((index + 1) % count)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [count, index, onIndexChange])

  if (count === 0) {
    return (
      <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
        Sin imagen
      </div>
    )
  }

  return (
    <div
      className="group relative size-full overflow-hidden"
      onTouchStart={(event) => {
        const { clientX, clientY } = event.touches[0]
        const target = event.target
        // Dragging the seek bar must not change slides.
        const onVideoControls =
          target instanceof HTMLVideoElement &&
          target.controls &&
          target.getBoundingClientRect().bottom - clientY < VIDEO_CONTROLS_HEIGHT_PX
        touchStartX.current = onVideoControls ? null : clientX
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null) return
        const delta = event.changedTouches[0].clientX - touchStartX.current
        touchStartX.current = null
        if (Math.abs(delta) >= SWIPE_THRESHOLD_PX) goTo(delta < 0 ? index + 1 : index - 1)
      }}
    >
      <div
        className="flex size-full transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {images.map((url, i) =>
          isVideoUrl(url) ? (
            <VideoPlayer key={url + i} src={url} active={i === index} label={`Video de ${alt}`} />
          ) : (
            <img
              key={url + i}
              src={url}
              alt={i === index ? alt : ''}
              draggable={false}
              className="size-full shrink-0 object-cover"
            />
          ),
        )}
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => goTo(index - 1)}
            aria-label="Anterior"
            className="absolute top-1/2 left-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-opacity hover:bg-black/60 md:opacity-0 md:group-hover:opacity-100"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={() => goTo(index + 1)}
            aria-label="Siguiente"
            className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-opacity hover:bg-black/60 md:opacity-0 md:group-hover:opacity-100"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}
    </div>
  )
}
