# PaperlessCare 現状実装調査

> 対象リポジトリ: `/Users/rkita/Desktop/React/PaperlessCare/paperlesscare-web`
> 調査日: 2026-09-05
> 調査時点のコミット: `0781b391 OCRをStorage依存から直接画像送信方式へ変更`（ブランチ `main`）
> 本調査ではコードを一切変更していません。実施したのは読み取り・`tsc --noEmit`・`eslint`・`next build`・パーサ単体テストの実行のみです。

---

## 1. 調査概要

### 1.1 調査の目的

「障害福祉サービス受給者証（18歳未満）」（黄緑色の受給者証）を実運用可能な状態まで完成させるにあたり、着手前に現状の実装範囲・未実装範囲・技術的負債を正確に把握すること。

### 1.2 調査範囲

| 範囲 | 内容 |
|---|---|
| フロントエンド | `src/` 配下 全38ファイル（TS/TSX/CSS 合計 約4,786行）を全文読了 |
| バックエンド | `functions/src/index.ts` 全文読了 |
| セキュリティルール | `firestore.rules` / `storage.rules` 全文読了 |
| 設定 | `package.json` / `tsconfig.json` / `next.config.ts` / `firebase.json` / `.firebaserc` / `firestore.indexes.json` / `.env.local`（キー名のみ） |
| 静的アセット | `public/cert-samples/{adult,child,mobility}/page-1..8.png` 24点（内容・寸法・ハッシュを確認） |
| 旧スナップショット | `src_20260514_1/` / `src_20260519_1/` のファイル構成を確認 |
| 実行検証 | `npx tsc --noEmit`（エラー0） / `npm run lint`（error 30・warning 42） / `npx next build`（成功） / パーサ単体テスト（3件 全pass） |

### 1.3 結論サマリ

**「障害福祉サービス受給者証（18歳未満）」は、UI上の選択肢としてのみ存在し、機能としては未実装です。**

- 受給者証種別の定義に `child`（18歳未満）は存在するが `enabled: false` / `statusLabel: "今後実装予定"` でボタンが押せない
  → `src/app/t/[tenantId]/constants/certPages.ts:24-32`
- OCR結果を項目に振り分けるパーサは `adult`（18歳以上）専用の分岐しか存在せず、`child` 用パーサは1本もない
  → `src/app/t/[tenantId]/lib/parsers/parseCertText.ts:57-71`、`src/app/t/[tenantId]/lib/parsers/adult/` のみ存在
- 帳票レイアウトは受給者証種別ではなくページ番号だけで切り替えており、種別ごとの分岐が存在しない
  → `src/app/t/[tenantId]/components/certLayouts.tsx:690-761`

一方で、18歳未満用のサンプル画像（`public/cert-samples/child/page-1..8.png`）は8ページ分揃っており、**その帳票構造は現在実装済みの adult 用レイアウト（LayoutType1〜7）とほぼ一致**しています（色違い）。したがって「レイアウトをゼロから作り直す」必要は薄く、**主戦場は「種別の有効化」「child 用パーサ」「保存データへの種別反映」「バリデーション」** になります。

---

## 2. システム全体構成

### 2.1 技術スタック

| 層 | 採用技術 | 補足 |
|---|---|---|
| フロントエンド | Next.js 16.1.1（App Router / Turbopack） | `package.json:14` |
| UI | React 19.2.3 / TypeScript 5 / Tailwind CSS v4 | `package.json:12-24` |
| スタイル | Tailwind + CSS Modules（1ファイルのみ）+ コンポーネント内 `<style>` タグ | `beneficiaries/page.module.css`、`AppShell.tsx:87`、`SideNav.tsx:56` |
| 認証 | Firebase Authentication（メール/パスワードのみ） | `src/lib/auth.ts`、`src/app/login/LoginClient.tsx` |
| DB | Cloud Firestore（`(default)` / location `nam5`） | `firebase.json:19-24` |
| ストレージ | Firebase Storage | `src/lib/firebase.ts:19` |
| サーバー処理 | Cloud Functions Gen2（`asia-northeast1`）Callable × 1本 | `functions/src/index.ts:30` |
| OCR | Google Cloud Vision API（`documentTextDetection`） | `functions/src/index.ts:51-53` |
| テスト | `node:test`（パーサ1本のみ・npm script 未登録） | `src/app/t/[tenantId]/lib/parsers/adult/page1.test.ts` |

**採用していないもの**: Supabase、REST/GraphQL の独自API、状態管理ライブラリ（Redux/Zustand等）、フォームライブラリ（react-hook-form/zod等）、PDF生成ライブラリ、UIコンポーネントライブラリ。

### 2.2 ディレクトリ構成

```
paperlesscare-web/
├── src/
│   ├── lib/
│   │   ├── firebase.ts               … Firebase SDK 初期化（app/auth/storage/functions/db）
│   │   └── auth.ts                   … useRequireAuth（匿名ユーザーは未ログイン扱い）
│   └── app/
│       ├── layout.tsx                … RootLayout
│       ├── page.tsx                  … / → /login へリダイレクトのみ
│       ├── login|signup|logout/      … 認証画面（各 page.tsx + *Client.tsx）
│       ├── components/
│       │   ├── AppShell.tsx          … ヘッダ＋サイドナビ＋本文の共通シェル
│       │   ├── SideNav.tsx           … メニュー3項目＋ログアウト
│       │   └── UnhandledRejectionGuard.tsx … ★未使用（layout.tsx でコメントアウト）
│       └── t/[tenantId]/
│           ├── layout.tsx            … AppShell 適用
│           ├── page.tsx              … 【中核】受給者証取込＆送信（801行）
│           ├── capture/page.tsx      … スマホカメラ撮影＋枠内トリミング
│           ├── beneficiaries/
│           │   ├── page.tsx          … 受給者一覧
│           │   ├── page.module.css   … 一覧・検索・★未使用モーダル用CSS
│           │   └── [beneficiaryId]/
│           │       ├── page.tsx      … 受給者編集
│           │       ├── EditPageSwitcher.tsx
│           │       └── CertImageViewer.tsx
│           ├── settings/page.tsx     … ★「現在このページは作成中です。」のみ
│           ├── components/           … PageTabs / certLayouts / RecipientImportModeSelect
│           ├── constants/certPages.ts… 種別定義・ページ定義・空フォーム
│           ├── types/cert.ts         … FormDataType / CertPage
│           └── lib/
│               ├── firestore/beneficiaries.ts … CRUD（Dは無し）
│               ├── storage/useCertPageImage.ts
│               ├── image/compressImage.ts
│               └── parsers/          … normalizeText / parseCertText / adult/page1-4
├── functions/src/index.ts            … ocrFromImageData（Callable）
├── firestore.rules / storage.rules / firestore.indexes.json
├── public/cert-samples/{adult,child,mobility}/page-1..8.png
├── src_20260514_1/  ★旧スナップショット（コミット済み・ビルド対象外だがlint/tsc対象）
└── src_20260519_1/  ★旧スナップショット（同上）
```

### 2.3 ルーティング一覧（`next build` 実測）

| Route | 種別 | 画面 |
|---|---|---|
| `/` | Static | `/login` へリダイレクトのみ |
| `/login` | Static | ログイン |
| `/signup` | Static | サインアップ |
| `/logout` | Static | サインアウト |
| `/t/[tenantId]` | Dynamic | 受給者証取込＆送信（中核画面） |
| `/t/[tenantId]/beneficiaries` | Dynamic | 受給者一覧 |
| `/t/[tenantId]/beneficiaries/[beneficiaryId]` | Dynamic | 受給者編集 |
| `/t/[tenantId]/capture` | Dynamic | カメラ撮影 |
| `/t/[tenantId]/settings` | Dynamic | システム設定（スタブ） |

### 2.4 データフロー

```
[画像選択 / スマホ撮影]
      ↓ compressImageToJpeg（長辺1800px / q=0.85）※撮影経由は capture 側で圧縮済み
[ブラウザ内 File を保持]      ← ここでは Storage へ一切アップロードしない
      ↓ Base64化
[Callable: ocrFromImageData]  ← 認証チェックのみ。Firestore/Storage には触れない
      ↓ Vision API documentTextDetection
[生テキスト]
      ↓ normalizeText → parseCertText(pageIndex, certType)
[FormDataType]  ← 画面上で ✎ ボタンから手修正可能
      ↓ 「確定して保存」
[Storage: tenants/{tenantId}/recipients/{beneficiaryId}/page{N}.jpg] を先にアップロード
      ↓
[Firestore: tenants/{tenantId}/beneficiaries/{beneficiaryId}] へ setDoc
```

設計上の良い点として、受給者ドキュメントIDを取込開始時にクライアント側で事前採番（`reserveBeneficiaryId`, `beneficiaries.ts:53-55`）し、同一IDへの `setDoc` で冪等に再試行できるようにしています。保存失敗時はアップロード済み画像を `deleteObject` でロールバックします（`page.tsx:481-485`）。

### 2.5 認証・認可

- **認証方式**: Firebase Auth のメール/パスワードのみ。匿名ユーザーは `useRequireAuth` で未ログイン扱いに統一（`src/lib/auth.ts:16`）。
- **テナント判定**: `users/{uid}.tenantId` を参照。ログイン成功時に Firestore REST API を直叩きして `tenantId` を取得し `/t/{tenantId}` へ遷移（`LoginClient.tsx:42-59`）。
- **Firestore Rules**: `tenants/{tenantId}/beneficiaries/{id}` は `get(users/{uid}).data.tenantId == tenantId` の場合のみ read/write 可。それ以外は全拒否（`firestore.rules:14-24`）。
- **Storage Rules**: 同じテナント所属チェックを Storage 側でも再現。旧パス `uploads/{uid}/` は読み取りのみ許可（`storage.rules`）。
- **画像取得**: `getDownloadURL()`（恒久トークン付きURL）を使わず `getBytes()` を採用し、都度 Rules 評価される設計（`useCertPageImage.ts:21-25`）。**セキュリティ設計として適切**。

---

## 3. PaperlessCare機能一覧

