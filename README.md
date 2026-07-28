# 竹東往台北轉乘攻略

家庭用的手機優先交通看板，將竹東前往台北的台鐵、高鐵與國光客運固定路線整理成可搭組合。

## 本機開發

```sh
npm install
npm run dev
```

## 驗證

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
```

## GitHub 設定

1. 在儲存庫 Settings → Secrets and variables → Actions 建立 `TDX_CLIENT_ID` 與 `TDX_CLIENT_SECRET`。
2. 在 Settings → Pages 將 Source 設為 GitHub Actions。
3. 手動執行「更新今日班表」確認 TDX 資料可正常取得。
4. 「部署 GitHub Pages」會在推送至 `main` 後發布網站。

TDX 憑證只供 GitHub Actions 使用，不得寫入 `.env`、前端程式或發布資料。
