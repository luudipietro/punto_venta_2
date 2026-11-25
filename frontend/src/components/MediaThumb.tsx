import { Play } from 'lucide-react'
import { getMediaUrl, getPosterUrl, isVideoUrl } from '@/lib/media'
import { cn } from '@/lib/utils'

/** Thumbnail for a stored photo or video — a video shows its poster with a
 * play badge, so it can't be mistaken for a photo. */
export function MediaThumb({ url, className }: { url: string; className?: string }) {
  const resolved = getMediaUrl(url)
  const isVideo = isVideoUrl(resolved)

  return (
    <span className={cn('relative block overflow-hidden', className)}>
      <img
        src={isVideo ? getPosterUrl(resolved) : resolved}
        alt=""
        className="size-full object-cover"
        onError={(event) => {
          event.currentTarget.style.visibility = 'hidden'
        }}
      />
      {isVideo && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/60 p-1.5 text-white">
            <Play className="size-3 fill-current" aria-label="Video" />
          </span>
        </span>
      )}
    </span>
  )
}
