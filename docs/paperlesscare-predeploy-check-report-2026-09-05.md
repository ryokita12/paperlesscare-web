# PaperlessCare デプロイ前 最終確認報告

> 対象リポジトリ: `/Users/rkita/Desktop/React/PaperlessCare/paperlesscare-web`
> 実施日: 2026-09-05
> 対象ブランチ: `main`（HEAD: `0781b391`）
> 対象の変更: `docs/paperlesscare-under18-foundation-fix-report-2026-09-05.md`（18歳未満対応前の土台修正）
> **本番デプロイは実行していません。** 本番Firestore／Storage／Firebase設定にも一切触れていません。

---

## 判定サマリ

| 確認項目 | 結果 | 備考 |
|---|---|---|
| Git status | **PASS** | 秘密情報・一時ファイルの混入なし。未追跡は新規ソース7件＋docs 2件のみ |
| PIIログ | **PASS** | ソース・ビルド成果物・本番バンドルすべてでOCR本文の出力なしを確認 |
| Functions build | **PASS** | `npm --prefix functions run build` 成功。`functions/lib/` の旧PIIログを解消 |
| Root TypeScript | **PASS** | `npx tsc --noEmit` エラー0 |
| Functions TypeScript | **PASS** | `npx tsc -p functions/tsconfig.json --noEmit` エラー0 |
| ESLint | **WARN** | 19問題（error 8 / warning 11）。**すべて既存由来**、今回の変更由来は0件 |
| Tests | **PASS** | **22 / 22 PASS**（fail 0） |
| Next.js Build | **PASS** | `.next` を削除したクリーンビルドで成功。10ルート生成 |
| adult回帰 | **一部確認** | 型・ビルド・単体テストで確認。実データを伴う動作は未確認（デプロイ後チェックリスト参照） |
| child disabled | **PASS** | `certPages.ts:30` の `enabled: false` を維持 |
| Deploy Ready | **YES** | 下記「17. 総括」参照 |

---

## 1. 確認概要

前回実施した土台修正（PIIログ除去・ページ2データモデル是正・旧データ互換・certType分岐・撮影往復の画像保持・テスト22件）について、本番デプロイ直前の安全確認を行いました。

**報告書の記載を鵜呑みにせず、現在のコードとビルド成果物を実測で確認**しています。

### 実施した検証

| # | 検証 | コマンド |
|---|---|---|
| 1 | Git状態・秘密情報の混入 | `git status` / `git diff` / `git ls-files --others --exclude-standard` / `git check-ignore` |
| 2 | PIIログの残存 | ソース・`functions/lib/`・`.next/` を横断grep |
| 3 | Functionsビルド | `npm --prefix functions run build` |
| 4 | 型チェック（ルート） | `npx tsc --noEmit` |
| 5 | 型チェック（Functions） | `npx tsc -p functions/tsconfig.json --noEmit` |
| 6 | Lint | `npm run lint` |
| 7 | テスト | `npm test` |
| 8 | 本番ビルド | `rm -rf .next && npm run build` |
| 9 | Firebase構成 | `firebase.json` / `.firebaserc` / rules / indexes の差分確認 |

### 今回、検証中に行った修正（1件のみ）

| ファイル:行 | 内容 | 理由 |
|---|---|---|
| `functions/src/index.ts:93-99` | `const { code, message } = err as {...}` → `(err ?? {}) as {...}` | `throw null` のようなケースで catch 内の分割代入自体が例外になり、**エラーログが残らないまま関数が落ちる**可能性があったため。挙動を変えない防御的修正 |

この修正後、Functions の型チェック・再ビルド・全検証を再実行し、すべてパスすることを確認しています。

---

## 2. Git状態

### 2.1 ブランチとHEAD

```
branch : main
HEAD   : 0781b391 OCRをStorage依存から直接画像送信方式へ変更
```

**土台修正はまだコミットされていません**（作業ツリー上の変更として存在）。デプロイ前にコミットするかはユーザーの運用判断です。

### 2.2 秘密情報・危険ファイルの混入チェック

| 対象 | 状態 |
|---|---|
| `.env.local` | **IGNORED ✓**（`.gitignore:34` の `.env*`） |
| `google-cloud-sdk/` | **IGNORED ✓** |
| `node_modules/` | **IGNORED ✓** |
| `.next/` | **IGNORED ✓** |
| `functions/lib/index.js` | **IGNORED ✓**（`functions/.gitignore`） |
| `functions/node_modules/` | **IGNORED ✓** |
| `.firebase/` | **IGNORED ✓** |

**追跡対象ファイルの秘密情報パターン検索**（`.env` / `secret` / `credential` / `serviceaccount` / `.pem` / `.p12` / `key*.json`）:

```
(該当なし)
```

**結論: 秘密鍵・APIキー・サービスアカウント・環境変数ファイルはいずれもGit管理対象に入っていません。**

### 2.3 未追跡ファイル（gitignore適用後）

```
docs/paperlesscare-current-status-recipient-certificate-under18.md
docs/paperlesscare-under18-foundation-fix-report-2026-09-05.md
src/app/t/[tenantId]/constants/certLayoutMap.ts
src/app/t/[tenantId]/constants/certLayoutMap.test.ts
src/app/t/[tenantId]/lib/compat/legacyPage2.ts
src/app/t/[tenantId]/lib/compat/legacyPage2.test.ts
src/app/t/[tenantId]/lib/parsers/adult/page2.test.ts
src/app/t/[tenantId]/lib/parsers/parseCertText.test.ts
src/app/t/[tenantId]/lib/storage/importImageStore.ts
```

