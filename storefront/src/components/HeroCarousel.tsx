import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { isVideoUrl } from '@/api/client'
import { VideoPlayer } from '@/components/VideoPlayer'

const AUTO_ADVANCE_MS = 5000

/** Hand-rolled (no carousel library, consistent with this app's
 * dependency-light philosophy) — a flex track translated via `translateX`,
 * auto-advancing every ~5s, resetting the timer on manual navigation and
 * pausing on hover or while a video is being watched. Slides are images or
 * tap-to-play videos. Renders nothing with 0 slides, and no arrows/dots with
 * just 1. */
export function HeroCarousel({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [watchingVideo, setWatchingVideo] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (images.length <= 1 || paused || watchingVideo) return
    timerRef.current = setInterval(() => {
      setIndex((current) => (current + 1) % images.length)
    }, AUTO_ADVANCE_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // `index` restarts the countdown after a manual change.
  }, [images.length, paused, watchingVideo, index])

  if (images.length === 0) return null

  function goTo(next: number) {
    setIndex((next + images.length) % images.length)
  }

  return (
    <div className="w-full px-3 pt-4 sm:px-6 lg:px-8">
      <div
        className="group relative aspect-[16/9] w-full overflow-hidden rounded-xl md:aspect-[3/1]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {images.map((url, i) =>
            isVideoUrl(url) ? (
              <VideoPlayer
                key={url + i}
                src={url}
                active={i === index}
                label={`Video ${i + 1} de la portada`}
                onStartedChange={setWatchingVideo}
              />
            ) : (
              <img key={url + i} src={url} alt="" className="h-full w-full shrink-0 object-cover" />
            ),
          )}
        </div>

        {images.length > 1 && (
          <>
            <button
              onClick={() => goTo(index - 1)}
              aria-label="Anterior"
              className="absolute top-1/2 left-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => goTo(index + 1)}
              aria-label="Siguiente"
              className="absolute top-1/2 right-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}

        {/* The dots would sit on top of the video's own controls. */}
        {images.length > 1 && !watchingVideo && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((url, i) => (
              <button
                key={url + i}
                onClick={() => goTo(i)}
                aria-label={`Ir al elemento ${i + 1}`}
                className={`size-2 rounded-full transition-colors ${
                  i === index ? 'bg-white' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
