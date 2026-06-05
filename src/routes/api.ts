import { Hono } from 'hono'
import { requireAuth, currentUser } from '../middleware/requireAuth.ts'
import {
  getTopics,
  getTopic,
  getAssignments,
  getTopicSpec,
} from '../services/knowledge.ts'
import { teachChat, gradeAssignment, type ChatMessage } from '../services/agent.ts'
import {
  recallMemory,
  consolidateFromGrade,
  getAllMastery,
  getErrorProfile,
} from '../services/memory.ts'
import { query } from '../db/pool.ts'
import { getOrInitPhaseState, incrementTurns } from '../services/phase.ts'

/**
 * 核心业务路由。全部需要登录(挂 requireAuth)。
 */
export const apiRoutes = new Hono()
apiRoutes.use('*', requireAuth)

// ---------- 课程地图:主题列表 + 该用户的掌握度状态 ----------
apiRoutes.get('/topics', async (c) => {
  const user = currentUser(c)
  const data = getTopics()
  const mastery = await getAllMastery(user.id)

  // 计算每个主题对该用户的解锁状态
  const topics = data.topics.map((t) => {
    const m = mastery[t.id]
    let status: string = 'available'
    if (m) status = m.status
    // 解锁判断:依赖主题需达 mastered,否则 locked
    if (t.unlock) {
      const dep = mastery[t.unlock]
      if (!dep || dep.status !== 'mastered') status = 'locked'
    }
    return {
      ...t,
      score: m?.score || 0,
      status: t.order === 1 ? (m ? m.status : 'available') : status,
    }
  })

  return c.json({ framework: data.framework, topics })
})

// ---------- 获取某主题的作业题(供前端展示题目)----------
apiRoutes.get('/topics/:id/assignments', async (c) => {
  const topicId = c.req.param('id')
  const data = getAssignments(topicId)
  if (!data) return c.json({ error: '该主题暂无作业' }, 404)
  const spec = getTopicSpec(topicId)
  // 只返回题目,不暴露 rubric 细节
  return c.json({
    topic: topicId,
    assignments: data.assignments.map((a) => ({
      id: a.id,
      level: a.level,
      title: a.title,
      prompt: a.prompt,
      frameworkHints: spec?.assignmentFrameworkHints?.[a.level] || [],
    })),
  })
})

// ---------- 讲解 + 互动问答 ----------
apiRoutes.post('/chat', async (c) => {
  const user = currentUser(c)
  const { topicId, history } = await c.req.json().catch(() => ({}))
  if (!topicId || !getTopic(topicId)) {
    return c.json({ error: '主题不存在' }, 400)
  }
  const mem = await recallMemory(user.id, topicId)
  const msgs: ChatMessage[] = Array.isArray(history) ? history : []

  try {
    const spec = getTopicSpec(topicId)
    const phaseState = spec ? await getOrInitPhaseState(user.id, topicId, spec) : undefined
    const rawReply = await teachChat(topicId, msgs, mem, phaseState, spec)
    const canAdvance = rawReply.includes('[PHASE_READY_TO_ADVANCE]')
    const reply = rawReply.replace(/\[PHASE_READY_TO_ADVANCE\]/g, '').trim()
    if (phaseState) await incrementTurns(user.id, topicId)
    return c.json({ reply, canAdvance })
  } catch (e: any) {
    return c.json({ error: e.message || 'AI 调用失败' }, 500)
  }
})

// ---------- 作业批改(核心)----------
apiRoutes.post('/grade', async (c) => {
  const user = currentUser(c)
  const { topicId, assignmentId, answer } = await c.req.json().catch(() => ({}))
  if (!topicId || !assignmentId || !answer) {
    return c.json({ error: '缺少参数(topicId/assignmentId/answer)' }, 400)
  }

  try {
    // 召回记忆 → 批改 → 沉淀
    const mem = await recallMemory(user.id, topicId)
    const result = await gradeAssignment(topicId, assignmentId, answer, mem)

    // 存作业历史
    await query(
      `INSERT INTO assignments_history (user_id, topic, assignment_id, answer, score_json)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, topicId, assignmentId, answer, JSON.stringify(result)]
    )
    // 沉淀长期记忆
    await consolidateFromGrade(user.id, topicId, result)

    return c.json({ result })
  } catch (e: any) {
    return c.json({ error: e.message || '批改失败' }, 500)
  }
})

// ---------- 用户画像(进度 + 错题本)----------
apiRoutes.get('/profile', async (c) => {
  const user = currentUser(c)
  const mastery = await getAllMastery(user.id)
  const errors = await getErrorProfile(user.id)
  return c.json({ user, mastery, errors })
})

export default apiRoutes
