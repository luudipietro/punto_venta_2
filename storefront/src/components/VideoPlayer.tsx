import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { getPosterUrl } from '@/api/client'

interface Props {
  src: string
  /** False while its slide is off-screen: playback stops and the poster is
   * back the next time it's shown. */
  active: boolean
  label: string
  /** Shown until played, instead of the video's own poster. */
  poster?: string
  /** Only the round button starts playback, leaving the rest of the area to
   * whatever sits there (the product card's link). */
  smallButton?: boolean
  /** True from the tap on play until the video ends or its slide is left —
   * pausing in between doesn't count as done. */
  onStartedChange?: (started: boolean) => void
}

const MIN_VISIBLE_RATIO = 0.25

/** Tap-to-play video. Only the poster is downloaded until the customer asks
 * for it (`preload="none"`), so a catalog full of videos costs no extra mobile
 * data, and starting one pauses any other. */
export function VideoPlayer({
  src,
  active,
  label,
  poster,
  smallButton,
  onStartedChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [started, setStarted] = useState(false)

  function changeStarted(next: boolean) {
    setStarted(next)
    onStartedChange?.(next)
  }

  function stop() {
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.load() // back to the poster
    changeStarted(false)
  }

  function handlePlay() {
    document.querySelectorAll('video').forEach((video) => {
      if (video !== videoRef.current) video.pause()
    })
    changeStarted(true)
  }

  // Also covers the carousel advancing in the instant between the tap and
  // playback actually starting.
  useEffect(() => {
    if (!active && started) stop()
    // `stop` is recreated every render; only these two should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, started])

  // Scrolled away: pause, so it isn't heard from somewhere off-screen.
  useEffect(() => {
    const video = videoRef.current
    if (!started || !video) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const fullscreen =
          document.fullscreenElement === video ||
          (video as { webkitDisplayingFullscreen?: boolean } & HTMLVideoElement)
            .webkitDisplayingFullscreen
        if (entry.intersectionRatio < MIN_VISIBLE_RATIO && !fullscreen) video.pause()
      },
      { threshold: [0, MIN_VISIBLE_RATIO] },
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [started])

  return (
    <div className="relative size-full shrink-0">
      <video
        ref={videoRef}
        src={src}
        poster={poster || getPosterUrl(src)}
        preload="none"
        playsInline
        controls={started}
        tabIndex={active ? 0 : -1}
        aria-label={label}
        onPlay={handlePlay}
        onEnded={stop}
        // Cropped like the photos around it until played, then shown whole.
        className={`size-full ${started ? 'bg-black object-contain' : 'object-cover'}`}
      />
      {!started && (
        <button
          type="button"
          // `play()` has to run inside the tap itself, or phones block it.
          onClick={() => void videoRef.current?.play().catch(() => {})}
          tabIndex={active ? 0 : -1}
          aria-label="Reproducir video"
          className={`absolute z-10 flex items-center justify-center ${
            smallButton ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' : 'inset-0'
          }`}
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-black/55 text-white shadow-lg">
            <Play className="ml-0.5 size-7 fill-current" />
          </span>
        </button>
      )}
    </div>
  )
}
