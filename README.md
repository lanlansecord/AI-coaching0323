## 小镜子

小镜子是一个中文 AI 成长陪练 Web 应用，当前基于 `Next.js 16 + App Router + Route Handlers + Neon + Drizzle`。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deploy to Netlify

这个项目可以直接导入 Netlify 部署。

### 1. 导入项目

在 Netlify 后台选择 `Add new project`，导入这个仓库。

### 2. 构建设置

- Base directory：留空
- Build command：`npm run build`
- Publish directory：`.next`

仓库里已经提供了：

- `netlify.toml`
- `.node-version`

### 3. 必填环境变量

至少需要把下面这些变量填到 Netlify 的 Site configuration -> Environment variables：

- `AI_API_KEY`
- `AI_MODEL`
- `DATABASE_URL`
- `COOKIE_SECRET`
- `ADMIN_PASSWORD`

如果要继续保留语音相关能力，还需要补对应的火山环境变量：

- `NEXT_PUBLIC_VOICE_PROVIDER`
- `VOLC_*`

参考本地示例文件：

- `.env.example`

### 4. 首次发布后建议检查

- `/api/sessions`
- `/api/auth/*`
- `/api/admin/*`
- `/api/tts`
- `/api/voice/realtime/*`

如果这些接口都能正常返回，说明 Netlify 侧的 SSR 和 Route Handlers 已经接住了。
