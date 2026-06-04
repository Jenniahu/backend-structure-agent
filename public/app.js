// ============ ArchLearn 前端逻辑 ============
const $ = (id) => document.getElementById(id)
const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (res.status === 401) { location.href = '/login.html'; throw new Error('未登录') }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '请求失败')
  return data
}

const state = {
  topics: [],
  currentTopic: 'cache',
  currentTopicTitle: '缓存',
  history: [],          // 当前主题的对话历史(短期记忆)
  currentAssignment: null,
}

// ---------- 初始化 ----------
async function init() {
  try {
    const me = await api('/api/auth/me')
    $('user-email').textContent = me.user.email
  } catch { return }
  await loadTopics()
  await loadProfile()
  selectTopic('cache', '缓存')
  bindEvents()
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
function selectTopic(id, title) {
  state.currentTopic = id
  state.currentTopicTitle = title
  state.history = []
  const topic = state.topics.find(t => t.id === id)
  $('topic-title').textContent = title
  $('topic-sub').textContent = topic ? topic.subtitle : ''
  document.querySelectorAll('.topic-btn').forEach(b =>
    b.classList.toggle('bg-indigo-50', b.dataset.topic === id))
  // 重置面板
  $('chat-box').innerHTML = ''
  $('report').classList.add('hidden')
  $('report').innerHTML = ''
  addMessage('assistant', `我们开始学习「${title}」。我会带你一步步建立思路,随时打断我提问。准备好了吗?先告诉我:你觉得${title}主要是用来解决什么问题的?`)
  loadAssignments(id)
}

// ---------- 学习问答 ----------
function addMessage(role, text) {
  const box = $('chat-box')
  const isUser = role === 'user'
  const div = document.createElement('div')
  div.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`
  div.innerHTML = `
    <div class="max-w-2xl ${isUser ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200'} rounded-2xl px-4 py-3 shadow-sm whitespace-pre-line leading-relaxed">${text}</div>`
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

// 让 textarea 随内容自动增高(上限由 CSS max-h-48 控制,超出可滚动)
function autoGrow(el) {
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 192) + 'px'
}

async function sendChat() {
  const input = $('chat-input')
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  autoGrow(input) // 发送后重置高度
  addMessage('user', text)
  state.history.push({ role: 'user', content: text })
  showTyping()
  try {
    const data = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ topicId: state.currentTopic, history: state.history }),
    })
    hideTyping()
    addMessage('assistant', data.reply)
    state.history.push({ role: 'assistant', content: data.reply })
  } catch (err) {
    hideTyping()
    addMessage('assistant', '抱歉,出错了:' + err.message)
  }
}

// ---------- 作业 ----------
async function loadAssignments(topicId) {
  $('assignment-card').classList.add('hidden')
  $('answer-area').classList.add('hidden')
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
  $('answer-input').value = ''
  $('report').classList.add('hidden')
  document.querySelectorAll('.assign-tab').forEach(b =>
    b.classList.toggle('border-indigo-500', b.dataset.id === a.id))
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
    await loadTopics()    // 刷新课程地图掌握度
    await loadProfile()   // 刷新错题本
  } catch (err) {
    alert('批改失败:' + err.message)
  } finally {
    btn.disabled = false
    btn.innerHTML = '<i class="fas fa-clipboard-check"></i> 提交批改'
  }
}

// ---------- 结构化打分报告渲染 ----------
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
        ${d.good ? `<p class="text-green-700"><i class="fas fa-check-circle"></i> ${d.good}</p>` : ''}
        ${d.issue ? `<p class="text-red-600"><i class="fas fa-exclamation-circle"></i> ${d.issue}</p>` : ''}
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
        ${r.nextStep ? `<p><i class="fas fa-lightbulb text-amber-500"></i> <b>下一步:</b> ${r.nextStep}</p>` : ''}
        ${r.followUp ? `<p><i class="fas fa-fire text-red-500"></i> <b>追问挑战:</b> ${r.followUp}</p>` : ''}
      </div>
    </div>`
  $('report').classList.remove('hidden')
  $('report').scrollIntoView({ behavior: 'smooth' })
}

// ---------- 模式切换 & 事件绑定 ----------
function bindEvents() {
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
  $('chat-send').onclick = sendChat
  const chatInput = $('chat-input')
  // Enter 发送,Shift+Enter 换行
  chatInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendChat()
    }
  }
  // 输入时自动增高
  chatInput.oninput = () => autoGrow(chatInput)
  $('submit-answer').onclick = submitAnswer
  $('logout-btn').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' })
    location.href = '/login.html'
  }
}

init()
