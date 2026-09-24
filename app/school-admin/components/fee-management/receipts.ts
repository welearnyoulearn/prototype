import type { ReceiptHeaderBlock, ReceiptCardData } from './types'

// ─── Shared fee-receipt rendering (branding, signature block, dual-copy layout) ─────

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const RUPEE = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`

const RECEIPT_HEADER_SIZE_PX: Record<ReceiptHeaderBlock['size'], number> = { sm: 11, md: 14, lg: 18, xl: 24 }

export function renderHeaderBlocks(blocks: ReceiptHeaderBlock[] = []): string {
  return blocks.map(b =>
    `<div style="font-size:${RECEIPT_HEADER_SIZE_PX[b.size]}px;font-weight:${b.bold ? 700 : 400};font-style:${b.italic ? 'italic' : 'normal'};text-align:${b.align}">${escapeHtml(b.text)}</div>`
  ).join('')
}

const RECEIPT_MODE_LABEL: Record<string, string> = {
  cash: 'Cash', cheque: 'Cheque', dd: 'Demand Draft', upi: 'UPI', online: 'Online Transfer',
}

export function receiptCard(data: ReceiptCardData, copyLabel: string): string {
  const lineRows = data.lines.map(l =>
    `<tr><td>${escapeHtml(l.label)}</td><td>${escapeHtml(l.period)}</td><td style="text-align:right">${RUPEE(l.amount)}</td></tr>`
  ).join('')
  return `
${copyLabel ? `<div class="copy-label">${escapeHtml(copyLabel)}</div>` : ''}
<div class="hdr">
  ${data.logo_url && data.logo_align === 'center' ? `<div style="text-align:center;margin-bottom:4px"><img src="${escapeHtml(data.logo_url)}" style="height:56px;object-fit:contain" /></div>` : ''}
  <div class="hdr-row">
    ${data.logo_url && data.logo_align === 'left' ? `<img class="hdr-logo left" src="${escapeHtml(data.logo_url)}" style="height:64px;object-fit:contain" />` : ''}
    <div class="hdr-text">
      <div class="school">${escapeHtml(data.school_name)}</div>
      ${renderHeaderBlocks(data.header_blocks)}
      <div class="rtitle">FEE RECEIPT</div>
      <div class="rno">Receipt No: <strong>${escapeHtml(data.receipt_number)}</strong></div>
    </div>
    ${data.logo_url && data.logo_align === 'right' ? `<img class="hdr-logo right" src="${escapeHtml(data.logo_url)}" style="height:64px;object-fit:contain" />` : ''}
  </div>
</div>
<div class="grid2">
  <div><div class="lbl">Student Name</div><div class="val">${escapeHtml(data.student_name)}</div></div>
  <div><div class="lbl">Roll Number</div><div class="val">${escapeHtml(data.roll_number)}</div></div>
  <div><div class="lbl">Class</div><div class="val">Grade ${escapeHtml(data.grade)}${escapeHtml(data.section)}</div></div>
  <div><div class="lbl">Parent / Guardian</div><div class="val">${escapeHtml(data.parent_name || '—')}</div></div>
