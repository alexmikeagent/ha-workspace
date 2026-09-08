const { chromium } = require("/usr/lib/chatgpt/resources/cua_node/lib/node_modules/playwright-core")
const fs = require("fs")
const path = require("path")
const assert = require("node:assert/strict")

;(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto("file://" + path.join(__dirname, "ha-workspace-plan.html"))
  const counts = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id)
    return {
      nodes: document.querySelectorAll("[data-node]").length,
      notes: document.querySelectorAll(".appendix details").length,
      tables: document.querySelectorAll("table").length,
      brokenAnchors: [...document.querySelectorAll('a[href^="#"]')]
        .filter((a) => !document.getElementById(a.hash.slice(1)))
        .map((a) => a.hash),
      duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
    }
  })
  assert.deepEqual(counts.brokenAnchors, [])
  assert.deepEqual(counts.duplicateIds, [])
  assert.match(await page.locator("#stack").innerText(), /Bun.*1\.4\.2/s)
  assert.match(await page.locator("#foundation-setup").innerText(), /2,867 files/)
  assert.match(await page.locator("#foundation-setup").innerText(), /Doppler/)
  assert.doesNotMatch(await page.locator("body").innerText(), /seed-drive|SEED_DRIVE_ROOT/)
  await page.locator("#motion-toggle").click()
  assert.equal(await page.locator("#motion-preview").getAttribute("data-open"), "true")
  assert.equal(await page.locator("#motion-toggle").getAttribute("aria-pressed"), "true")
  assert.equal(
    await page.locator(".motion-pane").evaluate((e) => getComputedStyle(e).transitionDuration),
    "0s",
  )
  await page.locator("#motion-toggle").click()
  assert.equal(await page.locator("#motion-preview").getAttribute("data-open"), "false")
  await page.evaluate(() => scrollTo(0, 0))
  assert.match(await page.locator("#effect-architecture").innerText(), /hexagonal modular monolith/)
  assert.match(await page.locator("#atom-state").innerText(), /Effect Atom/)
  assert.equal(
    await page.locator(".code-window pre code").first().textContent(),
    fs
      .readFileSync(path.join(__dirname, "effect-example.mts"), "utf8")
      .split("\nconst runtime =")[0]
      .trim(),
  )
  await page.screenshot({ path: path.join(__dirname, "plan-desktop.png") })
  await page.locator('[data-node="worker"]').click()
  assert.match(await page.locator("#node-title").innerText(), /Bun/)
  await page.locator('[data-step="3"]').click()
  assert.equal(await page.locator("#step-title").innerText(), "Comment on the version you see")
  await page.locator("#tab-agent").click()
  assert.equal(await page.locator("#tab-agent").getAttribute("aria-selected"), "true")
  await page.locator("#tab-agent").press("ArrowLeft")
  assert.equal(await page.locator("#tab-context").getAttribute("aria-selected"), "true")
  await page.locator("#expand-notes").click()
  assert.equal(await page.locator(".appendix details:not([open])").count(), 0)
  await page.locator("#expand-notes").click()
  assert.equal(await page.locator(".appendix details[open]").count(), 0)
  await page.locator("#effect-architecture").screenshot({
    path: path.join(__dirname, "plan-effect.png"),
    style: ".topbar { visibility: hidden }",
  })
  await page.locator("#atom-state").screenshot({
    path: path.join(__dirname, "plan-atoms.png"),
    style: ".topbar { visibility: hidden }",
  })
  const overflow = []
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      overflow.push(width)
    await page.locator("#expand-notes").click()
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
      overflow.push({ width, notes: "expanded" })
    await page.locator("#expand-notes").click()
  }
  assert.deepEqual(overflow, [])
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({ path: path.join(__dirname, "plan-mobile.png") })
  await page.locator(".mobile-menu").click()
  assert.equal(await page.locator(".mobile-menu").getAttribute("aria-expanded"), "true")
  await page.locator('.nav a[href="#effect-architecture"]').click()
  assert.equal(await page.locator(".mobile-menu").getAttribute("aria-expanded"), "false")
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ media: "print" })
  const print = await page.evaluate(() => {
    dispatchEvent(new Event("beforeprint"))
    return {
      closed: document.querySelectorAll("details:not([open])").length,
      ink: getComputedStyle(document.querySelector("h1")).color,
      background: getComputedStyle(document.body).backgroundColor,
    }
  })
  assert.equal(print.closed, 0)
  assert.deepEqual(errors, [])
  const result = {
    checkedAtUtc: new Date().toISOString(),
    passed: true,
    counts,
    viewports: [1440, 1024, 768, 390, 320],
    errors,
    overflow,
    print,
    checks: [
      "Confirmed setup and single fake Drive",
      "motion preview with reduced-motion support",
      "Bun and architecture decisions",
      "checked code embedded exactly",
      "component details",
      "workflow stages",
      "inspector keyboard tabs",
      "expand/collapse notes",
      "mobile navigation",
      "anchor targets and unique IDs",
      "print readability",
    ],
  }
  fs.writeFileSync(path.join(__dirname, "qa-results.json"), JSON.stringify(result, null, 2) + "\n")
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
