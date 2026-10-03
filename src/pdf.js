// Builds the lab record PDF. jsPDF is loaded on demand to keep first paint fast.

const COLLEGE = 'KGiSL INSTITUTE OF TECHNOLOGY'

// A4 portrait, all measurements in millimetres
const PAGE_W = 210
const PAGE_H = 297
const BORDER = 8 // gap between paper edge and page border
const PAD = 6 // gap between page border and content
const FOOTER_H = 11

const BODY = { size: 11, lh: 5.6 }
const CODE = { size: 9, lh: 4.3 }

// Standard PDF fonts only cover Latin-1 plus a few typographic symbols.
const REPLACEMENTS = {
  '\u2192': '->',
  '\u2190': '<-',
  '\u21d2': '=>',
  '\u2264': '<=',
  '\u2265': '>=',
  '\u2260': '!=',
  '\u2713': 'v',
  '\u2714': 'v',
  '\u00a0': ' ',
}
const clean = (text) =>
  String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/[\u2192\u2190\u21d2\u2264\u2265\u2260\u2713\u2714\u00a0]/g, (c) => REPLACEMENTS[c])
    .replace(/[^\n\x20-\x7E\xA0-\xFF\u2018\u2019\u201C\u201D\u2013\u2014\u2022\u2026]/g, '?')

export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso || ''
}

export function pdfFileName(form) {
  const safe = (s) => String(s).trim().replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')
  return `Exp_${safe(form.expNo)}.pdf`
}

export async function buildPdf(form) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })

  const left = BORDER + PAD
  const right = PAGE_W - BORDER - PAD
  const contentW = right - left
  const top = BORDER + PAD
  const bottom = PAGE_H - BORDER - FOOTER_H
  let y = top

  const ensure = (h) => {
    if (y + h > bottom) {
      doc.addPage()
      y = top
    }
  }

  // ---------- header box: Ex.No on the left, title on the right ----------
  const drawHeader = () => {
    const leftW = 62
    const rightW = contentW - leftW
    const title = clean(form.title).replace(/\n+/g, ' ').trim()

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    const titleLines = doc.splitTextToSize(title, rightW - 8)
    const titleLH = 6.4
    const meta = []
    if (form.date) meta.push(`Date : ${formatDate(form.date)}`)
    const leftH = 9 + meta.length * 5
    const h = Math.max(18, leftH + 4, titleLines.length * titleLH + 10)

    doc.setLineWidth(0.4)
    doc.setDrawColor(0)
    doc.rect(left, y, contentW, h)
    doc.line(left + leftW, y, left + leftW, y + h)

    doc.setFontSize(12)
    doc.text(`Ex.No : ${clean(form.expNo).trim()}`, left + 4, y + 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    meta.forEach((line, i) => doc.text(line, left + 4, y + 14 + i * 5))

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    const startY = y + (h - titleLines.length * titleLH) / 2 + 4.6
    titleLines.forEach((line, i) =>
      doc.text(line, left + leftW + rightW / 2, startY + i * titleLH, { align: 'center' }),
    )
    y += h + 6
  }

  // ---------- text helpers ----------
  const heading = (label, { keepWithNext = true } = {}) => {
    if (keepWithNext) ensure(22) // keep a heading together with at least a couple of lines
    y += 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    doc.setTextColor(0)
    doc.text(label, left, y + 4.5)
    y += 8
  }

  const wrapProse = (text) => {
    const out = []
    for (const raw of clean(text).split('\n')) {
      if (!raw.trim()) {
        out.push('')
        continue
      }
      // keep indentation: leading spaces become non-breaking spaces
      const indent = /^ */.exec(raw)[0].length
      const line = '\u00a0'.repeat(indent) + raw.slice(indent)
      out.push(...doc.splitTextToSize(line, contentW))
    }
    return out
  }

  const wrapCode = (text) => {
    const charW = doc.getTextWidth('M')
    const perLine = Math.max(10, Math.floor(contentW / charW) - 1)
    const out = []
    for (const raw of clean(text).split('\n')) {
      const line = raw.replace(/\s+$/, '')
      if (!line) {
        out.push('')
        continue
      }
      for (let i = 0; i < line.length; i += perLine) out.push(line.slice(i, i + perLine))
    }
    return out
  }

  const writeBlock = (text, { mono = false } = {}) => {
    if (!text || !text.trim()) return
    const style = mono ? CODE : BODY
    doc.setFont(mono ? 'courier' : 'helvetica', 'normal')
    doc.setFontSize(style.size)
    doc.setTextColor(20)
    const lines = mono ? wrapCode(text) : wrapProse(text)
    for (const line of lines) {
      ensure(style.lh)
      if (line) doc.text(line, left, y + style.lh - 1.3)
      y += style.lh
    }
    y += 2
  }

  const writeImages = (images) => {
    for (const img of images) {
      const ratio = img.w / img.h
      const maxH = bottom - top - 2
      const naturalW = (img.w * 25.4) / 110 // don't blow tiny images up
      let w = Math.min(contentW, Math.max(naturalW, contentW * 0.4))
      let h = w / ratio
      if (h > maxH) {
        h = maxH
        w = h * ratio
      }
      ensure(h + 2)
      const x = left + (contentW - w) / 2
      doc.addImage(img.data, 'JPEG', x, y, w, h, undefined, 'FAST')
      doc.setDrawColor(200)
      doc.setLineWidth(0.2)
      doc.rect(x, y, w, h)
      y += h + 4
    }
  }

  // ---------- content ----------
  drawHeader()

  heading('AIM')
  writeBlock(form.aim)

  heading('ALGORITHM')
  writeBlock(form.algorithm)

  heading('PROGRAM')
  writeBlock(form.program, { mono: true })
  writeImages(form.programImages || [])

  heading('OUTPUT')
  writeImages(form.outputImages || [])

  // RESULT always sits at the very end of the record: pinned to the bottom of
  // the last page. (Very long results simply flow on from the previous content.)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(BODY.size)
  const resultLines = form.result?.trim() ? wrapProse(form.result) : []
  const resultH = 2 + 8 + resultLines.length * BODY.lh + 2
  if (resultH <= bottom - top) {
    ensure(resultH)
    y = Math.max(y, bottom - resultH)
    heading('RESULT', { keepWithNext: false })
  } else {
    heading('RESULT')
  }
  writeBlock(form.result)

  // ---------- border + footer on every page ----------
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(0)
    doc.setLineWidth(0.6)
    doc.rect(BORDER, BORDER, PAGE_W - BORDER * 2, PAGE_H - BORDER * 2)

    const footerLineY = PAGE_H - BORDER - FOOTER_H + 3
    doc.setLineWidth(0.3)
    doc.line(BORDER, footerLineY, PAGE_W - BORDER, footerLineY)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(0)
    const textY = PAGE_H - BORDER - 3.5
    doc.text(COLLEGE, left, textY)
    doc.setFont('helvetica', 'normal')
    doc.text(`Page ${i} of ${pages}`, right, textY, { align: 'right' })
  }

  doc.setProperties({
    title: `Experiment ${form.expNo} - ${form.title}`,
    subject: 'Lab record',
  })
  return doc
}
