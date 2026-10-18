import { useEffect } from 'react'
import { getMediaUrl } from '@/api/client'
import type { BrandSettings } from '@/api/brandSettings'

const MIME_BY_EXT: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
}

/** Keeps the tab's favicon and title in sync with the brand configured in the
 * POS (same data the admin's `BrandMetaSync` uses). Until the settings load —
 * or if there's no logo — the static `index.html` favicon/title stay. */
export function BrandMetaSync({ brand }: { brand: BrandSettings | undefined }) {
  const logoUrl = brand?.logo_url ? getMediaUrl(brand.logo_url) : ''
  const companyName = brand?.company_name

  useEffect(() => {
    if (!logoUrl) return
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    const ext = logoUrl.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? ''
    if (MIME_BY_EXT[ext]) link.type = MIME_BY_EXT[ext]
    else link.removeAttribute('type')
    link.href = logoUrl
  }, [logoUrl])

  useEffect(() => {
    if (companyName) document.title = companyName
  }, [companyName])

  return null
}
