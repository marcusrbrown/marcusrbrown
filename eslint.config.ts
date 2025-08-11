import {defineConfig} from '@bfra.me/eslint-config'
import {name} from './package.json'

export default defineConfig({
  name,
  ignores: ['.ai/', '.cache/', '.github/copilot-instructions.md'],
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  rules: {
    'no-duplicate-imports': ['error', {allowSeparateTypeImports: true}],
  },
})
