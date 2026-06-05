// ============ ArchLearn 前端逻辑 ============

// ---------- 工具函数 ----------
const $ = (id) => document.getElementById(id)

const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (res.status === 401) { location.href = '/login.html'; throw new Error('未登录') }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '请求失败')
  return data
}

// ---------- Markdown 渲染 ----------
// 配置 marked
marked.setOptions({
  breaks: true,        // 单换行转 <br>
  gfm: true,           // GitHub Flavored Markdown
})

// 自定义渲染器：代码块加高亮 + 复制按钮
const renderer = new marked.Renderer()
renderer.code = function(code, lang) {
  let highlighted = code
  let langLabel = lang || ''
  try {
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } else {
      highlighted = hljs.highlightAuto(code).value
      langLabel = ''
    }
  } catch {}
  const escapedCode = code.replace(/`/g, '&#96;')
  return `<pre><button class="copy-btn" onclick="copyCode(this)" data-code="${encodeURIComponent(escapedCode)}"><i class="fas fa-copy"></i> 复制</button><code class="language-${lang || 'plaintext'}">${highlighted}</code></pre>`
}
marked.use({ renderer })

/**
 * 将 Markdown 字符串转换为安全 HTML
 */
function renderMd(text) {
  if (!text) return ''
  const raw = marked.parse(text)
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['onclick', 'data-code'],  // 允许复制按钮的属性
    FORCE_BODY: true,
  })
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]))
}

/** 复制代码块内容到剪贴板 */
window.copyCode = function(btn) {
  const code = decodeURIComponent(btn.dataset.code)
  navigator.clipboard.writeText(code).then(() => {
    btn.innerHTML = '<i class="fas fa-check"></i> 已复制'
    setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> 复制' }, 1800)
  })
}

// ---------- 全局状态 ----------
const state = {
  topics: [],
  currentTopic: 'cache',
  currentTopicTitle: '缓存',
  history: [],          // 当前主题的对话历史(短期记忆)
  currentAssignment: null,
  phaseState: null,
  pendingAttachments: [],  // { type:'image'|'file', name, dataUrl, mimeType }
}

// ---------- 初始化 ----------
async function init() {
  try {
    const me = await api('/api/auth/me')
    $('user-email').textContent = me.user.email
  } catch { return }
  initMarkdown()
  await loadTopics()
  await loadProfile()
  await selectTopic('cache', '缓存')
  bindEvents()
  initLightbox()
}

/** 初始化 marked — 注册 hljs 后再一次性设置（避免重复注册） */
function initMarkdown() {
  // hljs 注册常用语言（CDN 已逐个引入，此处无需再 register）
  // 仅做一次配置保护
  if (window._mdInited) return
  window._mdInited = true
}

// ---------- 课程地图 ----------
async function loadTopics() {
  const data = await api('/api/topics')
  state.topics = data.topics
  const statusIcon = { mastered: '✅', learning: '🔄', available: '📖', locked: '🔒' }
  $('topic-list').innerHTML = data.topics.map(t => {
    const locked = t.status === 'locked'
    return `
      <li>
        <button data-topic="${t.id}" data-title="${t.title}" ${locked ? 'disabled' : ''}
          class="topic-btn w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between
          ${locked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100'}">
          <span class="flex items-center gap-2">
            <span>${statusIcon[t.status] || '📖'}</span>
            <span class="text-sm font-medium text-slate-700">${t.title}</span>
          </span>
          ${t.score > 0 ? `<span class="text-xs text-slate-400">${t.score}</span>` : ''}
        </button>
      </li>`
  }).join('')
  document.querySelectorAll('.topic-btn').forEach(b => {
    if (!b.disabled) b.onclick = () => selectTopic(b.dataset.topic, b.dataset.title)
  })
}

// ---------- 错题本 ----------
async function loadProfile() {
  const data = await api('/api/profile')
  if (data.errors && data.errors.length) {
    $('error-list').innerHTML = data.errors.map(e =>
      `<li class="flex justify-between"><span><i class="fas fa-circle text-red-300 text-[6px] align-middle mr-1.5"></i>${e.label}</span><span class="text-xs text-red-400 font-medium">×${e.count}</span></li>`
    ).join('')
  }
}

// ---------- 选择主题 ----------
async function loadPhaseState(topicId) {
  try {
    state.phaseState = await api(`/api/phase/${topicId}`)
  } catch {
    state.phaseState = null
  }
  return state.phaseState
}

async function selectTopic(id, title) {
  state.currentTopic = id
  state.currentTopicTitle = title
  state.history = []
  state.phaseState = null
  const topic = state.topics.find(t => t.id === id)
  $('topic-title').textContent = title
  $('topic-sub').textContent = topic ? topic.subtitle : ''
  document.querySelectorAll('.topic-btn').forEach(b =>
    b.classList.toggle('bg-indigo-50', b.dataset.topic === id))
  // 重置面板
  $('chat-box').innerHTML = ''
  $('report').classList.add('hidden')
  $('report').innerHTML = ''
  clearAttachments()
  $('assignment-hints').classList.add('hidden')
  $('assignment-hints').innerHTML = ''
  const phase = await loadPhaseState(id)
  const opener = phase?.triggerQuestion
    ? `我们开始学习「${title}」。现在是 **${phase.currentPhase}** 阶段：${phase.phaseGoal}\n\n${phase.triggerQuestion}`
    : `我们开始学习「${title}」。我会带你一步步建立思路,随时打断我提问。准备好了吗?先告诉我:你觉得${title}主要是用来解决什么问题的?`
  addMessage('assistant', opener)
  await loadAssignments(id)
}

// ---------- 消息渲染 ----------
/**
 * @param {'user'|'assistant'} role
 * @param {string} text - Markdown 文本
 * @param {Array} attachments - 附件列表 [{type, name, dataUrl}]
 */
function addMessage(role, text, attachments = []) {
  const box = $('chat-box')
  const isUser = role === 'user'
  const div = document.createElement('div')
  div.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`

  // 构建附件 HTML
  let attachHtml = ''
  if (attachments && attachments.length) {
    attachHtml = attachments.map(a => {
      if (a.type === 'image') {
        return `<img src="${a.dataUrl}" class="msg-img" alt="${a.name}" onclick="openLightbox('${a.dataUrl}')" />`
      }
      return `<div class="flex items-center gap-2 text-sm mt-1 ${isUser ? 'text-indigo-100' : 'text-slate-500'}">
        <i class="fas fa-file"></i> <span>${a.name}</span>
      </div>`
    }).join('')
  }

  const bubbleCls = isUser
    ? 'user-bubble bg-indigo-600 text-white'
    : 'bg-white text-slate-700 border border-slate-200'

  div.innerHTML = `
    <div class="max-w-2xl ${bubbleCls} rounded-2xl px-4 py-3 shadow-sm">
      ${attachHtml}
      <div class="md-content">${renderMd(text)}</div>
    </div>`

  box.appendChild(div)
  box.scrollTop = box.scrollHeight
  return div
}

function showTyping() {
  const box = $('chat-box')
  const div = document.createElement('div')
  div.id = 'typing-indicator'
  div.className = 'flex justify-start'
  div.innerHTML = `<div class="bg-white border border-slate-200 rounded-2xl px-4 py-3 typing text-slate-400"><span>●</span><span>●</span><span>●</span></div>`
  box.appendChild(div)
  box.scrollTop = box.scrollHeight
}
function hideTyping() { const t = $('typing-indicator'); if (t) t.remove() }

function showAdvancePrompt() {
  const box = $('chat-box')
  const div = document.createElement('div')
  div.className = 'flex justify-start phase-advance'
  div.innerHTML = `
    <div class="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-slate-700 shadow-sm">
      <div class="font-medium text-indigo-700 mb-2"><i class="fas fa-arrow-right"></i> 进入下一阶段？</div>
      <button class="phase-advance-btn bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm">
        确认进入
      </button>
    </div>`
  div.querySelector('.phase-advance-btn').onclick = async () => {
    const btn = div.querySelector('.phase-advance-btn')
    btn.disabled = true
    btn.textContent = '推进中...'
    try {
      const data = await api(`/api/phase/${state.currentTopic}/advance`, { method: 'POST' })
      state.phaseState = data.state || await loadPhaseState(state.currentTopic)
      div.remove()
      const message = data.message || '已进入下一阶段。'
      addMessage('assistant', message)
      state.history.push({ role: 'assistant', content: message })
    } catch (err) {
      btn.disabled = false
      btn.textContent = '确认进入'
      addMessage('assistant', '暂时还不能进入下一阶段：' + err.message)
    }
  }
  box.appendChild(div)
  box.scrollTop = box.scrollHeight
}

// textarea 随内容自动增高
function autoGrow(el) {
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 192) + 'px'
}