| # | 機能 | 状態 | 根拠・備考 |
|---|---|---|---|
| 1 | メール/パスワードログイン | **実装済み** | `LoginClient.tsx` |
| 2 | サインアップ | **一部実装** | Auth ユーザーは作れるが `users/{uid}` が作られず、どのテナントにも入れない（`SignupClient.tsx:23`、`firestore.rules:11` が `allow write: if false`） |
| 3 | ログアウト | **実装済み** | `LogoutClient.tsx` |
| 4 | テナント振り分け | **一部実装** | 読み取りのみ。ユーザー↔テナント紐付けは Firestore コンソールでの手作業前提 |
| 5 | 共通シェル（ヘッダ/サイドナビ/モバイルドロワー） | **実装済み** | `AppShell.tsx` / `SideNav.tsx` |
| 6 | 受給者証種別の選択 | **一部実装** | 3種定義のうち `adult` のみ `enabled: true`（`certPages.ts:5-33`） |
| 7 | 取込モード選択（新規／既存更新） | **一部実装** | 「既存受給者を更新」は `alert("既存受給者検索は次のステップで追加します")` のみ（`page.tsx:536`） |
| 8 | 8ページのタブ切替・進捗表示 | **実装済み** | `PageTabs.tsx` |
| 9 | PC: ファイル選択／クリップボード貼り付け | **実装済み** | `page.tsx:302-370` |
| 10 | スマホ: カメラ撮影＋ガイド枠トリミング | **実装済み** | `capture/page.tsx` |
| 11 | 画像圧縮（EXIF回転考慮） | **実装済み** | `compressImage.ts` |
| 12 | OCR（Vision API Callable） | **実装済み** | `functions/src/index.ts` |
| 13 | OCRテキスト正規化 | **実装済み** | `normalizeText.ts`（元号・記号のOCR誤認識補正あり） |
| 14 | 項目自動抽出（パース） | **一部実装** | `adult` の1〜4ページのみ。5〜8ページ・`child`・`mobility` は `parseFallback` 任せ（`parseCertText.ts:57-73`） |
| 15 | 受給者証レイアウト表示（7種） | **実装済み** | `certLayouts.tsx`。ただし**種別非依存**（ページ番号のみで分岐） |
| 16 | 項目のインライン手修正 | **実装済み** | `EditableCertCell`（`certLayouts.tsx:18-84`） |
| 17 | 取込中セッションの復元 | **一部実装** | `formData`/`ocrText` は復元されるが **画像（File）は復元されない**（後述 9.1） |
| 18 | 受給者データの新規保存 | **実装済み** | `saveBeneficiary`（`beneficiaries.ts:93-122`） |
| 19 | 受給者一覧表示 | **実装済み** | `beneficiaries/page.tsx` |
| 20 | 受給者検索 | **未実装** | 検索フォームは描画されるが state もハンドラも無い（`beneficiaries/page.tsx:80-122`） |
| 21 | 受給者の新規登録ボタン（一覧画面） | **未実装** | `onClick` 無しの飾りボタン（`beneficiaries/page.tsx:75-77`） |
| 22 | 受給者編集・更新 | **実装済み** | `[beneficiaryId]/page.tsx` + `updateBeneficiary` |
| 23 | 受給者削除 | **未実装** | `deleteDoc` の呼び出しがコードベースに1件も存在しない |
| 24 | 保存済み画像の閲覧 | **実装済み** | `CertImageViewer` + `useCertPageImage` |
| 25 | 画像の差し替え（編集画面） | **未実装** | 編集画面に画像アップロードUIが無い |
| 26 | 入力バリデーション | **未実装** | `validate` / `required` 相当の実装が0件 |
| 27 | PDF出力・印刷 | **未実装** | `pdf`/`print`/`帳票`/`印刷` の該当コード0件 |
| 28 | システム設定画面 | **未実装** | 「現在このページは作成中です。」のみ（`settings/page.tsx`） |
| 29 | 権限・ロール管理 | **未実装** | ロールの概念自体が無い（テナント所属の有無のみ） |
| 30 | 監査ログ | **一部実装** | `createdBy`/`updatedBy`/`createdAt`/`updatedAt` は保持するが履歴は残らない |
| 31 | **障害福祉サービス受給者証（18歳未満）** | **未実装** | 本書 第4章 |
| 32 | 移動支援・地域活動支援 受給者証 | **未実装** | `enabled: false`。サンプル画像も4枚を2周させた仮素材（後述 9.13） |

---

## 4. 障害福祉サービス受給者証（18歳未満）の現状

### 4.1 一言でいうと

**「種別の箱」と「サンプル画像」だけが用意されており、選択も取込も保存もできません。**

### 4.2 関連実装の全数（キーワード横断調査の結果）

`child` / `児童` / `18歳` / `未満` / `beneficiary` / `recipient` / `certificate` / `welfare` / `disability` / `support` を横断検索し、コードの接続関係まで追跡した結果、18歳未満に「専用で」関係する実装は以下がすべてです。

| # | 箇所 | 内容 | 状態 |
|---|---|---|---|
| 1 | `constants/certPages.ts:24-32` | `CERT_TYPES` の `child` エントリ（label「障害福祉サービス受給者証（18歳未満）」/ `themeClass: "cert-type-green"` / `enabled: false` / `statusLabel: "今後実装予定"`） | 定義のみ |
| 2 | `constants/certPages.ts:35` | `CertTypeId` に `"child"` が含まれる（union 型として存在） | 定義のみ |
| 3 | `components/PageTabs.tsx:6` | `selectedCertType: "mobility" \| "adult" \| "child"`（`CertTypeId` を再定義した**重複型**） | 定義のみ |
| 4 | `components/PageTabs.tsx:39` | サムネイル画像パス `/cert-samples/${selectedCertType}/page-${index+1}.png` | 種別に応じて切替される（**唯一 child が効く箇所**） |
| 5 | `globals.css:103-106` | `.cert-type-green`（背景 `#ecfdf5` / 枠 `#6ee7b7`） | スタイルのみ |
| 6 | `public/cert-samples/child/page-1..8.png` | 黄緑色の受給者証サンプル8枚 | 素材のみ |
| 7 | `page.tsx:551-586` | 種別選択ボタン。`disabled={!type.enabled}` により **child は押下不可** | ブロック中 |

### 4.3 「児童」フィールドとの混同に注意

`FormDataType` には `childFurigana` / `childName` / `childBirthday` が存在します（`types/cert.ts:7-9`）。ただしこれは **「18歳未満の受給者証」用ではなく、受給者証（Ⅰ）（Ⅱ）内の「児童」欄**を指します。18歳以上（adult）のサンプル画像にも同じ「児童」欄が存在し、`parseAdultPage1` はそこを抽出しています（`adult/page1.ts:75-94`）。

つまり `child*` フィールド ≠ `certType: "child"` です。**この命名の重複は、今後の実装で混乱の原因になります。**

さらに `parseAdultPage2` では `childName` を「支給量等」の格納先として流用しており（`adult/page2.ts:29`）、フィールド名と意味が完全に乖離しています（後述 9.3）。

### 4.4 18歳未満の帳票構造は adult とほぼ同一

`public/cert-samples/child/` の画像を実際に確認した結果:

| ページ | child サンプルの内容 | 対応する既存レイアウト | 一致度 |
|---|---|---|---|
| 1 | 障害福祉サービス受給者証（Ⅰ）／受給者証番号・支給決定障害者等（居住地・フリガナ・氏名・生年月日）・児童（フリガナ・氏名・生年月日）・障害種別・交付年月日・支給市町村名及び印 | `LayoutType1` | ほぼ一致 |
| 2 | 介護給付費の支給決定内容／障害支援区分・認定有効期間・サービス種別×3組・予備欄 | `LayoutType2` | ほぼ一致 |
| 3 | 介護給付費の支給決定内容② | `LayoutType3` | 一致（要目視再確認） |
| 4 | 訓練等給付費の支給決定内容／サービス種別×3組・予備欄・問い合わせ先 | `LayoutType4` | 一致 |
| 5 | 障害福祉サービス受給者証（Ⅱ）／ページ1と同一構成 | `LayoutType5` | ほぼ一致（`issuerAddress` 欄の有無のみ差） |
| 6 | 計画相談支援給付費の支給内容＋特定障害者特別給付費の支給内容・予備欄・**問い合わせ先** | `LayoutType6` | **問い合わせ先が実装に無い** |
| 7 | 利用者負担に関する事項／負担上限月額・適用期間・変更前×2・無名の空行・上限額管理対象者該当の有無・上限額管理事業所名・開始年月日・特記事項欄・問い合わせ先 | `LayoutType7` | **実装側に「食事提供体制加算」行があるが、サンプルには無い** |
| 8 | **サンプル画像がページ1と同一（＝仮素材）** | `LayoutType7`（7と同じものを再利用） | **要素材差し替え** |

**重要な示唆**: adult / child のサンプル画像は「色が違うだけでレイアウトは同一」でした。したがって 18歳未満対応の主要工数は **レイアウト新規作成ではなく、種別の有効化・パーサ整備・データモデル整理** に集中します。

ただし、これはリポジトリ内のサンプル素材から読み取った事実であり、**自治体によって様式が異なる可能性は排除できません**（第11章で仕様確認事項として整理）。

---

## 5. 画面別実装状況

18歳未満に関係する（＝有効化された際に通る）画面すべてを個別に評価します。

### 5.1 受給者証取込＆送信（中核画面）

| 項目 | 内容 |
|---|---|
| 画面名 | 受給者証取込＆送信 |
| Route | `/t/[tenantId]`（`?page=N` で初期ページ指定可） |
| 実装ファイル | `src/app/t/[tenantId]/page.tsx`（801行） |
| 使用コンポーネント | `RecipientImportModeSelect` / `PageTabs` / `CertLayoutRenderer` / （内部）`EditableCertCell` |
| 表示できる項目 | 種別3択、取込進捗（n/8）、8ページのサムネイルタブ、画像プレビュー、受給者証レイアウト上の全項目 |
| 新規登録 | **可**（「確定して保存」→ `saveBeneficiary`）`page.tsx:417-487` |
| 編集 | 取込中のフォームは ✎ ボタンで手修正可。既存レコードの編集はこの画面では不可 |
| 削除 | **不可**（機能なし） |
| 保存 | **可**。Storage へ画像アップロード → Firestore へ `setDoc` |
| 再表示 | **限定的**。`sessionStorage` から `formData`/`ocrText`/`storagePath` は復元されるが、**画像（File）とプレビューは復元されない**（`page.tsx:150-166`） |
| DB永続化 | **される**（`tenants/{tenantId}/beneficiaries/{id}`） |
| 入力チェック | **無し** |
| 必須項目チェック | **無し**（唯一のガードは「1ページ以上取り込んでいるか」`page.tsx:421-424`） |
| 日付形式チェック | **無し**。和暦文字列をそのまま保存 |
| エラー表示 | あり（`status` / `saveMessage` に `❌ code message` 形式で表示）`page.tsx:52-57` |
| 読み取り専用項目 | 無し（全項目が編集可） |
| PDF出力 | **無し** |
| 印刷 | **無し** |
| 18歳未満での可否 | **不可**。種別ボタンが `disabled`（`page.tsx:556`, `certPages.ts:30`） |
| その他不足 | 「既存受給者を更新」が `alert` のみ（`page.tsx:536`）／保存後に一覧へ自動遷移しない／ページ単位の保存が無く常に8ページ一括／`console.log` が残存（`page.tsx:384,392`） |

### 5.2 スマホ撮影

| 項目 | 内容 |
|---|---|
| 画面名 | 受給者証を枠に合わせて撮影 |
| Route | `/t/[tenantId]/capture?next=...` |
| 実装ファイル | `src/app/t/[tenantId]/capture/page.tsx`（293行） |
| 使用コンポーネント | なし（単一ファイル） |
| 機能 | `getUserMedia` で背面カメラ起動 → A4比率(210:297)ガイド枠 → 枠内トリミング → 高さ1400pxへリサイズ → JPEG q=0.88 → `sessionStorage` に dataURL 保存 → 呼び出し元へ戻る |
| エラー表示 | あり（カメラ権限エラー時のメッセージ）`capture/page.tsx:57-61` |
| DB永続化 | 直接は行わない（呼び出し元に委譲） |
| 18歳未満での可否 | 種別非依存のため、種別が有効化されればそのまま動作 |
| その他不足 | `sessionStorage` に dataURL を格納するため、大きい画像で容量上限に当たる可能性（try/catch 無し `capture/page.tsx:172`）／連続撮影（複数ページ連続取込）に非対応 |

### 5.3 受給者一覧

