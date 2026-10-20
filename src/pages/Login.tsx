import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/AuthStore'
import { DonutProgress } from '../components/ui/DonutProgress'
import { CapsuleBars } from '../components/ui/CapsuleBars'
import { IconAlert, IconEye, IconEyeOff } from '../components/icons'

export default function Login() {
  const { signIn } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const message = await signIn(email.trim(), password)
    setBusy(false)
    if (message) {
      setError('Incorrect email or password.')
      return
    }
    navigate(location.state?.from ?? '/', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-gray-100 p-2.5 sm:p-4">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col overflow-hidden rounded-[32px] bg-white shadow-pop lg:flex-row">
        {/* Left: form */}
        <div className="flex w-full flex-col justify-center gap-6 px-6 py-10 sm:px-12 sm:py-14 lg:w-1/2">
          <img src="/afosi_logo.png" alt="AFOSI" className="h-16 w-auto self-start" />

          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2.5">
              <h1 className="text-[28px] font-bold leading-tight tracking-tight">AFOSI Suppliers Database</h1>
              <p className="text-[15px] leading-relaxed text-gray-500">Sign in to manage the AFOSI supplier directory.</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                Email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] font-normal outline-none focus:border-orange focus:bg-white"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                Password
                <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 pr-2 focus-within:border-orange focus-within:bg-white">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="min-w-0 flex-1 rounded-xl bg-transparent px-4 py-3 text-[14px] font-normal outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-ink"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <IconEyeOff width={17} height={17} /> : <IconEye width={17} height={17} />}
                  </button>
                </div>
              </label>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-bad/30 bg-bad/5 px-3.5 py-2.5 text-[13px] font-semibold text-bad">
                  <IconAlert width={15} height={15} className="shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-orange py-3.5 text-[15px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Logging in…' : 'Log in'}
              </button>
            </form>
          </div>
        </div>

        {/* Right: illustration */}
        <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-orange p-10 lg:flex">
          <div className="pointer-events-none absolute inset-0">
            <span className="absolute -right-10 -top-10 h-56 w-56 rounded-[40px] bg-white/10" />
            <span className="absolute right-24 top-32 h-16 w-16 rounded-2xl bg-white/10" />
            <span className="absolute -bottom-16 -left-10 h-64 w-64 rounded-full bg-black/10" />
            <span className="absolute bottom-40 left-28 h-10 w-10 rotate-12 rounded-xl bg-white/15" />
          </div>

          <div className="relative flex flex-1 items-center justify-center">
            <div className="relative w-full max-w-sm">
              <div className="rounded-3xl bg-white p-5 shadow-pop">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-[15px] font-bold">Directory</span>
                  <div className="flex gap-1 rounded-full bg-gray-50 p-1 text-[11px] font-semibold text-gray-400">
                    <span className="rounded-full bg-white px-2.5 py-1 text-ink shadow-sm">Trainers</span>
                    <span className="px-2.5 py-1">Consultants</span>
                    <span className="px-2.5 py-1">All</span>
                  </div>
                </div>
                <CapsuleBars
                  data={[
                    { label: 'Nrb', value: 34 },
                    { label: 'Coa', value: 18 },
                    { label: 'Cen', value: 22 },
                    { label: 'Nya', value: 15 },
                    { label: 'Wes', value: 12 },
                  ]}
                  highlightIndex={0}
                />
              </div>

              <div className="absolute -bottom-8 -right-8 flex flex-col items-center gap-1 rounded-3xl bg-ink p-5 text-white shadow-pop">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Verified</span>
                <DonutProgress percent={82} size={104} stroke={11} color="#F26522" trackColor="#333333" />
              </div>
            </div>
          </div>

          <div className="relative flex flex-col gap-2 pt-10 text-white">
            <h2 className="text-[28px] font-bold leading-tight tracking-tight">
              Find the right person, <span className="serif-italic">fast.</span>
            </h2>
            <p className="max-w-sm text-[14px] leading-relaxed text-white/80">
              Search, verify and shortlist AFOSI's prequalified trainers, facilitators and consultants, all in one directory.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
