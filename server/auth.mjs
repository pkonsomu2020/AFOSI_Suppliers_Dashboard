import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET
const COOKIE_NAME = 'afosi_session'
const TOKEN_TTL = '12h'

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return res.status(401).json({ error: 'Not authenticated.' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid.' })
  }
}

export function authRouter() {
  const router = express.Router()

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' })

    const adminEmail = process.env.ADMIN_EMAIL || ''
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || ''
    if (email.trim().toLowerCase() !== adminEmail.toLowerCase()) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }
    const ok = await bcrypt.compare(password, adminPasswordHash)
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' })

    const token = jwt.sign({ email: adminEmail }, JWT_SECRET, { expiresIn: TOKEN_TTL })
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000,
    })
    res.json({ email: adminEmail })
  })

  // Not behind requireAuth deliberately: this is the "do I already have a session?" check that
  // runs on every page load before the user has necessarily logged in — having no session yet
  // isn't an error, so it returns 200 with email: null rather than a 401 that'd show up as a
  // spurious-looking failed request in the browser console on every single visit.
  router.get('/me', (req, res) => {
    const token = req.cookies?.[COOKIE_NAME]
    if (!token) return res.json({ email: null })
    try {
      const user = jwt.verify(token, JWT_SECRET)
      res.json({ email: user.email })
    } catch {
      res.json({ email: null })
    }
  })

  router.post('/logout', (req, res) => {
    res.clearCookie(COOKIE_NAME)
    res.json({ ok: true })
  })

  return router
}