| 項目 | 内容 |
|---|---|
| 画面名 | 受給者管理 |
| Route | `/t/[tenantId]/beneficiaries` |
| 実装ファイル | `src/app/t/[tenantId]/beneficiaries/page.tsx`（174行）+ `page.module.css`（307行） |
| 使用コンポーネント | なし（CSS Modules のみ） |
| 表示できる項目 | 受給者名 / 受給者番号 / 生年月日 / 証種別 / 最終更新日 |
| 新規登録 | **不可**。「＋ 受給者を新規登録」ボタンに `onClick` が無い（`beneficiaries/page.tsx:75-77`） |
| 編集 | 行クリックで編集画面へ遷移（`beneficiaries/page.tsx:150`） |
| 削除 | **不可** |
| 保存 | 該当なし（読み取り専用画面） |
| 再表示 | 可（マウント時に `listBeneficiaries`） |
| DB永続化 | 読み取りのみ |
| 検索 | **不可**。受給者名・受給者番号・自治体・利用状況の4フォームは描画されるだけで、`value`/`onChange`/`onClick` がいずれも無い（`beneficiaries/page.tsx:80-122`） |
| 入力チェック | 該当なし |
| エラー表示 | あり（`error` を赤字表示）`beneficiaries/page.tsx:130-132` |
| ページング | **無し**。`listBeneficiaries` は全件取得（`beneficiaries.ts:124-137`） |
| PDF/印刷 | **無し** |
| 18歳未満での可否 | 一覧表示自体は種別非依存で動作する見込み |
| その他不足 | 「証種別」列に `colorName`（例: 「紫色の受給者証」）を表示しており、種別名になっていない（`beneficiaries/page.tsx:10-12`）／自治体セレクトの選択肢が「名古屋市/春日井市/小牧市」でハードコード（`beneficiaries/page.tsx:98-100`）／利用状況（利用中/停止中）は DB に該当フィールドが存在しない |

### 5.4 受給者編集

| 項目 | 内容 |
|---|---|
| 画面名 | 受給者情報の編集 |
| Route | `/t/[tenantId]/beneficiaries/[beneficiaryId]` |
| 実装ファイル | `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/page.tsx`（272行） |
| 使用コンポーネント | `EditPageSwitcher` / `CertImageViewer` / `CertLayoutRenderer` |
| 表示できる項目 | 保存済み画像（ページ別）、受給者証レイアウト上の全項目、ヘッダに氏名・受給者番号 |
| 新規登録 | 不可（編集専用） |
| 編集 | **可**（`updateField` → `EditableCertCell`）`[beneficiaryId]/page.tsx:89-100` |
| 削除 | **不可** |
| 保存 | **可**（`updateBeneficiary` → 再取得して再描画）`[beneficiaryId]/page.tsx:110-137` |
| 再表示 | 可（保存後に `getBeneficiary` で再取得） |
| DB永続化 | **される**（`pages` / `summary` / `updatedBy` / `updatedAt` を更新） |
| 入力チェック | **無し** |
| 必須項目チェック | **無し** |
| 日付形式チェック | **無し** |
| エラー表示 | あり（読込エラー / 保存エラー） |
| 読み取り専用項目 | 無し |
| 離脱警告 | `handleCancel` 時のみ `window.confirm`（`[beneficiaryId]/page.tsx:102-108`）。ブラウザバック・タブ閉じは未ガード |
| 画像差し替え | **不可**（アップロードUIが無い） |
| PDF/印刷 | **無し** |
| 18歳未満での可否 | レイアウトが `pageIndex` のみで決まるため、`certType` を無視して adult レイアウトで描画される（`certLayouts.tsx:690-761`, `[beneficiaryId]/page.tsx:233-244`） |
| その他不足 | `certType` を画面上に表示していない／`certType` の変更不可／旧データ（8ページ未満）は `padPages` で補完される良い実装あり（`[beneficiaryId]/page.tsx:20-33`） |

### 5.5 システム設定

| 項目 | 内容 |
|---|---|
| Route | `/t/[tenantId]/settings` |
| 実装ファイル | `src/app/t/[tenantId]/settings/page.tsx`（9行） |
| 状態 | **完全なスタブ**。「現在このページは作成中です。」のみ。インラインstyleでハードコード |

### 5.6 ログイン / サインアップ / ログアウト

| 画面 | Route | 状態 | 備考 |
|---|---|---|---|
| ログイン | `/login` | 実装済み | Firestore REST API 直叩きで `tenantId` 解決（`LoginClient.tsx:42-59`）。`db` を import しているが未使用（`LoginClient.tsx:5`） |
| サインアップ | `/signup` | 一部実装 | Auth ユーザーのみ作成。`users/{uid}` が作られないため、作成直後のユーザーはどのテナントにも入れない |
| ログアウト | `/logout` | 実装済み | `signOut` → `next` へ遷移 |

---

## 6. データ構造

### 6.1 Firestore コレクション

| パス | 用途 | ドキュメント構造 | 型定義 |
|---|---|---|---|
| `users/{uid}` | ユーザー↔テナント紐付け | `{ tenantId: string }`（実際に参照されているのはこのフィールドのみ） | **型定義なし**。`LoginClient.tsx:57` で `data.fields?.tenantId?.stringValue` として文字列抽出 |
| `tenants/{tenantId}/beneficiaries/{beneficiaryId}` | 受給者証データ | 下表参照 | `BeneficiaryRecord`（`beneficiaries.ts:34-44`） |

`tenants/{tenantId}` ドキュメント自体（事業所マスタ）は**存在しません**。Rules でも読み取りが拒否されます（`firestore.rules:26-28`）。そのため画面上のテナント表示は `auth.currentUser.email` の代用になっています（`AppShell.tsx:30-32`）。

### 6.2 受給者ドキュメント構造

```ts
// src/app/t/[tenantId]/lib/firestore/beneficiaries.ts:34-44
type BeneficiaryRecord = {
  id: string;                  // ドキュメントID（クライアント事前採番）
  tenantId: string;            // ★ドキュメント本体にも冗長保持
  certType: CertTypeId;        // "mobility" | "adult" | "child"
  summary: BeneficiarySummary; // 一覧表示用の代表値
  pages: SavedCertPage[];      // 常に8件（保存時）
  createdBy: { uid: string; email: string | null };
  createdAt: Timestamp | null;
  updatedBy: { uid: string; email: string | null };
  updatedAt: Timestamp | null;
};

// beneficiaries.ts:26-32
type BeneficiarySummary = {
  name: string; furigana: string; number: string; birthday: string; cityName: string;
};

// beneficiaries.ts:18-24
type SavedCertPage = {
  pageNo: number;      // 1..8
  title: string;       // PAGE_TITLES[index]
  formData: FormDataType;
  ocrText: string;     // OCR生テキスト（そのまま保存）
  storagePath: string; // "" の場合は画像なし
};
```

### 6.3 FormDataType（`src/app/t/[tenantId]/types/cert.ts`）

```ts
type FormDataType = Record<string, string> & { ...必須12項目 + 任意31項目 }
```

`Record<string, string>` との交差型のため、**任意のキーを型エラーなしで書き込めます**。これが後述の「型定義に無いキー（`serviceType1` 等）が実データに存在する」原因です。

| 分類 | フィールド | 型定義上 | 画面での利用 |
|---|---|---|---|
| 識別 | `number` | 必須 | LayoutType1(p1) / LayoutType5(p5) |
| 本人 | `address` `furigana` `name` `birthday` | 必須 | LayoutType1 / LayoutType5 |
| 児童 | `childFurigana` `childName` `childBirthday` | 必須 | LayoutType1 / LayoutType5 |
| 交付元 | `disabilityType` `issueDate` `cityName` `issuerAddress` | 必須 | LayoutType1（`issuerAddress` はp1のみ） |
| 認定 | `certPeriod` | 任意 | LayoutType2（認定有効期間） |
| サービス1組目 | `serviceType1` `servicePeriod1` `serviceAmount1` | **型定義に無い**（`emptyFormData` のみ生成 `certPages.ts:111-113`） | **未使用**（LayoutType2は代わりに `name`/`birthday`/`childName` を使用） |
| サービス2〜8組目 | `serviceType2..8` `servicePeriod2..8` `serviceAmount2..8` | 任意 | LayoutType2(2,3) / LayoutType3(4,5) / LayoutType4(6,7,8) |
| 計画相談 | `supportPeriod` `planOfficeName` `monitoringPeriod` `planStartDate` | 任意 | LayoutType6 |
| 特定障害者特別給付 | `specialPaymentAmount` `specialPaymentPeriod` `specialPaymentPrevAmount` `specialPaymentPrevPeriod` | 任意 | LayoutType6 |
| 利用者負担 | `burdenLimitAmount` `burdenPeriod` `burdenLimitAmountPrev` `burdenPeriodPrev` `mealProvisionStatus` `managementTargetStatus` `managementOfficeName` `startDate` `specialNotes` | 任意 | LayoutType7（p7・p8で共用） |
| その他 | `contactInfo` `memo` | 任意 | LayoutType4 / LayoutType6 / LayoutType7 |

### 6.4 Storage 構造

| パス | 用途 |
|---|---|
| `tenants/{tenantId}/recipients/{beneficiaryId}/page{N}.jpg` | 現行の保存先（`page.tsx:445`） |
| `uploads/{uid}/{fileName}` | **旧パス**。読み取り専用ルールで互換維持（`storage.rules:20-27`）。新規書き込みには使用されない |

### 6.5 ご要望項目に対する充足状況

| ご要望の観点 | 現状 |
|---|---|
| Collection / Table名 | `tenants/{tenantId}/beneficiaries` |
| Document構造 | 6.2 参照 |
| TypeScript型定義 | `BeneficiaryRecord` / `BeneficiarySummary` / `SavedCertPage` / `FormDataType` / `CertPage` |
| 必須項目 | 型上は12項目が必須（空文字許容）。**実行時の必須チェックは0件** |
| 任意項目 | 31項目（`?` 付き）＋ index signature 経由の任意キー |
| IDの持ち方 | Firestore 自動生成IDをクライアント側で事前採番（`reserveBeneficiaryId`） |
| 利用者情報との紐付け | 利用者マスタが存在しない。受給者ドキュメント内に氏名等を直接保持 |
| 事業所との紐付け | `tenantId` をパスとドキュメント両方に保持。**事業所マスタは存在しない** |
| 保存日時 | `createdAt`（`serverTimestamp()`） |
| 更新日時 | `updatedAt`（`serverTimestamp()`） |
| 作成者 | `createdBy: { uid, email }` |
| 更新者 | `updatedBy: { uid, email }` |
| 削除フラグ | **存在しない** |
| ステータス（利用中/停止中） | **存在しない**（一覧のセレクトは飾り） |
| 有効期限 | **存在しない**（`certPeriod` は「認定有効期間」の生文字列で、期限判定には使えない） |
| 支給期間 | `servicePeriod2..8` / `supportPeriod` / `burdenPeriod` 等、すべて生文字列 |
| 支給量 | `serviceAmount2..8`（生文字列） |
| 利用可能サービス | `serviceType2..8`（生文字列。マスタ・列挙型なし） |
| 市区町村情報 | `cityName` / `issuerAddress`（生文字列。市町村番号は未保持） |
| 保護者情報 | **存在しない**。「支給決定障害者等」欄（`name` 等）が実質的に保護者にあたるが、明示的な保護者フィールドは無い |

### 6.6 類似・重複するデータ定義