**想定外のファイルはありません。** 前回作成した新規ソース7件と、報告書2件のみです。

### 2.4 前回作業以外の変更（要注意）

**`cors.json` は前回の土台修正の対象外です。** 作業開始時点（現状調査の実施前）から未コミットの変更として存在していました。

```diff
-    "origin": ["http://localhost:3000", "http://localhost:3001", "http://192.168.0.5:3001"],
+    "origin": [
+      "https://paperlesscare-web.vercel.app",
+      "http://localhost:3000",
+      ...
+    ],
-    "responseHeader": ["Content-Type", "Authorization", "x-goog-resumable"],
+    "responseHeader": [
+      "Content-Type", "Content-Length", "Content-Range",
+      "Accept-Ranges", "Authorization", "x-goog-resumable"
+    ],
```

**重要**: `cors.json` は `firebase deploy` の対象ではありません。Cloud Storage バケットへの適用は `gsutil cors set` / `gcloud storage buckets update` という**GCP側の操作**です。

- 今回のデプロイ手順には**含めません**（Firebase設定変更・本番Storage設定変更は停止条件のため）
- このCORS設定がバケットに適用済みかどうかは、本レポートでは確認していません（本番への問い合わせを避けたため）
- 第13章に、ユーザーの判断事項として記載しています

### 2.5 Git履歴の個人情報について

**指示どおり、Git履歴の書き換え（`git filter-repo` / rebase / force push）は一切行っていません。** 現状確認のみです。

| 対象 | 状態 |
|---|---|
| **現在の作業ツリー** | **存在しません**。実データ（氏名・住所・受給者証番号・生年月日）を検索した結果、追跡・未追跡ファイルすべてで0件 |
| **`docs/` 配下の報告書** | **存在しません**。旧テストデータの実値を検索した結果、全パターン0件 |
| **Git履歴** | **存在します**。`f043c105 受給者証1ページ目の氏名と交付年月日抽出を改善` が `src/app/t/[tenantId]/lib/parsers/adult/page1.test.ts` に実データを導入しており、そのコミットには現在も残っています |

**デプロイへの影響はありません**（デプロイされるのは作業ツリーのビルド成果物であり、Git履歴ではないため）。リポジトリへのアクセス権を持つ人が過去コミットを閲覧できる、という点のみが残課題です。対処には履歴書き換え（force push を伴う）が必要で、ユーザーの判断事項です。

---

## 3. 変更ファイル確認

### 3.1 変更差分の規模

```
16 files changed, 443 insertions(+), 180 deletions(-)
```

（新規7ファイル 569行は未追跡のため上記に含まれません）

### 3.2 変更ファイル一覧と、デプロイ先の分類

| ファイル | 変更内容 | 反映先 |
|---|---|---|
| `functions/src/index.ts` | PIIログ除去、`buildLogContext` 追加、入力検証強化、`any` 除去、catch防御 | **Cloud Functions** |
| `src/app/t/[tenantId]/page.tsx` | certType伝播、PIIログ除去、IndexedDB連携 | フロントエンド |
| `src/app/t/[tenantId]/components/certLayouts.tsx` | ページ2フィールド差し替え、certType分岐、key再マウント | フロントエンド |
| `src/app/t/[tenantId]/components/PageTabs.tsx` | `CertTypeId` import、`getPageDefinitions` 使用 | フロントエンド |
| `src/app/t/[tenantId]/constants/certPages.ts` | `getPageDefinitions`/`getPageTitle`、`emptyFormData` 補完 | フロントエンド |
| `src/app/t/[tenantId]/types/cert.ts` | `serviceType1` 系の型定義 | フロントエンド |
| `src/app/t/[tenantId]/lib/firestore/beneficiaries.ts` | 読み取り時の正規化・旧データ互換 | フロントエンド |
| `src/app/t/[tenantId]/lib/parsers/parseCertText.ts` | パーサレジストリ化、PIIログ除去 | フロントエンド |
| `src/app/t/[tenantId]/lib/parsers/adult/page2.ts` | `serviceType1` 系へ格納、期間抽出のラベル起点化 | フロントエンド |
| `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/page.tsx` | certType伝播 | フロントエンド |
| `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/EditPageSwitcher.tsx` | certType props | フロントエンド |
| `src/app/t/[tenantId]/lib/parsers/adult/page1.test.ts` | テストデータ匿名化 | **デプロイ対象外**（テスト） |
| `package.json` | `test` スクリプト追加 | デプロイ対象外（scriptのみ） |
| `tsconfig.json` | 旧スナップショットを exclude | デプロイ対象外（ビルド設定） |
| `eslint.config.mjs` | ignore追加 | デプロイ対象外 |
| `cors.json` | **前回作業の対象外**（第2.4章） | GCP Storage設定（今回対象外） |

### 3.3 変更されていないことを確認したファイル

| ファイル | 差分 |
|---|---|
| `firestore.rules` | **なし** |
| `storage.rules` | **なし** |
| `firestore.indexes.json` | **なし**（`{"indexes":[],"fieldOverrides":[]}` のまま） |
| `firebase.json` | **なし** |
| `.firebaserc` | **なし** |

### 3.4 テストコードが本番バンドルに混入していないこと

`.next/` を検索した結果:

```
node:test を含むファイル : 0件
```

テストファイルは `src/app/` 配下にありますが、ルート（`page.tsx` / `route.ts`）ではなく、どこからもimportされていないため、バンドルに含まれません。

---

## 4. 個人情報ログ確認

### 4.1 ソースコードの全ログ出力（`src/` + `functions/src/`）

