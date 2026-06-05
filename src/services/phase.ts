import { query, queryOne } from '../db/pool.ts'
import type { TeachingPhaseSpec, TopicSpec } from './knowledge.ts'

export interface PhaseState {
  userId: number
  topicId: string
  currentPhase: string
  completedPhases: string[]
  turnsInPhase: number
  phaseStartedAt: string
  updatedAt: string
}

export interface PhaseStateView extends PhaseState {
  phaseGoal: string
  triggerQuestion?: string
  successSignal?: string
  minTurns: number
  maxTurns: number
  canAdvance: boolean
  completed: boolean
}

interface PhaseRow {
  user_id: number
  topic_id: string
  current_phase: string
  completed_phases: string[]
  turns_in_phase: number
  phase_started_at: string
  updated_at: string
}

function firstPhase(spec: TopicSpec | null): string {
  return spec?.teachingFlow[0]?.phase || 'ANCHOR'
}

function toState(row: PhaseRow): PhaseState {
  return {
    userId: Number(row.user_id),
    topicId: row.topic_id,
    currentPhase: row.current_phase,
    completedPhases: row.completed_phases || [],
    turnsInPhase: Number(row.turns_in_phase || 0),
    phaseStartedAt: row.phase_started_at,
    updatedAt: row.updated_at,
  }
}

export function getCurrentPhaseSpec(spec: TopicSpec | null, currentPhase: string): TeachingPhaseSpec | null {
  if (!spec || currentPhase === 'COMPLETED') return null
  return spec.teachingFlow.find((p) => p.phase === currentPhase) || spec.teachingFlow[0] || null
}

export function renderPhaseView(state: PhaseState, spec: TopicSpec | null): PhaseStateView {
  const phaseSpec = getCurrentPhaseSpec(spec, state.currentPhase)
  const completed = state.currentPhase === 'COMPLETED'
  const minTurns = phaseSpec?.minTurns || 0
  const maxTurns = phaseSpec?.maxTurns || 0
  return {
    ...state,
    phaseGoal: completed ? '本主题学习阶段已完成' : (phaseSpec?.goal || ''),
    triggerQuestion: phaseSpec?.triggerQuestion || phaseSpec?.scenario || phaseSpec?.message,
    successSignal: phaseSpec?.successSignal,
    minTurns,
    maxTurns,
    canAdvance: !completed && state.turnsInPhase >= minTurns,
    completed,
  }
}

export async function getOrInitPhaseState(
  userId: number,
  topicId: string,
  spec: TopicSpec | null
): Promise<PhaseState> {
  const existing = await queryOne<PhaseRow>(
    `SELECT user_id, topic_id, current_phase, completed_phases, turns_in_phase, phase_started_at, updated_at
     FROM learning_phase_state
     WHERE user_id = $1 AND topic_id = $2`,
    [userId, topicId]
  )
  if (existing) return toState(existing)

  const startPhase = firstPhase(spec)
  const row = await queryOne<PhaseRow>(
    `INSERT INTO learning_phase_state (user_id, topic_id, current_phase)
     VALUES ($1, $2, $3)
     RETURNING user_id, topic_id, current_phase, completed_phases, turns_in_phase, phase_started_at, updated_at`,
    [userId, topicId, startPhase]
  )
  if (!row) throw new Error('初始化学习阶段失败')
  return toState(row)
}

export async function incrementTurns(userId: number, topicId: string): Promise<PhaseState | null> {
  const row = await queryOne<PhaseRow>(
    `UPDATE learning_phase_state
     SET turns_in_phase = turns_in_phase + 1, updated_at = now()
     WHERE user_id = $1 AND topic_id = $2
     RETURNING user_id, topic_id, current_phase, completed_phases, turns_in_phase, phase_started_at, updated_at`,
    [userId, topicId]
  )
  return row ? toState(row) : null
}

export async function advancePhase(userId: number, topicId: string, spec: TopicSpec | null): Promise<{
  from: string
  to: string
  completed: boolean
  message: string
  state: PhaseState
}> {
  if (!spec || spec.teachingFlow.length === 0) {
    throw new Error('该主题暂无教学阶段配置')
  }

  const state = await getOrInitPhaseState(userId, topicId, spec)
  if (state.currentPhase === 'COMPLETED') {
    return {
      from: 'COMPLETED',
      to: 'COMPLETED',
      completed: true,
      message: '你已完成本主题的全部学习阶段，可以直接进入作业练习。',
      state,
    }
  }

  const currentSpec = getCurrentPhaseSpec(spec, state.currentPhase)
  if (currentSpec && state.turnsInPhase < currentSpec.minTurns) {
    throw new Error('当前阶段尚未达到推进条件')
  }

  const currentIndex = spec.teachingFlow.findIndex((p) => p.phase === state.currentPhase)
  const nextSpec = spec.teachingFlow[currentIndex + 1]
  const from = state.currentPhase
  const to = nextSpec?.phase || 'COMPLETED'
  const completed = to === 'COMPLETED'
  const completedPhases = state.completedPhases.includes(from)
    ? state.completedPhases
    : [...state.completedPhases, from]

  const row = await queryOne<PhaseRow>(
    `UPDATE learning_phase_state
     SET current_phase = $3,
         completed_phases = $4,
         turns_in_phase = 0,
         phase_started_at = now(),
         updated_at = now()
     WHERE user_id = $1 AND topic_id = $2
     RETURNING user_id, topic_id, current_phase, completed_phases, turns_in_phase, phase_started_at, updated_at`,
    [userId, topicId, to, completedPhases]
  )
  if (!row) throw new Error('推进学习阶段失败')

  return {
    from,
    to,
    completed,
    message: completed
      ? '你已完成本主题的全部学习阶段。现在去做作业，把框架用起来吧。'
      : `很好，我们进入 ${to} 阶段。${nextSpec?.triggerQuestion || nextSpec?.scenario || nextSpec?.message || nextSpec?.goal || ''}`,
    state: toState(row),
  }
}

export async function resetPhase(userId: number, topicId: string, spec: TopicSpec | null): Promise<PhaseState> {
  const startPhase = firstPhase(spec)
  const rows = await query<PhaseRow>(
    `INSERT INTO learning_phase_state (user_id, topic_id, current_phase, completed_phases, turns_in_phase, phase_started_at, updated_at)
     VALUES ($1, $2, $3, '{}', 0, now(), now())
     ON CONFLICT (user_id, topic_id)
     DO UPDATE SET current_phase = EXCLUDED.current_phase,
                   completed_phases = '{}',
                   turns_in_phase = 0,
                   phase_started_at = now(),
                   updated_at = now()
     RETURNING user_id, topic_id, current_phase, completed_phases, turns_in_phase, phase_started_at, updated_at`,
    [userId, topicId, startPhase]
  )
  if (!rows[0]) throw new Error('重置学习阶段失败')
  return toState(rows[0])
}