| # | 重複箇所 | 内容 | 影響 |
|---|---|---|---|
| 1 | `constants/certPages.ts:35` の `CertTypeId` と `components/PageTabs.tsx:6` の `"mobility" \| "adult" \| "child"` | 同じ union を2箇所で定義 | 種別追加時の修正漏れリスク |
| 2 | `types/cert.ts` の `FormDataType.serviceType2..8` と `constants/certPages.ts:111-113` の `serviceType1` 系 | 1組目だけ型定義に存在しない | `serviceType1` が永久に未使用のゴミフィールドとして保存される |
| 3 | `LayoutType1`（p1）と `LayoutType5`（p5） | 同じ識別項目（`number`/`name`/`birthday`/`child*` 等）を別々の `pages[0]`/`pages[4]` に重複保持 | 同一人物の情報が2箇所に分かれ、片方だけ修正すると不整合。`buildSummary` は `pages[0]` のみ参照（`beneficiaries.ts:66-75`） |
| 4 | `LayoutType2`（p2）での `name`/`birthday`/`childName` の流用 | 「サービス種別」「支給決定期間」「支給量等」を人物系フィールドに格納 | **フィールド名と意味の完全な乖離**（後述 9.3） |
| 5 | `constants/certPages.ts:42` の `sampleImagePath`（`/cert-samples/page-N.png`）と `PageTabs.tsx:39` の実パス（`/cert-samples/{certType}/page-N.png`） | 定義されたパスは存在せず、誰も参照していない | デッドコード |
| 6 | `src_20260514_1/` / `src_20260519_1/` | `src/` の旧スナップショットがコミット済み | `tsconfig.json:26-33` の `include` に含まれるため lint / tsc の対象になり、lint エラー30件のうち大半がここ由来 |

---

## 7. 現在実装されている項目

18歳未満の受給者証を「もし種別を有効化したら」画面上で扱える項目を、ご指定の3区分で整理します。

### 7.1 現在実装されている項目（画面に存在し、保存される）

| ページ | 帳票上の欄 | フィールド | OCR自動抽出 | 手入力 |
|---|---|---|---|---|
| 1 | 受給者証番号 | `number` | adultのみ可 | 可 |
| 1 | 居住地 | `address` | adultのみ可（精度低） | 可 |
| 1 | フリガナ（本人） | `furigana` | **不可**（常に空） | 可 |
| 1 | 氏名（本人） | `name` | adultのみ可 | 可 |
| 1 | 生年月日（本人） | `birthday` | adultのみ可 | 可 |
| 1 | フリガナ（児童） | `childFurigana` | **不可**（常に空） | 可 |
| 1 | 氏名（児童） | `childName` | adultのみ可 | 可 |
| 1 | 生年月日（児童） | `childBirthday` | adultのみ可 | 可 |
| 1 | 障害種別 | `disabilityType` | adultのみ可 | 可 |
| 1 | 交付年月日 | `issueDate` | adultのみ可 | 可 |
| 1 | 支給市区町村名 | `cityName` | adultのみ可 | 可 |
| 1 | （市町村住所） | `issuerAddress` | adultのみ可 | 可 |
| 2 | 障害支援区分 | `disabilityType`（p2の値） | 不可 | 可 |
| 2 | 認定有効期間 | `certPeriod` | 不可 | 可 |
| 2 | サービス種別①/支給決定期間①/支給量等① | `name`/`birthday`/`childName`（**流用**） | adult p2 のみ部分的 | 可 |
| 2 | サービス種別②③ 一式 | `serviceType2,3` 系 | 不可 | 可 |
| 2 | 予備欄 | `memo` | 不可 | 可 |
| 3 | サービス種別④⑤ 一式 | `serviceType4,5` 系 | adult p3 のみ | 可 |
| 3 | 予備欄 | `memo` | 不可 | 可 |
| 4 | サービス種別⑥⑦⑧ 一式 | `serviceType6,7,8` 系 | adult p4 のみ | 可 |
| 4 | 予備欄・問い合わせ先 | `memo` / `contactInfo` | 不可 | 可 |
| 5 | 受給者証（Ⅱ）の識別項目一式 | p1と同名フィールド（`pages[4]`） | **不可**（p5用パーサなし） | 可 |
| 6 | 支給期間・指定特定相談支援事業所名・モニタリング期間・開始年月日 | `supportPeriod` / `planOfficeName` / `monitoringPeriod` / `planStartDate` | **不可** | 可 |
| 6 | 特定障害者特別給付費（支給額・適用期間・変更前×2）・予備欄 | `specialPayment*` / `memo` | **不可** | 可 |
| 7,8 | 負担上限月額・適用期間・変更前×2・食事提供体制加算・上限額管理対象者該当の有無・上限額管理事業所名・開始年月日・特記事項欄・問い合わせ先 | `burden*` / `mealProvisionStatus` / `managementTargetStatus` / `managementOfficeName` / `startDate` / `specialNotes` / `contactInfo` | **不可** | 可 |

### 7.2 コード上に存在するが画面で利用されていない項目

| 項目 | 定義箇所 | 状況 |
|---|---|---|
| `serviceType1` / `servicePeriod1` / `serviceAmount1` | `constants/certPages.ts:111-113` | `emptyFormData()` で生成され、毎回 Firestore に空文字で保存されるが、どのレイアウトからも参照されない完全なデッドフィールド |
| `sampleImagePath` | `constants/certPages.ts:42,48,54,...` | 8ページ分定義されているが参照0件。かつ実在しないパス（`/cert-samples/page-N.png`） |
| `CertPage.previewUrl` / `selectedFile`（保存後） | `types/cert.ts:71-72` | 保存対象外（ブラウザ内のみ）。仕様上妥当 |
| `PersistedPageData.storagePath` | `page.tsx:66` | セッションに保存されるが、`storagePath` が確定するのは保存処理の中だけで、その直後に state がリセットされるため常に `""` |
| `AppShell` の `subtitle` prop | `AppShell.tsx:22` | 受け取るが未使用（lint warning） |
| `UnhandledRejectionGuard` | `src/app/components/UnhandledRejectionGuard.tsx` | `layout.tsx:4,32` でコメントアウトされており未使用 |
| `.badgeInactive` `.rowActions` `.textButton` `.modalOverlay` `.modal` `.modalHeader` `.modalTitle` `.modalCloseButton` `.modalBody` `.detailGrid` `.detailItem` `.detailLabel` `.detailValue` | `beneficiaries/page.module.css:179-307`（約110行） | 詳細モーダル・行アクション（編集/削除）を想定した CSS が丸ごと未使用。**実装途中の痕跡** |
| `LoginClient` の `db` import | `LoginClient.tsx:5` | 未使用（REST API を直叩きしているため） |
| `graphql` 依存 | `functions/package.json` | Functions のコードから参照されていない |

### 7.3 実運用上必要になりそうだが仕様確認が必要な項目

コードにも画面にも存在せず、実運用で必要になりうるもの。**法令・様式上の必須項目の断定は避け、確認事項として列挙します。**

| 項目 | 現状 | 確認したいこと |
|---|---|---|
| 市町村番号 | 未保持（サンプル帳票には「市町村番号（　　）」欄あり） | 別項目として保持すべきか |
| ステータス（利用中/停止中/失効） | 未保持（一覧のセレクトは飾り） | 業務上のステータス区分は何か |
| 有効期限・失効管理 | 未保持。期間はすべて生文字列 | 期限アラートは必要か。どの期間を基準にするか |
| 論理削除フラグ | 未保持。削除機能自体が無い | 物理削除か論理削除か。削除権限は誰か |
| 支給決定期間の構造化（開始日/終了日） | 生文字列のみ | 期間での検索・並び替えが必要か |
| 和暦↔西暦変換 | 未実装 | 保存形式は和暦文字列のままでよいか |
| 保護者・連絡先情報 | 未保持 | 「支給決定障害者等」欄と別に管理が必要か |
| 事業所（テナント）マスタ | 未保持 | 事業所名・住所・番号を持つべきか |
| ユーザーのロール（管理者/一般） | 未実装 | 編集・削除の権限差は必要か |
| 変更履歴・監査ログ | `updatedBy`/`updatedAt` のみ | 版管理・履歴参照は必要か |
| 受給者証の複数世代管理（更新前後） | 未対応（1受給者=1ドキュメント） | 年度更新時に旧証を残す必要があるか |
| PDF出力・印刷 | 未実装 | 出力レイアウト・出力対象・提出先の要件は |

---

## 8. 未実装・不完全な箇所

### 8.1 画面はあるが処理が未実装

| # | 箇所 | 現在の挙動 | 影響度 |
|---|---|---|---|
| 1 | `beneficiaries/page.tsx:75-77`「＋ 受給者を新規登録」 | クリックしても何も起きない（`onClick` 無し） | 中 |
| 2 | `beneficiaries/page.tsx:80-122` 検索カード全体 | 4つの入力・2つのボタンすべてハンドラ無し。`検索`/`条件をクリア` も無反応 | 中 |
| 3 | `page.tsx:536`「既存受給者を更新」 | `alert("既存受給者検索は次のステップで追加します")` のみ。`importMode="update"` は state に入るが以後どこでも使われない | 中 |
| 4 | `settings/page.tsx` | 「現在このページは作成中です。」の静的テキストのみ | 低 |
| 5 | `page.tsx:551-586` 種別選択（`child`/`mobility`） | `disabled` で押下不可。「今後実装予定」バッジ表示 | **高**（本件の主対象） |
| 6 | `AppShell.tsx:58-62` ユーザーメニュー | メールアドレスと `⌄` を表示するだけでドロップダウンが開かない | 低 |

### 8.2 バックエンド/DBはあるが画面と繋がっていない

| # | 箇所 | 内容 | 影響度 |
|---|---|---|---|
| 1 | `beneficiaries.ts:57-64` `getBeneficiary` | 編集画面からのみ使用。一覧の詳細モーダル（CSS だけ存在）からは未使用 | 低 |
| 2 | `BeneficiaryRecord.certType` | 保存はされるが、レイアウト選択・パーサ選択・表示のいずれにも使われていない（一覧では `colorName` として表示されるのみ） | **高** |
| 3 | `SavedCertPage.ocrText` | 保存されるが、どの画面にも表示されない（再パースにも使われない） | 中 |
| 4 | `storage.rules:20-27` 旧パス `uploads/{uid}/` | 読み取りルールは残っているが、参照するコードが `src/` に存在しない | 低 |
| 5 | `users/{uid}` の書き込み | Rules が `allow write: if false`（`firestore.rules:11`）。アプリからテナント紐付けを作成する手段が無い | **高** |
| 6 | `tenants/{tenantId}` ドキュメント | Rules で読み取り拒否。事業所情報を持てない | 中 |

### 8.3 モックデータ・ハードコード

| # | 箇所 | 内容 | 影響度 |
|---|---|---|---|
| 1 | `beneficiaries/page.tsx:98-100` | 自治体セレクトが「名古屋市 / 春日井市 / 小牧市」でハードコード | 中 |
| 2 | `beneficiaries/page.tsx:107-109` | 利用状況セレクトが「利用中 / 停止中」でハードコード（対応するDBフィールドが無い） | 中 |
| 3 | `beneficiaries/page.tsx:86,91` | プレースホルダ「山田 太郎」「1234567890」 | 低（プレースホルダなので許容範囲） |
| 4 | `page.tsx:169` | `nextPath` のフォールバックが `/t/aaaa`（テスト用テナントIDの残骸） | 低 |
| 5 | `page1.test.ts:9-37` | 実在の個人名・住所らしき OCR テキストがテストフィクスチャとしてリポジトリにコミットされている | **高**（個人情報の取り扱い。要確認） |
| 6 | `public/cert-samples/mobility/` | page-1==page-5、page-2==page-6、page-3==page-7、page-4==page-8（4枚を2周させた仮素材。MD5一致で確認） | 低（mobility は対象外のため） |
| 7 | `public/cert-samples/{adult,child}/page-8.png` | **page-1.png と完全に同一ファイル**（MD5一致）。8ページ目のサンプルが存在しない | 中 |
| 8 | `functions/src/index.ts:57-60` | OCR 生テキスト全文を Cloud Logging に出力 | **高**（個人情報がログに残る） |

