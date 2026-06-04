import 'dotenv/config'

/**
 * 集中管理所有环境变量配置。
 * 任何地方需要配置都从这里读,便于统一管理与校验。
 */
export const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || '',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret',
  llm: {
    baseUrl: process.env.LLM_BASE_URL || 'https://llm-api.mcisaas.com/v1',
    apiKey: process.env.LLM_API_KEY || '',
    // 强模型:用于作业批改(质量优先)
    modelStrong: process.env.LLM_MODEL_STRONG || 'gpt-5.4',
    // 快模型:用于讲解/问答(速度与成本优先)
    modelFast: process.env.LLM_MODEL_FAST || 'gpt-5.4-mini',
  },
}

/** 启动时校验关键配置是否齐全 */
export function validateConfig() {
  const missing: string[] = []
  if (!config.databaseUrl) missing.push('DATABASE_URL')
  if (!config.llm.apiKey) missing.push('LLM_API_KEY')
  if (missing.length > 0) {
    console.warn(`⚠️  缺少环境变量: ${missing.join(', ')}(部分功能将不可用)`)
  }
}
