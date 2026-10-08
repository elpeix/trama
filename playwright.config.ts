import { defineConfig, devices } from "@playwright/test";

const PORT = 5180;
const BUILD_PORT = 5181;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /build\.spec\.ts/ },
    {
      name: "build",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${BUILD_PORT}` },
      testMatch: /build\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run build && npx vite preview --port ${BUILD_PORT} --strictPort`,
      url: `http://localhost:${BUILD_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
