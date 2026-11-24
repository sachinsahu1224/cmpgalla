export function toPaise(value: string | number): number {
  const raw = String(value).trim()
  if (!raw || raw === '-' || raw === '.') return 0
  const negative = raw.startsWith('-')
  const [whole, frac = ''] = raw.replace('-', '').split('.')
  const rupees = Number(whole || '0')
  if (!Number.isFinite(rupees)) return 0
  const paise = rupees * 100 + Number((frac + '00').slice(0, 2))
  return negative ? -paise : paise
}

export function toMilli(value: string | number): number {
  const raw = String(value).trim()
  if (!raw || raw === '-' || raw === '.') return 0
  const negative = raw.startsWith('-')
  const [whole, frac = ''] = raw.replace('-', '').split('.')
  const units = Number(whole || '0')
  if (!Number.isFinite(units)) return 0
  const milli = units * 1000 + Number((frac + '000').slice(0, 3))
  return negative ? -milli : milli
}

export function formatInr(paise: number): string {
  const negative = paise < 0
  const abs = Math.abs(Math.round(paise))
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${negative ? '-' : ''}₹${whole.toLocaleString('en-IN')}.${frac}`
}

function roundDiv(numerator: number, denominator: number): number {
  const sign = numerator < 0 ? -1 : 1
  const abs = Math.abs(numerator)
  return sign * Math.round(abs / denominator)
}

export function lineTaxPaise(quantityMilli: number, ratePaise: number): number {
  return roundDiv(quantityMilli * ratePaise, 1000)
}

export function gstPaise(taxablePaise: number, gstRate: number, intra: boolean): { cgst: number; sgst: number; igst: number } {
  if (gstRate <= 0 || taxablePaise <= 0) return { cgst: 0, sgst: 0, igst: 0 }
  if (!intra) return { cgst: 0, sgst: 0, igst: roundDiv(taxablePaise * gstRate, 100) }
  const half = roundDiv(taxablePaise * gstRate, 200)
  return { cgst: half, sgst: half, igst: 0 }
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowHundred(value: number): string {
  if (value < 20) return ONES[value]
  const ten = Math.floor(value / 10)
  const one = value % 10
  return one ? `${TENS[ten]} ${ONES[one]}` : TENS[ten]
}

function belowThousand(value: number): string {
  const hundred = Math.floor(value / 100)
  const rest = value % 100
  return [hundred ? `${ONES[hundred]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ')
}

export function inWords(rupees: number): string {
  if (rupees === 0) return 'Indian Rupees Zero Only'
  const crore = Math.floor(rupees / 10000000)
  const lakh = Math.floor((rupees % 10000000) / 100000)
  const thousand = Math.floor((rupees % 100000) / 1000)
  const rest = rupees % 1000
  const parts = [
    crore ? `${belowThousand(crore)} Crore` : '',
    lakh ? `${belowHundred(lakh)} Lakh` : '',
    thousand ? `${belowHundred(thousand)} Thousand` : '',
    rest ? belowThousand(rest) : '',
  ].filter(Boolean)
  return `Indian Rupees ${parts.join(' ')} Only`
}

export function formatAmount(paise: number): string {
  const negative = paise < 0
  const abs = Math.abs(Math.round(paise))
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${negative ? '-' : ''}${whole.toLocaleString('en-IN')}.${frac}`
}

export function amountInWords(paise: number): string {
  const abs = Math.abs(Math.round(paise))
  const rupees = Math.floor(abs / 100)
  const frac = abs % 100
  if (!frac) return inWords(rupees)
  return `${inWords(rupees).replace(/ Only$/, '')} and ${belowHundred(frac)} paise Only`
}
