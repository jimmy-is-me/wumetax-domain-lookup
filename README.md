# WUMETAX Domain Lookup

WUMETAX 的網域 WHOIS / RDAP 查詢工具，設計給 Cloudflare Pages 部署。

## 架構

- 前台：純 HTML / CSS / JavaScript
- 後端：Cloudflare Pages Functions
- 網域資料：IANA RDAP Bootstrap → 對應 Registry RDAP
- DNS：Cloudflare DNS over HTTPS
- 快取：Cloudflare Cache API，查詢結果預設快取 5 分鐘
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

目前已有 Edge cache。正式公開後若流量增加，建議再於 Cloudflare 對 `/api/domain*` 加上 Rate Limiting / WAF 規則；若遭機器人大量查詢，再加入 Turnstile。
