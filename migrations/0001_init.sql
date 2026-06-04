-- ============================================================
-- ArchLearn 初始化数据库结构
-- 设计要点对应 PRD 第 4 章(记忆系统)与第 7.2 节(数据模型)
-- ============================================================

-- ---------- 账号与登录 ----------

-- 用户账号(简单登录:邮箱 + 密码哈希)
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 登录会话(token 持有,鉴权用)
CREATE TABLE IF NOT EXISTS auth_sessions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

-- ---------- 长期记忆 ① 偏好画像 ----------
-- 记录用户喜欢的讲解风格/节奏,用于个性化讲解
CREATE TABLE IF NOT EXISTS preferences (
  user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  teach_style TEXT NOT NULL DEFAULT 'analogy',   -- analogy(类比) | direct(直接) | visual(图示)
  pace        TEXT NOT NULL DEFAULT 'normal',    -- fast(快讲) | normal | slow(细嚼)
  notes       TEXT DEFAULT '',                   -- Agent 沉淀的自由观察
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 长期记忆 ② 能力画像 ----------
-- 记录每个知识点的掌握度,驱动课程地图状态
CREATE TABLE IF NOT EXISTS mastery (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic      TEXT NOT NULL,                       -- 主题 id,如 'cache'
  score      INTEGER NOT NULL DEFAULT 0,          -- 掌握度 0-100
  status     TEXT NOT NULL DEFAULT 'not_started', -- not_started | learning | mastered
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic)
);

-- ---------- 长期记忆 ③ 错误档案 ----------
-- 记录高频错误点,批改时一针见血、针对性复练
CREATE TABLE IF NOT EXISTS errors (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,        -- 错误类别:requirement(需求澄清) | estimation(容量估算) | tradeoff(取舍) | architecture(架构) | clarity(表达)
  topic      TEXT NOT NULL,        -- 关联主题
  count      INTEGER NOT NULL DEFAULT 1,
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category, topic)
);

-- ---------- 作业历史 ----------
CREATE TABLE IF NOT EXISTS assignments_history (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic       TEXT NOT NULL,
  assignment_id TEXT NOT NULL,     -- 对应知识库里的作业题 id
  answer      TEXT NOT NULL,       -- 用户提交的答案
  score_json  JSONB NOT NULL,      -- 结构化打分结果(5 维度 + 总分 + 点评)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignments_user_topic ON assignments_history(user_id, topic);

-- ---------- 短期记忆:学习会话 ----------
CREATE TABLE IF NOT EXISTS learn_sessions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic         TEXT NOT NULL,
  messages_json JSONB NOT NULL DEFAULT '[]'::jsonb,  -- 对话历史
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learn_sessions_user ON learn_sessions(user_id);
