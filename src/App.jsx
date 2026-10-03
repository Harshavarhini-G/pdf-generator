import { useCallback, useEffect, useRef, useState } from 'react'
import { clearSavedForm, emptyForm, loadForm, saveForm } from './storage.js'
import { fileToStoredImage } from './imageUtils.js'
import { buildPdf, pdfFileName } from './pdf.js'

const STORAGE_LIMIT_MB = 5

/* ---------- small building blocks ---------- */

function Section({ title, hint, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-brand/15 bg-white shadow-sm">
      <div className="border-b border-brand/10 bg-brand-soft px-4 py-3 sm:px-6">
        <h2 className="text-base font-semibold text-brand-dark">{title}</h2>
      </div>
      <div className="space-y-4 p-4 sm:p-6">
        {hint && <p className="text-sm text-slate-500">{hint}</p>}
        {children}
      </div>
    </section>
  )
}

function Label({ htmlFor, children, required }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
      {children}
      {required && <span className="ml-0.5 text-margin">*</span>}
    </label>
  )
}

function ImagePicker({ id, images, onAdd, onRemove, busy, label }) {
  const inputRef = useRef(null)
  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          e.target.value = '' // allow picking the same file again
          if (files.length) onAdd(files)
        }}
      />
      <button
        type="button"
        className="btn-secondary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Adding images…' : label}
      </button>

      {images.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No images added yet.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.id} className="overflow-hidden rounded-lg border border-rule bg-paper">
              <div className="flex h-32 items-center justify-center bg-white">
                <img src={img.data} alt={img.name} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-rule px-2 py-1.5">
                <span className="truncate text-xs text-slate-600" title={img.name}>
                  {i + 1}. {img.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(img.id)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-margin hover:bg-red-50"
                  aria-label={`Remove ${img.name}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ---------- app ---------- */

export default function App() {
  const [form, setForm] = useState(loadForm)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState({ kind: 'idle', text: 'Changes save automatically' })
  const [notice, setNotice] = useState(null)
  const [busyField, setBusyField] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState(null)

  const formRef = useRef(form)
  formRef.current = form
  const firstRender = useRef(true)
  const noticeTimer = useRef(null)

  const flash = useCallback((kind, text) => {
    setNotice({ kind, text })
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4500)
  }, [])

  const set = (field) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [field]: value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }

  /* ----- persistence ----- */
  const persist = useCallback((data) => {
    const res = saveForm(data)
    if (res.ok) {
      const mb = res.bytes / 1024 / 1024
      setStatus({
        kind: 'ok',
        text: `Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${mb.toFixed(1)} MB of about ${STORAGE_LIMIT_MB} MB used`,
      })
    } else {
      setStatus({
        kind: 'error',
        text: 'Browser storage is full. Remove some images so your work can be saved.',
      })
    }
    return res.ok
  }, [])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    setStatus({ kind: 'pending', text: 'Saving…' })
    const t = setTimeout(() => persist(form), 300)
    return () => clearTimeout(t)
  }, [form, persist])

  // flush pending changes if the tab is closed or hidden quickly
  useEffect(() => {
    const flush = () => saveForm(formRef.current)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  /* ----- preview (only built when the button is pressed) ----- */
  const closePreview = useCallback(() => {
    setPreviewOpen(false)
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return null
    })
  }, [])

  const openPreview = async () => {
    setPreviewOpen(true)
    setPreviewBusy(true)
    setPreviewError(null)
    try {
      const doc = await buildPdf({
        ...form,
        expNo: form.expNo || '—',
        title: form.title || 'Experiment title',
      })
      const url = URL.createObjectURL(doc.output('blob'))
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return url
      })
    } catch (err) {
      setPreviewError(err.message || 'Could not build the preview')
    } finally {
      setPreviewBusy(false)
    }
  }

  useEffect(() => {
    if (!previewOpen) return
    const onKey = (e) => e.key === 'Escape' && closePreview()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [previewOpen, closePreview])

  /* ----- images ----- */
  const addImages = async (field, files) => {
    setBusyField(field)
    const added = []
    const failed = []
    for (const file of files) {
      try {
        added.push(await fileToStoredImage(file))
      } catch (err) {
        failed.push(err.message)
      }
    }
    if (added.length) setForm((f) => ({ ...f, [field]: [...f[field], ...added] }))
    setBusyField(null)
    if (failed.length) flash('error', failed.join(' · '))
  }

  const removeImage = (field, id) =>
    setForm((f) => ({ ...f, [field]: f[field].filter((img) => img.id !== id) }))

  /* ----- actions ----- */
  const handleSave = () => {
    if (persist(form)) flash('ok', 'Saved in this browser.')
    else flash('error', 'Could not save. Browser storage is full — remove some images.')
  }

  const handleExport = async () => {
    const next = {}
    if (!form.expNo.trim()) next.expNo = 'Enter the experiment number.'
    if (!form.title.trim()) next.title = 'Enter the experiment title.'
    setErrors(next)
    if (Object.keys(next).length) {
      flash('error', 'Fill in the experiment number and title before exporting.')
      const first = next.expNo ? 'expNo' : 'title'
      document.getElementById(first)?.focus()
      return
    }
    setExporting(true)
    try {
      const doc = await buildPdf(form)
      doc.save(pdfFileName(form))
      persist(form) // data stays in the form and in storage
      flash('ok', `Exported ${pdfFileName(form)}`)
    } catch (err) {
      flash('error', `Export failed: ${err.message || err}`)
    } finally {
      setExporting(false)
    }
  }

  const handleClear = () => {
    const ok = window.confirm(
      'Clear the whole form?\n\nThis permanently deletes everything saved in this browser, including uploaded images.',
    )
    if (!ok) return
    clearSavedForm()
    firstRender.current = true
    setForm(emptyForm())
    setErrors({})
    setStatus({ kind: 'idle', text: 'Form cleared' })
    flash('ok', 'Form cleared.')
  }

  const statusColor =
    status.kind === 'error' ? 'font-medium text-red-100' : status.kind === 'ok' ? 'text-emerald-100' : 'text-blue-100'

  return (
    <div
      className={`min-h-screen transition-[padding] duration-300 ease-out ${
        previewOpen ? 'lg:pr-[max(38vw,420px)]' : ''
      }`}
    >
      {/* top bar */}
      <header className="bg-gradient-to-r from-brand-dark to-brand shadow-md">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-14 w-[132px] shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm sm:h-16 sm:w-[160px]">
              {logoFailed ? (
                <span className="text-sm font-bold tracking-wide text-brand-dark">KGiSL KITE</span>
              ) : (
                <img
                  src="/kgisl-logo.svg"
                  alt="KGiSL Institute of Technology"
                  className="max-h-full max-w-full object-contain"
                  onError={() => setLogoFailed(true)}
                />
              )}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold leading-tight text-white sm:text-2xl">
                Record Generator
              </h1>
              <p className={`text-xs ${statusColor}`} role="status" aria-live="polite">
                {status.text}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn shrink-0 bg-white text-brand-dark shadow-sm hover:bg-brand-soft"
            onClick={openPreview}
          >
            PDF preview
          </button>
        </div>
      </header>

      {notice && (
        <div
          role="alert"
          className={`fixed inset-x-4 bottom-4 z-30 mx-auto max-w-md rounded-lg px-4 py-3 text-sm shadow-lg ${
            notice.kind === 'error' ? 'bg-margin text-white' : 'bg-ink text-white'
          }`}
        >
          {notice.text}
        </div>
      )}

      <main className="mx-auto max-w-[1200px] px-3 py-5 sm:px-6 sm:py-8">
        {/* ---------- form: one large container holding every card ---------- */}
        <div className="space-y-5 rounded-3xl border border-brand/15 bg-gradient-to-b from-[#d6e5fd] to-[#e9f1fe] p-3 shadow-[0_24px_60px_-24px_rgba(33,71,196,0.45)] sm:p-8">
          <Section title="Experiment details">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="date">Date</Label>
                <input id="date" type="date" className="field" value={form.date} onChange={set('date')} />
              </div>
              <div>
                <Label htmlFor="expNo" required>
                  Experiment number
                </Label>
                <input
                  id="expNo"
                  className={`field ${errors.expNo ? 'field-error' : ''}`}
                  value={form.expNo}
                  onChange={set('expNo')}
                  placeholder="e.g. 5"
                  autoComplete="off"
                  aria-invalid={!!errors.expNo}
                />
                {errors.expNo && <p className="mt-1 text-xs text-margin">{errors.expNo}</p>}
              </div>
            </div>
            <div>
              <Label htmlFor="title" required>
                Topic / experiment title
              </Label>
              <input
                id="title"
                className={`field ${errors.title ? 'field-error' : ''}`}
                value={form.title}
                onChange={set('title')}
                placeholder="e.g. Implementation of Stack using Arrays"
                autoComplete="off"
                aria-invalid={!!errors.title}
              />
              {errors.title && <p className="mt-1 text-xs text-margin">{errors.title}</p>}
            </div>
          </Section>

          <Section title="Aim">
            <textarea
              id="aim"
              className="field min-h-[140px] resize-y"
              value={form.aim}
              onChange={set('aim')}
              placeholder="To write a program that…"
              aria-label="Aim"
            />
          </Section>

          <Section title="Algorithm" hint="Line breaks and indentation are kept exactly as you type them.">
            <textarea
              id="algorithm"
              className="field min-h-[260px] resize-y"
              value={form.algorithm}
              onChange={set('algorithm')}
              placeholder={'Step 1: Start\nStep 2: …'}
              aria-label="Algorithm"
            />
          </Section>

          <Section title="Program" hint="Type or paste your code, add program screenshots, or do both.">
            <textarea
              id="program"
              className="field min-h-[320px] resize-y font-mono text-[13px] leading-relaxed"
              value={form.program}
              onChange={set('program')}
              placeholder="#include <stdio.h>"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="Program code"
              wrap="off"
              style={{ whiteSpace: 'pre', overflowX: 'auto', tabSize: 4 }}
            />
            <div>
              <h3 className="mb-2 text-sm font-medium">Program images</h3>
              <ImagePicker
                id="programImages"
                label="Upload program images"
                images={form.programImages}
                busy={busyField === 'programImages'}
                onAdd={(files) => addImages('programImages', files)}
                onRemove={(id) => removeImage('programImages', id)}
              />
            </div>
          </Section>

          <Section title="Output" hint="Screenshots only. They appear in the order you add them.">
            <ImagePicker
              id="outputImages"
              label="Upload output screenshots"
              images={form.outputImages}
              busy={busyField === 'outputImages'}
              onAdd={(files) => addImages('outputImages', files)}
              onRemove={(id) => removeImage('outputImages', id)}
            />
          </Section>

          <Section title="Result">
            <textarea
              id="result"
              className="field min-h-[140px] resize-y"
              value={form.result}
              onChange={set('result')}
              placeholder="Thus the program was executed successfully and the output was verified."
              aria-label="Result"
            />
          </Section>

          {/* ---------- actions ---------- */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/15 bg-white p-4 shadow-sm sm:p-6">
            <button type="button" className="btn-primary" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
            <button type="button" className="btn-secondary" onClick={handleSave}>
              Save
            </button>
            <button type="button" className="btn-danger sm:ml-auto" onClick={handleClear}>
              Clear Form
            </button>
          </div>
          <p className="pb-1 text-center text-xs font-medium text-slate-500">Copyright by Techmorph</p>
        </div>
      </main>

      {/* ---------- preview drawer (slides in from the right) ---------- */}
      <aside
        aria-label="PDF preview"
        aria-hidden={!previewOpen}
        className={`fixed right-0 top-0 z-40 flex h-full w-full flex-col border-l border-brand/20 bg-white shadow-2xl transition-[transform,visibility] duration-300 ease-out lg:w-[38vw] lg:min-w-[420px] ${
          previewOpen ? 'visible translate-x-0' : 'invisible translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-brand/10 bg-brand-soft px-4 py-3">
          <h2 className="text-base font-semibold text-brand-dark">PDF preview</h2>
          <div className="flex items-center gap-3">
            {previewUrl && (
              <a
                className="text-sm font-medium text-brand hover:underline"
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in new tab
              </a>
            )}
            <button
              type="button"
              onClick={closePreview}
              aria-label="Close preview"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-brand-dark transition-colors hover:bg-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-slate-200">
          {previewError ? (
            <p className="p-6 text-sm text-margin">{previewError}</p>
          ) : previewBusy || !previewUrl ? (
            <p className="p-6 text-sm text-slate-600">{previewOpen ? 'Building preview…' : ''}</p>
          ) : (
            <iframe title="PDF preview" src={previewUrl} className="h-full w-full" />
          )}
        </div>
        <p className="border-t border-brand/10 px-4 py-2 text-xs text-slate-500">
          If the preview is blank on your phone, tap &ldquo;Open in new tab&rdquo;.
        </p>
      </aside>
    </div>
  )
}
