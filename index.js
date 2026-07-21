const express = require("express");
const { chromium } = require("playwright");

const app = express();
app.use(express.json());

const SECRET = process.env.RUNNER_SECRET || "changeme";

app.use((req, res, next) => {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${SECRET}`) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/join", async (req, res) => {
  const { meeting_url, names } = req.body;
  if (!meeting_url || !Array.isArray(names) || !names.length) {
    return res.status(400).json({ error: "meeting_url and names[] required" });
  }
  const results = [];
  for (const name of names) {
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-fake-ui-for-media-stream"],
      });
      const ctx = await browser.newContext({ permissions: ["camera", "microphone"] });
      const page = await ctx.newPage();
      await page.goto(meeting_url, { waitUntil: "networkidle", timeout: 30000 });
      const nameInput = page.locator('input[type="text"]').first();
      await nameInput.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      await nameInput.fill(name).catch(() => {});
      const joinBtn = page.getByRole("button", { name: /join now|ask to join/i }).first();
      await joinBtn.click().catch(() => {});
      await page.waitForTimeout(8000);
      results.push({ name, ok: true });
      await browser.close();
    } catch (err) {
      results.push({ name, ok: false, message: err.message });
      if (browser) await browser.close().catch(() => {});
    }
  }
  res.json({ results });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`meet-runner on ${port}`));
