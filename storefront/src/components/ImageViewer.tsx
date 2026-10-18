import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  images: string[]
  index: number
  onIndexChange: (index: number) => void
  alt: string
}

const SWIPE_THRESHOLD_PX = 40

/** Product photo viewer: a sliding track (same `translateX` approach as
 * `HeroCarousel`) with side arrows, ←/→ keyboard keys and touch swipe. Arrows
 * only render with 2+ photos. Index is controlled so the thumbnail strip
 * below stays in sync. */
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
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
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
        touchStartX.current = event.touches[0].clientX
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
        {images.map((url, i) => (
          <img
            key={url + i}
            src={url}
            alt={i === index ? alt : ''}
            draggable={false}
            className="size-full shrink-0 object-cover"
          />
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => goTo(index - 1)}
            aria-label="Foto anterior"
            className="absolute top-1/2 left-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-opacity hover:bg-black/60 md:opacity-0 md:group-hover:opacity-100"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            onClick={() => goTo(index + 1)}
            aria-label="Foto siguiente"
            className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition-opacity hover:bg-black/60 md:opacity-0 md:group-hover:opacity-100"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}
    </div>
  )
}