### 8.4 デバッグコード

| # | 箇所 | 内容 | 影響度 |
|---|---|---|---|
| 1 | `page.tsx:384` | `console.log("OCR RAW TEXT", text)` — 受給者証の全文がブラウザコンソールに出力 | **高** |
| 2 | `page.tsx:392` | `console.log("PARSED CERT DATA", parsed)` — 氏名・生年月日等が出力 | **高** |
| 3 | `parseCertText.ts:51-55` | `console.log("PARSE CERT", { pageIndex, selectedCertType, normalized })` | **高** |
| 4 | `LoginClient.tsx:61` | `console.error("[LOGIN] ERROR", e)` | 低 |
| 5 | `LogoutClient.tsx:26,32` | `console.warn` | 低 |

### 8.5 TODO / FIXME / 実装途中コメント

明示的な `TODO` / `FIXME` コメントは**0件**です。代わりに以下が実装途中の痕跡です。

| # | 箇所 | 内容 |
|---|---|---|
| 1 | `page.tsx:536` | `alert("既存受給者検索は次のステップで追加します")` |
| 2 | `settings/page.tsx:6` | 「現在このページは作成中です。」 |
| 3 | `certPages.ts:13,31` | `statusLabel: "今後実装予定"` |
| 4 | `layout.tsx:4,32` | `UnhandledRejectionGuard` のコメントアウト |
| 5 | `beneficiaries/page.module.css:198-307` | 未使用のモーダル/行アクション用CSS 約110行 |
| 6 | `src_20260514_1/` `src_20260519_1/` | 旧ソースのディレクトリコピーがリポジトリに残置 |

---

## 9. 不具合・技術的懸念

影響度: **高** = 実運用でデータ欠損・情報漏えい・機能不全に直結 / **中** = 運用に支障 / **低** = 品質・保守性

---

### 9.1 【高】スマホ撮影から戻ると、それまでに選択した全ページの画像が失われる

- **該当ファイル**: `src/app/t/[tenantId]/page.tsx:150-166`, `:179`, `:262-274`, `:441-450`
- **現在の挙動**:
  1. ページ1〜3の画像を取り込む（`selectedFile` が3ページ分保持される）
  2. ページ4で「ファイルを選択」→ モバイル判定により `/t/{tenantId}/capture` へ**ルート遷移**（`page.tsx:271`）
  3. 画面がアンマウントされ、React state（`File` オブジェクト）が消滅
  4. 撮影して戻ると `sessionStorage` から復元されるが、復元対象は `formData` / `ocrText` / `storagePath` のみ（`page.tsx:150-166`）
  5. 結果、**ページ1〜3の `selectedFile` は `null`、`previewUrl` は空**になる
- **問題点**:
  - `completedCount` は `selectedFile` の有無で数えるため（`page.tsx:179`）、進捗が `1/8` に戻る
  - `PageTabs` の「済」バッジも消える（`PageTabs.tsx:20`）
  - 決定的なのは保存処理で、`if (page.selectedFile)` の場合のみアップロードするため（`page.tsx:446`）、**ページ1〜3の画像は Storage に一切保存されない**。`storagePath: ""` のまま Firestore に書かれ、編集画面で「画像が保存されていません」となる
  - OCR で抽出したテキストデータは残るため、ユーザーは「保存できた」と誤認する
- **影響度**: **高**（モバイル運用が主要導線であれば、実質的にデータ欠損）

---

### 9.2 【高】受給者証種別（certType）がレイアウト・パーサのどちらにも反映されない

- **該当ファイル**: `src/app/t/[tenantId]/components/certLayouts.tsx:690-761`, `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/page.tsx:233-244`
- **現在の挙動**: `CertLayoutRenderer` は `pageIndex` のみを引数に取り、`switch (pageIndex)` でレイアウトを決定。`certType` を受け取るインターフェース自体が存在しない。
- **問題点**: 18歳未満を有効化しても、adult 用のレイアウト・タイトル（`PAGE_TITLES`）がそのまま使われる。今回はサンプルを見る限り構造が一致するため大事故にはならないが、**将来 mobility（移動支援）を追加した時点で確実に破綻**する。編集画面も同様で、`certType` を無視して常に adult レイアウトを描画する。
- **影響度**: **高**（18歳未満対応の設計上の中心的課題）

---

### 9.3 【高】ページ2で「サービス種別/支給決定期間/支給量等」を人物系フィールドに流用している

- **該当ファイル**: `src/app/t/[tenantId]/components/certLayouts.tsx:215-233`, `src/app/t/[tenantId]/lib/parsers/adult/page2.ts:23-29`
- **現在の挙動**:
  ```ts
  // adult/page2.ts
  name: serviceName,      // 「短期入所」等のサービス名が name に入る
  birthday: period,       // 「令和x年…から…まで」が birthday に入る
  childName: amount,      // 「n日/月」が childName に入る
  ```
  ```tsx
  // certLayouts.tsx LayoutType2
  <div>サービス種別</div> → field="name"
  <div>支給決定期間</div> → field="birthday"
  <div>支給量等</div>     → field="childName"
  ```
- **問題点**:
  - `pages[0].formData.name` は「氏名」、`pages[1].formData.name` は「サービス種別」という、**ページによって意味が変わるフィールド**になっている
  - `serviceType1` / `servicePeriod1` / `serviceAmount1` という正しいフィールドが `emptyFormData()` に用意されているのに（`certPages.ts:111-113`）使われていない
  - 将来「氏名でDB横断検索」等を実装した場合、ページ2のサービス名がヒットする
  - 18歳未満のパーサを新規に書く際、この誤った構造を踏襲するか正すかの判断が必要
- **影響度**: **高**（データモデルの根幹。18歳未満実装の前に決着させるべき）

---

### 9.4 【高】OCR生テキスト（個人情報）がブラウザコンソールとCloud Loggingに全文出力される

- **該当ファイル**: `src/app/t/[tenantId]/page.tsx:384,392`, `src/app/t/[tenantId]/lib/parsers/parseCertText.ts:51-55`, `functions/src/index.ts:57-60`
- **現在の挙動**: 受給者証の氏名・生年月日・住所・受給者番号を含む OCR 結果が、ブラウザの `console.log` と Cloud Functions の `logger.info` に**全文**出力される。
- **問題点**: Cloud Logging には保持期間中残り続け、プロジェクト閲覧権限者が参照できる。要配慮個人情報の取り扱いとして本番運用前に必ず除去が必要。
- **影響度**: **高**

---

### 9.5 【高】サインアップしてもテナントに所属できない（ユーザープロビジョニングが未実装）

- **該当ファイル**: `src/app/signup/SignupClient.tsx:19-30`, `src/app/login/LoginClient.tsx:52-59`, `firestore.rules:8-12`
- **現在の挙動**: サインアップは `createUserWithEmailAndPassword` のみを実行し、`users/{uid}` ドキュメントを作らない。Rules 側も `allow write: if false` のためアプリからは作成不可能。ログイン時に `users/{uid}` の取得に失敗すると `throw` され、`tenantId` が空なら黙って `/login` に戻る（`LoginClient.tsx:59`）。
- **問題点**: 新規ユーザーは「ログインは成功するが何も起きずログイン画面に戻る」という状態になり、原因が画面から分からない。テナント紐付けは Firestore コンソールでの手作業が前提。
- **影響度**: **高**（運用開始時の障壁）

---

### 9.6 【中】ページ7とページ8で編集中の入力状態が引き継がれ、誤ったページに保存されうる

- **該当ファイル**: `src/app/t/[tenantId]/components/certLayouts.tsx:18-84`, `:740-761`
- **現在の挙動**: `switch (pageIndex)` の `case 6` / `case 7` / `default` がすべて同じ `LayoutType7` を返す（`certLayouts.tsx:740-761`）。React は同じ位置・同じコンポーネント型の要素を**同一インスタンスとして再利用**するため、`EditableCertCell` 内の `editing` / `draft` state（`certLayouts.tsx:31-32`）がページ切替後も保持される。
- **問題点**: ページ7のセルを編集中（入力欄が開いた状態）でページ8へ切り替えると、入力欄が開いたままページ7の下書きが残り、そこで「保存」を押すと**ページ8のフィールドにページ7の値が書き込まれる**。
- **影響度**: 中（発生条件は限定的だが、誤データの混入につながる）

---

### 9.7 【中】ページ5だけを取り込んだ場合、一覧に氏名・受給者番号が表示されない

- **該当ファイル**: `src/app/t/[tenantId]/lib/firestore/beneficiaries.ts:66-75`
- **現在の挙動**: `buildSummary` は `pages[0].formData` のみを参照する。
- **問題点**: 受給者証（Ⅱ）＝ページ5にも同じ識別項目があるが、ページ1を取り込まずページ5だけ取り込んだ場合、`summary` が全項目空になり、一覧に「未登録 / 未取得 / 未取得」と表示される。またページ1とページ5で氏名を別々に修正でき、不整合が生じる。
- **影響度**: 中

---

### 9.8 【中】バリデーションが一切存在しない

- **該当ファイル**: `src/app/t/[tenantId]/page.tsx:417-487`, `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/page.tsx:110-137`
- **現在の挙動**: 保存前チェックは「1ページ以上取り込んでいるか」（`page.tsx:421`）と「受給者IDが採番済みか」（`page.tsx:426`）のみ。編集画面には**チェックが1つもない**。
- **問題点**: 受給者番号・氏名・交付年月日が空でも保存できる。受給者番号が数字10桁であるべきか等の形式チェックも無い。日付は和暦文字列をそのまま保存するため、OCR誤認識（例:「令和7年13月45日」）がそのまま通る。
- **影響度**: 中（18歳未満を実運用に乗せる上では必須対応）

---

### 9.9 【中】削除機能が存在しない

- **該当ファイル**: コードベース全体（`deleteDoc` の呼び出し0件）
- **現在の挙動**: 誤って登録した受給者を、アプリから削除も無効化もできない。
- **問題点**: 誤登録の訂正手段が Firestore コンソールでの手作業のみ。論理削除フラグも無いため、一覧から隠すこともできない。
- **影響度**: 中

---

### 9.10 【中】受給者一覧が全件取得・クライアント側フィルタなし

- **該当ファイル**: `src/app/t/[tenantId]/lib/firestore/beneficiaries.ts:124-137`
- **現在の挙動**: `orderBy("updatedAt", "desc")` のみで `limit` なし。全ドキュメントを取得。
- **問題点**: 受給者が増えると読み取りコストとロード時間が線形に増加する。加えて Firestore Rules が `get(users/{uid})` をドキュメントごとに評価するため、読み取り回数が実質2倍以上になる（`firestore.rules:16-17`）。検索機能が未実装なことと合わせ、件数が増えた時点で実用に耐えなくなる。
- **影響度**: 中

---

### 9.11 【中】旧データ・不正データで `undefined` 参照によるクラッシュの可能性

