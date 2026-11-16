import js from "@eslint/js";
import tseslint from "typescript-eslint";

const MAX_COMPLEXITY = 15;
const MAX_DEPTH = 2;

export default tseslint.config(
  { ignores: ["dist", "node_modules", "public", "assets"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      complexity: ["error", MAX_COMPLEXITY],
      "max-depth": ["error", MAX_DEPTH],
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: [0, 1, -1],
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
          ignoreNumericLiteralTypes: true,
          // Named constants are the point of the rule: a literal assigned to a const is a name.
          enforceConst: true,
          detectObjects: false,
        },
      ],
    },
  },
  {
    // House layouts are tables of coordinates measured off photos; naming each one adds nothing.
    files: ["src/house/*Floor.ts"],
    rules: { "@typescript-eslint/no-magic-numbers": "off" },
  },
  {
    // Config files are plain JS outside the typed project.
    files: ["eslint.config.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
