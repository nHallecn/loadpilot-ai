# Playwright browser review guidance

Source: [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp).

Use a real browser during UI iteration instead of relying only on source inspection:

- Open the running app at desktop and narrow mobile viewport sizes.
- Capture accessibility-aware page structure and screenshots after meaningful changes.
- Test navigation by clicking each top-nav item and confirming its active state follows the visible section.
- Scroll through the complete page and inspect density, truncation, overflow, focus states, and responsive breakpoints.
- Exercise key actions such as connecting, selecting an investigation path, starting a test, and moving to diagnosis.
- Recheck after every visual change because a layout can look correct at the top while failing lower on the page.

The official server can be configured with `npx @playwright/mcp@latest` for a compatible MCP client. In this project, browser-based validation should remain local and should not alter production data or weaken security controls.
