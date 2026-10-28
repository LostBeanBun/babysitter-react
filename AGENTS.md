<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 版本号规范

- 每次改动（含修复、文案、样式、重构、依赖升级）都必须升版：`npm run version:bump patch|minor|major`，并补全 `CHANGELOG.md` 顶部条目
- 版本号唯一来源为 `package.json` 的 `version`；界面展示统一用 `APP_VERSION`（`src/constants/version.ts`，由 `next.config.ts` 注入），不要硬编码版本号
- `npm run lint` 末尾会执行 `npm run version:check` 与 `npm run i18n:parity`：工作区有改动却未升版、或两端文案不一致都会直接失败
- 改 i18n 文案必须两端同时改（`i18n:parity` 会逐字比对 `zh-CN` / `en-US`）；确实无法同步的 key 差异登记在 `scripts/i18n-parity.allow.json` 并写明原因
- 功能级更新（`minor` / `major`）在提交推送后运行 `npm run version:tag` 打 `vX.Y.Z` 发布标签并推送；`patch` 修复不打标签（级别由「当前版本 vs 最近标签」自动判定，确需打标签用 `--force`）
- 行为需与 Vue 版仓库（`../babysitter`）保持一致：功能同步实现、版本号同步升版、发布标签同步打（`../babysitter/package.json`）

## 回归核查（每次改动必做）

- 提交只应包含本次目标相关的改动：顺手重构、顺手改样式、顺手改文案一律拆成独立改动，不在功能改动里夹带
- 改公共变量 / 全局样式 / 公共组件（如 `--tabbar-*` 等 `:root` 变量、`TabBar`、`TimelineList`、`ChoiceGrid`、`BaseModal`、`Toast`、i18n key）之前，先 `grep` 出全部引用点，逐个确认影响面并记录在改动说明里
- 提交前必须按「受影响页面清单」跑一遍真实浏览器冒烟（至少：今日、记录、统计、设置 + 本次涉及的弹窗），逐项核对：选中/激活态高亮、禁用态、空态、骨架屏、深/浅色、`prefers-reduced-motion: reduce`
- 冒烟统一用仓库内的 `e2e/smoke.mjs`（`npm run smoke`，两端各一份、逻辑一致）：自动种入固定数据，巡检四页浅/深色、照护卡布局、提醒横幅直达弹窗、统计图表与 `reduce`，截图落在 `e2e/.artifacts/<app>/`；新增回归点请补进脚本而不是临时写脚本
- 依赖动画的提示（高亮闪现、脉冲、入场）必须同时提供**静态兜底**：`reduce` 下动画会被全局压到 0.01ms，只有静态样式仍可见
- 不允许用「测试通过」替代人工核查：样式/交互类改动必须留下截图或 DOM 计算值（尺寸、颜色、类名）作为证据；核查过的页面与结论写进提交说明
- 发现既有功能与本次改动无因果关系却发生变化时，先停下定位原因，不要顺手「一起修」或放任不管
