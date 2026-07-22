import { expect, test } from "@playwright/test";

/**
 * Full happy path: register → new chat → streamed answer → reload →
 * history → delete. Runs against the mock AI provider.
 */

const email = `e2e-${Date.now()}@example.com`;
const password = "e2e-password-123";

test.describe.configure({ mode: "serial" });

test("register a new account and land in the chat", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Navn (valgfrit)").fill("E2E Tester");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Adgangskode").fill(password);
  await page.getByRole("button", { name: "Opret konto" }).click();
  await page.waitForURL("**/chat");
  await expect(page.getByRole("heading", { name: "Hvad kan jeg hjælpe med?" })).toBeVisible();
});

test("log in, send a message and see the streamed answer", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Adgangskode").fill(password);
  await page.getByRole("button", { name: "Log ind" }).click();
  await page.waitForURL("**/chat");

  await page.getByLabel("Skriv en besked til 1MM AI").fill("Hej, hvad kan du?");
  await page.getByRole("button", { name: "Send besked" }).click();

  // The user's message and the streamed mock answer both appear.
  await expect(page.getByText("Hej, hvad kan du?").first()).toBeVisible();
  await expect(page.getByText(/Dette er et testsvar fra 1MM AI/).first()).toBeVisible({
    timeout: 15_000,
  });

  // The conversation received an auto-generated title in the sidebar.
  await expect(
    page.getByRole("navigation", { name: "Samtaler" }).getByRole("link").first(),
  ).toBeVisible();
});

test("reload the page and reopen the saved conversation", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Adgangskode").fill(password);
  await page.getByRole("button", { name: "Log ind" }).click();
  await page.waitForURL("**/chat");

  const conversationLink = page
    .getByRole("navigation", { name: "Samtaler" })
    .getByRole("link")
    .first();
  await expect(conversationLink).toBeVisible();
  await conversationLink.click();
  await page.waitForURL("**/chat/**");

  // The saved history is rendered from the database.
  await expect(page.getByText("Hej, hvad kan du?").first()).toBeVisible();
  await expect(page.getByText(/Dette er et testsvar fra 1MM AI/).first()).toBeVisible();
});

test("delete the conversation from the sidebar", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Adgangskode").fill(password);
  await page.getByRole("button", { name: "Log ind" }).click();
  await page.waitForURL("**/chat");

  const nav = page.getByRole("navigation", { name: "Samtaler" });
  const firstLink = nav.getByRole("link").first();
  await expect(firstLink).toBeVisible();
  await firstLink.hover();

  page.once("dialog", (dialog) => void dialog.accept());
  await nav.getByRole("button", { name: /Slet samtalen/ }).first().click();

  await expect(nav.getByText("Ingen samtaler endnu. Start din første!")).toBeVisible();
});

test("memories page: add, edit and delete a memory", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Adgangskode").fill(password);
  await page.getByRole("button", { name: "Log ind" }).click();
  await page.waitForURL("**/chat");

  await page.getByRole("link", { name: "Hukommelse" }).click();
  await page.waitForURL("**/memories");

  await page.getByLabel("Ny memory").fill("Jeg foretrækker korte svar");
  await page.getByRole("button", { name: "Tilføj" }).click();
  await expect(page.getByText("Jeg foretrækker korte svar")).toBeVisible();

  await page.getByRole("button", { name: "Redigér memory" }).first().click();
  await page.getByLabel("Redigér memory").fill("Jeg foretrækker punktopstillinger");
  await page.getByRole("button", { name: "Gem", exact: true }).click();
  await expect(page.getByText("Jeg foretrækker punktopstillinger")).toBeVisible();

  await page.getByRole("button", { name: "Slet memory" }).first().click();
  await expect(page.getByText("Ingen gemte minder endnu.")).toBeVisible();
});
