// jest.config.js
/** @type {import("ts-jest").JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Automatically clear mock calls, instances and results before every test
  clearMocks: true,
  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: "v8",
  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
  moduleNameMapper: {
    // Handle module aliases (if you have them in tsconfig.json)
    // Example: "^@/lib/(.*)$": "<rootDir>/src/lib/$1"
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // The root directory that Jest should scan for tests and modules within
  rootDir: ".",
  // A list of paths to directories that Jest should use to search for files in
  roots: [
    "<rootDir>/src"
  ],
  // The glob patterns Jest uses to detect test files
  testMatch: [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)"
  ],
  // A map from regular expressions to paths to transformers
  transform: {
    // Use ts-jest for ts/tsx files
    "^.+\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json", // Ensure this points to your tsconfig
      },
    ],
  },
  // Setup files after env
  // setupFilesAfterEnv: ["<rootDir>/src/setupTests.ts"], // if you need setup
};

