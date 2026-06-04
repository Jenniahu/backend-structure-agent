# ArchLearn — 后端架构学习 Agent

一个用「**讲解 + 问答 + 作业 + 结构化反馈**」闭环,帮有技术基础但缺工程经验的计算机学生建立后端架构思维、并能应对架构面试的个性化 AI 学习平台。

> 核心理念:学的是**架构设计思维**,不是背答案。

---

## ✨ 已完成功能

- **简单登录**:邮箱 + 密码注册/登录/登出(bcrypt 哈希 + Cookie 会话)
- **课程地图**:5 个主题(缓存/消息队列/数据库选型/负载均衡/分库分表),按掌握度解锁
- **学习问答(学练用闭环①②)**:AI 导师用类比讲解 + 苏格拉底式追问,小步快跑、能问不灌
- **作业练习(闭环③)**:每主题分级作业(入门/进阶/综合/挑战)
- **结构化批改(闭环④)**:5 维度打分(需求澄清/容量估算/架构合理性/取舍意识/表达清晰度)+ 总分等级 + 下一步建议 + 追问挑战
- **长期记忆(记忆飞轮)**:
  - 召回:学习/批改时注入用户偏好与薄弱点
  - 沉淀:批改后自动更新掌握度、累加错误档案
  - 「我的薄弱点」面板展示高频错误

## 🧭 功能入口(API)

| 方法 | 路径 | 作用 | 需登录 |
|------|------|------|:----:|
| GET  | `/api/health` | 健康检查 | 否 |
| POST | `/api/auth/register` | 注册(body: email, password) | 否 |
| POST | `/api/auth/login` | 登录 | 否 |
| POST | `/api/auth/logout` | 登出 | 是 |
| GET  | `/api/auth/me` | 当前用户 | 是 |
| GET  | `/api/topics` | 课程地图 + 掌握度 | 是 |
| GET  | `/api/topics/:id/assignments` | 某主题作业题 | 是 |
| POST | `/api/chat` | 讲解+问答(body: topicId, history) | 是 |
| POST | `/api/grade` | 作业批改(body: topicId, assignmentId, answer) | 是 |
| GET  | `/api/profile` | 掌握度 + 错题本 | 是 |

页面:`/login.html`(登录) · `/`(主学习界面)

## 🏗️ 技术架构

- **后端**:Hono + Node.js(`@hono/node-server`),tsx 直接运行 TypeScript
- **数据库**:PostgreSQL(7 张表,见 `migrations/0001_init.sql`)
- **LLM**:OpenAI 兼容接口;批改用 `gpt-5.4`(质量),讲解/问答用 `gpt-5.4-mini`(速度成本)
- **知识库**:`knowledge/` 下的 md/json 作为 Prompt 上下文(不爬文档、不上 RAG)
- **前端**:静态 HTML + Tailwind(CDN) + 原生 JS

### 数据模型(长期记忆)
- `users` / `auth_sessions` — 账号与登录会话
- `preferences` — 偏好画像(讲解风格/节奏)
- `mastery` — 能力画像(每主题掌握度)
- `errors` — 错误档案(高频薄弱点)
- `assignments_history` — 作业历史(含打分 JSONB)
- `learn_sessions` — 学习会话(短期记忆)

## 🚀 本地开发

```bash
# 1. 启动 PostgreSQL 并创建数据库(本地示例)
#    DATABASE_URL=postgresql://archlearn:archlearn_dev@127.0.0.1:5432/archlearn

# 2. 安装依赖
npm install

# 3. 配置环境变量:复制 .env.example 为 .env 并填值
cp .env.example .env

# 4. 跑数据库迁移
npm run migrate

# 5. 启动(开发)
npm run dev          # 或用 PM2: pm2 start ecosystem.config.cjs

# 6. 访问 http://localhost:3000
```

## ☁️ 部署到 Render(傻瓜教程)

> 代码已为 Render 准备就绪(`render.yaml`)。最后点击部署由你完成。

**方式一:用 Blueprint 一键创建(推荐)**
1. 把代码 push 到 GitHub。
2. Render 控制台 → **New +** → **Blueprint** → 连接你的仓库。
3. Render 会读 `render.yaml`,自动创建 Web Service + PostgreSQL。
4. 在 Web Service 的 **Environment** 里手动填两个敏感变量:
   - `LLM_API_KEY` = 你的 LLM Key
   - `SESSION_SECRET` = 一段强随机字符串
5. 部署完成,访问 Render 给的网址即可。

**方式二:手动创建**
1. Render → New + → **PostgreSQL**,创建后复制 **Internal Database URL**。
2. Render → New + → **Web Service**,连接仓库:
   - Build Command: `npm install`
   - Start Command: `npm run migrate && npm start`
3. 在 Environment 里填:`DATABASE_URL`(上一步的 URL)、`LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL_STRONG`、`LLM_MODEL_FAST`、`SESSION_SECRET`。
4. 部署。

## 🔒 安全说明
- LLM Key 仅存于环境变量,所有调用走后端,前端永不暴露。
- 密码 bcrypt 哈希存储。
- `.env` 已在 `.gitignore`,不会提交。

## 📌 尚未实现 / 下一步
- 其余 4 个主题(目前仅「缓存」内容完整,框架已就位)
- 经典案例库(短链/Feed流/秒杀)
- 模拟面试模式、错题针对性复练流
- 学习进度可视化报表

## 📊 状态
- **平台**:Render(目标)/ 本地已跑通
- **技术栈**:Hono + Node.js + PostgreSQL + Tailwind
- **最后更新**:2026-06-04
