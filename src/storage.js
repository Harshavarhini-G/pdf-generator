const KEY = 'lab-record-pdf:v1'

export const todayISO = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const emptyForm = () => ({
  date: todayISO(),
  expNo: '',
  title: '',
  aim: '',
  algorithm: '',
  program: '',
  programImages: [],
  outputImages: [],
  result: '',
})

export function loadForm() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyForm()
    return { ...emptyForm(), ...JSON.parse(raw) }
  } catch {
    return emptyForm()
  }
}

/** Returns { ok: true, bytes } or { ok: false, error } */
export function saveForm(form) {
  try {
    const json = JSON.stringify(form)
    localStorage.setItem(KEY, json)
    return { ok: true, bytes: json.length }
  } catch (err) {
    return { ok: false, error: err }
  }
}

export function clearSavedForm() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