| ファイル:行 | ログ | 出力内容 | 判定 |
|---|---|---|---|
| `src/app/t/[tenantId]/page.tsx:467` | `console.info("[OCR] completed", {...})` | `pageNo` / `certType` / `textLength` / `filledFieldCount` | **安全**（件数と種別のみ） |
| `functions/src/index.ts:86` | `logger.info("ocrFromImageData completed", {...})` | `pageNo` / `certType` / `textLength` | **安全** |
| `functions/src/index.ts:102` | `logger.error("ocrFromImageData failed", {...})` | `pageNo` / `certType` / `code` / `message` | **安全**（Vision APIのエラーコードとメッセージのみ。エラーオブジェクト全体は出さない） |
| `src/app/login/LoginClient.tsx:61` | `console.error("[LOGIN] ERROR", e)` | Firebase Authのエラー | **許容**（既存。受給者証のPIIは含まない。ログイン失敗調査に必要） |
| `src/app/logout/LogoutClient.tsx:26,32` | `console.warn(...)` | サインアウト失敗 | **許容**（既存。個人情報なし） |

**`console.log` / `console.debug` / `console.table` / `console.dir` / `console.trace` は、`src/` `functions/src/` のいずれにも存在しません。**

### 4.2 除去された旧ログ（検索で不在を確認）

| パターン | ソース | `functions/lib/` | `.next/` |
|---|---|---|---|
| `OCR RAW TEXT` | 0件 | 0件 | **0件** |
| `PARSED CERT DATA` | 0件 | 0件 | **0件** |
| `PARSE CERT` | 0件 | 0件 | **0件** |
| `ocrFromImageData raw text` | 0件 | **0件**（ビルド後） | — |

### 4.3 ログ引数に変数が丸ごと渡っていないか

`console.*` の引数に `text` / `parsed` / `formData` / `ocr` / `data` が渡っている箇所を検索:

```
(該当なし)
```

すべてのログが、明示的にフィールドを選んだオブジェクトリテラルを渡しています。

### 4.4 本番バンドル（`.next/`）の実測

クリーンビルド後の `.next/static` `.next/server` を検索した結果:

- `OCR RAW TEXT` / `PARSED CERT DATA` / `PARSE CERT` : **すべて0件**
- `[OCR] completed`（新しい非個人情報ログ）: **存在**（意図どおり）

### 4.5 補足: `ocrText` はFirestoreに保存され続けます（ログではない）

`ocrText`（OCR本文）は**ログには出ませんが**、以下に保持されます。

| 保存先 | 該当箇所 |
|---|---|
| Firestore `beneficiaries/{id}.pages[].ocrText` | `lib/firestore/beneficiaries.ts:23`, `page.tsx:538` |
| ブラウザの sessionStorage（取込中のみ） | `page.tsx:249` |

これは**今回の変更前からの既存挙動**で、変更していません。現状どの画面にも表示されず、再パースにも使われていないため、保持の要否は仕様確認事項です（前回報告書 C-19 / R-19）。**デプロイのブロッカーではありません。**

### 4.6 判定

**PASS** — OCR本文・氏名・住所・生年月日・受給者番号のいずれも、ソース・ビルド成果物・本番バンドルのログ出力に含まれていません。

---

## 5. Functionsビルド結果

### 5.1 ビルド前の状態（重要）

前回報告の指摘どおり、**旧ビルド成果物にPIIログが残っていました**。

```
functions/lib/index.js:81:        logger.info("ocrFromImageData raw text", {
functions/lib/index.js:83:            text,          ← OCR全文
```

タイムスタンプは `Jul 10 14:09` で、今回のソース修正が反映されていない状態でした。

### 5.2 ビルド実行

`functions/package.json` の scripts を確認し、`"build": "tsc"` であることを確認したうえで実行:

```bash
npm --prefix functions run build
```

```
> build
> tsc

(exit 0)
```

### 5.3 ビルド後の検証

```
旧PIIログ（"raw text" / "ocrFromImageData raw"）: 0件 ✓
```

ビルド成果物のログ呼び出し（実測）:

```js
logger.info("ocrFromImageData completed", {
    ...logContext,
    textLength: text.length,
});

const { code, message } = (err ?? {});
logger.error("ocrFromImageData failed", {
    ...logContext,
    code,
    message,
});
```

**`text` 変数がloggerに渡っていないことを、コンパイル済みJavaScriptで直接確認しました。**

### 5.4 デプロイ時の再ビルドについて

`firebase.json:14` の predeploy フックが設定されています。

```json
"predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
```

**`firebase deploy --only functions` を実行すると、この検証済みビルドがもう一度実行されます。** つまりデプロイ時点のソースからビルドされるため、成果物の取り違えは起きません。

### 5.5 判定

**PASS**

---

## 6. TypeScript確認結果

| 対象 | コマンド | 結果 |
|---|---|---|
| ルート（Next.js） | `npx tsc --noEmit` | **PASS**（エラー0） |
| Functions | `npx tsc -p functions/tsconfig.json --noEmit` | **PASS**（エラー0） |

`tsconfig.json` の `exclude` に旧スナップショット（`src_20260514_1` / `src_20260519_1`）と `functions` を指定済みのため、現行コードのみが対象です。

Next.js のビルド中にも `Running TypeScript ...` フェーズが実行され、こちらも通過しています。

**判定: PASS**

---

## 7. ESLint結果

### 7.1 実行コマンド

`package.json` の `"lint": "eslint"` を確認し、`npm run lint` で実行。

### 7.2 結果

```
✖ 19 problems (8 errors, 11 warnings)
```

### 7.3 error 8件 — すべて既存由来（今回触っていないファイル）

