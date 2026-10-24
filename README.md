# WUMETAX Domain Lookup

WUMETAX 的網域 WHOIS / RDAP 查詢工具，設計給 Cloudflare Pages 部署。

## 架構

- 前台：純 HTML / CSS / JavaScript
- 後端：Cloudflare Pages Functions
- 網域資料：IANA RDAP Bootstrap → 對應 Registry RDAP
- DNS：Cloudflare DNS over HTTPS
- 快取：只快取 IANA RDAP 服務對照表；網域查詢結果不寫入本站快取，RDAP / DNS 上游請求使用 no-store
- 靜態資源不觸發 Function：透過 `_routes.json` 僅讓 `/api/*` 進入 Pages Functions

## 功能

- 網域註冊狀態
- Registrar / IANA Registrar ID
- 建立日期、到期日期、更新日期
- Nameserver
- DNSSEC
- Cloudflare DNS 判斷
- A / AAAA / MX / NS 記錄
- RDAP 原始 JSON
- 查詢網址可分享
- 最近查詢只存在瀏覽器 localStorage
- 手機版 RWD

## Cloudflare Pages 部署

1. Cloudflare Dashboard → Workers & Pages → Create application → Pages。
2. 連接這個 GitHub repository。
3. Framework preset 選 `None`。
4. Build command 留空。
5. Build output directory 填 `/` 或保持預設 root（依 Cloudflare UI 顯示）。
6. 部署。

> 注意：本專案使用 `/functions`，請使用 Git integration / Wrangler 部署。Cloudflare Pages 的 Direct Upload 不支援 Pages Functions。

## 自訂網域建議

例如：

- `domain.wumetax.com`
- `whois.wumetax.com`
- `tools.wumetax.com`

如果之後要整合更多工具，建議使用 `tools.wumetax.com/domain/` 的工具站架構；如果此工具會單獨使用，`domain.wumetax.com` 最直覺。

## API

```text
GET /api/domain?domain=wumetax.com
```

回傳 normalized JSON，並保留 `raw` 原始 RDAP 資料。

## 查詢結果說明

RDAP 回傳 404 時，本工具會顯示「目前查無註冊紀錄」，而不是絕對宣稱「可以購買」。Registry 保留字、Premium Domain、特殊註冊資格等情況仍可能無法購買，最終以實際 Registrar 的即時註冊結果為準。

## 進一步防濫用

網域查詢每次都會連線上游。正式公開後若流量增加，建議再於 Cloudflare 對 `/api/domain*` 加上 Rate Limiting / WAF 規則；若遭機器人大量查詢，再加入 Turnstile。

## WUMETAX Lab 統一平面介面與驗證

前台沿用原生 HTML / CSS / JavaScript；沒有 React 或 Framer Motion，所有動態效果使用 CSS，並尊重 `prefers-reduced-motion`。保留原始 WUMETAX Logo 與 `_routes.json` 路由，不含 PDF 功能。Pages Function 仍提供原有 API，並改進資料新鮮度與來源標示。

設計 token 集中在 `assets/css/styles.css` 的 `:root`：與 https://digital-clock-online.wumetax.com/ 統一：`#111827` 頁首頁尾、`#3B82F6` Hero、白色資料區、`#10B981` 狀態色、`#F59E0B` 強調色，以及 Outfit / Noto Sans TC 字體。所有卡片採小圓角、無陰影、無模糊的平面格式。Google Fonts 無法載入時會使用系統備援字體。Hero 使用寬版深色查詢面板，保留原始 WUMETAX Logo；四區結果仍由 Google Public DNS + EDNS Client Subnet 模擬。

開發工具僅用於測試，不會加入前台載入資源。Node.js 22+：

```sh
npm ci
npm test
npm run check:functions
npx playwright install chromium
npm run dev
# 另開終端機，保持本機網站運作：
npm run test:browser
```

已安裝 Microsoft Edge 時，可設定 `BROWSER_CHANNEL=msedge` 執行瀏覽器測試。瀏覽器測試使用固定 API 測試資料，涵蓋 320 / 390 / 768 / 1024 / 1440px、各種註冊狀態、錯誤、DNS、四區解析、網址/NS 複製、紀錄、JSON、reduced-motion 與損毀紀錄。後端測試模擬外部服務，驗證 RDAP 與四區查詢契約；不能取代正式環境上游服務的可用性確認。

Pages 仍使用 Git integration、Framework None、根目錄輸出與空白 Build command。`check:functions` 是本機部署前檢查，輸出到已忽略的 `.checks/`，不是正式站的 Build command。

## 名稱伺服器資料來源與更新

- 每次查詢與「重新查詢」都重新向 Registry RDAP、Cloudflare DNS over HTTPS 與 Google 區域 DNS 發出請求，前端與 API 使用 `no-store`，不再讀寫舊的整份結果快取。IANA 服務對照表仍快取一天，它不是網域註冊資料。
- `nameservers` 優先採用本次 DNS NS 回覆，`rdapNameservers` 另外保留 Registry 的資料，可在介面展開比對。兩者不同會顯示提示。
- 新增 `nameserverSource`、`nameserverTtl`、`nameserverDnsOk`、`nameserverMismatch`、`checkedAt`；原本的 RDAP、日期、DNS、四區解析與原始 JSON 欄位保留。
- DNS 未取得 NS 時會以 RDAP 備援，介面明確標示，複製功能使用畫面上的同一組名稱伺服器。
- 重新查詢能避開本站 HTTP 快取，無法強迫外部遞迴 DNS 解析器清除 TTL 內的快取，也不能強迫 Registry 即時發布更新。介面顯示查詢時間與 DNS 回覆 TTL，避免把查詢時間誤認成全球生效時間。
- 測試涵蓋舊 RDAP / 新 DNS 的差異、重新連線上游、NS 複製更新、備援、記錄類型過濾與 TTL=0。

測試時可透過 `PORT` 設定本機網站埠號，並以 `TEST_URL` 指向對應測試網址，避免與其他工具站衝突。
