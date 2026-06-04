import pkg from 'pg'
import { config } from '../config.ts'

const { Pool } = pkg

/**
 * 全局 PostgreSQL 连接池。
 * 使用连接池而非单连接,是后端处理并发请求的标准做法
 * (这本身就是一个架构知识点:连接复用,避免每次请求新建连接的开销)。
 */
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10, // 最大连接数
})

/** 简单封装查询,带类型 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const res = await pool.query(text, params)
  return res.rows as T[]
}

/** 查询单行(无结果返回 null) */
export async function queryOne<T = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows.length > 0 ? rows[0] : null
}
