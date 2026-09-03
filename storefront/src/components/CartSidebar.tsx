import { useEffect } from 'react'
import { Minus, Plus, Trash2, X } from 'lucide-react'
import { useCartStore } from '@/stores/cartStore'
import { useCartUiStore } from '@/stores/cartUiStore'
import { useCartPreview } from '@/hooks/useCartPreview'
import { formatCurrency, formatPriceOrConsult } from '@/lib/format'
import { buildCartWhatsAppUrl } from '@/lib/whatsapp'

interface Props {
  whatsappNumber: string | null
}

/** A right-side sliding drawer, not a centered dialog — a fixed backdrop +
 * `<aside>` pair, always mounted so the slide-in/out animates both ways,
 * driven by `cartUiStore`. Hand-rolled (no radix-ui `Dialog`, unlike the
 * admin app's `Sheet.tsx`) to keep this app dependency-light. */
export function CartSidebar({ whatsappNumber }: Props) {
  const isOpen = useCartUiStore((state) => state.isOpen)
  const close = useCartUiStore((state) => state.close)
  const lines = useCartStore((state) => state.lines)
  const setQuantity = useCartStore((state) => state.setQuantity)
  const removeLine = useCartStore((state) => state.removeLine)
  const clear = useCartStore((state) => state.clear)
  const { data: preview, isError } = useCartPreview(lines)

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, close])

  const naiveTotal = lines.reduce(
    (sum, line) => sum + (line.price ? Number(line.price) * line.quantity : 0),
    0,
  )
  const hasConsultItems = lines.some((line) => line.price === null)

  return (
    <>
      <div
        onClick={close}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-black/50 transition-opacity ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-card text-card-foreground shadow-xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Carrito de compras"
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold">Tu carrito</h2>
          <button
            onClick={close}
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
            {preview && preview.applied_promotions.length > 0 && (
              <div className="mb-2 space-y-1">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(preview.subtotal)}</span>
                </div>
                {preview.applied_promotions.map((promo) => (
                  <div
                    key={promo.promotion_id}
                    className="flex items-center justify-between text-sm text-emerald-600 dark:text-emerald-400"
                  >
                    <span>{promo.name}</span>
                    <span>-{formatCurrency(promo.discount_amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-bold text-primary">
                {formatCurrency(preview ? preview.total : naiveTotal)}
              </span>
            </div>
            {hasConsultItems && (
              <p className="mb-3 text-xs text-muted-foreground">
                Hay productos con precio a consultar — no están incluidos en el total.
              </p>
            )}
            {isError && (
              <p className="mb-3 text-xs text-muted-foreground">
                No pudimos calcular las promociones — mostrando el total sin descuentos.
              </p>
            )}
            {whatsappNumber ? (
              <a
                href={buildCartWhatsAppUrl(whatsappNumber, lines, preview)}
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
      </aside>
    </>
  )
}
