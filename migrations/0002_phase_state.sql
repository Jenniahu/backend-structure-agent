-- Phase 教学状态追踪
-- 记录每位用户在每个主题下的当前教学阶段，支持跨会话断点续学
CREATE TABLE IF NOT EXISTS learning_phase_state (
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id          TEXT NOT NULL,
  current_phase     TEXT NOT NULL DEFAULT 'ANCHOR',
  completed_phases  TEXT[] NOT NULL DEFAULT '{}',
  turns_in_phase    INTEGER NOT NULL DEFAULT 0,
  phase_started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_phase_state_user ON learning_phase_state(user_id);
