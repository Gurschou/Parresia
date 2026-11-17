import { expect, test, type Page } from "@playwright/test";

/**
 * Hele brugerrejsen: registrering → analyse (tekst og lyd) → rapport →
 * PDF/Markdown → mønsterbibliotek → sammenligning → dashboard → log ud.
 */
test.describe.configure({ mode: "serial" });

const email = `e2e-${Date.now()}@example.com`;
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

const CATEGORY_HEADINGS = [
  "Kognitive strategier",
  "Styrkende overbevisninger",
  "Begrænsende overbevisninger",
  "Værdier & 6 Human Needs",
  "Meta-programmer",
  "Meaning-makers",
  "VAKOG",
  "Eye Accessing Cues",
  "Mangler & næste spørgsmål",
];

async function waitForReport() {
  await expect(page.getByText("Analyserer").or(page.getByText("Sammenfatning")).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sammenfatning" })).toBeVisible({ timeout: 60_000 });
}

test("beskyttede sider sender til login", async () => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("registrering logger ind og åbner ny analyse", async () => {
  await page.goto("/register");
  await page.fill("#name", "E2E Coach");
  await page.fill("#email", email);
  await page.fill("#password", "hemmelig123");
  await page.getByRole("button", { name: "Opret konto" }).click();
  await expect(page).toHaveURL(/\/analyses\/new/);
  await expect(page.getByRole("heading", { name: "Hvem vil du modellere i dag?" })).toBeVisible();
});

test("tekst-analyse: ekspert, live-fremdrift og fuld rapport", async () => {
  await page.getByRole("button", { name: "Ny", exact: true }).click();
  await page.fill("#exp-name", "Mette Holm");
  await page.fill("#exp-role", "Salgsdirektør");
  await page.getByRole("button", { name: "Opret ekspert" }).click();
  await expect(page.getByRole("combobox", { name: "Vælg ekspert" })).toContainText("Mette Holm");

  await page.getByRole("button", { name: "Brug eksempel" }).click();
  await page.fill("#goal", "Lukker store aftaler konsekvent");
  await page.getByRole("button", { name: /Kør analyse/ }).click();

  await expect(page).toHaveURL(/\/analyses\/[0-9a-f-]{36}$/);
  await waitForReport();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mette Holm");
  for (const h of CATEGORY_HEADINGS) await expect(page.getByRole("heading", { level: 2, name: h, exact: true })).toBeVisible();
  await expect(page.getByText("TOTE-løkke").first()).toBeVisible();
  await expect(page.getByText("Leksikon-krydstjek")).toBeVisible();
});

test("rapporter kan downloades som PDF, Markdown og JSON", async () => {
  const id = page.url().split("/").pop()!;
  const pdf = await page.request.get(`/api/analyses/${id}/report?format=pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const md = await page.request.get(`/api/analyses/${id}/report?format=md`);
  expect(await md.text()).toContain("## Mangler & næste spørgsmål");
  const json = await (await page.request.get(`/api/analyses/${id}/report?format=json`)).json();
  expect(Object.keys(json.result)).toEqual(expect.arrayContaining(["cognitive_strategies", "vakog", "gaps_and_next_questions"]));
});

test("et fund kan gemmes i mønsterbiblioteket", async () => {
  const card = page.locator("#enabling_beliefs .group").first();
  await card.hover();
  await card.getByRole("button", { name: "Gem i mønsterbibliotek" }).click();
  await page.fill("#pt-tags", "identitet, forberedelse");
  await page.getByRole("button", { name: "Gem", exact: true }).click();
  await expect(page.getByText("Gemt i mønsterbiblioteket")).toBeVisible();
  await page.goto("/patterns");
  await expect(page.getByText("#forberedelse")).toBeVisible();
  await expect(page.getByText("1 ekspert")).toBeVisible();
});

test("lyd-upload: transskribering → analyse", async () => {
  await page.goto("/analyses/new");
  await page.getByRole("tab", { name: "Lyd / video" }).click();
  await page.locator('input[type="file"][accept*="mp3"]').setInputFiles({
    name: "interview-jonas.mp3",
    mimeType: "audio/mpeg",
    buffer: Buffer.alloc(4096, 3),
  });
  await expect(page.getByText("interview-jonas.mp3")).toBeVisible();
  await page.getByRole("button", { name: /Kør analyse/ }).click();
  await expect(page).toHaveURL(/\/analyses\/[0-9a-f-]{36}$/);
  await waitForReport();
  await expect(page.getByText("interview-jonas.mp3").first()).toBeVisible();
});

test("sammenligning og dashboard viser data på tværs af analyser", async () => {
  await page.goto("/analyses");
  const boxes = page.getByRole("checkbox");
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  await page.getByRole("button", { name: "Sammenlign" }).click();
  await expect(page).toHaveURL(/\/compare\?ids=/);
  await expect(page.getByRole("heading", { name: "Side om side" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Meta-programmer" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Mønstre på tværs af modeller" })).toBeVisible();
  await expect(page.getByText("VAKOG-fordeling")).toBeVisible();
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
});

test("ekspertprofil samler sessioner", async () => {
  await page.goto("/experts");
  await page.getByText("Mette Holm").first().click();
  await expect(page.getByRole("heading", { name: "Samlet profil" })).toBeVisible();
  await expect(page.getByText("Strategier på tværs af sessioner")).toBeVisible();
});

test("log ud", async () => {
  await page.goto("/");
  await page.getByText("E2E Coach").click();
  await page.getByRole("menuitem", { name: "Log ud" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/analyses");
  await expect(page).toHaveURL(/\/login/);
});
