# UI 风格规范

本文件是全项目 UI 的唯一规范来源。任何新增/修改样式都必须先在本文件找到对应规则，不允许「就这一处特事特办」。

- 适用仓库：`babysitter`（Vue）与 `babysitter-react`（React）——两端必须保持像素级一致，改一端必须同步另一端。
- token 唯一来源：Vue `src/styles/main.css`，React `src/app/theme.css`。两端 `:root` 与 `[data-theme='dark']` 内容必须逐行同源。

## 1. 设计基调

iOS 26 Liquid Glass + Apple HIG。整体观感：**半透明玻璃层、柔和色温阴影、大圆角、克制的品牌橙**。

- 背景是固定的浅/深色渐变，内容层是半透明玻璃卡片，靠 `--glass-*` 系列营造层次，不靠重阴影。
- 品牌橙 `--primary: #ff6b35` 只用于「当前/主操作/激活」，不做大面积铺底。
- 表面色优先级：`--surface`（常规卡）> `--surface-2`（卡内分区、次级块）> `--surface-3`（更弱的占位、禁用底）。

## 2. Token 体系

### 2.1 硬性约束

- **禁止裸值**：`font-size`、`z-index`、间距（margin/padding）、圆角、动效时长、颜色，一律引用 token。例外仅限：1px 描边、0 值、CSS `calc()` 里的中间量、负值 margin 微调，以及**不在 8pt 阶梯上的既有间距微调值**（2/3/5/6/9/10/11/13/14/18px——为保持两端像素一致原值保留；新增间距一律取 `--space-*` 阶梯值，阶梯上的 4/8/12/16/20/24px 一律写 token）。
- 新增 token 需同时加到两端 `main.css` / `theme.css` 的 `:root` 与 `[data-theme='dark']`（若暗色需不同值）。
- 无引用的 token 就是技术债：要么接入，要么删除，不允许长期挂空。

### 2.2 字号阶梯

| token | 值 | 用途 |
| --- | --- | --- |
| `--fs-2xs` | 10px | 微标签：TabBar 文字、图表轴刻度 |
| `--fs-xs` | 11px | Caption 2 |
| `--fs-sm` | 12px | Caption 1、时间戳、次要说明 |
| `--fs-13` | 13px | Footnote：列表正文、辅助说明（高频） |
| `--fs-14` | 14px | 卡片正文、次级标题（高频） |
| `--fs-base` | 15px | Subhead：正文主体 |
| `--fs-md` | 17px | Headline：Section 标题、卡片大标题 |
| `--fs-lg` | 20px | Title 3：页面标题（PageHeader） |
| `--fs-xl` | 22px | Title 2：大数字、统计主数值 |

行高约定：标题类 `1.25`，正文类 `1.4`，说明类 `1.35`。默认不写 `line-height`，只有偏离默认时才写。

### 2.3 间距阶梯（8pt 网格）

| token | 值 | 用途 |
| --- | --- | --- |
| `--space-1` | 4px | 图标与文字、紧凑元素内部 |
| `--space-2` | 8px | 列表项内部分区、小组件间距 |
| `--space-3` | 12px | 卡片内边距下限、卡片间小间距 |
| `--space-4` | 16px | 页面水平 gutter、卡片默认内边距 |
| `--space-5` | 20px | 分组间距、页头内边距 |
| `--space-6` | 24px | 大分组间距、页面顶部留白 |

页面布局基准（`.page` / 页面容器）：

- 水平 gutter 统一走 `--page-gutter` token（`:root` 16px；`@media (max-width:400px)` → 10px；`@media (min-width:700px)` → 32px）。`.page` 与 `PageHeader` 都引用它，因此页头与内容在**所有断点**都左右对齐（实测三档 `title-left - card-left = 0`）。不要在组件里单独写死页头内边距。
- 顶部：`calc(var(--header-height) + var(--safe-top) + var(--space-3))`。
- 底部：`calc(var(--tabbar-height) + var(--tabbar-bottom) + var(--space-6))`。
- 页面内首个区块不再额外加 `margin-top`，由 `.page` 的顶部留白统一提供。

