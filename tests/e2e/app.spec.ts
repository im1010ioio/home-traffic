import { expect, test } from "@playwright/test";

test("家人可以在手機上切換三種台北行程與各段班表", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "竹東往台北轉乘攻略" })).toBeVisible();
    await expect(page.getByRole("tab").allTextContents()).resolves.toEqual([
        "國光客運",
        "台鐵",
        "高鐵",
    ]);
    await page.getByRole("tab", { name: "台鐵" }).click();
    await expect(page.getByLabel("僅顯示對號列車")).toBeChecked();
    await expect(page.getByLabel("直達新竹")).not.toBeChecked();

    await page.getByRole("link", { name: "各段班表" }).click();
    await expect(page.getByRole("heading", { name: "各段班表" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "新竹 → 台北" })).toBeVisible();
    await expect(page.getByText("5608")).toHaveCount(0);
    await expect(page.getByText("9003")).toHaveCount(0);
});

test("過期資料仍顯示舊行程但不顯示即時倒數", async ({ page }) => {
    await page.route("**/data/today.json", (route) => route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
            schemaVersion: 1,
            serviceDate: "2026-07-27",
            generatedAt: "2026-07-27T04:30:00+08:00",
            status: "ready",
            sources: ["TDX"],
            legs: [{
                id: "bus-old-1820",
                route: "bus",
                service: "國光客運 1820",
                origin: "朝陽路口",
                destination: "台北",
                departure: "2026-07-27T08:00:00+08:00",
                arrival: "2026-07-27T09:30:00+08:00",
            }],
        }),
    }));

    await page.goto("/");
    await expect(page.getByText("08:00 從 朝陽路口 發車")).toBeVisible();
    await expect(page.getByText(/還有 .*分鐘/)).toHaveCount(0);
});
