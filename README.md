# 星光照明倉存管理

React + Vite + TypeScript + Supabase；GitHub Pages 靜態網站。全部庫存、貨品、相片參考及交易都使用同一 Supabase 專案；本機只保存未提交操作的記憶體狀態，不會假裝跨裝置同步。免員工登入，只供測試資料。

## 已實作

- 總覽：貨品數量、庫存件數、庫存成本、低庫存及近 30 日無出倉觀察。
- 貨品新增／編輯、SKU 及條碼唯一性、規格、買賣價格、補貨閾值；多倉庫庫存。
- 單件／批次模式、ZXing 連續掃碼、同碼防重複、明確允許重掃、支援裝置震動。
- 購物車數量調整／移除／清空、倉庫、備註、確認畫面。
- PostgreSQL 原子 RPC：固定次序鎖定庫存、整批回退、禁止負庫存、唯一 idempotency key；同 key 不同內容拒絕，網絡結果不明時保留原請求以安全重試。
- 不可刪除交易歷史、貨品名稱／SKU／條碼快照、編號／香港日期／類型篩選、UTF-8 BOM CSV 匯出及公式注入防護。
- 圖片卡、名稱／SKU／條碼搜尋、多項規格及倉庫庫存篩選、直接加入批次。
- 相簿／拍照／電腦上載、預覽、1400px 主圖及 360px 縮圖、替換及移除參考。JPEG、PNG、WebP；瀏覽器不支援的 HEIC 提示轉檔。
- Supabase Realtime 訂閱、重新連線／視窗聚焦／30 秒後備刷新。載入完整分頁資料；中斷時顯示狀態。
- 未配置資料庫時顯示設定畫面，寫入停用，不建立假的本機資料庫。

## 首次設定

1. 建立 Supabase **測試專案**。不要使用既有生產庫；這是全新 schema migration。
2. 在 SQL Editor 依次執行：
   - `supabase/migrations/202610110001_inventory.sql`
   - `supabase/migrations/202610110002_storage_realtime.sql`
   每個檔案只執行一次；之後使用 migration 工具追蹤，勿重複建立 table/policy。
3. 第一份 SQL 建立 products、warehouses、inventory、inventory_batches、inventory_batch_items、product_images 及 process_inventory_batch RPC。只新增「主倉」，不插入真實庫存。第二份建立 product-images bucket（2MB/檔案）、Storage 權限及 Realtime publication。
4. 到 GitHub repository → Settings → Secrets and variables → Actions → **Variables** 加入：
   - `VITE_SUPABASE_URL`：專案 https URL
   - `VITE_SUPABASE_ANON_KEY`：publishable key 或 legacy anon key
   公開前端 key 可嵌入編譯檔；**切勿使用 service_role 或 secret key**。
5. Settings → Pages → Source 選 **GitHub Actions**。
6. Actions →「部署倉存網站」→ Run workflow。若 Variables 修改，需重新執行部署，已編譯 JS 不會自動更新。
7. 預期網址：`https://oxygen1024.github.io/starlighting/`。需等 Pages 成功部署後才可使用。
8. 在貨品管理新增測試貨品，再透過入倉輸入起始庫存。不要直接修改 inventory。

Realtime 須保持六張表加入 `supabase_realtime` publication；SQL 已設定。Storage 使用公開圖片 bucket，檔名採 UUID。移除／替換相片只更新產品參考，保留舊 blob 供管理員清理，避免同時操作誤刪仍使用中的圖片。

## 匿名存取影響

沒有員工身分或私人資料保護：任何取得網址／公開 key 的人都能讀取價格、圖片、庫存與交易，並修改貨品、上載圖片及提交入出倉。RLS 與 GRANT 禁止客戶端直接修改庫存或新增／修改／刪除完成交易，但**無法證明提交者是員工**。只使用測試資料；不要放客戶個人資料或真實敏感成本。管理員仍可從 SQL 管理資料。公開 Storage 亦可能被濫用並耗用免費配額。

## 本機開發

```sh
npm ci
cp .env.example .env.local
# 填入同一 Supabase 專案的公開設定
npm run dev
npm run typecheck
npm test
npm run build
```

