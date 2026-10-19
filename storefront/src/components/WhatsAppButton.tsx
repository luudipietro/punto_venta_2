import { WhatsAppIcon } from '@/components/SocialIcons'

/** Always-visible floating link straight to the shop's WhatsApp chat — no
 * cart or prefilled order, just "talk to us". Renders nothing until the admin
 * has configured a number. */
export function WhatsAppButton({ phoneNumber }: { phoneNumber: string | null }) {
  if (!phoneNumber) return null

  return (
    <a
      href={`https://wa.me/${phoneNumber}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribinos por WhatsApp"
      className="fixed right-4 bottom-4 z-30 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 sm:right-6 sm:bottom-6"
    >
      <WhatsAppIcon className="size-8" />
    </a>
  )
}
