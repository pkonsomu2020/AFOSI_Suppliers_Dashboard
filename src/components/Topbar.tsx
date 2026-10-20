import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/AuthStore'
import { Avatar } from './ui/Avatar'
import { IconBell, IconGrid, IconLogOut, IconMail, IconSearch } from './icons'

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const { session, signOut } = useAuthStore()
  const email = session?.user.email ?? ''

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(`/find${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
  }

  return (
    <header className="flex items-center gap-3 py-1">
      <button
        onClick={onMenu}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white lg:hidden"
        aria-label="Open menu"
      >
        <IconGrid width={18} height={18} />
      </button>

      <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5">
        <IconSearch width={18} height={18} className="shrink-0 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a skill, activity or supplier name"
          className="min-w-0 flex-1 border-none bg-transparent text-[14px] outline-none placeholder:text-gray-400"
        />
        <kbd className="hidden shrink-0 rounded-md bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-400 sm:inline-block">⌘F</kbd>
      </form>

      <button className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white sm:flex">
        <IconMail width={17} height={17} />
      </button>
      <button className="relative hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-white sm:flex">
        <IconBell width={17} height={17} />
        <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-orange" />
      </button>

      <div className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-gray-200 bg-white py-1.5 pl-1.5 pr-2">
        <Avatar name={email || 'AFOSI Staff'} size={34} />
        <div className="hidden flex-col leading-tight sm:flex">
          <span className="text-[13px] font-bold">AFOSI Staff</span>
          <span className="max-w-[160px] truncate text-[11px] text-gray-500">{email}</span>
        </div>
        <button
          onClick={() => signOut()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-50 hover:text-bad"
          aria-label="Log out"
          title="Log out"
        >
          <IconLogOut width={16} height={16} />
        </button>
      </div>
    </header>
  )
}