// ---------- 附件管理 ----------
/** 将 File 对象转成 dataUrl */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function addAttachment(file) {
  const isImage = file.type.startsWith('image/')
  const dataUrl = await fileToDataUrl(file)
  const att = { type: isImage ? 'image' : 'file', name: file.name, dataUrl, mimeType: file.type }
  state.pendingAttachments.push(att)
  renderAttachmentPreview()
}

function renderAttachmentPreview() {
  const preview = $('attachment-preview')
  preview.innerHTML = state.pendingAttachments.map((a, i) => {
    if (a.type === 'image') {
      return `<div class="attach-thumb">
        <img src="${a.dataUrl}" alt="${a.name}">
        <button class="attach-remove" onclick="removeAttachment(${i})">×</button>
      </div>`
    }
    return `<div class="attach-thumb">
      <div class="attach-file">
        <i class="fas fa-file text-indigo-400"></i>
        <span class="truncate">${a.name}</span>
      </div>
      <button class="attach-remove" onclick="removeAttachment(${i})">×</button>
    </div>`
  }).join('')
}

window.removeAttachment = function(i) {
  state.pendingAttachments.splice(i, 1)
  renderAttachmentPreview()
}

function clearAttachments() {
  state.pendingAttachments = []
  renderAttachmentPreview()
}