</div>
<table><thead><tr><th>Fee Head</th><th>Period</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>${lineRows}</tbody>
<tfoot><tr class="tot"><td colspan="2" style="text-align:right">Total Paid:</td><td style="text-align:right">${RUPEE(data.total_paid)}</td></tr></tfoot></table>
<div class="grid2">
  <div><div class="lbl">Payment Mode</div><div class="val">${RECEIPT_MODE_LABEL[data.payment_mode] || escapeHtml(data.payment_mode)}</div></div>
  <div><div class="lbl">Payment Date</div><div class="val">${data.paid_date ? new Date(data.paid_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</div></div>
  ${data.transaction_ref ? `<div><div class="lbl">Reference</div><div class="val">${escapeHtml(data.transaction_ref)}</div></div>` : ''}
</div>
${data.notes ? `<div style="margin-bottom:10px"><div class="lbl">Remarks</div><div class="val">${escapeHtml(data.notes)}</div></div>` : ''}
<div class="sig-row">
  <div class="sig-box">${escapeHtml(data.collected_by_name || 'Collected By')}</div>
  <div class="sig-box">Authorized Signatory</div>
</div>
${data.balance_after != null ? `<div class="ftr">Balance after this payment: ${RUPEE(data.balance_after)} &nbsp;·&nbsp; Generated on ${new Date().toLocaleString('en-IN')}</div>` : `<div class="ftr">Generated on ${new Date().toLocaleString('en-IN')} &nbsp;·&nbsp; Computer-generated receipt.</div>`}
`
}

const RECEIPT_STYLE = `
  *{box-sizing:border-box}
  @page { size: A4; margin: 10mm }
  body{font-family:Arial,sans-serif;color:#222;max-width:720px;margin:0 auto}
  .sheet{page-break-inside:avoid;overflow:hidden;position:relative;padding:8px 4px}
  .cut-line{height:6mm;line-height:6mm;overflow:hidden;border-top:1px dashed #999;text-align:center;color:#999;font-size:10px}
  .copy-label{position:absolute;top:2px;right:4px;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px}
  .hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:10px}
  .hdr-row{position:relative}
  .hdr-row .hdr-logo{position:absolute;top:50%;transform:translateY(-50%)}
  .hdr-row .hdr-logo.left{left:0}.hdr-row .hdr-logo.right{right:0}
  .hdr-text{text-align:center}
  .school{font-size:18px;font-weight:bold}.rtitle{font-size:13px;font-weight:bold;margin-top:4px;letter-spacing:1px}
  .rno{font-size:11px;color:#555;margin-top:3px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
  .lbl{font-size:10px;color:#888;margin-bottom:1px}.val{font-size:12px;font-weight:500}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  th{background:#f3f4f6;padding:5px 8px;text-align:left;font-size:10px;border:1px solid #ddd}
  td{padding:5px 8px;font-size:11px;border:1px solid #ddd}
  .tot td{font-weight:bold;background:#f9fafb}
  .sig-row{display:flex;justify-content:space-between;margin-top:16px}
  .sig-box{text-align:center;border-top:1px solid #333;width:150px;padding-top:3px;font-size:10px;color:#555}
  .ftr{margin-top:8px;text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:6px}
  @media print{body{padding:0}}
`

// Writes HTML into a popup window and prints only after any <img> tags (e.g. school
// logo from Cloudinary) have finished loading — printing immediately after
// document.write() races the image request and can print a blank logo.
export function writeAndPrint(win: Window, html: string) {
  win.document.write(html); win.document.close()

  const images = Array.from(win.document.images)
  if (images.length === 0) { win.print(); return }
  let remaining = images.length
  const proceed = () => { if (--remaining <= 0) win.print() }
  images.forEach(img => {
    if (img.complete) proceed()
    else { img.addEventListener('load', proceed); img.addEventListener('error', proceed) }
  })
}

export function openReceiptWindow(receiptNumber: string, bodyHtml: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt ${escapeHtml(receiptNumber)}</title>
<style>${RECEIPT_STYLE}</style></head><body>${bodyHtml}</body></html>`
  const win = window.open('', '_blank', 'width=800,height=900')
  if (win) writeAndPrint(win, html)
}

// Two copies (Office + Payer) on one A4 sheet — used for every printed receipt
// (payment collection and passbook reprints alike). Sheet heights + cut-line are
// budgeted to total well under the ~277mm usable A4 height (297mm page - 10mm
// top/bottom margins) so both copies always land on a single page.
export function printDualCopyReceipt(data: ReceiptCardData) {
  openReceiptWindow(data.receipt_number, `
<div class="sheet" style="height:133mm">${receiptCard(data, 'Office Copy')}</div>
<div class="cut-line">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
<div class="sheet" style="height:133mm">${receiptCard(data, 'Payer Copy')}</div>`)
}
