module.exports = {
  extends: ["eslint:recommended", "plugin:prettier/recommended"],
  parserOptions: {
    sourceType: "module",
  },
  env: {
    commonjs: true,
    es2020: true,
    "shared-node-browser": true,
  },
  rules: {
    "no-console": "off",
  },
};
