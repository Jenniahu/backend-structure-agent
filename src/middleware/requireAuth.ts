import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { getUserByToken, type User } from '../services/auth.ts'

/**
 * 鉴权中间件:校验 Cookie 中的 session token。
 * 通过则把 user 挂到 c.set('user'),否则返回 401。
 */
export async function requireAuth(c: Context, next: Next) {
  const token = getCookie(c, 'session') || ''
  const user = await getUserByToken(token)
  if (!user) {
    return c.json({ error: '未登录或登录已过期' }, 401)
  }
  c.set('user', user)
  await next()
}

/** 从 context 取出当前登录用户(在 requireAuth 之后调用) */
export function currentUser(c: Context): User {
  return c.get('user') as User
}
