// Playwright para Electron: os testes abrem o proprio app (main.js).
// Rodar: npm test   (num servidor sem tela: xvfb-run -a npm test)
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test",
  testMatch: /.*\.spec\.js/,
  timeout: 90000,
  workers: 1,                       // o app e de instancia unica
  retries: 0,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