### 2.4 圆角阶梯

| token | 值 | 用途 |
| --- | --- | --- |
| `--radius-2xs` | 4px | 小徽章、色块 |
| `--radius-xs` | 8px | 小按钮、小输入、图标块 |
| `--radius-sm` | 10px | 紧凑控件 |
| `--radius` | 12px | **默认**：卡片、输入框、列表项 |
| `--radius-md` | 16px | 强调卡、图表容器 |
| `--radius-lg` | 20px | 弹窗面板、大卡、TabBar 胶囊内的激活片 |
| `--radius-xl` | 28px | 特大容器 |
| `--radius-pill` | 999px | 胶囊（标签、TabBar、分段控件） |

规则：同类容器圆角必须一致；`999px` 一律写成 `var(--radius-pill)`；默认圆角一律用 `var(--radius)`，不要各写各的 `10px` / `12px` / `14px`。

### 2.5 阴影

`--shadow-xs` / `--shadow-md` / `--shadow-lg` / `--shadow-glass` / `--shadow-float`。

- 卡片默认不加阴影（玻璃层次靠 `--glass-border` + `--glass-shine`）。
- 只有「浮起的层」用阴影：弹窗 `--shadow-lg`、TabBar `--shadow-float`、Toast `--shadow-md`。
- 禁止在组件里手写 `rgba(0,0,0,…)` 阴影。

### 2.6 z-index 阶梯

```
--z-base:           1   组件内局部堆叠（如记录页日期标签盖过时间轴线）
--z-header:        40   页头
--z-tabbar-scrim:  49   TabBar 渐隐遮罩
--z-tabbar:        50   悬浮 TabBar
--z-float:        100   计时悬浮球
--z-modal:        200   弹窗遮罩 + 面板
--z-toast:        300   Toast
```

规则：

- 禁止裸写 `z-index: N`，一律 `var(--z-*)`。
- **Toast 必须高于弹窗**（`--z-toast: 300`）。弹窗内保存/校验的提示必须可见，这是本次统一前的一个明确缺陷。
- 同层元素靠 DOM 顺序解决，不靠加更大 z-index。

### 2.7 动效

| token | 值 | 用途 |
| --- | --- | --- |
| `--dur-press` | 0.06s | 按压反馈，必须即时 |
| `--dur-fast` | 0.12s | 微交互：hover 显隐、图标透明度 |
| `--dur-base` | 0.2s | 颜色/底色/描边过渡 |
| `--dur-slow` | 0.3s | 位移、缩放、布局 |
| `--dur-enter` | 0.35s | 弹层、Toast 入场 |

曲线：颜色与常规过渡用 `--ease-out`；有「弹一下」意图的（激活片、卡片入场）用 `--spring`。

规则：

- 颜色/底色/描边用 `--dur-base`，位移/缩放用 `--dur-slow`，同一条 `transition` 里两者都要时写成多段。
- 禁止混用裸 `ease` / `0.25s` / `0.4s`；收敛到上面 5 档。
- 依赖动画才能感知的提示，**必须**在 `@media (prefers-reduced-motion: reduce)` 下提供静态样式兜底（全局规则会把动画压到 0.01ms，静态样式是唯一可见途径）。

## 3. 行为模式

### 3.1 按压反馈（全部可点元素必配）

任何可点元素必须有 `:active` 反馈，且**不得只依赖 `hover`**（触屏无 hover，且全局关闭了系统 tap 高亮）。

```css
.interactive:active {
  transform: scale(var(--tap-scale)); /* 按钮/选项用 0.96 */
  transition-duration: var(--dur-press);
}
```

按压幅度分三档，按「元素面积极大，收缩幅度越小」选取：

- `--tap-scale`（0.96）：按钮、选项块、图标按钮、TabBar 项。
- `--tap-scale-item`（0.985）：列表行、大块可点区。
- `--tap-scale-strong`（0.92）：关闭、删除类强调按压。

