import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Toast } from './components/Toast'
import { DataGate } from './components/DataGate'
import { AppStoreProvider } from './store/AppStore'

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <AppStoreProvider>
      <div className="min-h-screen bg-gray-100 p-2.5 sm:p-4">
        <div className="mx-auto flex h-[calc(100vh-1.25rem)] max-w-[1600px] gap-3 rounded-[32px] bg-white p-3 shadow-pop sm:h-[calc(100vh-2rem)]">
          <div className="hidden lg:block">
            <Sidebar />
          </div>

          {menuOpen && (
            <div className="fixed inset-0 z-40 flex lg:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
              <div className="relative z-10 h-full p-2.5">
                <Sidebar onNavigate={() => setMenuOpen(false)} />
              </div>
            </div>
          )}

          <main className="flex min-w-0 flex-1 scroll-smooth flex-col gap-4 overflow-y-auto rounded-3xl bg-gray-50 p-4 sm:p-6">
            <Topbar onMenu={() => setMenuOpen(true)} />
            <DataGate>
              <Outlet />
            </DataGate>
          </main>
        </div>
        <Toast />
      </div>
    </AppStoreProvider>
  )
}