// ---------- 发送消息 ----------
async function sendChat() {
  const input = $('chat-input')
  const text = input.value.trim()
  const attachments = [...state.pendingAttachments]

  if (!text && attachments.length === 0) return

  input.value = ''
  autoGrow(input)
  clearAttachments()

  // 在对话框中显示用户消息
  addMessage('user', text || '（附件）', attachments)

  // 构建发给后端的消息内容（图片以 base64 data URL 携带）
  let contentForHistory = text
  if (attachments.length) {
    const attachDesc = attachments.map(a =>
      a.type === 'image'
        ? `[用户上传了图片: ${a.name}，base64数据: ${a.dataUrl.slice(0, 80)}…]`
        : `[用户上传了文件: ${a.name}]`
    ).join('\n')
    contentForHistory = text ? `${text}\n\n${attachDesc}` : attachDesc
  }

  state.history.push({ role: 'user', content: contentForHistory })
  showTyping()

  try {
    const data = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ topicId: state.currentTopic, history: state.history }),
    })
    hideTyping()
    addMessage('assistant', data.reply)
    state.history.push({ role: 'assistant', content: data.reply })
    if (data.canAdvance) showAdvancePrompt()
  } catch (err) {
    hideTyping()
    addMessage('assistant', '抱歉,出错了:' + err.message)
  }
}

// ---------- 作业 ----------
async function loadAssignments(topicId) {
  $('assignment-card').classList.add('hidden')
  $('answer-area').classList.add('hidden')
  $('assignment-hints').classList.add('hidden')
  $('assignment-hints').innerHTML = ''
  $('report').classList.add('hidden')
  try {
    const data = await api(`/api/topics/${topicId}/assignments`)
    $('assignment-tabs').innerHTML = data.assignments.map(a =>
      `<button data-id="${a.id}" class="assign-tab px-3 py-1.5 rounded-lg text-sm border border-slate-300 hover:border-indigo-400 hover:bg-indigo-50">${a.level} · ${a.title}</button>`
    ).join('')
    document.querySelectorAll('.assign-tab').forEach(b => {
      b.onclick = () => selectAssignment(data.assignments.find(a => a.id === b.dataset.id))
    })
  } catch {
    $('assignment-tabs').innerHTML = '<p class="text-sm text-slate-400">该主题暂无作业</p>'
  }
}

