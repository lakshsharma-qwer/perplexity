/**
 * End-to-end UI test: types a question, waits for the streamed answer with citations,
 * asks a follow-up, and saves screenshots. Usage: npx tsx eval/e2e.ts [baseUrl] [outDir]
 */
import { chromium } from "playwright-core";

const base = process.argv[2] || "http://localhost:3000";
const out = process.argv[3] || ".";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function check(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok -", msg);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, colorScheme: "light" });
  await page.goto(base);
  const box = page.getByRole("textbox", { name: "Ask a question" });
  await box.fill("Who founded Perplexity AI and when?");
  await page.getByRole("radio", { name: "Quick" }).click();
  await box.press("Enter");

  await page.getByText("Sources", { exact: true }).waitFor({ timeout: 90_000 });
  check(true, "sources appear");
  await page.locator("text=Related").waitFor({ timeout: 180_000 });
  const answer = await page.locator(".prose-answer").first().innerText();
  check(/Srinivas/i.test(answer), "answer names Aravind Srinivas");
  check((await page.locator("a.cite").count()) > 0, "answer has clickable citations");
  await page.screenshot({ path: `${out}/thread-light.png`, fullPage: false });

  // Follow-up uses conversation context ("its") and appends a second turn.
  const follow = page.getByRole("textbox", { name: "Ask a question" });
  await follow.fill("What browser did it launch?");
  await follow.press("Enter");
  await page.locator("section").nth(1).locator("text=Related").waitFor({ timeout: 180_000 });
  const second = await page.locator("section").nth(1).locator(".prose-answer").innerText();
  check(/Comet/i.test(second), "follow-up resolves 'it' → Comet");
  check((await page.locator("nav button").count()) >= 1, "thread saved in history");

  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `${out}/thread-dark.png`, fullPage: false });
  await browser.close();
  console.log("E2E passed");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
