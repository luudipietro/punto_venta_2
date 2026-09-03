import { useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadProductImage } from '@/api/product'
import { useAddProductImage, useProductImages, useRemoveProductImage } from '@/hooks/useProductImages'

/** Extra photos for a product's future e-commerce listing, separate from the
 * cover image (`Product.image_url`) used everywhere else in the POS. Only
 * usable once the product has an id — a brand-new product has nowhere to
 * attach images to yet. */
export function ProductGallery({ productId }: { productId: number }) {
  const { data: images } = useProductImages(productId)
  const addMutation = useAddProductImage(productId)
  const removeMutation = useRemoveProductImage(productId)
  const [uploading, setUploading] = useState(false)

  async function handleAddFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadProductImage(file)
      await addMutation.mutateAsync(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove(imageId: number) {
    try {
      await removeMutation.mutateAsync(imageId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la imagen')
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label>Galería (fotos adicionales)</Label>
      {images && images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((image) => (
            <div key={image.id} className="group relative">
              <img
                src={image.url}
                alt=""
                className="aspect-square w-full rounded-md border object-cover"
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden'
                }}
              />
              <button
                type="button"
                onClick={() => handleRemove(image.id)}
                disabled={removeMutation.isPending}
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-destructive"
                aria-label="Quitar imagen"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Input
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(event) => handleAddFile(event.target.files?.[0])}
      />
      {uploading && <p className="text-xs text-muted-foreground">Subiendo imagen...</p>}
    </div>
  )
}
