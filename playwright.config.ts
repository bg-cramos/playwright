import { defineConfig, devices } from '@playwright/test';

export default defineConfig({

  testDir: './tests',


  timeout: 120000,


  reporter: 'html',


  globalSetup: require.resolve('./global-setup'),

  use: {

    storageState: 'storageState.json',


    actionTimeout: 10000,
    navigationTimeout: 30000,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  expect: {
    timeout: 10000,
  },
});
