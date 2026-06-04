import { query, queryOne } from '../db/pool.ts'
import type { MemoryProfile } from './agent.ts'
import type { GradeResult } from './agent.ts'

/**
 * 记忆系统:实现长期记忆的「召回」与「沉淀」,即 PRD 第 4.3 节的记忆飞轮。
 * - 召回 recall: 从 DB 取出用户画像,组装成 MemoryProfile 注入 Prompt。
 * - 沉淀 consolidate: 批改/学习后,把观察写回 DB(更新掌握度、累加错误档案)。
 */

// 错误类别 key → 中文标签(用于在 Prompt 里展示薄弱点)
const CATEGORY_LABELS: Record<string, string> = {
  requirement: '需求澄清',
  estimation: '容量估算',
  architecture: '架构合理性',
  tradeoff: '取舍意识',
  clarity: '表达清晰度',
}

/** ① 召回:取出用户在某主题下的长期记忆画像 */
export async function recallMemory(userId: number, topic: string): Promise<MemoryProfile> {
  const pref = await queryOne<{ teach_style: string; pace: string }>(
    'SELECT teach_style, pace FROM preferences WHERE user_id = $1',
    [userId]
  )
  const mast = await queryOne<{ score: number }>(
    'SELECT score FROM mastery WHERE user_id = $1 AND topic = $2',
    [userId, topic]
  )
  // 取该用户高频错误类别(全局 + 本主题,按次数排序取前 3)
  const errs = await query<{ category: string; total: number }>(
    `SELECT category, SUM(count) AS total
     FROM errors WHERE user_id = $1
     GROUP BY category ORDER BY total DESC LIMIT 3`,
    [userId]
  )

  return {
    teachStyle: pref?.teach_style || 'analogy',
    pace: pref?.pace || 'normal',
    mastery: mast?.score || 0,
    weakCategories: errs.map((e) => CATEGORY_LABELS[e.category] || e.category),
  }
}

/** ② 沉淀:批改后更新长期记忆(掌握度 + 错误档案) */
export async function consolidateFromGrade(
  userId: number,
  topic: string,
  result: GradeResult
): Promise<void> {
  // --- 更新掌握度 ---
  // 简单策略:用本次总分按 30% 权重平滑更新历史掌握度
  const existing = await queryOne<{ score: number }>(
    'SELECT score FROM mastery WHERE user_id = $1 AND topic = $2',
    [userId, topic]
  )
  const oldScore = existing?.score || 0
  const newScore = Math.round(oldScore * 0.7 + result.total * 0.3)
  const status = newScore >= 75 ? 'mastered' : 'learning'

  await query(
    `INSERT INTO mastery (user_id, topic, score, status, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, topic)
     DO UPDATE SET score = $3, status = $4, updated_at = now()`,
    [userId, topic, newScore, status]
  )

  // --- 累加错误档案(本次暴露的薄弱维度)---
  for (const key of result.weaknessKeys || []) {
    await query(
      `INSERT INTO errors (user_id, category, topic, count, last_seen)
       VALUES ($1, $2, $3, 1, now())
       ON CONFLICT (user_id, category, topic)
       DO UPDATE SET count = errors.count + 1, last_seen = now()`,
      [userId, key, topic]
    )
  }
}

/** 获取用户在所有主题的掌握度(供课程地图渲染) */
export async function getAllMastery(
  userId: number
): Promise<Record<string, { score: number; status: string }>> {
  const rows = await query<{ topic: string; score: number; status: string }>(
    'SELECT topic, score, status FROM mastery WHERE user_id = $1',
    [userId]
  )
  const map: Record<string, { score: number; status: string }> = {}
  for (const r of rows) map[r.topic] = { score: r.score, status: r.status }
  return map
}

/** 获取用户错误档案(供错题本展示) */
export async function getErrorProfile(
  userId: number
): Promise<{ category: string; label: string; topic: string; count: number }[]> {
  const rows = await query<{ category: string; topic: string; count: number }>(
    'SELECT category, topic, count FROM errors WHERE user_id = $1 ORDER BY count DESC',
    [userId]
  )
  return rows.map((r) => ({
    category: r.category,
    label: CATEGORY_LABELS[r.category] || r.category,
    topic: r.topic,
    count: r.count,
  }))
}