function selectAssignment(a) {
  state.currentAssignment = a
  $('assignment-level').textContent = a.level
  $('assignment-title').textContent = a.title
  $('assignment-prompt').textContent = a.prompt
  $('assignment-card').classList.remove('hidden')
  $('answer-area').classList.remove('hidden')
  renderAssignmentHints(a)
  $('answer-input').value = ''
  $('report').classList.add('hidden')
  document.querySelectorAll('.assign-tab').forEach(b =>
    b.classList.toggle('border-indigo-500', b.dataset.id === a.id))
}

function renderAssignmentHints(a) {
  const box = $('assignment-hints')
  const hints = Array.isArray(a.frameworkHints) ? a.frameworkHints : []
  if (!hints.length) {
    box.classList.add('hidden')
    box.innerHTML = ''
    return
  }
  const learnedFramework = state.phaseState?.completedPhases?.includes('FRAMEWORK') ||
    state.phaseState?.currentPhase === 'DRILL' ||
    state.phaseState?.currentPhase === 'CONNECT' ||
    state.phaseState?.currentPhase === 'COMPLETED'
  const status = learnedFramework
    ? '<span class="text-green-700"><i class="fas fa-check-circle"></i> 你在学习中已练习过这些框架</span>'
    : '<span class="text-amber-700"><i class="fas fa-lightbulb"></i> 建议先完成学习问答中的框架讲解再作答</span>'
  box.innerHTML = `
    <details open class="bg-white rounded-xl p-4 shadow-sm border border-indigo-100 mb-4">
      <summary class="cursor-pointer font-medium text-slate-800 list-none flex items-center justify-between">
        <span><i class="fas fa-clipboard-list text-indigo-500"></i> 答题框架提示</span>
        <i class="fas fa-chevron-down text-slate-400 text-xs"></i>
      </summary>
      <div class="mt-3 text-sm">
        <div class="mb-2">${status}</div>
        <ul class="space-y-1.5 text-slate-600 list-disc pl-5">
          ${hints.map(h => `<li>${escapeHtml(h)}</li>`).join('')}
        </ul>
      </div>
    </details>`
  box.classList.remove('hidden')
}

async function submitAnswer() {
  const answer = $('answer-input').value.trim()
  if (!answer) { alert('请先写下你的方案'); return }
  if (!state.currentAssignment) return
  const btn = $('submit-answer')
  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI 批改中(约 10-30 秒)...'
  try {
    const data = await api('/api/grade', {
      method: 'POST',
      body: JSON.stringify({
        topicId: state.currentTopic,
        assignmentId: state.currentAssignment.id,
        answer,
      }),
    })
    renderReport(data.result)
    await loadTopics()
    await loadProfile()
  } catch (err) {
    alert('批改失败:' + err.message)
  } finally {
    btn.disabled = false
    btn.innerHTML = '<i class="fas fa-clipboard-check"></i> 提交批改'
  }
}

// ---------- 结构化打分报告渲染（含 Markdown）----------
function renderReport(r) {
  const gradeColor = { A: 'text-green-600', B: 'text-blue-600', C: 'text-amber-600', D: 'text-red-600' }[r.grade] || 'text-slate-600'
  const bar = (score) => {
    const pct = score * 10
    const color = score >= 7 ? 'bg-green-500' : score >= 5 ? 'bg-amber-500' : 'bg-red-500'
    return `<div class="w-full bg-slate-200 rounded-full h-2"><div class="${color} h-2 rounded-full" style="width:${pct}%"></div></div>`
  }
  const dims = r.dimensions.map(d => `
    <div class="py-3 border-b border-slate-100 last:border-0">
      <div class="flex items-center justify-between mb-1.5">
        <span class="font-medium text-slate-700">${d.name}</span>
        <span class="text-sm font-semibold ${d.score >= 7 ? 'text-green-600' : d.score >= 5 ? 'text-amber-600' : 'text-red-600'}">${d.score}/10</span>
      </div>
      ${bar(d.score)}
      <div class="mt-2 space-y-1 text-sm">
        ${d.good ? `<div class="text-green-700 md-content"><i class="fas fa-check-circle"></i> ${renderMd(d.good)}</div>` : ''}
        ${d.issue ? `<div class="text-red-600 md-content"><i class="fas fa-exclamation-circle"></i> ${renderMd(d.issue)}</div>` : ''}
      </div>
    </div>`).join('')

  $('report').innerHTML = `
    <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div class="bg-slate-800 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <p class="text-xs text-slate-300">作业反馈报告</p>
          <p class="text-sm">${r.gradeComment || ''}</p>
        </div>
        <div class="text-right">
          <div class="text-3xl font-bold ${gradeColor.replace('600','400')}">${r.total}<span class="text-base text-slate-400">/100</span></div>
          <div class="text-lg font-bold ${gradeColor.replace('600','300')}">${r.grade}</div>
        </div>
      </div>
      <div class="px-6 py-2">${dims}</div>
      <div class="px-6 py-4 bg-slate-50 space-y-2 text-sm">
        ${r.nextStep ? `<div class="md-content"><i class="fas fa-lightbulb text-amber-500"></i> <b>下一步:</b> ${renderMd(r.nextStep)}</div>` : ''}
        ${r.followUp ? `<div class="md-content"><i class="fas fa-fire text-red-500"></i> <b>追问挑战:</b> ${renderMd(r.followUp)}</div>` : ''}
      </div>
    </div>`
  $('report').classList.remove('hidden')
  $('report').scrollIntoView({ behavior: 'smooth' })
}

