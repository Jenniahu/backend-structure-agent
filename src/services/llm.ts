import { config } from '../config.ts'

/**
 * LLM 客户端:封装 OpenAI 兼容接口调用。
 * 用原生 fetch,不依赖 openai SDK,保持轻量。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  /** 是否要求返回 JSON(批改场景用) */
  json?: boolean
}

/** 调用 LLM 对话补全,返回文本内容 */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const model = options.model || config.llm.modelFast
  const body: any = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
  }
  if (options.maxTokens) body.max_tokens = options.maxTokens
  if (options.json) body.response_format = { type: 'json_object' }

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LLM 调用失败 (${res.status}): ${text}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLM 返回内容为空')
  }
  return content
}

/** 调用 LLM 并解析为 JSON 对象(失败时尝试提取 JSON 片段) */
export async function chatJson<T = any>(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<T> {
  const raw = await chat(messages, { ...options, json: true })
  try {
    return JSON.parse(raw) as T
  } catch {
    // 兜底:从文本中提取第一个 {...} 块
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      return JSON.parse(match[0]) as T
    }
    throw new Error(`无法解析 LLM 返回的 JSON: ${raw.slice(0, 200)}`)
  }
}
