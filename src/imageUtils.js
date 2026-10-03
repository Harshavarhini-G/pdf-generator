// Screenshots can be huge. localStorage holds roughly 5 MB, so every upload is
// scaled down and re-encoded as JPEG before it is stored.
const MAX_SIDE = 1600
const QUALITY = 0.82

const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('This file is not a readable image'))
    img.src = src
  })

export async function fileToStoredImage(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image`)
  }
  const img = await loadImage(await readAsDataURL(file))
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff' // flatten transparent PNGs onto white
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    data: canvas.toDataURL('image/jpeg', QUALITY),
    w,
    h,
  }
}