按压时长一律 `--dur-press`（0.06s），保证按下瞬间可见。

### 3.2 hover 规则

- `hover` 只做「增强」（显隐次要按钮、颜色微调），不做「唯一反馈」。
- 桌面专属 hover 用 `@media (hover: hover)` 包裹。
- 靠 hover 显隐的次要操作（如列表行的删除按钮），在 `@media (hover: none)`（触屏）下必须保证常显或有等价可达路径。

### 3.3 焦点

键盘可达元素（按钮、输入、可选项）必须有可见 focus 样式。全局统一为**两种机制**（各司其职，全站一致，不允许某个组件自定义第三种）：

- **全局 `:focus-visible`**（按钮、链接、可选项）：`outline: 2.5px solid var(--primary); outline-offset: 2px;` —— outline 无障碍性更好、绘制在最上层且不影响布局。
- **表单输入 `.form-input:focus`**：`box-shadow: var(--focus-ring)`（= `0 0 0 3.5px var(--primary-soft)`）—— 输入框用更柔和的内发光环，边框同时转 `--primary`。

规则：组件不要覆写焦点色（除非是语义错误态 `.has-error` 用 `--danger`）。焦点一律主色，不引入第二种强调色。

### 3.4 触控目标

- 所有可点元素最小热区 **44×44px**。视觉尺寸不足时用透明伪元素扩展热区：
  `.btn-x::after { content: ''; position: absolute; inset: 50% auto auto 50%; width: 44px; height: 44px; transform: translate(-50%, -50%); }`
- 开关（switch）视觉 48×28 但热区必须撑到 44px 高。

### 3.5 当前/选中/交互态

统一三类状态语义，不得混用：

| 状态 | 视觉 | 触发 |
| --- | --- | --- |
| 按压 `:active` | `--fill-hover` 底 + `scale(--tap-scale)` | 手指按下期间 |
| 选中 `.selected` | `--primary-soft` 底 + `inset 0 0 0 1.5px var(--primary)` 内描边 | 点击后持续标识当前记录/选项，直到点选另一条 |
| 保存 `.saved` | `--primary-glow` 轻闪 1.8s + `reduce` 下静态底色兜底 | 新记录写入后 |
| 删除待确认 `.deleting` | `--danger-soft` 底 + `inset 0 0 0 1.5px var(--danger)` + 脉冲 | 删除确认弹窗打开期间，优先级高于「选中」 |

- 点击记录行 → 该行进入「选中」并打开编辑弹窗；弹窗关闭 1s 后取消选中。
- 点击行内删除按钮 → **按钮与整行同时**进入 danger 高亮（`--danger` 底 + 红字 + 整行 danger 描边），松手进入删除待确认态。
- 优先级：`deleting` > `saved` > `selected` > `:active`。

### 3.6 选项块（ChoiceGrid 类）选中态

所有「类型/方式/左右侧/颜色」等单选块，选中态只允许这一种做法：

```css
.selected {
  border-width: 1.5px;
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary-dark);
}
```

带语义色的选项（如喂养类型）选中态用**内联样式**覆盖 `background` / `border-color` / `color`（软底 = 选项色 + `22` 透明度后缀、边框与文字 = 选项色，两端同款写法），但**结构必须相同**（1.5px 边框 + 软底 + 深色文字），不允许出现「只加粗边框」「只换底色」「inset ring 用 surface-2 底」等变体。

### 3.7 弹窗

- 形态：桌面居中卡片（`--radius-lg`），移动端底部抽屉（顶部圆角 `--radius-lg`）。
- 遮罩：`--modal-mask` + `backdrop-filter: var(--glass-blur)`，点击遮罩关闭。
- 标题栏：标题 `--fs-md` 加粗，右侧 44×44 关闭按钮（`--tap-scale-strong`）。
- 打开/关闭动画 `--dur-enter` + `--spring`；`reduce` 下静态出现。

### 3.8 Toast

