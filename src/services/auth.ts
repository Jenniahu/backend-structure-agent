import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { query, queryOne } from '../db/pool.ts'

/**
 * 鉴权服务:注册、登录、会话管理。
 * - 密码用 bcrypt 哈希,绝不明文存储。
 * - 登录后生成随机 token,存 auth_sessions 表,前端用 HttpOnly Cookie 持有。
 */

const SESSION_DAYS = 30

export interface User {
  id: number
  email: string
}

/** 注册新用户,返回用户;邮箱已存在则抛错 */
export async function register(email: string, password: string): Promise<User> {
  const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email])
  if (existing) {
    throw new Error('该邮箱已被注册')
  }
  const hash = await bcrypt.hash(password, 10)
  const row = await queryOne<{ id: number; email: string }>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
    [email, hash]
  )
  // 初始化偏好画像(长期记忆①)
  await query('INSERT INTO preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [row!.id])
  return { id: row!.id, email: row!.email }
}

/** 校验邮箱密码,成功返回用户,失败返回 null */
export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const row = await queryOne<{ id: number; email: string; password_hash: string }>(
    'SELECT id, email, password_hash FROM users WHERE email = $1',
    [email]
  )
  if (!row) return null
  const ok = await bcrypt.compare(password, row.password_hash)
  if (!ok) return null
  return { id: row.id, email: row.email }
}

/** 为用户创建登录会话,返回 token */
export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000)
  await query(
    'INSERT INTO auth_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expires]
  )
  return token
}

/** 通过 token 找到有效会话对应的用户 */
export async function getUserByToken(token: string): Promise<User | null> {
  if (!token) return null
  const row = await queryOne<{ id: number; email: string }>(
    `SELECT u.id, u.email
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  )
  return row ? { id: row.id, email: row.email } : null
}

/** 销毁会话(登出) */
export async function destroySession(token: string): Promise<void> {
  await query('DELETE FROM auth_sessions WHERE token = $1', [token])
}
