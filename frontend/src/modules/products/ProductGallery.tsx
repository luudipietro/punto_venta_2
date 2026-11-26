import { useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadMedia } from '@/api/product'
import { useAddProductImage, useProductImages, useRemoveProductImage } from '@/hooks/useProductImages'
import { MediaThumb } from '@/components/MediaThumb'

/** Extra photos and videos for a product's online listing, separate from the
 * cover image (`Product.image_url`) used everywhere else in the POS. Only
 * usable once the product has an id — a brand-new product has nowhere to
 * attach images to yet. */
export function ProductGallery({ productId }: { productId: number }) {
  const { data: images } = useProductImages(productId)
  const addMutation = useAddProductImage(productId)
  const removeMutation = useRemoveProductImage(productId)
  const [uploading, setUploading] = useState<'image' | 'video' | null>(null)

  async function handleAddFile(file: File | undefined) {
    if (!file) return
    setUploading(file.type.startsWith('video/') ? 'video' : 'image')
    try {
      const url = await uploadMedia(file)
      await addMutation.mutateAsync(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir el archivo')
    } finally {
      setUploading(null)
    }
  }

  async function handleRemove(imageId: number) {
    try {
      await removeMutation.mutateAsync(imageId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el archivo')
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label>Galería (fotos y videos adicionales)</Label>
      {images && images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((image) => (
            <div key={image.id} className="group relative">
              <MediaThumb url={image.url} className="aspect-square w-full rounded-md border" />
              <button
                type="button"
                onClick={() => handleRemove(image.id)}
                disabled={removeMutation.isPending}
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-destructive"
                aria-label="Quitar de la galería"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Input
        type="file"
        accept="image/*,video/*"
        disabled={uploading !== null}
        onChange={(event) => {
          handleAddFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <p className="text-xs text-muted-foreground">
        {uploading === 'video'
          ? 'Subiendo y procesando video... puede tardar un par de minutos.'
          : uploading === 'image'
            ? 'Subiendo imagen...'
            : 'Videos de hasta 2 minutos y 150 MB.'}
      </p>
    </div>
  )
}
