import { useEffect } from 'react'
import { useBrandSettings } from '@/hooks/useBrandSettings'
import { brandConfig } from '@/theme/brand.config'

/** Keeps the browser tab's favicon and title in sync with the configured
 * brand — same fallback pattern as everywhere else brand data is read
 * (`brand?.company_name ?? brandConfig.companyName`). Mounted once near the
 * root. */
export function BrandMetaSync() {
  const { data: brand } = useBrandSettings()
  const logoUrl = brand?.logo_url ?? brandConfig.logoUrl
  const companyName = brand?.company_name ?? brandConfig.companyName

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = logoUrl
  }, [logoUrl])

  useEffect(() => {
    document.title = companyName
  }, [companyName])

  return null
}
