import { chat, chatJson, type ChatMessage } from './llm.ts'
export type { ChatMessage } from './llm.ts'
import { config } from '../config.ts'
import {
  getTopic,
  getTopicMaterial,
  getAssignments,
  getAssignment,
  type TopicSpec,
} from './knowledge.ts'
import { getCurrentPhaseSpec, type PhaseState } from './phase.ts'

/**
 * Agent 核心:把「教学方法论 + 知识库素材 + 用户长期记忆」组装成 Prompt,
 * 实现讲解、苏格拉底问答、作业结构化批改三大能力。
 */

// ====== 用户长期记忆画像(供召回注入)======
export interface MemoryProfile {
  teachStyle: string // analogy | direct | visual
  pace: string // fast | normal | slow
  /** 该用户的高频错误类别(中文标签),如 ["容量估算", "取舍意识"] */
  weakCategories: string[]
  /** 当前主题掌握度 0-100 */
  mastery: number
}

/** 把记忆画像渲染成一段注入 Prompt 的中文描述 */
function renderMemory(mem?: MemoryProfile): string {
  if (!mem) return '这是一位新用户,暂无历史画像。'
  const styleMap: Record<string, string> = {
    analogy: '偏好用类比/生活例子讲解',
    direct: '偏好直接简洁的讲解',
    visual: '偏好图示化、结构化的讲解',
  }
  const paceMap: Record<string, string> = {
    fast: '节奏可以快一些',
    normal: '正常节奏',
    slow: '需要讲得细一些、慢一些',
  }
  const lines = [
    `- 讲解偏好: ${styleMap[mem.teachStyle] || '类比讲解'};${paceMap[mem.pace] || '正常节奏'}`,
    `- 当前主题掌握度: ${mem.mastery}/100`,
  ]
  if (mem.weakCategories.length > 0) {
    lines.push(`- 该用户的薄弱点(请在讲解和批改中重点关注、适时提醒): ${mem.weakCategories.join('、')}`)
  }
  return lines.join('\n')
}

function renderPhaseContext(phaseState?: PhaseState, spec?: TopicSpec | null): string {
  if (!phaseState || !spec) return ''
  if (phaseState.currentPhase === 'COMPLETED') {
    return `【当前教学阶段】
- 当前阶段：COMPLETED
- 本主题的阶段式学习已完成。可以继续答疑，但要鼓励学生去作业中使用系统设计框架。`
  }

  const current = getCurrentPhaseSpec(spec, phaseState.currentPhase)
  if (!current) return ''
  const currentIndex = spec.teachingFlow.findIndex((p) => p.phase === current.phase)
  const futurePhases = spec.teachingFlow.slice(currentIndex + 1).map((p) => p.phase).join('、') || '无'
  const keyPoints = current.keyPoints?.length
    ? `\n- 本阶段关键点：${current.keyPoints.join('；')}`
    : ''
  const task = current.triggerQuestion || current.scenario || current.message || ''

  return `【当前教学阶段】
- 已完成阶段：${phaseState.completedPhases.length ? phaseState.completedPhases.join('、') : '无'}
- 当前阶段：${current.phase}
- 当前阶段目标：${current.goal}
- 成功信号：${current.successSignal || '学生能用自己的话说明本阶段核心思路'}
- 已在本阶段对话 ${phaseState.turnsInPhase} 轮（最少 ${current.minTurns} 轮，上限 ${current.maxTurns} 轮）
- 当前阶段启动问题/任务：${task || '围绕当前阶段目标继续追问'}${keyPoints}

【本阶段行为规则——非常重要】
1. 你的首要任务是达成当前阶段目标，不要偏离。
2. 成功信号达成后，在回复末尾加上标记 [PHASE_READY_TO_ADVANCE]。
3. 如果已对话轮数 >= 上限轮数，无论是否完全达成，也主动建议推进并附上标记 [PHASE_READY_TO_ADVANCE]。
4. 如果学生提前问了后续阶段的内容，简短回答后顺势引导，可以适当提前推进。
5. 当前处于 ${current.phase} 阶段，不要完整展开 ${futurePhases} 阶段的内容。
6. 标记只放在回复最后，不要解释标记本身。`
}

// ====== 公共系统人设 ======
const PERSONA = `你是「ArchLearn」——一位专门帮计算机专业学生建立后端架构设计思维的 AI 导师。
你的教学铁律:
1. 你面对的是有技术基础但缺乏工程经验的学生,目标是让他们【建立架构思维】并能应对架构面试,而不是背答案。
2. 能用提问引导就不要直接灌输答案(苏格拉底式)。
3. 每个技术决策都要说清:为什么用 + 不用会怎样 + 有什么代价。
4. 善用类比降低门槛。
5. 小步快跑:每次讲解控制在很短的篇幅(最多 3-5 句),讲完就抛一个问题给学生,绝不长篇大论。
6. 始终引导学生用这套系统设计框架思考:需求澄清 → 容量估算 → 接口设计 → 数据模型 → 高层架构 → 深挖瓶颈 → 权衡讨论。
7. 用中文,语气友好、有耐心、像一个会带你思考的学长。

【提问规范——非常重要,你面对的是新手,提问必须具体可答】
A. 每次提问都必须包裹在一个【具体场景】里:给出具体的数据例子、具体的数字、具体的业务动作,
   绝不只抛抽象概念。
   ✗ 反例(太抽象,新手接不住):"缓存和数据库不一致了怎么办?"
   ✓ 正例(有场景,能下手答):"假设你缓存了某商品价格,运营刚把它从 100 元改成 80 元,
     但缓存里还是旧的 100 元,用户看到的就是错价。你觉得问题出在哪一步?有什么办法让缓存跟着更新?"
B. 提问后要【明确回答方向】或给一点提示,降低门槛,例如:"你可以先从'缓存什么时候该更新'这个角度想"。
C. 如果学生表示没看懂或答得偏,换一个【更生活化的新例子】重新解释和提问,不要重复同一句话。
D. 提问【循序渐进】,先易后难,一次只问一个问题,不要一口气抛好几个问题压垮学生。
E. 学生答对时,先肯定,再用一个【更进一步的具体场景】追问深一层。`

