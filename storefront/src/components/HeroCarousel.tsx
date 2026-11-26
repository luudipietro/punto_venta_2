import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { isVideoUrl } from '@/api/client'
import { HeroVideo, SLIDE_TRANSITION_MS } from '@/components/HeroVideo'

const AUTO_ADVANCE_MS = 5000
const MIN_VISIBLE_RATIO = 0.5

/** Hand-rolled (no carousel library, consistent with this app's
 * dependency-light philosophy) — a flex track translated via `translateX`.
 * A photo stays ~5s (paused while the mouse is over it); a video plays by
 * itself and the carousel moves on when it ends. Everything stands still while
 * the carousel is scrolled out of view. Renders nothing with 0 slides, and no
 * arrows/dots with just 1. */
export function HeroCarousel({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [visible, setVisible] = useState(false)
  const [stuckVideo, setStuckVideo] = useState<string | null>(null)
  const [soundOn, setSoundOn] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)
  const hasSlides = images.length > 0

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.intersectionRatio >= MIN_VISIBLE_RATIO),
      { threshold: [0, MIN_VISIBLE_RATIO] },
    )
    observer.observe(frame)
    return () => observer.disconnect()
  }, [hasSlides])

  // Another video starting (a product card's) takes the sound over.
  useEffect(() => {
    if (!soundOn) return
    function onPlay(event: Event) {
      const video = event.target as HTMLVideoElement
      if (!video.hasAttribute('data-ambient')) setSoundOn(false)
    }
    // Media events don't bubble, hence the capture phase.
    document.addEventListener('play', onPlay, true)
    return () => document.removeEventListener('play', onPlay, true)
  }, [soundOn])

  // A video sets its own pace — unless it can't play, then it's one more photo.
  const current = images[index]
  const waitsForVideo = isVideoUrl(current) && current !== stuckVideo

  useEffect(() => {
    if (images.length <= 1 || !visible || hovered || waitsForVideo) return
    // `index` restarts the countdown after a manual change.
    const timer = setTimeout(() => setIndex((index + 1) % images.length), AUTO_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [images.length, visible, hovered, waitsForVideo, index])

  if (!hasSlides) return null

  function goTo(next: number) {
    setIndex((next + images.length) % images.length)
  }

  return (
    <div className="w-full px-3 pt-4 sm:px-6 lg:px-8">
      <div
        ref={frameRef}
        className="group relative aspect-[16/9] w-full overflow-hidden rounded-xl md:aspect-[3/1]"
        // Mouse only: a tap on a phone would otherwise leave it "hovered".
        onPointerEnter={(event) => event.pointerType === 'mouse' && setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <div
          className="flex h-full transition-transform ease-out"
          style={{
            transform: `translateX(-${index * 100}%)`,
            transitionDuration: `${SLIDE_TRANSITION_MS}ms`,
          }}
        >
          {images.map((url, i) =>
            isVideoUrl(url) ? (
              <HeroVideo
                key={url + i}
                src={url}
                active={i === index}
                visible={visible}
                loop={images.length === 1}
                label={`Video ${i + 1} de la portada`}
                soundOn={soundOn}
                onSoundChange={setSoundOn}
                onEnded={() => goTo(i + 1)}
                onStuckChange={(stuck) => setStuckVideo(stuck ? url : null)}
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
          </>
        )}
      </div>
    </div>
  )
}
