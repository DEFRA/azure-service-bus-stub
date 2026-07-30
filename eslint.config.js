import neostandard from 'neostandard';
import importX from 'eslint-plugin-import-x';

const config = neostandard({
  env: ['node', 'vitest'],
  ignores: [...neostandard.resolveIgnoresFromGitignore()],
  noJsx: true,
  noStyle: true
});

config.push({
  plugins: {
    'import-x': importX
  }
});

config.push({
  files: ['**/*.js'],
  rules: {
    'import-x/no-unused-modules': [
      'error',
      {
        unusedExports: true,
        src: ['src/**/!(*.test).js']
      }
    ]
  }
});

config.push({
  files: ['**/*.test.{cjs,js}'],
  rules: {
    'import-x/no-unused-modules': [
      'error',
      {
        unusedExports: true,
        src: ['src/**/*.test.js']
      }
    ]
  }
});

export default config;
