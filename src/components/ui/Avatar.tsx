import { initials } from '../../lib/format'

const PALETTE = [
  { bg: '#000000', fg: '#ffffff' },
  { bg: '#f26522', fg: '#000000' },
  { bg: '#fde3d6', fg: '#000000' },
  { bg: '#e0e0e0', fg: '#000000' },
]

function hash(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const c = PALETTE[hash(name) % PALETTE.length]
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  )
}
