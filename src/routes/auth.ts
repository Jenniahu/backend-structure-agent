import { Hono } from 'hono'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import {
  register,
  verifyLogin,
  createSession,
  destroySession,
} from '../services/auth.ts'
import { requireAuth, currentUser } from '../middleware/requireAuth.ts'

export const authRoutes = new Hono()

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'Lax' as const,
  path: '/',
  maxAge: 30 * 24 * 3600,
}

/** 简单邮箱格式与密码校验 */
function validate(email?: string, password?: string): string | null {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱格式不正确'
  if (!password || password.length < 6) return '密码至少 6 位'
  return null
}

// 注册
authRoutes.post('/register', async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}))
  const err = validate(email, password)
  if (err) return c.json({ error: err }, 400)
  try {
    const user = await register(email, password)
    const token = await createSession(user.id)
    setCookie(c, 'session', token, COOKIE_OPTS)
    return c.json({ user })
  } catch (e: any) {
    return c.json({ error: e.message || '注册失败' }, 400)
  }
})

// 登录
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}))
  const err = validate(email, password)
  if (err) return c.json({ error: err }, 400)
  const user = await verifyLogin(email, password)
  if (!user) return c.json({ error: '邮箱或密码错误' }, 401)
  const token = await createSession(user.id)
  setCookie(c, 'session', token, COOKIE_OPTS)
  return c.json({ user })
})

// 登出
authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, 'session')
  if (token) await destroySession(token)
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ ok: true })
})

// 获取当前用户
authRoutes.get('/me', requireAuth, (c) => {
  return c.json({ user: currentUser(c) })
})
