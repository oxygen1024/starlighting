# 星光照明倉存管理

React + Vite + TypeScript + Supabase；GitHub Pages 靜態網站。全部庫存、貨品、相片參考及交易都使用同一 Supabase 專案；本機只保存未提交操作的記憶體狀態，不會假裝跨裝置同步。需要已授權帳戶登入；仍只供測試資料。

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

Realtime 須保持六張表加入 `supabase_realtime` publication；SQL 已設定。Storage 使用私人圖片 bucket，已登入並獲授權後下載圖片，檔名採 UUID。移除／替換相片只更新產品參考，保留舊 blob 供管理員清理，避免同時操作誤刪仍使用中的圖片。

## 匿名存取影響

登入安全設定已於 2026-10-18 更新：未登入或未列於私密 staff_accounts 名單的帳戶無法讀寫倉存、執行 RPC 或存取圖片。所有裝置仍共用同一資料庫。歷史紀錄不會因這次新增登入而補上操作員身份；如多人共用同一帳戶，亦不能識別個別員工。

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

## 單件／批量刪除貨品

貨品管理每行可勾選，提供全選篩選結果、取消選取及刪除所選貨品，最多一次 1,000 款；貨品列表及詳情亦可單件刪除。確認畫面逐項顯示全倉庫存。仍有任何庫存的貨品不能刪除，批量中任何一款不符條件會整批回退。

`20261011102455_archive_products.sql` 新增 archived_at 及 archive_products RPC，並令入出倉與刪除按相同次序鎖定產品。刪除採封存方式：前端隱藏，歷史交易／相片保留，不可再入出倉；條碼釋放供正確貨品使用。重試刪除已封存貨品不會重複操作。一般客戶端不能直接封存／取消封存，Supabase 管理員可復原。匿名 RPC 權限是既定免登入測試設計，advisor 對 SECURITY DEFINER 的提醒仍適用：https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable 。

17 項自動測試、TypeScript 及 build 通過；雲端以回退交易驗證封存及重試。未在兩部實體裝置上測試同時刪除／入倉。

## 操作紀錄

導航「操作紀錄」分為入倉／出倉及新增／修改／刪除兩部分。貨品詳情亦可開啟該貨品的操作紀錄。新增 `product_activity_log`、私有 schema 的資料庫 trigger 及 Realtime publication；紀錄由資料庫自動產生，客戶端只能讀取，不能修改或刪除。支援日期、名稱、類型及每頁 50 筆瀏覽，顯示變更前後欄位。免登入設計無法識別員工身份。

既有貨品記為啟用當下的 baseline 快照，而非假冒歷史新增紀錄；快照內原有 created_at 仍顯示為貨品建立時間。之後 Excel 匯入、條碼配對、資料修改及刪除均會自動記錄。同一資料庫交易失敗時，操作紀錄亦會回退。

Migration：`20261011102758_product_activity_log.sql`。19 項自動測試及 build 通過，真實資料庫亦以回退交易驗證三種操作均產生紀錄。

## Excel 條碼及入倉數量

欄位配對新增條碼及入倉數量，並可選倉庫。未選數量欄或空白視為 0；數量須為 0 至 9999999 整數。條碼可空白，文字格式可保留前導零；數字格式會提示核對。預覽顯示條碼、數量、錯誤及總入倉件數。現有條碼及所選列中重複條碼會被檢查。

新 RPC `import_products_with_stock` 在同一 PostgreSQL 交易新增貨品、產生初始入倉及操作紀錄。任何選定行失敗會整批回退；同一匯入 key 的重試不會重复新增或加庫存。最多 1000 款；有數量者每 200 款產生一筆入倉批次，但所有批次仍在同一原子交易提交。零數量者只建貨品，不建庫存交易。這是新增匯入，不覆蓋現有貨品；同名預設略過。

Migration `20261011103707_import_products_with_stock.sql` 已套用。私有匯入請求紀錄不對客戶端公開。24 項測試、TypeScript 及 build 通過，含 201 項跨批次回退及 idempotency；雲端用回退交易驗證條碼、入倉量及安全重試。

## 有庫存亦可刪除（取代原本零庫存限制）

使用者已要求允許刪除有庫存貨品。新 `archive_products_with_stock(p_ids,p_expected)` RPC 按固定次序鎖定貨品，核對確認畫面中的逐倉庫數量，再於同一交易清零所有倉庫、產生出倉紀錄及封存貨品。出倉備註明確標示「刪除貨品：清零剩餘庫存（非一般出貨）」。歷史紀錄及產品刪除紀錄保留。已刪除貨品重試不會再次扣貨。

