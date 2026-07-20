/** @type {import('prettier').Config} */
const config = {
  semi: true,
  singleQuote: true,
  jsxSingleQuote: false,
  trailingComma: 'all',
  printWidth: 110,
  tabWidth: 2,
  arrowParens: 'always',
  endOfLine: 'lf',

  // Sorts Tailwind classes into canonical order. Must stay last in the plugin
  // list — the plugin's own docs require it.
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './src/app/globals.css',
  tailwindFunctions: ['cn', 'cva'],
};

export default config;
