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
    await expect(page.getByText("今日資料尚未更新")).toBeVisible();

    await page.getByRole("link", { name: "各段班表" }).click();
    await expect(page.getByRole("heading", { name: "各段班表" })).toBeVisible();
    await expect(page.getByRole("link", { name: "查看 5608 官方即時資訊" })).toHaveAttribute(
        "href",
        /taiwanbus\.tw/,
    );
});

test("各段班表會呈現 5608 與 9003 的今日固定時刻", async ({ page }) => {
    await page.route("**/data/today.json", (route) => route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
            schemaVersion: 1,
            serviceDate: "2026-07-28",
            generatedAt: "2026-07-28T04:30:00+08:00",
            status: "ready",
            sources: ["TDX"],
            legs: [
                {
                    id: "bus-5608",
                    route: "bus",
                    service: "新竹客運 5608",
                    origin: "新光大樓",
                    destination: "馬偕醫院",
                    departure: "2026-07-28T07:00:00+08:00",
                    arrival: "2026-07-28T07:25:00+08:00",
                },
                {
                    id: "bus-9003",
                    route: "bus",
                    service: "國光客運 9003",
                    origin: "馬偕醫院",
                    destination: "台北",
                    departure: "2026-07-28T07:40:00+08:00",
                    arrival: "2026-07-28T09:00:00+08:00",
                },
            ],
        }),
    }));

    await page.goto("/#schedules");
    await expect(page.getByText("07:00", { exact: true })).toBeVisible();
    await expect(page.getByText("07:40", { exact: true })).toBeVisible();
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
                origin: "朝陽路",
                destination: "台北",
                departure: "2026-07-27T08:00:00+08:00",
                arrival: "2026-07-27T09:30:00+08:00",
            }],
        }),
    }));

    await page.goto("/");
    await expect(page.getByText("08:00 從 朝陽路 發車")).toBeVisible();
    await expect(page.getByText(/還有 .*分鐘/)).toHaveCount(0);
});