`vite.config.ts` 的 base 固定為 `/starlighting/`。無需付費 AI API。可選圖片相似度搜尋未實作；圖片搵貨是可靠的圖片瀏覽及文字／規格搜尋。

## 檔案導覽

- `src/main.tsx`：導航、統計、貨品編輯、圖片卡、購物車、確認、歷史、設定及同步。
- `src/Scanner.tsx`：相機生命週期、ZXing 連續掃碼、重掃控制。
- `src/core.ts`：清單、數量驗證、篩選、CSV、防重掃邏輯。
- `src/db.ts`：Supabase client、Storage URL、圖片壓縮。
- `src/style.css`：桌面、雙欄手機及窄屏響應式設計。
- `supabase/migrations/`：schema/RPC/RLS、Storage/Realtime。
- `tests/`：核心行為及 PGlite PostgreSQL 整合測試。
- `.github/workflows/deploy.yml`：型別檢查、測試、production build 及 Pages 部署。
- `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`index.html`：工具鏈。

## 驗證紀錄及上線前實機檢查

已於開發環境通過 11 項自動測試、TypeScript 及 production build。PGlite 執行真正 PostgreSQL schema/RPC，驗證整批成功、回退、歷史快照、idempotency、輸入及匿名權限。PGlite 為單連線引擎，不代表已完成多連線競爭測試。

連接真實測試 Supabase 後需要驗證：

- 兩部裝置打開網站，一部提交批次，另一部統計／歷史／庫存更新。
- 兩個獨立連線同時出倉同一貨品，超額者應整批失敗，庫存不負數。
- iPhone Safari、Android Chrome 相機權限、不同條碼、持續同碼與移開後重掃。
- 相簿、即時拍照、相片方向、壓縮、Storage RLS，替換／移除及其他裝置更新。
- 調整／移除貨品、缺貨整批拒絕、斷線安全重試、圖片篩選及加入清單。
- 尚未在實體手機及真實 Supabase 執行以上測試；不可把自動測試當成實機驗證。

官方設定參考：
- https://vite.dev/guide/static-deploy.html
- https://supabase.com/docs/guides/realtime/postgres-changes
- https://supabase.com/docs/guides/storage/security/access-control

## 2026-10-11 雲端設定更新

已連接 Startlight（Sydney）測試專案；兩份 migrations 已成功套用。`src/public-config.json` 只包含可公開 URL 與 publishable key；環境變數可覆蓋。毋須再執行首次 SQL。已在真實 PostgreSQL 用可回退交易驗證入倉、idempotency 及不足庫存回退，測試資料沒有保留。

安全 advisor 提示匿名及 authenticated 可呼叫 SECURITY DEFINER RPC：這是免登入測試的指定設計，函式固定 search_path、檢查輸入、鎖定庫存，且禁止客戶端直接修改 inventory/history。詳見 https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable 。

GitHub 寫入仍受 403 權限阻擋；未部署網站。

## 新功能：Excel 匯入、條碼配對及字體大小

貨品管理及首頁提供「Excel 匯入」入口。支援 .xlsx（舊 .xls 請另存為 .xlsx）、最多 5MB、每張工作表最多 1,000 行貨品及 100 欄。選擇工作表、是否有標題行、名稱欄及可選品牌／種類欄，預覽後確認。空白行略過、無效文字阻止匯入、同名預設略過，可逐行剔除。只新增貨品，庫存維持不變；無需條碼或 SKU。匯入用固定 UUID 及單次資料庫 upsert，網絡結果不明時同一次重試不重複新增。關閉頁面會遺失未提交設定，結果不明時請先在同一畫面重試。

「掃描配對條碼」：搜尋並選取現有貨品、掃描／輸入條碼、確認配對。預設顯示未有條碼貨品，可取消篩選以替換條碼。用舊條碼條件更新，防止覆蓋其他裝置剛修改的條碼，並依靠資料庫唯一限制防止同碼配到兩件貨品。

頁頂可選細／標準／大字，手機按鈕加大及首頁三步操作指引。字體偏好只保存在目前裝置；貨品及庫存仍保存在 Supabase 並跨裝置同步。`.xlsx` 解析使用 MIT 授權 read-excel-file，按需要才載入。
