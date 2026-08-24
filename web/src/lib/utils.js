import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs) => twMerge(clsx(inputs))

export const pad = (n) => String(n).padStart(2, '0')
export const hhmm = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`
export const minutesFromHHMM = (s) => {
  const [h, m] = String(s).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseDay = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (s, n) => {
  const d = parseDay(s)
  d.setDate(d.getDate() + n)
  return isoDay(d)
}
export const money = (n) =>
  new Intl.NumberFormat('lv-LV', { style: 'currency', currency: 'EUR' }).format(Number(n || 0))
/** "Forno · Rīga Centrs" → "Rīga Centrs", for chips where the brand is implied. */
export const shortName = (name) => {
  const parts = String(name || '').split('·')
  return (parts.length > 1 ? parts.slice(1).join('·') : parts[0]).trim()
}

export const initials = (name) =>
  String(name || '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
