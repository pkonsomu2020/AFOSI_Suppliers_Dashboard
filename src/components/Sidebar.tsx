import { NavLink } from 'react-router-dom'
import { IconGrid, IconProfile, IconSearch, IconSparkle, IconUpload } from './icons'

const NAV = [
  { to: '/', label: 'Overview', icon: IconGrid, end: true },
  { to: '/find', label: 'Find a facilitator', icon: IconSearch },
  { to: '/profile', label: 'Supplier profile', icon: IconProfile },
]

const ADMIN_NAV = [{ to: '/update-results', label: 'Update results', icon: IconUpload }]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-6 overflow-y-auto rounded-3xl bg-ink p-5 text-white">
      <div className="shrink-0 px-2 pt-1">
        <img src="/afosi_logo_white.png" alt="AFOSI, Action for Sustainability Initiative" className="h-14 w-auto" />
      </div>

      <nav className="flex shrink-0 flex-col gap-1">
        <span className="px-2 pb-1 font-mono text-[10px] font-medium uppercase tracking-widest text-gray-500">Menu</span>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
                isActive ? 'bg-orange text-ink font-bold' : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <item.icon width={17} height={17} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <nav className="flex shrink-0 flex-col gap-1">
        <span className="px-2 pb-1 font-mono text-[10px] font-medium uppercase tracking-widest text-gray-500">Admin</span>
        {ADMIN_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
                isActive ? 'bg-orange text-ink font-bold' : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <item.icon width={17} height={17} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex shrink-0 flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
          <IconSparkle className="text-orange" width={20} height={20} />
          <span className="text-[13px] font-bold leading-tight">Need someone fast?</span>
          <span className="text-[12px] leading-snug text-gray-400">Search a skill and get the closest-matching people in minutes.</span>
        </div>
      </div>
    </aside>
  )
}