// ---------- 图片灯箱 ----------
window.openLightbox = function(src) {
  $('lightbox-img').src = src
  $('lightbox').classList.add('open')
}

function initLightbox() {
  $('lightbox-close').onclick = () => $('lightbox').classList.remove('open')
  $('lightbox').onclick = (e) => { if (e.target === $('lightbox')) $('lightbox').classList.remove('open') }
}

// ---------- 模式切换 & 事件绑定 ----------
function bindEvents() {
  // 模式切换
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.onclick = () => {
      const mode = b.dataset.mode
      document.querySelectorAll('.mode-btn').forEach(x => {
        const on = x === b
        x.classList.toggle('bg-white', on)
        x.classList.toggle('shadow', on)
        x.classList.toggle('text-indigo-600', on)
        x.classList.toggle('text-slate-500', !on)
      })
      $('learn-panel').classList.toggle('hidden', mode !== 'learn')
      $('learn-panel').classList.toggle('flex', mode === 'learn')
      $('practice-panel').classList.toggle('hidden', mode !== 'practice')
    }
  })

  // 发送
  $('chat-send').onclick = sendChat
  const chatInput = $('chat-input')
  chatInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
  }
  chatInput.oninput = () => autoGrow(chatInput)

  // 退出
  $('logout-btn').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' })
    location.href = '/login.html'
  }

  // 提交作业
  $('submit-answer').onclick = submitAnswer

  // ===== 附件 =====

  // 附件按钮 (通用文件)
  $('attach-btn').onclick = () => $('file-input').click()
  $('file-input').onchange = async (e) => {
    for (const f of e.target.files) await addAttachment(f)
    e.target.value = ''
  }

  // 图片专用按钮
  $('img-btn').onclick = () => $('img-input').click()
  $('img-input').onchange = async (e) => {
    for (const f of e.target.files) await addAttachment(f)
    e.target.value = ''
  }

  // ===== 粘贴图片 =====
  document.addEventListener('paste', async (e) => {
    // 只在聊天输入框聚焦时响应
    if (document.activeElement !== chatInput &&
        !$('chat-input-area').contains(document.activeElement)) return
    const items = e.clipboardData?.items || []
    let handled = false
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) { await addAttachment(file); handled = true }
      }
    }
    // 若只有纯文本则让默认行为继续
    if (!handled) return
  })

  // ===== 拖拽上传 =====
  const inputArea = $('chat-input-area')

  inputArea.addEventListener('dragenter', (e) => {
    e.preventDefault(); inputArea.classList.add('drag-over')
  })
  inputArea.addEventListener('dragover', (e) => {
    e.preventDefault()
  })
  inputArea.addEventListener('dragleave', (e) => {
    if (!inputArea.contains(e.relatedTarget)) inputArea.classList.remove('drag-over')
  })
  inputArea.addEventListener('drop', async (e) => {
    e.preventDefault()
    inputArea.classList.remove('drag-over')
    const files = Array.from(e.dataTransfer.files)
    for (const f of files) await addAttachment(f)
  })
}

init()
