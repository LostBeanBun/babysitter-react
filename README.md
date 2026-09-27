# 宝宝日记 🍼

温馨简约的宝宝喂养记录与统计工具（PWA）。

> 记录宝宝的每一次喂养、睡眠与成长瞬间。数据完全保存在本地浏览器（IndexedDB），不上传任何服务器，可随时导出备份。

## ✨ 功能

- 🍼 **喂养记录**：左侧亲喂 / 右侧亲喂 / 双侧亲喂（带计时器）、瓶喂母乳、配方奶（记录奶量 ml）
- 🧷 **纸尿裤**：尿湿 / 便便 / 尿+便，可记录颜色与量
- 🎀 **吸奶记录**：左侧 / 右侧 / 双侧，带计时器与奶量
- 😴 **睡眠记录**：小睡 / 夜间睡眠，支持计时与手动输入
- 📊 **统计图表**：每日奶量 / 睡眠 / 纸尿裤 / 吸奶趋势图，支持按时间段（今天/近7天/近14天/近30天/本月/全部）查看
- 🔄 **周期对比**：当前区间 vs 上一等长区间，9 项指标百分比变化对比
- 👶 **多宝宝支持**：可添加多个宝宝并自由切换
- 💾 **本地保存**：数据存于浏览器 IndexedDB，隐私安全
- 📤 **数据导出**：JSON 全量备份 / 按宝宝导出 CSV（Excel 可直接打开）
- 📥 **数据导入**：支持 JSON 备份恢复
- 📱 **PWA**：可安装到手机/电脑桌面，离线可用

## 🛠 技术栈

- Next.js 16（App Router，静态导出 `output: 'export'`）+ React 19 + TypeScript
- Zustand（状态管理）
- Dexie.js + dexie-react-hooks（IndexedDB，useLiveQuery 响应式）
- Apache ECharts（按需引入，控制包体积）
- react-i18next（中英双语）
- PWA：manifest + Service Worker（静态导出兼容）

## 🚀 本地开发

```bash
npm install
npm run dev
```

## 📦 构建

```bash
npm run build
# 产物在 out/ 目录
```

## 🌐 部署

纯静态站点（`next build` 导出到 `out/`），可直接部署到 GitHub Pages 或 Cloudflare Pages。

### GitHub Pages

1. 将代码推送到 GitHub 仓库
2. 仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**
3. `.github/workflows/deploy.yml` 已配置（构建后上传 `out/`）
4. 部署完成后访问 `https://<用户名>.github.io/<仓库名>/`

### Cloudflare Pages

1. 登录 Cloudflare Dashboard → Workers & Pages → Create → Pages
2. Connect to Git 选择本仓库
3. Build command: `npm run build`，Build output directory: `out`
4. 保存后自动部署，每次推送自动更新

## 📄 数据说明

- 所有数据存储在浏览器本地，卸载浏览器或清除站点数据会丢失记录，**请定期导出 JSON 备份**
- 换设备可通过「设置 → 导出 JSON 备份」→ 新设备「设置 → 导入」迁移数据

## 📁 目录结构

```
src/
├── app/              # Next.js App Router 页面与全局样式
├── components/       # 组件（charts / common / dashboard / forms / timeline / settings）
├── constants/        # 类型标签与配色
├── db/               # Dexie 数据库定义
├── hooks/            # 客户端 hooks（timer / theme / chart / undo）
├── i18n/             # i18next 与中英语言包
├── services/         # 统计聚合、导出导入
├── stores/           # Zustand 状态（baby / theme / toast）
├── tabs.ts           # 底部导航配置
├── types/            # TypeScript 类型
├── utils/            # 工具函数
└── views/            # 页面视图（Dashboard / Log / Stats / Settings）
```

## 🧹 工程规范

- ESLint + Prettier 统一代码风格（`npm run lint` / `npm run format`）
- EditorConfig 规范缩进与换行
- TypeScript 严格模式类型检查（`npm run typecheck`）