確認後若庫存被其他装置修改，整批拒絕，需重新確認。旧 archive_products 端點仍只接受零庫存，避免舊頁面在未確認清零時誤刪有庫存貨品。新增 migration：`20261011105527_archive_products_with_stock.sql`。26 項測試及 build 通過，雲端以回退交易驗證，沒有刪除使用者貨品。

### 成本密碼（毋須帳戶登入）

執行 `20261011113135_protect_product_costs.sql` 後，入貨單價搬到不公開的 `inventory_private.product_costs`；原有成本快照搬到 `inventory_private.cost_history`。搬移驗證成功後才移除 `products.purchase_price` 及公開操作紀錄內的成本欄位。貨品、庫存及交易記錄保持原狀。舊版網頁必須重新整理。

- 點頁頂「查看成本」輸入共享密碼。解鎖不設時限，切換分頁／應用程式不會鎖定；可隨時手動鎖定。令牌只存同一分頁的 sessionStorage，重新整理仍保留；密碼不會儲存在瀏覽器。
- 私密資料不加入 Realtime；公開的 `cost_revision` 只發送版本數字，已解鎖裝置收到後重新經驗證讀取成本。每 30 秒亦檢查更新。
- 在成本面板修改入貨單價、查看成本紀錄、更改密碼。改密碼即撤銷所有解鎖令牌。更新價格有並行修改檢查。
- bcrypt（成本係數 12）儲存密碼雜湊；32 位元組隨機令牌在資料庫只存 SHA-256，伺服器驗證令牌及撤銷狀態。8 次失敗後於 5 分鐘視窗內暫停驗證；全站共用限制，避免換裝置繞過，但亦可能被惡意人士暫時耗盡。
- 密碼最少 4 字元，可用四位數字（包括前置零），UTF-8 最多 72 位元組。只有知道密碼的人可查看／修改成本；共享密碼不會識別個別操作員。員工其他功能現需登入；成本密碼是額外保護，仍應只使用測試資料。
- 未設定初始密碼時成本預設鎖定，網站無公開「首次設定」入口。由專案擁有人在 Supabase SQL Editor 設定或忘記密碼時重設；不要將真實密碼或雜湊提交 GitHub：

```sql
begin;
update inventory_private.cost_access_settings
set password_hash=extensions.crypt('在此換成你自己至少4字元的新密碼',extensions.gen_salt('bf',12)),
    failures=0,retry_at=clock_timestamp()
where singleton;
delete from inventory_private.cost_sessions;
update public.cost_revision set revision=revision+1 where singleton;
commit;
```

`tests/costAccess.test.ts` 使用 PGlite 真正 pgcrypto 驗證資料搬移、匿名拒絕、密碼、令牌、限流、成本修改紀錄、改密碼撤銷以及原有 Excel／入出倉流程。手機分頁切換與重新整理仍須用 iPhone／Android 實測。

安全顧問會提示私密表有 RLS 但沒有 policy（刻意拒絕客戶端直接存取），以及匿名角色可呼叫 SECURITY DEFINER RPC（這些成本入口刻意使用伺服器驗證的解鎖令牌，而非帳戶角色）。已逐項檢查固定 search_path、最小授權、輸入及令牌驗證。參考：[私密表 RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)、[匿名 RPC](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)。

密碼及解鎖偏好更新：依次套用 `20261011114155_relax_cost_password_unlock.sql`，接受四位數字並取消自動到期；不會重設現有密碼。手動鎖定及更改密碼撤銷仍然有效。

### 倉務工作台與執貨改善

