import {defineConfig} from '@bfra.me/eslint-config'
import {name} from './package.json'

export default defineConfig({
  name,
  ignores: ['.ai/', '.github/copilot-instructions.md'],
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
})
