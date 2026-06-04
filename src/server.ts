import { serve } from '@hono/node-server'
import { app } from './app.ts'
import { config, validateConfig } from './config.ts'

validateConfig()

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`🚀 ArchLearn 服务已启动: http://localhost:${info.port}`)
  }
)
