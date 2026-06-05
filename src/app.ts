import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serveStatic } from '@hono/node-server/serve-static'
import { authRoutes } from './routes/auth.ts'
import { apiRoutes } from './routes/api.ts'
import { phaseRoutes } from './routes/phase.ts'

/**
 * Hono 应用主入口。
 * 这里只做装配:挂中间件、挂路由、挂静态资源。
 * 具体业务逻辑放在 routes/ 与 services/ 下,保持入口清爽。
 */
export const app = new Hono()

app.use('*', logger())

// 健康检查(部署平台探活 + 本地快速验证用)
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', service: 'archlearn', time: new Date().toISOString() })
})

// ====== 业务路由 ======
app.route('/api/auth', authRoutes)
app.route('/api/phase', phaseRoutes)
app.route('/api', apiRoutes)

// 静态资源(前端页面),放在最后兜底
app.use('/*', serveStatic({ root: './public' }))

export default app
