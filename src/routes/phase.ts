import { Hono } from 'hono'
import { requireAuth, currentUser } from '../middleware/requireAuth.ts'
import { getTopic, getTopicSpec } from '../services/knowledge.ts'
import {
  advancePhase,
  getOrInitPhaseState,
  renderPhaseView,
  resetPhase,
} from '../services/phase.ts'

export const phaseRoutes = new Hono()
phaseRoutes.use('*', requireAuth)

phaseRoutes.get('/:topicId', async (c) => {
  const user = currentUser(c)
  const topicId = c.req.param('topicId')
  if (!getTopic(topicId)) return c.json({ error: '主题不存在' }, 404)

  const spec = getTopicSpec(topicId)
  const state = await getOrInitPhaseState(user.id, topicId, spec)
  return c.json(renderPhaseView(state, spec))
})

phaseRoutes.post('/:topicId/advance', async (c) => {
  const user = currentUser(c)
  const topicId = c.req.param('topicId')
  if (!getTopic(topicId)) return c.json({ error: '主题不存在' }, 404)

  try {
    const spec = getTopicSpec(topicId)
    const result = await advancePhase(user.id, topicId, spec)
    return c.json({
      from: result.from,
      to: result.to,
      completed: result.completed,
      message: result.message,
      state: renderPhaseView(result.state, spec),
    })
  } catch (e: any) {
    return c.json({ error: e.message || '推进学习阶段失败' }, 400)
  }
})

phaseRoutes.post('/:topicId/reset', async (c) => {
  const user = currentUser(c)
  const topicId = c.req.param('topicId')
  if (!getTopic(topicId)) return c.json({ error: '主题不存在' }, 404)

  const spec = getTopicSpec(topicId)
  const state = await resetPhase(user.id, topicId, spec)
  return c.json({
    reset: true,
    currentPhase: state.currentPhase,
    message: `已重置，从头开始学「${getTopic(topicId)?.title || topicId}」。`,
    state: renderPhaseView(state, spec),
  })
})

export default phaseRoutes
