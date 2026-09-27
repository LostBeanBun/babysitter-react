import { defineConfig, globalIgnores } from 'eslint/config'
import nextPlugin from 'eslint-config-next'

const eslintConfig = defineConfig([
  ...nextPlugin,
  globalIgnores(['.next/**', 'out/**', 'dist/**', 'node_modules/**', 'coverage/**']),
])

export default eslintConfig