參考順豐公開的[標準倉儲配送服務](https://htm.sf-express.com/tw/tc/products_services/storage_service/storage_services/standard_express_service/)所列的收貨掃描、訂單揀貨、覆核、庫存預警、庫位管理及報表流程，以及[順豐科技 LaaS](https://www.sf-laas.com/)的可視化倉儲概念，按星光照明現有流程實作：

- `OperationsDashboard.tsx`：每日倉務快捷操作、倉庫範圍、香港日期的入出倉件數及單據數、缺貨／低庫存提示；點數字可查對應紀錄。
- `InventoryLookup.tsx`、`warehouse.ts`：庫存查詢、寬鬆名稱／條碼／貨架搜尋、品牌／種類／貨架篩選、數量排序、每頁 50 款，及匯出全部符合條件的 CSV。匯出欄位明確列出，不包含入貨單價、成本或內部 SKU。
- `PickingChecklist.tsx`：出倉清單按貨架自然排序（A2 先於 A10）、掃碼定位核對、逐款剔選數量、最新缺貨提示；改數量／條碼／倉庫會令舊核對失效。核對本身不扣貨，最終交易仍使用原有原子 RPC。
- `PrintPreview.tsx`：執貨清單、已完成入出倉單據的 A4 列印預覽／瀏覽器儲存 PDF。已完成單據使用交易快照。
- `main.tsx`、`style.css`：手機卡片、桌面表格、批次步驟提示、固定確認操作區及預先彙總庫存查詢，沿用原有品牌及字體大小選擇。
- `tests/warehouse.test.ts`：香港跨日、倉庫數量、今日交易、組合篩選、貨架排序、公開欄位匯出及核對失效測試。

不需要新資料庫遷移或 Supabase 設定。資料沿用既有共用資料庫及 Realtime；貨架沿用 `products.location`，是各倉共用的貨品資料，並非新增每倉獨立儲位。待提交清單及核對狀態沿用當前操作頁，未儲存為共享派工單。未加入順豐 API 或使用其內部系統畫面。

驗證：TypeScript、45 項自動測試及正式建置；此環境沒有瀏覽器 QA，手機相機、列印及排版仍需實機驗證。

### 貨品管理直接更改數量

`AdjustQuantity.tsx` 在貨品列表提供「更改數量」，先選倉庫、讀取目前庫存，再輸入目標總數（0 至 9999999）及選填原因。使用 `20261012123121_adjust_inventory_quantity.sql` 的 `adjust_inventory_quantity` RPC，以貨品鎖及原數量比較防止覆蓋其他裝置的修改；同一識別碼重試不重複調整。

增加／減少差額沿用 `inventory_batches` 與 `inventory_batch_items`，備註標明「庫存調整」，保留原數量、新數量及原因；不變的數量不製造假交易。既有 Realtime 更新庫存及紀錄。新私密表 `stock_adjustment_requests` 只供 RPC 判斷重試，不允許匿名直接讀寫。48 項測試、TypeScript 及建置通過。

### Excel 成本欄位
- 欄位配對新增「成本／入貨單價（選填）」，港元、非負數、最多兩位小數；不選或空白預設 0。
- 先解鎖成本密碼才能配對及匯入成本。沿用私密成本表、修改紀錄及成本同步通知。
- Migration `20261012132000_import_product_costs.sql` 為匯入 RPC 增加可選 `p_token`，舊三參數呼叫仍可使用。成本、貨品、庫存同一交易提交，重試不重複建立。

### 主頁及返回操作
- 主頁只保留搜尋、貨品管理、入倉及出倉；原有統計、補貨及滯銷觀察移至「倉存分析」。
- 頁首「上一頁」保留原頁搜尋及篩選，還原捲動位置。庫存查詢切頁仍保留品牌、倉庫、排列及頁碼；主頁重新搜尋會建立新查詢。
- 返回不會清空未提交批次，亦不會重新提交交易。無資料庫變更。

### 2026-10-18 帳戶登入
- `src/StaffAuth.tsx`：Supabase Auth 登入名稱／密碼、登入恢復、定期權限核對及設定頁更改密碼；沒有公開註冊入口。
- 登入名稱會正規化成小寫，內部 Auth email 為 `<username>@login.starlighting.invalid`，不發送郵件。忘記密碼由專案管理員透過 Auth Admin API 重設。成本密碼保持獨立。
- `20261018082014_require_staff_login.sql`：私密員工名單、全部表 restrictive RLS、全部既有 RPC 首先驗證員工及有效 auth session、撤銷匿名存取。歷史資料保留。
- 管理員新增帳戶：先用 Supabase Auth Admin `createUser` 設定上述內部 email、password 及 email_confirm=true，再在 SQL Editor 將該 user UUID 與 username 加入 inventory_private.staff_accounts。停用時設 active=false 並撤銷 Auth sessions。不要使用 user_metadata 作授權。
- `src/usePrivateImages.ts`：透過帶登入令牌的 Storage download 取得圖片，登出卸載時撤銷本機 blob URL。圖片 bucket 現為 private；舊的公共圖片連結不再可用。
- 首個帳戶由臨時、隨機密鑰保護的管理端建立；部署後設定端點已關閉，沒有初始密碼、管理密鑰或 service_role 寫入 GitHub。
- 本機 57 項測試；新增匿名拒絕、未授權拒絕、員工正常操作、私密圖片、保留成本鎖、停用及撤銷 session 測試。
- Security advisor 的私密表無政策提示是刻意 default-deny；已登入可執行 SECURITY DEFINER 的提示是經驗證的 RPC 設計，每個函式均先檢查員工身份與 session。參考 https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable 。
- Auth 的外洩密碼檢查尚未啟用，可在方案支援時由管理員啟用：https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection 。
- 舊版頁面需重新整理才會顯示登入。實體手機相機及版面仍需驗收。
