<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 版本号规范

- 每次改动（含修复、文案、样式、重构、依赖升级）都必须升版：`npm run version:bump patch|minor|major`，并补全 `CHANGELOG.md` 顶部条目
- 版本号唯一来源为 `package.json` 的 `version`；界面展示统一用 `APP_VERSION`（`src/constants/version.ts`，由 `next.config.ts` 注入），不要硬编码版本号
- `npm run lint` 末尾会执行 `npm run version:check`：工作区有改动却未升版会直接失败
- 行为需与 Vue 版仓库（`../babysitter`）保持一致：功能同步实现、版本号同步升版（`../babysitter/package.json`）