- **該当ファイル**: `src/app/t/[tenantId]/lib/firestore/beneficiaries.ts:63,134`, `src/app/t/[tenantId]/beneficiaries/page.tsx:152-154`, `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/page.tsx:194`
- **現在の挙動**: `snap.data() as Omit<BeneficiaryRecord, "id">` と**無検証でキャスト**している。
- **問題点**: `summary` フィールドを持たないドキュメント（手動投入・旧スキーマ）があると、`item.summary.name`（`beneficiaries/page.tsx:152`）や `record.summary.name`（`[beneficiaryId]/page.tsx:194`）で `TypeError: Cannot read properties of undefined` が発生し、一覧画面・編集画面が丸ごと落ちる。`pages` が配列でない場合も `padPages` で例外になりうる。型定義と実データの一致は実行時に一切保証されていない。
- **影響度**: 中

---

### 9.12 【中】Firestore Timestamp と Date の扱いが型上あいまい

- **該当ファイル**: `src/app/t/[tenantId]/lib/firestore/beneficiaries.ts:41,43`, `src/app/t/[tenantId]/beneficiaries/page.tsx:14-22`
- **現在の挙動**: 型上 `Timestamp | null` だが、実際は `serverTimestamp()` で書き込むため、書き込み直後のローカルスナップショットでは `null` になりうる。`formatUpdatedAt` は `try/catch` で `ts.toDate()` を包み、失敗時は「未取得」と表示する（`beneficiaries/page.tsx:16-21`）。
- **問題点**: 現状クラッシュはしないが、`updatedAt` が `null` のドキュメントは `orderBy("updatedAt","desc")` のクエリ結果から**除外される**可能性がある（Firestore はフィールド未設定のドキュメントを orderBy 対象から外す）。保存直後に一覧へ移動すると一時的に表示されないケースが考えられる。
- **影響度**: 中

---

### 9.13 【中】8ページ目のサンプル画像が1ページ目と同一ファイル

- **該当ファイル**: `public/cert-samples/adult/page-8.png`, `public/cert-samples/child/page-8.png`
- **現在の挙動**: MD5 が page-1.png と完全一致（adult: `b7c29c6e…` / child: `cbb9521d…`）。`PageTabs` のサムネイル（`PageTabs.tsx:39`）に「受給者証（Ⅰ）」の画像が8ページ目として表示される。
- **問題点**: ユーザーが取り込むべきページを誤認する。加えて `mobility` は4枚を2周させただけの仮素材（page-1==page-5 等）。
- **影響度**: 中

---

### 9.14 【中】ログイン後のリダイレクト先を検証していない（オープンリダイレクト）

- **該当ファイル**: `src/app/login/LoginClient.tsx:32-36`
- **現在の挙動**: `sp.get("next")` をそのまま `router.replace(next)` に渡す。
- **問題点**: `/login?next=https://example.com/` のようなURLを踏ませることで、ログイン直後に外部サイトへ遷移させられる。フィッシングの踏み台になりうる。
- **影響度**: 中

---

### 9.15 【低】18歳未満・移動支援のパーサが存在せず、フォールバックに落ちる

- **該当ファイル**: `src/app/t/[tenantId]/lib/parsers/parseCertText.ts:57-73`
- **現在の挙動**: `selectedCertType === "adult"` かつ `pageIndex` が 0〜3 の場合のみ専用パーサ。それ以外はすべて `parseFallback`（`parseCertText.ts:8-42`）。
- **問題点**: `parseFallback` は `number` / `address` / `name` / `birthday` / `disabilityType` / `issueDate` / `cityName` の7項目しか返さず、`certPeriod` 以降のフィールドはキー自体が欠落する（`FormDataType` の必須12項目しか返さない）。18歳未満を有効化しただけでは、**8ページすべてがこのフォールバックを通る**ため、ほぼ手入力になる。
- **影響度**: 低（種別が無効な現状では発火しないが、有効化時に即座に問題化する）

---

### 9.16 【低】ページ5〜8に専用パーサが無い（adult も同様）

- **該当ファイル**: `src/app/t/[tenantId]/lib/parsers/` — `adult/page1.ts`〜`page4.ts` のみ
- **現在の挙動**: adult であってもページ5〜8は `parseFallback` を通る。ページ5（受給者証Ⅱ）はページ1と同構造なので `parseAdultPage1` が流用できるはずだが、分岐が無い。
- **影響度**: 低〜中（18歳未満の実装範囲をどこまでにするかで変動）

---

### 9.17 【低】パーサの抽出ロジックが行位置に強く依存している

- **該当ファイル**: `src/app/t/[tenantId]/lib/parsers/adult/page3.ts:10-18`, `adult/page4.ts:10-18`
- **現在の挙動**: 「サービス種別」を含む行を見つけ、その**+1行目/+3行目/+5行目**を種別/期間/支給量として決め打ちしている。
- **問題点**: OCR の改行位置が1行でもずれると全項目がずれる。空行が混ざる帳票では機能しない可能性が高い。テストもない。
- **影響度**: 低（手修正できるため致命的ではないが、精度は期待できない）

---

### 9.18 【低】`FormDataType` の `Record<string, string>` 交差型が型安全性を無効化している

- **該当ファイル**: `src/app/t/[tenantId]/types/cert.ts:1`
- **問題点**: `Record<string, string>` との交差により、タイプミスしたキーも型エラーにならない。実際に `serviceType1` が型定義に無いまま `emptyFormData()` に存在している（`certPages.ts:111-113`）。「型定義と実データの不一致」がコンパイル時に検出されない構造になっている。
- **影響度**: 低（保守性）

---

### 9.19 【低】旧ソースのスナップショット2式がリポジトリに残置

- **該当ファイル**: `src_20260514_1/`（26ファイル）, `src_20260519_1/`（31ファイル）
- **問題点**: `tsconfig.json:26-33` の `include` が `**/*.ts` / `**/*.tsx` のため、`tsc` と `eslint` の対象になる。`npm run lint` のエラー30件・警告42件のうち**大半がこの2ディレクトリ由来**で、本番コードの問題が埋もれる。`next build` の対象外なので実害はないが、調査・レビューのノイズになる。
- **影響度**: 低

---

### 9.20 【低】lint エラーが本番コードにも残存

- **該当ファイル**: `src/` 配下
- **内訳**（`src/` のみ）:
  - `AppShell.tsx:31` — `react-hooks/set-state-in-effect`（effect 内での同期 setState）
  - `beneficiaries/page.tsx:38` — 同上
  - `UnhandledRejectionGuard.tsx:8`, `LoginClient.tsx:60`, `LogoutClient.tsx:31`, `SignupClient.tsx:25`, `capture/page.tsx:57`, `beneficiaries/page.tsx:45` — `no-explicit-any`
  - `AppShell.tsx:22`（`subtitle` 未使用）, `LoginClient.tsx:5`（`db` 未使用）, `capture/page.tsx:57`（`e` 未使用） — `no-unused-vars`
  - `SideNav.tsx:38,51`, `capture/page.tsx:257`, `page.tsx:721`, `PageTabs.tsx` — `no-img-element`
- **影響度**: 低

---

### 9.21 【低】テストが1本のみ・npm script 未登録

- **該当ファイル**: `src/app/t/[tenantId]/lib/parsers/adult/page1.test.ts`, `package.json:5-10`
- **現在の挙動**: `parseAdultPage1` のテストが3件あり、**すべて pass する**（`node --experimental-strip-types --test` で実行確認済み）。ただし `package.json` に `test` スクリプトが無く、CI もないため実行されない。
- **付随する懸念**: テストフィクスチャ（`page1.test.ts:9-37`）に実在の個人名・住所と思われる OCR テキストが含まれている（9.3節 8.3-#5 参照）。
- **影響度**: 低（品質面）／個人情報の点では**要確認**

---

## 10. 実運用までに不足している機能

「障害福祉サービス受給者証（18歳未満）」を実際に業務で使うために、機能として不足しているもの。

| # | 不足機能 | 現状 | 必要性 |
|---|---|---|---|
| 1 | 18歳未満の種別を選択できること | `enabled: false` で押下不可 | **必須** |
| 2 | 18歳未満用の OCR パース | 専用パーサ0本。フォールバックのみ | **必須**（無いと全項目手入力） |
| 3 | `certType` に応じたレイアウト・ページ定義の切替 | `pageIndex` のみで決定 | **必須** |
| 4 | スマホ撮影復帰時の画像保持 | 失われる（9.1） | **必須** |
| 5 | 必須項目・形式のバリデーション | 皆無 | **必須** |
| 6 | 既存受給者の検索・更新 | `alert` のみ | **必須**（年度更新運用のため） |
| 7 | 一覧の検索・絞り込み | フォームは飾り | **必須** |
| 8 | 削除（または論理削除・無効化） | 無し | **必須**（誤登録の訂正手段） |
| 9 | デバッグログの除去 | `console.log` 3箇所＋Functions ログ | **必須**（個人情報） |
| 10 | ユーザー↔テナント紐付けの作成手段 | Firestore コンソール手作業 | **必須** |
| 11 | 8ページ目のサンプル画像 | page-1 の複製 | 推奨 |
| 12 | 編集画面での画像差し替え | 無し | 推奨 |
| 13 | PDF出力・印刷 | 無し | 仕様確認後 |
| 14 | 有効期限・支給決定期間の構造化と期限アラート | 生文字列のみ | 仕様確認後 |
| 15 | ステータス管理（利用中/停止中） | フィールド自体が無い | 仕様確認後 |
| 16 | ロール・権限制御 | 概念が無い | 仕様確認後 |
| 17 | 変更履歴 | `updatedBy`/`updatedAt` のみ | 仕様確認後 |
| 18 | 離脱時の未保存警告（beforeunload） | `handleCancel` のみ | 推奨 |
| 19 | 保存成功後の一覧遷移 | メッセージ表示のみ | 推奨 |

---

## 11. 仕様確認が必要な項目

コードだけでは判断できず、業務仕様の確認が必要な事項です。