| ファイル:行 | ルール |
|---|---|
| `src/app/components/AppShell.tsx:31` | `react-hooks/set-state-in-effect` |
| `src/app/components/UnhandledRejectionGuard.tsx:8` | `no-explicit-any`（未使用コンポーネント） |
| `src/app/login/LoginClient.tsx:60` | `no-explicit-any` |
| `src/app/logout/LogoutClient.tsx:31` | `no-explicit-any` |
| `src/app/signup/SignupClient.tsx:25` | `no-explicit-any` |
| `src/app/t/[tenantId]/beneficiaries/page.tsx:38` | `react-hooks/set-state-in-effect` |
| `src/app/t/[tenantId]/beneficiaries/page.tsx:45` | `no-explicit-any` |
| `src/app/t/[tenantId]/capture/page.tsx:57` | `no-explicit-any` |

### 7.4 指示された重点確認対象の状況

| 対象 | error | 判定 |
|---|---|---|
| **Functions**（`functions/src/index.ts`） | **0件** | 前回の土台修正で `any` 2件を解消済み |
| **certType対応**（`certLayoutMap.ts` / `certLayouts.tsx` / `certPages.ts` / `PageTabs.tsx`） | **0件** | — |
| **IndexedDB対応**（`importImageStore.ts`） | **0件** | — |
| **parser関連**（`parseCertText.ts` / `adult/page2.ts` / `lib/compat/`） | **0件** | — |
| **今回修正したその他のファイル** | **0件** | — |

**今回追加した新規7ファイルには、error / warning ともに0件です。**

### 7.5 warning 11件 — すべて既存由来

| ルール | 件数 | 箇所 |
|---|---|---|
| `@next/next/no-img-element` | 5 | `SideNav.tsx:38,51` / `capture/page.tsx:257` / `PageTabs.tsx:40` / `page.tsx:804` |
| `@typescript-eslint/no-unused-vars` | 6 | `AppShell.tsx:22`（`subtitle`）/ `LoginClient.tsx:5`（`db`）/ `capture/page.tsx:57`（`e`）/ `certLayouts.tsx:205,532,611`（`pageTitle`） |

`certLayouts.tsx` の `pageTitle` 未使用3件は今回変更したファイルにありますが、**warning であり error ではなく、かつ既存**（`LayoutType2` / `6` / `7` がタイトルをハードコードしているため）です。解消するとUI上のタイトル表示が変わるため、デプロイ直前の変更としては見送りました。

### 7.6 推移

| | 土台修正の前 | 現在 |
|---|---|---|
| 総問題数 | 72 | **19** |
| error | 30 | **8** |
| warning | 42 | **11** |

**新しいエラーは1件も増えていません。**

### 7.7 補足: `functions` 独自lintは実行不可（既存の環境問題）

```bash
npm --prefix functions run lint
```

```
TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions':
Cannot read properties of undefined (reading 'allowShortCircuit')
```

`functions/` が eslint 8 を使う一方、ルールの解決がルートの `node_modules/eslint`（v9）を参照しているためです。**今回の変更とは無関係の既存問題**で、前回報告書にも記載済み（R-9）。

**デプロイへの影響はありません。** predeploy フックが実行するのは `npm run build`（＝`tsc`）であり、lint ではないためです。ルートの `npm run lint` は `functions/src/` も対象に含んでおり、そちらでは0件です。

### 7.8 判定

**WARN**（既存指摘のみ。デプロイのブロッカーではない）

---

## 8. テスト結果

### 8.1 実行コマンド

`package.json` の `"test": "node --experimental-strip-types --test"` を使用。

```bash
npm test
```

### 8.2 結果

```
ℹ tests 22
ℹ pass 22
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

**22 / 22 PASS**（前回と同数、fail 0）

### 8.3 指示された確認対象の網羅状況

| 指示された対象 | テストファイル | 件数 | 結果 |
|---|---|---|---|
| adult page1 parser | `lib/parsers/adult/page1.test.ts` | 3 | **PASS** |
| adult page2 parser | `lib/parsers/adult/page2.test.ts` | 3 | **PASS** |
| legacy page2 migration | `lib/compat/legacyPage2.test.ts` | 8 | **PASS** |
| certType layout mapping | `constants/certLayoutMap.test.ts` | 4 | **PASS** |
| ページタイトルmapping | `constants/certLayoutMap.test.ts`（`CERT_TYPES` 全種別×全ページの解決を検証） | 上記に含む | **PASS** |
| パーサ振り分け（certType分岐） | `lib/parsers/parseCertText.test.ts` | 4 | **PASS** |

### 8.4 全テストの内訳

**`certLayoutMap.test.ts`（4件）**
- adult の8ページが想定どおりのレイアウトへ割り当てられる（修正前の `switch` との回帰テスト）
- child は現時点では adult と同じレイアウトを参照する
- 定義済みの全種別が全ページ分のレイアウトを解決できる
- 範囲外のページはフォールバックする（例外を投げない）

**`legacyPage2.test.ts`（8件）**
- `isPage2` の判定（`pageNo` 優先・無ければ配列添字）
- 旧フィールドの値を `serviceType1` 系へ移送する
- 移送元の旧フィールドは空にする（コピーではなく移動）
- 新フィールドに値がある場合は上書きしない
- 項目ごとに独立して移送する
- 移送が不要なら同一オブジェクトをそのまま返す
- 新形式で保存された空データは変化しない

**`adult/page1.test.ts`（3件）**
- 実機OCR RAW TEXTから本人・児童・交付年月日等を正しく抽出する
- 交付年月日はスペースを含む和暦表記でも抽出でき、数字だけの値は採用しない
- 氏名ラベルが「氏名」で連続表記の場合でも本人・児童を抽出できる

**`adult/page2.test.ts`（3件）**
- 1組目を `serviceType1` / `servicePeriod1` / `serviceAmount1` へ格納する
- 人物情報用フィールドへサービス情報を混入させない
- 該当行が無いOCR結果では1組目を空文字で返す

**`parseCertText.test.ts`（4件）**
- adult のページ1〜4は専用パーサへ振り分けられる
- adult のページ5〜8は専用パーサ未実装（null）
- child / mobility は専用パーサ未登録で adult のものを流用しない
- adult ページ2はサービス情報を `serviceType1` 系へ入れる／専用パーサが無い場合もフォールバックで必須項目を返す

### 8.5 テストデータの安全性

全テストのフィクスチャが架空値であることを再確認しました（`架空 太郎` / `架空 花子` / `架空市` / `1234567890` / `1111111111` / `山田 太郎`）。実在の氏名・住所・受給者証番号は含まれていません。

### 8.6 判定

**PASS（22/22）**

---

## 9. Next.js Build結果

### 9.1 コマンドの確認

`package.json` の `"build": "next build"` を確認。**`npm run build` がこのリポジトリで正しいコマンド**です（`npx next build` と等価）。

### 9.2 クリーンビルドの実行

キャッシュの影響を排除するため `.next` を削除してから実行しました。

```bash
rm -rf .next && npm run build
```

### 9.3 結果

```
▲ Next.js 16.1.1 (Turbopack)
- Environments: .env.local