- 位置：`bottom: calc(var(--tabbar-height) + var(--tabbar-bottom) + var(--space-4))`，水平居中。
- z-index `--z-toast`（300），必须盖过弹窗。
- 入场 `--dur-enter` + `--spring`；`reduce` 下静态出现（不依赖动画的淡入即可）。

### 3.9 空态

空态分**两档语境**，各自内部一致（不要跨档强行统一尺寸）：

| 档 | 语境 | 样式 |
| --- | --- | --- |
| 页级空态 | 整页无数据（如记录页「暂无记录」） | 内边距 `40px 12px`，主文案 `--fs-base`，hint `--fs-sm`/`--text-muted` |
| 卡内空态 | 单张卡 / 图表无数据（如某图表「暂无数据」） | 内边距 `20px 12px`，文案 `--fs-13`/`--text-secondary` |

- 结构统一为「主文案（+ 可选 hint）+ 可选主操作按钮」，文字居中、`--text-secondary`。
- 同一档内所有页面必须共用同一份样式，不允许每个页面各写一套 `.empty-*`。

### 3.10 骨架屏

- 结构必须与真实内容同尺寸（行高、行距、圆角、分组头），否则加载结束会跳动。
- 底色 `--surface-2`，shimmer 动画 `1.2s`；`reduce` 下静态底色（不做 shimmer）。
- 每个有异步内容的页面都应有对应骨架，不允许「有的页面转圈、有的页面骨架、有的页面空白」。

## 4. 组件样式规范

### 4.1 按钮

| 类型 | 底 | 文字 | 边框 |
| --- | --- | --- | --- |
| 主按钮 `.btn-primary` | `--primary-gradient` | `--on-primary` | 无 |
| 次按钮 `.btn-outline` | 透明 | `--text` | 1px `--border-strong` |
| 弱按钮 `.btn-soft` | `--surface-2` | `--text` | 1px `--glass-border` |
| 危险按钮 `.btn-danger-soft` | `--danger-soft` | `--danger` | 无 |

- 高度：主/次按钮 `48px`，紧凑按钮 `40px`，图标按钮 `44×44`。
- 圆角 `var(--radius-sm)`（紧凑）/ `var(--radius)`（默认）。
- 按压：`scale(var(--tap-scale))` + `--dur-press`；主按钮同时轻微提亮。

### 4.2 卡片

- 背景 `--surface`，边框 `1px solid var(--glass-border)`，圆角 `var(--radius)`，内边距 `--space-4`。
- 内部分区用 `--surface-2` + `var(--radius-sm)`，不再叠卡片边框。
- 卡片间距 `--space-3`，分组间距 `--space-5`。

### 4.3 表单

- 输入框：高 `48px`，圆角 `var(--radius-sm)`，底 `--surface-2`，边框 `1px solid var(--glass-border)`。
- 行内参数紧凑输入（如提醒设置的 ReminderParam）：高 `40px`，圆角 `var(--radius-xs)`，宽度由场景定（提醒参数为 `72px`）；因输入本体低于 3.4 的 44px 热区，必须用包裹 `<label>` 撑到 `min-height: 44px`（点击标签文字即聚焦输入），两端同结构。
- focus：边框 `--primary` + `box-shadow: var(--focus-ring)`，两处写法全局统一。
- 错误：边框 `--danger` + 错误文案 `--fs-sm`/`--danger`，提交失败触发 `shake` 动画（`reduce` 下静态红色边框）。
- 标签：`--fs-14`/`--text-secondary`，与输入框间距 `--space-2`。
- 数值类行内输入必须做边界钳制（min/max + 空值回退 min），失焦时静默修正并回显，规则常量见 `src/utils/reminderScheduler.ts`（`clampIntervalHours`、`INTERVAL_MIN_HOURS`、`INTERVAL_MAX_HOURS`，两端同源）。

### 4.4 列表项（TimelineList）

