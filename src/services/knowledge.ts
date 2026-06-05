import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 知识库加载器:读取 knowledge/ 下的教学内容。
 * 内容作为 Prompt 上下文喂给 LLM,保证教学质量稳定。
 * MVP 阶段直接读文件 + 内存缓存,不上 RAG。
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const kbRoot = join(__dirname, '../../knowledge')

// ---------- 类型定义 ----------
export interface Topic {
  id: string
  title: string
  subtitle: string
  order: number
  unlock: string | null
  summary: string
  keyPoints: string[]
  status: string
}

export interface TopicsData {
  framework: string[]
  topics: Topic[]
}

export interface RubricDimension {
  key: string
  name: string
  weight: number
  criteria: string
}

export interface Assignment {
  id: string
  level: string
  title: string
  prompt: string
}

export interface AssignmentData {
  topic: string
  rubric: {
    description: string
    dimensions: RubricDimension[]
    gradeBands: { min: number; label: string; comment: string }[]
  }
  assignments: Assignment[]
}

export interface TeachingPhaseSpec {
  phase: string
  goal: string
  triggerQuestion?: string
  successSignal?: string
  keyPoints?: string[]
  scenario?: string
  message?: string
  minTurns: number
  maxTurns: number
}

export interface TopicSpec {
  topicId: string
  teachingFlow: TeachingPhaseSpec[]
  assignmentFrameworkHints: Record<string, string[]>
}

// ---------- 简单内存缓存(读一次缓存住)----------
const cache = new Map<string, any>()

function readJson<T>(relPath: string): T {
  if (cache.has(relPath)) return cache.get(relPath)
  const data = JSON.parse(readFileSync(join(kbRoot, relPath), 'utf-8'))
  cache.set(relPath, data)
  return data
}

function readText(relPath: string): string {
  if (cache.has(relPath)) return cache.get(relPath)
  const data = readFileSync(join(kbRoot, relPath), 'utf-8')
  cache.set(relPath, data)
  return data
}

// ---------- 对外 API ----------

/** 获取所有主题与学习框架 */
export function getTopics(): TopicsData {
  return readJson<TopicsData>('topics.json')
}

/** 获取单个主题元信息 */
export function getTopic(topicId: string): Topic | undefined {
  return getTopics().topics.find((t) => t.id === topicId)
}

/** 获取主题的讲解素材(markdown 文本) */
export function getTopicMaterial(topicId: string): string {
  try {
    return readText(`topics/${topicId}.md`)
  } catch {
    return ''
  }
}

/** 获取主题的作业与评分标准 */
export function getAssignments(topicId: string): AssignmentData | null {
  try {
    return readJson<AssignmentData>(`assignments/${topicId}.json`)
  } catch {
    return null
  }
}

/** 获取单道作业题 */
export function getAssignment(topicId: string, assignmentId: string): Assignment | undefined {
  return getAssignments(topicId)?.assignments.find((a) => a.id === assignmentId)
}

/** 获取主题的教学引擎 Spec。没有 spec 的主题保持旧行为。 */
export function getTopicSpec(topicId: string): TopicSpec | null {
  try {
    return readJson<TopicSpec>(`specs/${topicId}.json`)
  } catch {
    return null
  }
}