✓ Compiled successfully in 2.2s
  Running TypeScript ...
✓ Generating static pages using 9 workers (7/7)
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /login
├ ○ /logout
├ ○ /signup
├ ƒ /t/[tenantId]
├ ƒ /t/[tenantId]/beneficiaries
├ ƒ /t/[tenantId]/beneficiaries/[beneficiaryId]
├ ƒ /t/[tenantId]/capture
└ ƒ /t/[tenantId]/settings
```

**10ルートすべてが正常に生成**されました。土台修正前と同じ構成です（ルートの増減なし）。

### 9.4 判定

**PASS**

---

## 10. Firebase設定確認

### 10.1 `.firebaserc`

```json
{ "projects": { "default": "paperlesscare" } }
```

デフォルトプロジェクト: **`paperlesscare`**

### 10.2 `firebase.json`

```json
{
  "functions": [{
    "source": "functions",
    "codebase": "default",
    "disallowLegacyRuntimeConfig": true,
    "ignore": ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log", "*.local"],
    "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
  }],
  "firestore": {
    "database": "(default)",
    "location": "nam5",
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": { "rules": "storage.rules" }
}
```

### 10.3 設定項目ごとの確認

| 項目 | 内容 |
|---|---|
| **Hosting target** | **設定なし**。`firebase.json` に `hosting` キーが存在しません |
| **Functions source** | `functions` |
| **Functions codebase** | `default` |
| **Functions region** | `asia-northeast1`（`functions/src/index.ts:13` の `setGlobalOptions`） |
| **Functions runtime** | Node 24（`functions/package.json` の `engines`） |
| **Functions entrypoint** | `lib/index.js`（`main`） |
| **Functions predeploy** | `npm --prefix "$RESOURCE_DIR" run build` — 第5.4章で検証済み |
| **Hosting predeploy** | **該当なし**（Hosting未設定のため） |
| **Firestore rules** | `firestore.rules`（差分なし） |
| **Firestore indexes** | `firestore.indexes.json`（差分なし・空） |
| **Storage rules** | `storage.rules`（差分なし） |

### 10.4 【重要】フロントエンドの配信先は Firebase Hosting ではありません

**`firebase.json` に `hosting` セクションは存在せず、Git履歴を遡っても一度も存在したことがありません**（`git log -p --all -- firebase.json` で `"hosting"` の出現回数 0）。

フロントエンドは **Vercel** に配信されていると判断しました。根拠:

| 根拠 | 内容 |
|---|---|
| `cors.json` | 許可オリジンに `https://paperlesscare-web.vercel.app` |
| `.gitignore:36-37` | `# vercel` / `.vercel` |
| `firebase.json` | `hosting` 未設定（履歴上も一度もなし） |
| プロジェクト構成 | Next.js 16 App Router のゼロコンフィグ構成（`vercel.json` 不要） |

したがって、**`firebase deploy --only hosting` は実行できません**（設定が無いためCLIがエラーになります）。フロントエンドの反映はVercel側の操作です。

### 10.5 デプロイされるFunction

```
ocrFromImageData  (onCall / Gen2 / asia-northeast1)
```

エクスポートは1件のみです。

---

## 11. デプロイ対象判定

### 11.1 今回必要

| リソース | 必要性 | 理由 |
|---|---|---|
| **Cloud Functions** | **今回必要** | `functions/src/index.ts` を変更（PIIログ除去・入力検証強化・catch防御）。**これをデプロイしない限り、Cloud LoggingへのOCR全文出力は止まりません** |
| **フロントエンド（Vercel）** | **今回必要**（Firebaseの範囲外） | `src/` 配下11ファイルを変更。ページ2のデータモデル是正・旧データ互換・certType分岐・撮影往復の画像保持はすべてフロントエンド側 |

### 11.2 デプロイ順序の推奨

**Cloud Functions を先に、フロントエンドを後に。**

| 順序 | 状態 | 影響 |
|---|---|---|
| **① Functions 先行**（推奨） | 新Function × 現行フロント | `pageNo`/`certType` が届かず `undefined` になるだけ。**PIIログは即座に停止**。正常動作 |
| ② フロント先行 | 現行Function × 新フロント | 追加フィールドは無視され動作するが、**PIIログが止まらない期間が残る** |

Callable のペイロードは双方向に後方互換なので、どちらの順でも壊れません。**個人情報の観点から①を推奨**します。

### 11.3 今回不要

| リソース | 理由 |
|---|---|
| **Firestore Rules** | `firestore.rules` に差分なし。権限モデルは変更していない |
| **Storage Rules** | `storage.rules` に差分なし |
| **Firestore Indexes** | `firestore.indexes.json` に差分なし（空のまま）。新しいクエリも追加していない |
| **Firebase Hosting** | **設定が存在しない**（第10.4章） |
| **Firestore データ移行** | 実施しない。アプリ側の互換処理（`lib/compat/legacyPage2.ts`）で対応済み |
| **Storage データ操作** | 不要。保存パス（`tenants/{tenantId}/recipients/{id}/pageN.jpg`）は変更していない |

---

## 12. デプロイ不要対象

第11.3章のとおりです。要点を再掲します。

- **`firebase deploy --only firestore:rules` は不要** — ルール未変更
- **`firebase deploy --only storage` は不要** — ルール未変更
- **`firebase deploy --only firestore:indexes` は不要** — インデックス未変更
- **`firebase deploy --only hosting` は実行不可** — Hosting未設定

不要なリソースを含めてデプロイすると、意図しない上書きのリスクが増えます。**`--only functions` に限定**してください。

---

## 13. デプロイ前に残っている問題

### 13.1 デプロイをブロックする問題

**ありません。**

### 13.2 ユーザーの判断が必要な事項（ブロッカーではない）

| # | 事項 | 内容 | 推奨 |
|---|---|---|---|
| **J-1** | **`cors.json` の未コミット変更** | 前回作業の対象外。Vercelオリジンと `Content-Length` / `Content-Range` / `Accept-Ranges` ヘッダを追加する内容。**`firebase deploy` では適用されません**（`gsutil cors set` 等のGCP操作）。バケットへ適用済みかは未確認 | 今回のデプロイとは切り離して、別途判断してください。停止条件（Firebase/GCP設定変更）に該当するため、こちらでは適用していません |
| **J-2** | **変更のコミット** | 土台修正はまだ未コミット。Vercelがgit連携デプロイの場合、**コミット＆pushしないとフロントエンドに反映されません** | Vercelの配信方式（git連携 or CLI）に応じて判断してください |
| **J-3** | **Git履歴の個人情報** | `f043c105` に実データが残存（第2.5章）。作業ツリー・報告書には存在しない | デプロイとは独立。履歴書き換えの要否を判断してください |

### 13.3 デプロイ後に残る既知の制約（前回報告書より）

| # | 内容 | 影響 |
|---|---|---|
| R-3 | 既存の保存済みデータで、ページ2「支給決定期間①」に認定有効期間の値が入っている可能性 | 自動修正されない。編集画面での手修正か再取込が必要 |
| R-10 | Firestore一括migrationは未実施 | 一度も編集されない受給者は旧構造のまま。アプリ側の互換処理で表示は正常 |
| R-9 | `functions` 独自lintが実行不可 | デプロイに影響なし（predeployは `tsc`） |
| R-16 | IndexedDBが使えない環境では撮影往復で画像が失われる | 従来どおりの挙動に戻るだけ。エラーにはならない |

---

## 14. 推奨デプロイコマンド

### 14.1 Firebase側（ユーザーが実行）

```bash
firebase deploy --only functions --project paperlesscare
```

**このコマンド1つで完結します。**

| 要素 | 理由 |
|---|---|
| `--only functions` | Rules / Indexes は未変更のため対象外にする。Hostingは設定自体が存在しない |
| `--project paperlesscare` | `.firebaserc` の default と同じだが、誤ったプロジェクトへの適用を防ぐため明示 |

**実行時の挙動**

1. predeploy フックが `npm --prefix functions run build` を自動実行（本レポートで検証済み・成功）
2. `functions/lib/` が再生成される（PIIログを含まないコード）
3. `ocrFromImageData`（Gen2 / `asia-northeast1`）が更新される

**所要時間の目安**: 1〜3分程度。デプロイ中も旧リビジョンが応答するため、ダウンタイムは基本的に発生しません。

### 14.2 フロントエンド側（Firebaseの範囲外）

フロントエンドは Vercel に配信されています（第10.4章）。**Firebase CLI では反映されません。**

配信方式に応じて、いずれかを実施してください。

**(a) Vercelのgit連携を使っている場合**

```bash
git add -A
git commit -m "18歳未満受給者証対応の土台修正（PIIログ除去/データモデル是正/certType分岐/画像保持）"
git push origin main
```

`main` へのpushでVercelが自動ビルド・デプロイします。

**(b) Vercel CLI を使っている場合**

```bash
vercel --prod
```

> どちらの方式かはリポジトリからは判別できません（`.vercel` はgitignore対象で、ローカルにも存在しません）。普段の運用に合わせてください。

### 14.3 推奨する実行順序

```
1. firebase deploy --only functions --project paperlesscare   ← 先にこちら
2. フロントエンド（Vercel）の反映
```

理由は第11.2章のとおりです。**Functions を先にデプロイすることで、PIIログの出力を最短で停止できます。**

### 14.4 実行してはいけないコマンド（参考・今回は不要）

```bash
firebase deploy                            # 全リソース。未変更のRulesまで上書きするため使わない
firebase deploy --only hosting             # Hosting未設定のためエラーになる
firebase deploy --only firestore           # Rules/Indexesは未変更のため不要
firebase deploy --only storage             # Rules未変更のため不要
gsutil cors set cors.json gs://<bucket>    # cors.jsonの適用。今回の対象外（第13.2章 J-1）
```

---

## 15. デプロイ後確認チェックリスト

### 15.1 adult版（最重要 — 回帰確認）

> **ステージング環境またはテスト用テナントでの実施を推奨します。** 本番データで実施する場合は、確認後に登録したテスト受給者を削除できない点にご注意ください（削除機能は未実装）。

| # | 手順 | 期待する結果 |
|---|---|---|
| 1 | ログイン | `/t/{tenantId}` へ遷移する |
| 2 | 「新規受給者を登録」→ 種別で **「障害福祉サービス受給者証（18歳以上）」** を選択 | 紫色のカードが選択状態になる |
| 3 | ページ1の画像を取り込み → 「取込開始」 | OCRが完了し、氏名・生年月日・受給者証番号等が表示される |
| 4 | **ページ2**の画像を取り込み → 「取込開始」 | **「サービス種別」「支給決定期間」「支給量等」に値が入る** |
| 5 | **ページ2の「支給決定期間」を確認** | **認定有効期間ではなく、支給決定期間の値**が入っている（今回の修正点） |
| 6 | 任意のセルの ✎ で手修正 → 「保存」 | 値が反映される |
| 7 | 「確定して保存」 | `✅ 保存しました（ID: ...）` が表示される |
| 8 | 「受給者管理」画面へ | 一覧に表示され、氏名・受給者番号・生年月日・証種別・最終更新日が出る |
| 9 | 行をクリックして編集画面を開く | 受給者情報が表示される |
| 10 | 保存済み画像が表示されること | 「取り込み画像」に画像が表示される（「画像が保存されていません」にならない） |
| 11 | ページ2を開く | サービス種別①・支給決定期間①・支給量等①が保存した値で表示される |
| 12 | 値を編集して「保存する」→ 再度開く | 値が保持されている |

### 15.2 旧データ互換（重要）

| # | 手順 | 期待する結果 |
|---|---|---|
| 13 | **今回の修正前に登録済みの受給者**の編集画面を開く | エラーにならず表示される |
| 14 | ページ2を開く | **サービス種別①・支給決定期間①・支給量等①が空欄になっていない**（旧フィールドから移送されて表示される） |
| 15 | そのまま「保存する」→ 再度開く | 値が保持されている（新構造へ移行済み） |

### 15.3 ページ7・8の分離

| # | 手順 | 期待する結果 |
|---|---|---|
| 16 | 編集画面でページ7のセルの ✎ を押し、入力欄を開いたまま**保存せずに**ページ8へ切り替える | 入力欄が閉じており、ページ7の下書きが残っていない |
| 17 | ページ8のセルを編集して保存 → ページ7に戻る | ページ7の値が変わっていない |

### 15.4 スマホ（撮影往復での画像保持 — 今回の重点修正）

| # | 手順 | 期待する結果 |
|---|---|---|
| 18 | スマホでログイン →「新規受給者を登録」→ adult を選択 | — |
| 19 | ページ1を選択 → カメラ起動 → 撮影 →「この写真でOK」 | ページ1のサムネイルが表示され、進捗が `1/8` |
| 20 | ページ2へ移動 → 撮影 →「この写真でOK」 | **進捗が `2/8`** になる |
| 21 | **ページ1のタブを確認** | **「済」バッジとサムネイルが残っている**（← 修正前は消えていた） |
| 22 | ページ3も撮影 | 進捗が `3/8`、ページ1・2の「済」も残っている |
| 23 | 「確定して保存」 | 保存成功 |
| 24 | 編集画面を開き、ページ1・2・3を切り替える | **3ページとも画像がStorageから表示される**（← 修正前はページ3のみだった） |
| 25 | 「この受給者の取り込み画像は保存されていません」の警告が**出ない**こと | 警告なし |

### 15.5 child が無効であること

| # | 手順 | 期待する結果 |
|---|---|---|
| 26 | 種別選択画面を確認 | 「障害福祉サービス受給者証（18歳未満）」に**「今後実装予定」バッジ**が付き、**押せない**（グレーアウト） |

### 15.6 Cloud Logging（個人情報の非出力確認 — 必須）

デプロイ後に1回OCRを実行してから、Google Cloud Console → Logging → ログエクスプローラで確認してください。

**クエリ例**

```
resource.type="cloud_run_revision"
resource.labels.service_name="ocrfromimagedata"
```

| # | 確認内容 | 期待する結果 |
|---|---|---|
| 27 | `ocrFromImageData completed` のログを開く | `pageNo` / `certType` / `textLength` **のみ**。`text` フィールドが存在しない |
| 28 | ログ本文に**氏名**が含まれていないこと | 含まれない |
| 29 | ログ本文に**住所**が含まれていないこと | 含まれない |
| 30 | ログ本文に**受給者証番号**が含まれていないこと | 含まれない |
| 31 | ログ本文に**生年月日**が含まれていないこと | 含まれない |
| 32 | 検索窓に `ocrFromImageData raw text` を入力 | **デプロイ以降のログには出現しない**（デプロイ前のログには残っています） |

> **注意**: デプロイ**以前**に出力されたログは Cloud Logging の保持期間中そのまま残ります。過去ログの削除が必要かどうかは、別途ご判断ください（ログバケットの保持期間設定またはログの削除操作が必要で、本レポートの対象外です）。

### 15.7 ブラウザコンソール

| # | 確認内容 | 期待する結果 |
|---|---|---|
| 33 | OCR実行時のコンソール出力 | `[OCR] completed {pageNo, certType, textLength, filledFieldCount}` のみ |
| 34 | `OCR RAW TEXT` / `PARSED CERT DATA` が出ないこと | 出力されない |

---

## 16. child実装へ進むための条件

前回報告の判定（**READY WITH CONDITIONS**）は変わっていません。コード側の土台は整っており、残るのは**素材・情報の準備**です。

| # | 条件 | 状態 | 備考 |
|---|---|---|---|
| **C-1** | 18歳未満の**実物様式の確認** | **未充足** | `public/cert-samples/child/page-8.png` が page-1 の複製（MD5一致）で、8ページ目の正しい様式が不明。自治体差の有無も要確認 |
| **C-2** | 18歳未満の**実機OCRサンプル収集**（各ページ2〜3枚） | **未充足** | **今回のFunctionsデプロイ後に実施してください。** デプロイ前に収集すると、OCR全文がCloud Loggingに記録されます |

### 16.1 今回のデプロイで満たされる前提

| 前提 | デプロイ後の状態 |
|---|---|
| 個人情報がログに残らない | **満たされる**（Functionsデプロイで有効化） |
| データモデルが正しい | 満たされる（フロントエンド反映で有効化） |
| 既存データが壊れない | 満たされる |
| `certType` で帳票・パーサを差し替えられる | 満たされる |
| adult が壊れていない | 満たされる（デプロイ後チェックリストで最終確認） |

### 16.2 child 有効化の手順

前回報告書 第20.4章に6ステップで記載済みです。様式が adult と同一であれば、実質的な作業は**パーサ実装のみ**になります。

---

## 17. 総括

### 17.1 判定

# DEPLOY READY

### 17.2 判断根拠

| 観点 | 状態 |
|---|---|
| 型チェック | ルート・Functions ともエラー0 |
| ビルド | Next.js クリーンビルド成功、Functions ビルド成功 |
| テスト | 22 / 22 PASS（fail 0） |
| Lint | 新規エラー0件。残る8件はすべて今回触っていないファイルの既存指摘 |
| 個人情報 | ソース・ビルド成果物・本番バンドルすべてでOCR本文の出力なしを**実測で確認** |
| 秘密情報 | Git管理対象への混入なし |
| 破壊的変更 | Rules / Indexes / Storageパス / Firestoreスキーマの破壊的変更なし |
| 後方互換 | Callable のペイロード、Firestoreの旧データ、いずれも互換維持 |
| child | `enabled: false` を維持。本番で選択できない |

**デプロイを止めるべき理由は見つかりませんでした。**

残っている ESLint の8 error / 11 warning は、いずれも**今回の変更以前から存在するもの**で、機能に影響しません（`no-explicit-any` と `set-state-in-effect`、および `<img>` 要素の推奨事項）。指示のとおり、軽微な既存 warning を理由に NOT READY とはしていません。

### 17.3 今回の検証で判明した重要事項

**1. `functions/lib/` に旧PIIログが実在していました**

前回報告の「可能性がある」という指摘は事実でした。`functions/lib/index.js:81-83` に `logger.info("ocrFromImageData raw text", { text })` が残っていました。今回のビルドで解消し、コンパイル済みJavaScriptを直接検索して不在を確認しています。なお `firebase deploy` の predeploy フックが再ビルドするため、デプロイ時点でも同じ結果になります。

**2. Firebase Hosting は設定されていません**

ご指示には「Firebase Hosting / Cloud Functions の可能性」とありましたが、`firebase.json` に `hosting` セクションは存在せず、**Git履歴を遡っても一度も存在したことがありません**。フロントエンドは Vercel に配信されています（`cors.json` のオリジン、`.gitignore` の `.vercel` が根拠）。

したがって **`firebase deploy --only hosting` は実行できません**。フロントエンドの反映は Vercel 側の操作（git push または `vercel --prod`）になります。これを見落とすと「Functionsだけデプロイして、フロントエンドの修正が反映されない」状態になるため、第14章に分けて記載しました。

**3. `cors.json` に前回作業とは無関係の未コミット変更があります**

作業開始時点から存在していたもので、こちらでは触れていません。`firebase deploy` の対象外（`gsutil cors set` 等のGCP操作）のため、今回のデプロイ手順からは切り離しています。

**4. catch内の分割代入に軽微な脆さがありました**

`const { code, message } = err as {...}` は `err` が `null` の場合に catch 内で例外になり、**エラーログが残らないまま関数が落ちる**可能性がありました。`(err ?? {})` に変更して防御しています。挙動は変わりません。

### 17.4 実行していただくこと

**Firebase（1コマンド）**

```bash
firebase deploy --only functions --project paperlesscare
```

**フロントエンド（Vercel）** — git連携なら:

```bash
git add -A
git commit -m "18歳未満受給者証対応の土台修正（PIIログ除去/データモデル是正/certType分岐/画像保持）"
git push origin main
```

**順序**: Functions を先に。PIIログの停止を最優先するためです。

### 17.5 デプロイ後にお願いしたいこと

第15章のチェックリストのうち、**特に以下3点**を優先してご確認ください。コードだけでは保証しきれない部分です。

1. **旧データ互換**（15.2 / 手順13-15）— 修正前に登録された受給者のページ2が空欄にならないこと
2. **スマホ撮影の画像保持**（15.4 / 手順18-25）— 複数ページ撮影後、すべての画像が保存されること
3. **Cloud Loggingの個人情報**（15.6 / 手順27-32）— OCR本文が記録されていないこと

3が確認できた時点で、**18歳未満の実機OCRサンプル収集（C-2）に着手できます。**
