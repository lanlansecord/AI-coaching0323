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

## Deploy

### EdgeOne Pages

这个项目可以直接导入 EdgeOne Pages 部署，当前已经补好了：

- `edgeone.json`
- `.node-version`
- `package.json` 里的 `engines.node`

#### 1. 导入项目

在 EdgeOne Pages 后台选择从 Git 仓库导入这个项目。

#### 2. 构建设置

如果后台没有自动读取到 `edgeone.json`，手动填：

- Framework：`Next.js`
- Build command：`npm run build`
- Output directory：`.next`
- Node.js version：`22`

#### 3. 必填环境变量

至少需要把下面这些变量填到 EdgeOne Pages 的环境变量里：

- `AI_API_KEY`
- `AI_MODEL`
- `DATABASE_URL`
- `COOKIE_SECRET`
- `ADMIN_PASSWORD`

如果你保留语音转写接口，还要补：

- `GROQ_API_KEY`
- `GROQ_STT_MODEL`

参考本地示例文件：

- `.env.example`

#### 4. 首次发布后建议检查

- `/api/sessions`
- `/api/auth/me`
- `/api/admin/stats`
- `/api/asr`

如果这些接口都能正常返回，说明 EdgeOne Pages 的 SSR、Route Handlers 和 API 路由已经接住了。

### Netlify

这个项目也可以继续导入 Netlify 部署。

#### 1. 导入项目

在 Netlify 后台选择 `Add new project`，导入这个仓库。

#### 2. 构建设置

- Base directory：留空
- Build command：`npm run build`
- Publish directory：`.next`

仓库里已经提供了：

- `netlify.toml`
- `.node-version`