// ====== 能力 1:讲解 + 互动问答 ======
/**
 * 处理学习对话。messages 是本次会话历史(短期记忆),
 * 注入主题素材 + 用户长期记忆,返回 Agent 的下一句回复。
 */
export async function teachChat(
  topicId: string,
  history: ChatMessage[],
  mem?: MemoryProfile,
  phaseState?: PhaseState,
  spec?: TopicSpec | null
): Promise<string> {
  const topic = getTopic(topicId)
  const material = getTopicMaterial(topicId)

  const system: ChatMessage = {
    role: 'system',
    content: `${PERSONA}

【当前主题】${topic?.title || topicId}:${topic?.summary || ''}

【本主题教学素材(你必须基于此讲解,不要跑题)】
${material}

${renderPhaseContext(phaseState, spec)}

【这位学生的长期记忆画像】
${renderMemory(mem)}

请按教学铁律,结合学生画像进行讲解或追问。记住:小步快跑、能问就不直接给答案。`,
  }

  return chat([system, ...history], {
    model: config.llm.modelFast,
    temperature: 0.7,
    maxTokens: 800,
  })
}

// ====== 能力 2:作业结构化批改 ======
export interface ScoreDimension {
  key: string
  name: string
  score: number // 0-10
  good: string // 做得好的点
  issue: string // 问题/缺失
}

export interface GradeResult {
  total: number // 0-100
  grade: string // A/B/C/D
  gradeComment: string
  dimensions: ScoreDimension[]
  nextStep: string // 下一步建议
  followUp: string // 追问挑战
  /** 沉淀:本次暴露的薄弱类别(对应 rubric 的 key)*/
  weaknessKeys: string[]
}

/**
 * 批改作业,返回 5 维度结构化打分。
 * 用强模型 + 低 temperature + JSON 输出,保证打分稳定。
 */
export async function gradeAssignment(
  topicId: string,
  assignmentId: string,
  answer: string,
  mem?: MemoryProfile
): Promise<GradeResult> {
  const assignmentData = getAssignments(topicId)
  const assignment = getAssignment(topicId, assignmentId)
  if (!assignmentData || !assignment) {
    throw new Error('作业题不存在')
  }
  const rubric = assignmentData.rubric

  const dimensionDesc = rubric.dimensions
    .map((d) => `- ${d.key}(${d.name}): ${d.criteria}`)
    .join('\n')

  const system: ChatMessage = {
    role: 'system',
    content: `${PERSONA}

你现在是一位严格但建设性的架构面试官,正在批改一份系统设计作业。
请严格按照下面的评分标准打分,给出具体证据,不要笼统客套。

【评分标准:5 个维度,每维度 0-10 分,总分 = 各维度之和 ×2 = 满分 100】
${dimensionDesc}

【等级划分】
${rubric.gradeBands.map((b) => `≥${b.min}: ${b.label}(${b.comment})`).join(' | ')}

【这位学生的长期记忆画像(批改时可结合其薄弱点针对性点评)】
${renderMemory(mem)}

【你必须严格输出以下 JSON 结构,不要有多余文字】
{
  "dimensions": [
    {"key":"requirement","name":"需求澄清","score":0-10,"good":"做得好的具体点","issue":"问题或缺失的具体点"},
    {"key":"estimation","name":"容量估算","score":0-10,"good":"...","issue":"..."},
    {"key":"architecture","name":"架构合理性","score":0-10,"good":"...","issue":"..."},
    {"key":"tradeoff","name":"取舍意识","score":0-10,"good":"...","issue":"..."},
    {"key":"clarity","name":"表达清晰度","score":0-10,"good":"...","issue":"..."}
  ],
  "total": 0-100,
  "grade": "A/B/C/D",
  "gradeComment": "总评一句话",
  "nextStep": "针对最弱项给出的下一步学习建议",
  "followUp": "一个能继续深挖的追问挑战",
  "weaknessKeys": ["得分最低的1-2个维度的key"]
}`,
  }

  const user: ChatMessage = {
    role: 'user',
    content: `【作业题目】${assignment.title}(难度:${assignment.level})
${assignment.prompt}

【学生的作答】
${answer}

请批改并按要求输出 JSON。`,
  }

  const result = await chatJson<GradeResult>([system, user], {
    model: config.llm.modelStrong,
    temperature: 0.2,
    maxTokens: 1500,
  })

  // 兜底校验 total
  if (typeof result.total !== 'number') {
    result.total = result.dimensions.reduce((s, d) => s + (d.score || 0), 0) * 2
  }
  return result
}
