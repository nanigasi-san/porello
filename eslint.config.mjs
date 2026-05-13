import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [".next/**", "node_modules/**", "drizzle/**", "playwright-report/**"],
  },
];

export default eslintConfig;