| # | 確認事項 | 背景 | 影響する実装 |
|---|---|---|---|
| C-1 | 18歳未満の受給者証は、リポジトリ内の `public/cert-samples/child/` と同じ8ページ構成・同じ項目でよいか | サンプル画像は adult と色以外ほぼ同一。自治体により様式が異なる可能性 | ページ定義・レイアウト・パーサの全体設計 |
| C-2 | 8ページ目（利用者負担に関する事項②）の正しい様式は何か | サンプルが page-1 の複製で確認不能 | LayoutType7 の分割要否 |
| C-3 | ページ7の「食事提供体制加算」欄は実際の様式に存在するか | 実装（`certLayouts.tsx:637-640`）にはあるがサンプル画像には無い | LayoutType7 の項目 |
| C-4 | ページ6の「問い合わせ先」欄が実装に無いが必要か | サンプルには存在（`certLayouts.tsx` の LayoutType6 に無い） | LayoutType6 の項目追加 |
| C-5 | 「支給決定障害者等」欄と「児童」欄の関係。18歳未満の場合、保護者＝支給決定障害者等 という理解でよいか | `child*` フィールドの意味づけ | データモデル・一覧の表示名（誰の名前を出すか） |
| C-6 | 一覧の「受給者名」に表示すべきは本人（保護者）か児童か | 18歳未満では児童名で探すのが自然な可能性 | `buildSummary`（`beneficiaries.ts:66-75`） |
| C-7 | 8ページすべての取込を必須とするか、一部ページのみの取込を許容するか | 現状は1ページでも保存可能 | バリデーション設計 |
| C-8 | 必須項目は何か（受給者証番号・氏名・交付年月日・支給市町村名 等） | 現状チェック皆無 | バリデーション設計 |
| C-9 | 日付は和暦文字列のまま保持でよいか、西暦に正規化するか | 現状は和暦文字列。期限管理には不向き | データモデル・期限アラート |
| C-10 | 支給決定期間・認定有効期間を「開始日/終了日」に構造化する必要があるか | 現状は「令和x年y月z日から令和a年b月c日まで」の1文字列 | データモデル・検索 |
| C-11 | 受給者証の年度更新時、旧証データを残すか上書きするか | 現状1受給者=1ドキュメント上書き | データモデル（履歴・世代管理） |
| C-12 | 削除は物理削除か論理削除か。実行できるのは誰か | 削除機能が無い | 削除機能・ロール設計 |
| C-13 | ステータス（利用中/停止中）の定義と遷移条件 | 一覧のセレクトは飾り、DBフィールド無し | データモデル・一覧絞り込み |
| C-14 | 自治体（市区町村）はマスタ管理するか、自由入力か | 現状セレクトは3市ハードコード、保存は自由文字列 | 検索・マスタ設計 |
| C-15 | PDF出力・印刷の要否と、出力レイアウト（受給者証の再現か、一覧表か） | 未実装 | 帳票機能 |
| C-16 | ユーザーのロール区分（管理者/一般等）と、編集・削除の権限差 | ロール概念が無い | Rules・UI |
| C-17 | 新規ユーザーのテナント割当フローをアプリ内で行うか、管理者が別途行うか | 現状 Firestore コンソール手作業 | ユーザー管理機能・Rules |
| C-18 | `page1.test.ts` のテストデータに実在の個人情報が含まれていないか。含まれる場合の取り扱い | 氏名・住所・受給者番号らしき値がコミット済み | Git 履歴の扱い |
| C-19 | OCR結果（`ocrText`）を Firestore に保存し続ける必要があるか | 現状保存されるが表示も再利用もされない | データ保持方針・個人情報 |
| C-20 | 移動支援・地域活動支援受給者証（クリーム色）の実装時期 | 現状 `enabled: false`、サンプルも仮素材 | 種別切替の設計スコープ |

---

## 12. 完成までの残タスク

### A. 必須対応（これがないと機能として成立しない）

| # | タスク名 | 内容 | 対象ファイル / 機能 | 難易度 | 前後関係 | 実装時の注意点 |
|---|---|---|---|---|---|---|
| A-1 | データモデルの整理（`serviceType1` 問題の決着） | ページ2の「サービス種別/支給決定期間/支給量等」を `name`/`birthday`/`childName` から `serviceType1`/`servicePeriod1`/`serviceAmount1` へ移行。`FormDataType` に1組目を正式に型定義 | `types/cert.ts`<br>`constants/certPages.ts:111-113`<br>`components/certLayouts.tsx:215-233`<br>`lib/parsers/adult/page2.ts:23-29` | 中 | **最初に実施**。A-2以降すべての前提 | 既存の保存済みデータとの互換。移行しないなら読み出し時のフォールバックが必要。18歳未満の実装で誤った構造を複製しないため、着手前に決着させる |
| A-2 | `certType` をレイアウト選択に反映 | `CertLayoutRenderer` に `certType` を渡し、`(certType, pageIndex)` でレイアウトを決定する構造へ。`PAGE_DEFINITIONS` も種別ごとに持てるようにする | `components/certLayouts.tsx:685-762`<br>`constants/certPages.ts:37-88`<br>`page.tsx:748-753`<br>`beneficiaries/[beneficiaryId]/page.tsx:233-244` | 中 | A-1 の後 | 編集画面は `record.certType` を渡す。旧データで `certType` が欠落している場合の既定値（`"adult"`）を決める |
| A-3 | 18歳未満（child）種別の有効化 | `CERT_TYPES` の `child` を `enabled: true` / `statusLabel: ""` に。`PageTabs` の重複型を `CertTypeId` に統一 | `constants/certPages.ts:24-32`<br>`components/PageTabs.tsx:6` | 小 | A-2 の後（先に有効化すると adult レイアウトで動いてしまう） | 有効化するだけでは A-4 が無い限りほぼ手入力運用になる点を関係者に共有 |
| A-4 | 18歳未満用パーサの実装 | `lib/parsers/child/page1..8.ts` を新規作成し、`parseCertText` に `certType === "child"` の分岐を追加 | `lib/parsers/parseCertText.ts:44-73`<br>`lib/parsers/child/`（新規） | **大** | A-1 / A-3 の後 | 実機OCRサンプルの収集が前提。adult のロジックが流用できるページ（1・5）と、行位置依存で作り直しが要るページ（3・4）を切り分ける。ページ単位でテストを書く |
| A-5 | ページ5〜8のパーサ実装 | ページ5は `parseAdultPage1` 相当を流用。6〜8は新規 | `lib/parsers/{adult,child}/page5..8.ts`（新規）<br>`parseCertText.ts` | 中 | A-4 と並行可 | ページ5はページ1と同構造。共通化して両種別で使い回す |
| A-6 | スマホ撮影復帰時の画像保持 | ページ遷移でも画像を失わない仕組み（IndexedDB への一時退避、または撮影をモーダル/同一ルート内に変更） | `page.tsx:150-166,262-274`<br>`capture/page.tsx` | 中 | 独立して着手可 | `sessionStorage` は dataURL 保存で容量上限に当たりやすい。IndexedDB（Blob 保存可）が有力。あるいは撮影直後に Storage へ先行アップロードする設計変更も選択肢 |
| A-7 | バリデーションの実装 | 必須項目チェック（C-8で確定した項目）、受給者番号の形式、和暦日付の形式・妥当性。保存ボタンの活性制御とエラー表示 | `page.tsx:417-487`<br>`beneficiaries/[beneficiaryId]/page.tsx:110-137`<br>`lib/validation/`（新規） | 中 | A-1 の後、C-8/C-9 の回答が前提 | 取込画面と編集画面で同じバリデータを共有する。OCR誤認識を弾きすぎて業務が止まらないよう、警告とエラーを分ける設計を検討 |
| A-8 | デバッグログの除去 | `console.log` 3箇所と Functions の OCR 全文ログを削除または本番で無効化 | `page.tsx:384,392`<br>`parseCertText.ts:51-55`<br>`functions/src/index.ts:57-60` | 小 | いつでも可。**本番投入前に必須** | Functions 側は `textLength` のみ残す等、デバッグ性とのバランスを取る |
| A-9 | 削除（または無効化）機能 | 受給者の削除。Firestore ドキュメント＋Storage 画像の両方。C-12 の回答により物理/論理を選択 | `lib/firestore/beneficiaries.ts`（新規関数）<br>`beneficiaries/page.tsx`<br>`beneficiaries/[beneficiaryId]/page.tsx` | 中 | C-12 の回答が前提 | 論理削除なら一覧クエリと Rules の両方に反映。物理削除なら Storage の孤児ファイルを残さないこと。確認ダイアログ必須 |
| A-10 | 既存受給者の検索・更新フロー | 「既存受給者を更新」から受給者を選び、既存ドキュメントに追記/上書きする導線 | `page.tsx:520-540`<br>`RecipientImportModeSelect.tsx`<br>`lib/firestore/beneficiaries.ts` | **大** | A-1 / A-2 の後 | `importMode` state は既にあるが未使用。既存の `beneficiaryId` を引き継ぐ形にすれば Storage パスも自然に上書きされる。ページ単位の部分更新か全ページ差し替えかを決める |
| A-11 | 一覧の検索・絞り込み実装 | 受給者名・受給者番号・自治体・（ステータス）での絞り込み | `beneficiaries/page.tsx:80-122`<br>`lib/firestore/beneficiaries.ts:124-137` | 中 | A-1 の後 | 件数が少ないうちはクライアント側フィルタで十分。将来的には Firestore クエリ＋複合インデックス（`firestore.indexes.json` は現在空） |
| A-12 | ユーザー↔テナント紐付けの手段整備 | 管理者がアプリまたは Admin SDK 経由で `users/{uid}` を作成できる仕組み。ログイン失敗時のメッセージ改善 | `firestore.rules:8-12`<br>`LoginClient.tsx:52-59`<br>Cloud Functions（新規） | 中 | C-17 の回答が前提 | `allow write: if false` は維持し、Callable Function 経由で管理者のみ書き込む設計が安全 |

### B. できれば対応（運用品質を上げる）

| # | タスク名 | 内容 | 対象ファイル / 機能 | 難易度 | 前後関係 | 実装時の注意点 |
|---|---|---|---|---|---|---|
| B-1 | ページ7/8の state 混入バグ修正 | `LayoutType7` を2ページで共用する際に `key={pageIndex}` を付与、または `EditableCertCell` を制御コンポーネント化 | `components/certLayouts.tsx:740-761` | 小 | A-2 と同時が効率的 | `key` 付与が最小修正。根本解決は `EditableCertCell` の `draft` state を廃し `value` を直接編集する形へ |
| B-2 | `buildSummary` をページ1・5の両方から構築 | ページ1が空ならページ5から補完 | `lib/firestore/beneficiaries.ts:66-75` | 小 | A-1 の後 | C-6（誰の名前を出すか）の回答を反映 |
| B-3 | Firestore 読み出し時のスキーマ検証 | `summary` / `pages` の欠落・型不一致に対する防御 | `lib/firestore/beneficiaries.ts:57-64,124-137` | 小 | 独立 | 既存の `padPages`（`[beneficiaryId]/page.tsx:20-33`）と同じ思想で `summary` にもデフォルトを適用 |
| B-4 | 一覧のページング / `limit` 付与 | `limit(50)` ＋ 続きを読む | `lib/firestore/beneficiaries.ts:124-137`<br>`beneficiaries/page.tsx` | 小 | A-11 と同時 | Rules の `get()` 呼び出しコストも同時に軽減される |
| B-5 | 「証種別」列の表示を正しいラベルに | `colorName`（紫色の受給者証）ではなく `shortLabel` を表示 | `beneficiaries/page.tsx:10-12` | 小 | 独立 | 色バッジと種別名を併記する案も |
| B-6 | 8ページ目のサンプル画像差し替え | adult / child の page-8.png を正しい様式画像に | `public/cert-samples/{adult,child}/page-8.png` | 小 | C-2 の回答が前提 | mobility の仮素材も将来的に差し替え |
| B-7 | 編集画面での画像差し替え・追加 | 編集画面から特定ページの画像を再アップロード | `beneficiaries/[beneficiaryId]/page.tsx` | 中 | A-6 の後 | 既存 Storage パスへの上書きなので比較的単純。差し替え後の再OCRの要否を決める |
| B-8 | 未保存離脱の警告 | `beforeunload` ＋ Next.js のルート遷移ガード | `page.tsx`<br>`beneficiaries/[beneficiaryId]/page.tsx:102-108` | 小 | 独立 | App Router ではルート遷移のブロックが難しい。最低限 `beforeunload` から |
| B-9 | 保存成功後の一覧遷移 | 保存後に自動で一覧または詳細へ | `page.tsx:470-477` | 小 | 独立 | 保存メッセージを見せる時間を確保する |
| B-10 | オープンリダイレクトの防止 | `next` パラメータを相対パスのみ許可 | `LoginClient.tsx:32-36` | 小 | 独立 | `next.startsWith("/") && !next.startsWith("//")` 程度で十分 |
| B-11 | 旧スナップショットディレクトリの整理 | `src_20260514_1/` `src_20260519_1/` を削除、または `tsconfig`/`eslint` の対象外へ | `tsconfig.json:26-33`<br>`eslint.config.mjs` | 小 | 独立 | Git 履歴には残るので削除しても復元可能。lint ノイズが 30 errors → 数件に減る |
| B-12 | lint エラーの解消 | `no-explicit-any` / `set-state-in-effect` / 未使用変数 | `src/` 各所（9.20 参照） | 小 | B-11 の後 | まず `src/` に限定して潰すのが効率的 |
| B-13 | テストの整備 | `package.json` に `test` スクリプト追加。パーサのテストをページ別に拡充 | `package.json:5-10`<br>`lib/parsers/**/*.test.ts` | 中 | A-4 / A-5 と並行 | `node --experimental-strip-types --test` で動作確認済み。フィクスチャは匿名化データに差し替える（C-18） |
| B-14 | `ocrText` の保存方針見直し | 表示も再利用もされていない生テキストの保持要否を決める | `lib/firestore/beneficiaries.ts:18-24`<br>`page.tsx:456` | 小 | C-19 の回答が前提 | 残すなら「OCR結果を見る」UIを付けて価値を出す。不要なら保存対象から外して個人情報の露出面を減らす |
| B-15 | デッドコードの除去 | `sampleImagePath` / `UnhandledRejectionGuard` / 未使用CSS 約110行 / `AppShell.subtitle` / `LoginClient` の `db` / `functions` の `graphql` 依存 | 8.5・7.2 参照 | 小 | 独立 | `UnhandledRejectionGuard` は使うか消すかを判断（現在コメントアウト） |

