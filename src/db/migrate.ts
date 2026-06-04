import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './pool.ts'

/**
 * 极简迁移脚本:按文件名顺序执行 migrations/ 下所有 .sql。
 * SQL 内已用 IF NOT EXISTS,所以可重复执行(幂等)。
 * 生产首次部署时,Render 启动前跑一次即可。
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '../../migrations')

async function run() {
  console.log('📦 开始执行数据库迁移...')
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')
    console.log(`  → 执行 ${file}`)
    await pool.query(sql)
  }

  console.log('✅ 迁移完成')
  await pool.end()
}

run().catch((err) => {
  console.error('❌ 迁移失败:', err)
  process.exit(1)
})
