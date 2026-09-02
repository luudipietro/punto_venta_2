import { useEffect, useRef } from 'react'
import { Minus, Plus, Trash2, X } from 'lucide-react'
import { useCartStore } from '@/stores/cartStore'
import { formatCurrency, formatPriceOrConsult } from '@/lib/format'
import { buildCartWhatsAppUrl } from '@/lib/whatsapp'

interface Props {
  open: boolean
  whatsappNumber: string | null
  onClose: () => void
}

export function CartDialog({ open, whatsappNumber, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const lines = useCartStore((state) => state.lines)
  const setQuantity = useCartStore((state) => state.setQuantity)
  const removeLine = useCartStore((state) => state.removeLine)
  const clear = useCartStore((state) => state.clear)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const total = lines.reduce(
    (sum, line) => sum + (line.price ? Number(line.price) * line.quantity : 0),
    0,
  )
  const hasConsultItems = lines.some((line) => line.price === null)

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[calc(100%-2rem)] max-w-lg rounded-xl border border-border bg-card text-card-foreground backdrop:bg-black/50"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold">Tu carrito</h2>
          <button
            onClick={() => dialogRef.current?.close()}
            aria-label="Cerrar"
            className="rounded-full p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Todavía no agregaste nada.</p>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <ul className="flex flex-col gap-4">
              {lines.map((line) => (
                <li key={line.key} className="flex gap-3">
                  <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                    {line.imageUrl && (
                      <img
                        src={line.imageUrl}
                        alt=""
                        className="size-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{line.productName}</p>
                        {line.variantLabel && (
                          <p className="text-xs text-muted-foreground">{line.variantLabel}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeLine(line.key)}
                        aria-label="Quitar"
                        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center rounded-lg border border-border">
                        <button
                          onClick={() => setQuantity(line.key, line.quantity - 1)}
                          aria-label="Restar"
                          className="p-1.5 hover:bg-accent"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm">{line.quantity}</span>
                        <button
                          onClick={() => setQuantity(line.key, line.quantity + 1)}
                          aria-label="Sumar"
                          className="p-1.5 hover:bg-accent"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold">{formatPriceOrConsult(line.price)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lines.length > 0 && (
          <div className="border-t border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
            </div>
            {hasConsultItems && (
              <p className="mb-3 text-xs text-muted-foreground">
                Hay productos con precio a consultar — no están incluidos en el total.
              </p>
            )}
            {whatsappNumber ? (
              <a
                href={buildCartWhatsAppUrl(whatsappNumber, lines)}
                target="_blank"
                rel="noreferrer"
                className="mb-2 flex w-full items-center justify-center rounded-lg bg-[#25D366] px-4 py-3 font-medium text-white transition-opacity hover:opacity-90"
              >
                Pedir por WhatsApp
              </a>
            ) : (
              <p className="mb-2 text-center text-sm text-muted-foreground">
                Consultanos por nuestros canales de contacto habituales.
              </p>
            )}
            <button
              onClick={clear}
              className="w-full rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              Vaciar carrito
            </button>
          </div>
        )}
      </div>
    </dialog>
  )
}
