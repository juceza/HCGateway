// @ts-check

// Prettier config for the HCGateway web SPA. Quote/semicolon settings match the
// existing source style (double quotes, semicolons) to avoid reformatting churn.

/** @type {import('prettier').Config} */
const config = {
  arrowParens: 'always',
  singleQuote: true,
  jsxSingleQuote: true,
  tabWidth: 2,
  semi: true,
  trailingComma: 'all',
  plugins: ['prettier-plugin-tailwindcss'],
};

export default config;