- 行内边距 `var(--space-2) var(--space-3)`，图标 `44×44`，圆角 `var(--radius)`。
- 标题 `--fs-14` 加粗，详情 `--fs-13`/`--text-secondary`，时间戳 `--fs-sm`/`--text-muted`（胶囊底 `--surface-2`）。
- 状态叠加顺序见 3.5；行内删除按钮 44×44，`reduce`/触屏下常显。

### 4.5 TabBar

iOS 26 悬浮胶囊：高 `--tabbar-height: 62px`，宽 `min(100% - 2*gutter, 480px)`，底距 `--tabbar-bottom`，圆角 `--radius-pill`，`backdrop-filter: var(--glass-blur-heavy)`。激活片 `--primary-soft` + `--radius-pill`，图标 24px，标签 `--fs-2xs`。详见 `--tabbar-*` token 注释。

### 4.6 图表

- 色板唯一来源（全部在 TS 侧）：系列色 = `CHART_COLORS` 常量（`constants`）；轴线/网格/tooltip/who 色 = `useChartTheme`（Vue `src/composables/`、React `src/hooks/`）。两者**必须两端逐行同源**。CSS **不设** `--chart-*` token——canvas 读不到 CSS 变量，双源只会漂移（旧 `--chart-*` 已删除）。
- 图表主色统一用 `--primary` 派生，不再用旧的 `#E8906C`。

## 5. 暗色模式

- 暗色值一律写在 `[data-theme='dark']` 的同名 token 上，组件里**禁止**出现「本该随主题切换却写死」的浅色字面色值（如卡片/文字/描边色）。
- **受控例外：语义指标色（kind/data colors）**。每类指标有固定色身份（如奶量=紫、睡眠=蓝、换尿布=靛），其取值刻意**不随主题切换**（两主题下都用同一组饱和值），因此允许在 JS 常量表（如 `CONFIG`/`CHART_COLORS`）中直接写色值——但必须：
  1. 集中定义在**单一常量表**，不允许散落在多个组件里各写一份；
  2. 取值需在浅/深两主题下都校验可读性（对比度、不刺眼）——已核验 TodayOverview 指标卡、快捷入口渐变、悬浮计时球在深色下均正常；
  3. 不得用于「随主题变化的 UI 层」（卡片底、文字、描边、阴影）。
- 新增语义色优先复用 `--accent-*`（暗色已单独定义）；确需独立色值才新建常量并登记于此。
- PWA `theme-color`、渐变兜底色必须从 token 派生，不允许手工对齐；图表色从 `CHART_COLORS` / `useChartTheme` 派生（见 4.6）。

## 6. i18n 布局

- 文案容器一律允许 `min-width: 0` + 单行省略 `text-overflow: ellipsis`，或明确换行；不允许定宽导致英文溢出。
- 空串文案（如英文无单位后缀）要 `v-if` / 条件渲染隐藏，不留空占位。
- 所有按钮、标题、选项文案按英文最长长度检查一遍（320px 宽下）。

## 7. 响应式断点

收敛为 4 个主断点，禁止新增杂散断点：

| 断点 | 用途 |
| --- | --- |
| `≤400px` | 小屏：水平 gutter 由 `--page-gutter` 降到 10px（在 `:root` 上重定义，页头与内容同步） |
| `≥700px` | 平板：容器放宽、内容居中 `max-width: 1200px` |
| `≥900px` | 桌面：设置页等特殊容器 |
| `≥1440px` | 大屏上限 |

## 8. 落地与核查流程

1. 改任何 token / 全局类 / 公共组件前，先 `grep` 全部引用点，确认影响面并写进提交说明。
2. 每次改动必须升版 + 登记 `CHANGELOG.md`（见 `AGENTS.md`）。
3. 提交前按「受影响页面清单」真实浏览器冒烟：今日/记录/统计/设置 + 涉及的弹窗/Toast/悬浮球，逐项核对激活态、禁用态、空态、骨架屏、深/浅色、`prefers-reduced-motion: reduce`。
4. 样式/交互改动必须留证据（截图或 DOM 计算值），核查结论写进提交说明。
5. 发现与本次改动无因果关系的既有变化，停下定位，不顺手改。
