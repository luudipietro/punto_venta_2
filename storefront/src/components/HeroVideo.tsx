import { useEffect, useRef } from 'react'
import { getPosterUrl } from '@/api/client'

export const SLIDE_TRANSITION_MS = 500

interface Props {
  src: string
  /** Its slide is the one being shown. */
  active: boolean
  /** The carousel is on screen. */
  visible: boolean
  loop: boolean
  label: string
  onEnded: () => void
  /** Told whether the video can't play (autoplay refused, load error), so the
   * carousel doesn't wait for an end that will never come. */
  onStuckChange: (stuck: boolean) => void
}

/** A video that behaves like any other hero slide: no controls, muted (browsers
 * only autoplay muted video), cropped to fill like the photos. It plays while
 * it's both the current slide and on screen, resuming where it was after a
 * scroll. */
export function HeroVideo({
  src,
  active,
  visible,
  loop,
  label,
  onEnded,
  onStuckChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const shouldPlay = active && visible

  function play() {
    const video = videoRef.current
    if (!video) return
    video.muted = true
    video.play().catch((error: DOMException) => {
      // `AbortError` is just a `pause()` arriving first. Anything else is real,
      // e.g. an iPhone in low power mode refusing to autoplay.
      if (error.name !== 'AbortError') onStuckChange(true)
    })
  }

  useEffect(() => {
    if (shouldPlay) play()
    else videoRef.current?.pause()
    // `play` is recreated every render; only this should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay])

  // Rewinds once the slide is out of sight (not during the transition), so it
  // starts over next time round.
  useEffect(() => {
    if (active) return
    const timer = setTimeout(() => {
      if (videoRef.current) videoRef.current.currentTime = 0
    }, SLIDE_TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [active])

  return (
    <video
      ref={videoRef}
      // Marks it as background motion: other videos don't pause it.
      data-ambient
      src={src}
      poster={getPosterUrl(src)}
      // Nothing is downloaded until its turn comes.
      preload="none"
      muted
      playsInline
      disablePictureInPicture
      loop={loop}
      aria-label={label}
      onEnded={onEnded}
      onPlaying={() => onStuckChange(false)}
      onError={() => onStuckChange(true)}
      // The way to start it where autoplay is refused.
      onClick={play}
      className="h-full w-full shrink-0 object-cover"
    />
  )
}
