import { useEffect, useRef } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { getPosterUrl, hasSound } from '@/api/client'

export const SLIDE_TRANSITION_MS = 500

interface Props {
  src: string
  /** Its slide is the one being shown. */
  active: boolean
  /** The carousel is on screen. */
  visible: boolean
  loop: boolean
  label: string
  /** The customer's choice, shared by every hero video. */
  soundOn: boolean
  onSoundChange: (soundOn: boolean) => void
  onEnded: () => void
  /** Told whether the video can't play (autoplay refused, load error), so the
   * carousel doesn't wait for an end that will never come. */
  onStuckChange: (stuck: boolean) => void
}

/** A video that behaves like any other hero slide: no controls, shown whole
 * like the photos. It starts muted (browsers only autoplay muted video), with a
 * button to turn the sound on. It plays while it's both the current slide and
 * on screen, resuming where it was after a scroll. */
export function HeroVideo({
  src,
  active,
  visible,
  loop,
  label,
  soundOn,
  onSoundChange,
  onEnded,
  onStuckChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const shouldPlay = active && visible

  function play() {
    const video = videoRef.current
    if (!video) return
    video.muted = !soundOn
    video.play().catch((error: DOMException) => {
      // `AbortError` is just a `pause()` arriving first.
      if (error.name === 'AbortError') return
      if (!video.muted) {
        // Phones may refuse sound without a tap on this very video: go on muted.
        onSoundChange(false)
        video.muted = true
        video.play().catch(() => onStuckChange(true))
        return
      }
      // Real, e.g. an iPhone in low power mode refusing to autoplay.
      onStuckChange(true)
    })
  }

  function toggleSound() {
    const video = videoRef.current
    if (!video) return
    // Set right here, inside the tap: phones don't allow unmuting any later.
    video.muted = soundOn
    if (!soundOn) {
      document
        .querySelectorAll<HTMLVideoElement>('video:not([data-ambient])')
        .forEach((other) => other.pause())
      video.play().catch(() => {})
    }
    onSoundChange(!soundOn)
  }

  useEffect(() => {
    if (shouldPlay) play()
    else videoRef.current?.pause()
    // `play` is recreated every render; only this should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay])

  // Turned off from outside (another video started).
  useEffect(() => {
    if (!soundOn && videoRef.current) videoRef.current.muted = true
  }, [soundOn])

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
    <div className="relative h-full w-full shrink-0">
      <video
        ref={videoRef}
        // Marks it as the hero's own: other videos don't pause it.
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
        className="size-full object-contain"
      />
      {hasSound(src) && (
        <button
          type="button"
          onClick={toggleSound}
          tabIndex={active ? 0 : -1}
          aria-label={soundOn ? 'Silenciar' : 'Activar sonido'}
          className="absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
        >
          {soundOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
      )}
    </div>
  )
}
