import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function invoiceBarcodeText(parts: { gstin: string; number: string; date: string; buyerGstin: string; amount: string }) {
  return ['INV', parts.gstin, parts.number || 'DRAFT', parts.date, parts.buyerGstin, parts.amount].join('|')
}

export function InvoiceBarcode({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let live = true
    QRCode.toDataURL(value, { margin: 0, width: 128, errorCorrectionLevel: 'M' }).then((url) => {
      if (live) setSrc(url)
    })
    return () => {
      live = false
    }
  }, [value])
  return (
    <div className="text-center">
      <p className="text-xs font-semibold">{label}</p>
      {src ? <img src={src} alt={`${label} barcode`} className="mt-1 h-28 w-28" /> : <div className="mt-1 h-28 w-28 bg-white" />}
    </div>
  )
}
