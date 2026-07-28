import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    base: process.env.GITHUB_ACTIONS ? "/home-traffic/" : "/",
    plugins: [
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["icon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png"],
            manifest: {
                name: "竹東往台北轉乘攻略",
                short_name: "竹東轉乘",
                description: "竹東前往台北的固定路線班表與轉乘組合。",
                theme_color: "#ff385c",
                background_color: "#ffffff",
                display: "standalone",
                lang: "zh-Hant-TW",
                start_url: ".",
                icons: [
                    {
                        src: "icon-192.png",
                        sizes: "192x192",
                        type: "image/png",
                        purpose: "any",
                    },
                    {
                        src: "icon-512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "any",
                    },
                    {
                        src: "icon-512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable",
                    },
                    {
                        src: "icon.svg",
                        sizes: "any",
                        type: "image/svg+xml",
                        purpose: "any",
                    },
                ],
            },
            workbox: {
                navigateFallback: "index.html",
                runtimeCaching: [
                    {
                        urlPattern: /\/data\/today\.json$/,
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "daily-timetable",
                            expiration: { maxEntries: 2, maxAgeSeconds: 172800 },
                        },
                    },
                ],
            },
        }),
    ],
});
