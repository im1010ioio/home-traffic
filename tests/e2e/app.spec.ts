import { expect, test } from "@playwright/test";

test("家人可以在手機上切換三種台北行程與台鐵、高鐵固定班表", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "竹東往台北轉乘攻略" })).toBeVisible();
    await expect(page.getByRole("tab").allTextContents()).resolves.toEqual([
        "🚌國光客運",
        "🚃台鐵",
        "🚄高鐵",
    ]);
    await page.getByRole("tab", { name: "台鐵" }).click();
    await expect(page.getByLabel("僅顯示對號列車")).toBeChecked();
    await expect(page.getByLabel("直達新竹")).not.toBeChecked();

    await page.getByRole("link", { name: "台鐵、高鐵固定班表" }).click();
    await expect(page.getByRole("heading", { name: "台鐵、高鐵固定班表" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "新竹 → 台北" })).toBeVisible();
    await expect(page.getByLabel("僅顯示對號列車")).toBeChecked();
    await expect(page.getByLabel("顯示已過班次")).not.toBeChecked();
    await page.getByRole("tab", { name: "高鐵" }).click();
    await expect(page.getByRole("heading", { name: "高鐵新竹 → 台北" })).toBeVisible();
    await expect(page.getByLabel("僅顯示對號列車")).toHaveCount(0);
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

test("高鐵步行段合併為轉乘間隔且不增加轉乘次數", async ({ page }) => {
    await page.route("**/data/today.json", (route) => route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
            schemaVersion: 1,
            serviceDate: "2026-07-27",
            generatedAt: "2026-07-27T04:30:00+08:00",
            status: "ready",
            sources: ["TDX"],
            legs: [
                { id: "to-zhuzhong", route: "tra", service: "區間 1835", origin: "榮華", destination: "竹中", departure: "2026-07-27T19:16:00+08:00", arrival: "2026-07-27T19:27:00+08:00" },
                { id: "to-liujia", route: "tra", service: "區間 1768", origin: "竹中", destination: "六家", departure: "2026-07-27T19:41:00+08:00", arrival: "2026-07-27T19:46:00+08:00" },
                { id: "walk-to-liujia", route: "walk", service: "步行轉乘", origin: "六家", destination: "高鐵新竹", departure: "2026-07-27T19:46:00+08:00", arrival: "2026-07-27T19:56:00+08:00" },
                { id: "thsr", route: "thsr", service: "高鐵 0676", origin: "高鐵新竹", destination: "台北", departure: "2026-07-27T19:57:00+08:00", arrival: "2026-07-27T20:33:00+08:00" },
            ],
        }),
    }));

    await page.goto("/");
    await page.getByRole("tab", { name: "高鐵" }).click();
    await expect(page.getByText("步行至 高鐵新竹 轉乘 · 間隔 11 分鐘")).toBeVisible();
    await expect(page.getByText("六家 → 高鐵新竹")).toHaveCount(0);
    await expect(page.getByText("20:33 抵達台北 · 2 次轉乘")).toBeVisible();
    await expect(page.getByText(/轉乘 · 等待/)).toHaveCount(0);
});
