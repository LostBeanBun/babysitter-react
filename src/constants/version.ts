/**
 * 应用版本号：唯一来源 package.json#version
 * 由 next.config.ts 的 env 在构建时注入（React 侧），展示于「设置 → 关于」
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'