### C. 仕様確認が必要（コードだけでは判断できない）

第11章の C-1 〜 C-20 がそのままタスクになります。特に **A タスクの前提になるもの**を再掲します。

| # | 確認事項 | ブロックするタスク | 難易度（確認後の実装） |
|---|---|---|---|
| C-1 | 18歳未満の様式が `cert-samples/child/` と一致するか | **A-4（パーサ全体）** | 大 |
| C-2 | 8ページ目の正しい様式 | A-2 / B-6 | 中 |
| C-3 | ページ7の「食事提供体制加算」欄の有無 | A-2 | 小 |
| C-4 | ページ6の「問い合わせ先」欄 | A-2 | 小 |
| C-5 / C-6 | 支給決定障害者等と児童の関係・一覧に出す氏名 | A-1 / B-2 | 小 |
| C-7 / C-8 | 取込必須ページ・必須項目 | **A-7（バリデーション）** | 中 |
| C-9 / C-10 | 日付・期間の保持形式 | A-1 / A-7 | 中 |
| C-11 | 年度更新時の世代管理 | **A-10（既存受給者更新）** | 大 |
| C-12 | 削除の方式と権限 | **A-9（削除）** | 中 |
| C-13 | ステータス定義 | A-11 | 中 |
| C-14 | 自治体マスタ | A-11 | 中 |
| C-15 | PDF出力の要否・レイアウト | （新規タスク） | 大 |
| C-16 / C-17 | ロール・ユーザー割当 | **A-12** | 中 |
| C-18 | テストデータの個人情報 | B-13 | 小 |
| C-19 | `ocrText` の保持方針 | B-14 | 小 |
| C-20 | 移動支援の実装時期 | A-2 のスコープ | — |

---

## 13. 推奨実装順序

現在の実装状況（レイアウトは流用可能・パーサとデータモデルが弱点）を踏まえた順序です。

### フェーズ0: 着手前の確定（コード変更なし）

1. **C-1 / C-2 / C-3 / C-4 の確認** — 18歳未満の実物様式を入手し、8ページ構成と各ページの項目を確定する。ここが揺れると A-4 が丸ごと作り直しになるため、**最優先**。
2. **C-5 / C-6 / C-7 / C-8 の確認** — 誰の氏名を主キー的に扱うか、必須項目は何か。A-1 と A-7 の設計に直結。
3. **実機 OCR サンプルの収集** — 18歳未満の受給者証を各ページ2〜3枚ずつ実際に撮影・OCRし、生テキストを蓄積する。A-4 のパーサはこれが無いと書けない。

### フェーズ1: 土台の整理（18歳未満を載せる前に済ませる）

4. **A-8 デバッグログの除去** — 小さく独立。実機サンプル収集で個人情報がログに流れる前に実施すべき。
5. **B-11 旧スナップショットの整理** — lint ノイズを消し、以降の変更の見通しを良くする。
6. **A-1 データモデルの整理** — `serviceType1` 問題の決着。**18歳未満のパーサを書く前に必ず終わらせる**（誤った構造を複製しないため）。
7. **B-3 スキーマ検証の追加** — A-1 のデータ移行で旧データが混在するため、防御を先に入れておくと安全。

### フェーズ2: 種別対応の骨格

8. **A-2 `certType` をレイアウト選択に反映** — 取込画面・編集画面の両方。この時点ではまだ child のレイアウトは adult と同じ実体を指してよい。
9. **B-1 ページ7/8の state 混入バグ修正** — A-2 で `switch` を触るタイミングで同時に。
10. **A-3 child 種別の有効化** — ここで初めて 18歳未満が選択可能になる。この時点では「レイアウトは出るがOCRはフォールバック」の状態。

### フェーズ3: 取込精度（本丸）

11. **A-4 18歳未満用パーサの実装** — ページ1から順に、実機サンプルとテストをセットで。ページ1・5は adult のロジック流用から始める。
12. **A-5 ページ5〜8のパーサ** — A-4 と並行。両種別で共通化できる部分を切り出す。
13. **B-13 テストの整備** — A-4 / A-5 と同時に進める（後追いにしない）。

### フェーズ4: 入力品質と保存の信頼性

14. **A-6 スマホ撮影復帰時の画像保持** — モバイル運用が主導線なら、フェーズ3と入れ替えて先行させる判断もあり。
15. **A-7 バリデーション** — 必須・形式チェック。取込画面と編集画面で共通化。
16. **B-8 / B-9 離脱警告・保存後遷移** — 小粒だが体感品質が上がる。

### フェーズ5: 運用機能

17. **A-11 一覧の検索・絞り込み** ＋ **B-4 ページング** ＋ **B-5 種別列の表示修正**
18. **A-9 削除（または無効化）**
19. **A-10 既存受給者の更新フロー** — 年度更新運用に必要。A-1 / A-2 が固まっていないと設計できないため後半に。
20. **B-7 編集画面での画像差し替え**

### フェーズ6: 権限・仕上げ

21. **A-12 ユーザー↔テナント紐付けの手段整備** ＋ **B-10 オープンリダイレクト防止**
22. **B-12 lint 解消** / **B-15 デッドコード除去** / **B-6 サンプル画像差し替え** / **B-14 `ocrText` 方針**
23. **C-15 の確認結果に応じた PDF出力・印刷**（必要な場合）

### フェーズ7: 動作テスト

24. 18歳未満の実物受給者証を使った、PC・スマホ双方での**通し検証**
    - 8ページ取込 → 保存 → 一覧表示 → 編集 → 再保存 → 画像表示
    - 途中でのリロード・ブラウザバック・撮影往復
    - 別テナントのユーザーからのアクセス遮断（Rules の実地確認）
    - 必須項目未入力・日付誤りでの保存拒否

### 実装順序の要点

- **A-4（パーサ）が最大の工数**であり、**C-1（様式確定）と実機サンプル**がその前提です。この2つを先に押さえないと、他をいくら進めても18歳未満は完成しません。
- **A-1（データモデル整理）を A-4 より前に**置いているのが、この順序の肝です。18歳未満のパーサは adult のコードをベースに書くことになるため、`name` に「サービス種別」を入れるような構造を先に正しておかないと、負債が倍になります。
- A-6（画像保持）は独立性が高いので、モバイル運用の重要度に応じてどのフェーズにも差し込めます。

---

## 14. 総括

### 14.1 PaperlessCare 全体

「受給者証を撮影 → Vision API で OCR → 受給者証の様式どおりの画面に流し込む → 手修正して Firestore + Storage に保存 → 一覧から呼び出して編集」という**一連の主導線は、18歳以上（紫色）に限れば通しで動作します**。設計面でも、受給者IDの事前採番による冪等な保存、保存失敗時の画像ロールバック、`getDownloadURL` を避けて `getBytes` で都度 Rules を評価する画像取得、Firestore と Storage で同一のテナント境界を再現した Rules など、要点を押さえた実装が随所にあります。

一方で、**受給者を「探す・更新する・消す」という管理系の機能は、ほぼ画面の外形だけが存在する状態**です。一覧の検索フォーム、新規登録ボタン、「既存受給者を更新」、詳細モーダル用の CSS 約110行 — いずれもハンドラや実装が伴っていません。バリデーションは1件も存在せず、削除機能もありません。ビルド・型チェックは通り、パーサの単体テストも通りますが、テストは1本のみで npm script にも登録されていません。

### 14.2 障害福祉サービス受給者証（18歳未満）

**完成度としては、着手前の準備段階です。** 用意されているのは、

- 種別定義（`enabled: false` の状態）
- テーマカラー（`.cert-type-green`）
- 8ページ分のサンプル画像

の3点のみで、選択も取込も保存もできません。

ただし調査を通じて分かった重要な事実として、**18歳未満のサンプル様式は、既に実装済みの adult 用レイアウト（LayoutType1〜7）とほぼ一致していました**（色以外の構造差は、ページ6の「問い合わせ先」欄とページ7の「食事提供体制加算」欄の2点程度）。つまり**帳票レイアウトをゼロから作る必要はない可能性が高く**、これは工数見積り上のプラス材料です。

実際の主戦場は次の3点です。

1. **OCR パーサの新規実装**（`child` 用が0本。実機サンプルの収集が前提）
2. **`certType` を軸にした分岐構造への作り替え**（現在はページ番号だけでレイアウトが決まる）
3. **データモデルの是正**（ページ2でサービス名を `name` に入れている構造を、18歳未満に複製する前に正す）

### 14.3 最も注意すべき3点

1. **A-1（データモデル整理）を A-4（child パーサ）より先に行うこと。** 順序を逆にすると、`name` に「サービス種別」を入れる誤った構造が18歳未満側にも複製され、後の是正コストが倍になります。

2. **スマホ撮影から戻ると、それまでに選んだページの画像がすべて失われます（9.1）。** OCR テキストだけは残るため「保存できた」ように見えますが、Storage には画像が上がりません。モバイルが主導線であれば、これは18歳未満対応と同格の優先度です。

3. **OCR 生テキスト（氏名・住所・生年月日を含む）が、ブラウザコンソールと Cloud Logging に全文出力されています（9.4）。** 実機サンプルの収集を始める前に除去してください。あわせて、テストフィクスチャ（`page1.test.ts:9-37`）に実在の個人情報らしき値がコミットされている点も、取り扱いの確認が必要です。

### 14.4 次のアクション

コードに手を入れる前に、以下2点の確定を推奨します。

- **18歳未満の実物様式の確認**（C-1〜C-4）— リポジトリのサンプル画像が実際の様式と一致するか
- **18歳未満の実機 OCR サンプルの収集** — 各ページ2〜3枚。これが無いとパーサは書けません

この2つが揃った時点で、第13章のフェーズ1（土台整理）から順に着手するのが、最も手戻りの少ない進め方です。
