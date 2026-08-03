import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['coverage/**', 'node_modules/**'] },
  ...tseslint.configs.recommended
);
