const express = require("express");
const { chromium } = require("playwright");

const PORT = process.env.PORT || 3000;
const SECRET = process.env.RUNNER_SECRET;

if (!SECRET) {
  console.error("RUNNER_SECRET env var is required");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => res.send("meet-attendee-runner ok"));

app.post("/run", async (req, res) => {
  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { meetUrl, names, durationSeconds } = req.body || {};
  if (
    typeof meetUrl !== "string" ||
    !/^https:\/\/meet\.google\.com\/[a-z-]+/i.test(meetUrl) ||
    !Array.isArray(names) ||
    names.length === 0 ||
    typeof durationSeconds !== "number" ||
    durationSeconds < 30
  ) {
    return res.status(400).json({ error: "invalid input" });
  }

  const started = Date.now();
  const results = await Promise.all(
    names.map((name) =>
      joinMeet(meetUrl, String(name), durationSeconds).catch((err) => ({
        name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }))
    )
  );

  res.json({
    ok: true,
    launched: names.length,
    elapsedMs: Date.now() - started,
    results,
  });
});

async function joinMeet(meetUrl, name, durationSeconds) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    await page.goto(meetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });

    const nameInput = page
      .locator('input[aria-label*="name" i], input[placeholder*="name" i]')
      .first();
    await nameInput.waitFor({ timeout: 20_000 });
    await nameInput.fill(name);

    const joinBtn = page
      .locator(
        'button:has-text("Ask to join"), button:has-text("Join now"), [role="button"]:has-text("Ask to join"), [role="button"]:has-text("Join now")'
      )
      .first();
    await joinBtn.click({ timeout: 15_000 });

    await page.waitForTimeout(durationSeconds * 1000);

    return { name, ok: true };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

app.listen(PORT, () => {
  console.log(`meet-attendee-runner listening on :${PORT}`);
});
