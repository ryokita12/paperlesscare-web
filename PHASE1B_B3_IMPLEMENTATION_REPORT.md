# PaperlessCare Phase 1-B3 実装報告書 ― 通所受給者証の hidden integration

- 作成日：2026-10-03
- 状態：**実装・ローカル検証まで完了**。未コミット・未push・未デプロイ（ユーザーのレビュー待ち）。Production には接続していない
- **作業場所**：git worktree `paperlesscare-web/.claude/worktrees/phase1b3-tsusho-hidden/`（branch `feat/phase1b3-tsusho-hidden-integration`）
  - 本報告書もこの worktree の直下にある（26章）。

---

## 1. 実装概要

通所受給者証（`tsusho`）を、PaperlessCare 本体の次の基盤に**非公開のまま**接続した。

- 種別定義（`CERT_TYPES` / `CertTypeId`）
- ページ定義
- レイアウト
- parser の登録表（`CERT_PAGE_PARSERS` / `parseCertText`）

あわせて、次を入れた。

- 管理Web・LINE の種別選択を「公開可能な種別だけを表示する関数」経由にした。
- `tsusho` は `enabled` / `lineEnabled` / `adminVisible` をすべて `false` にし、**どちらの画面にも表示されない**。
- ページ数（`PAGE_COUNT = 8`）、期限処理、profile の扱い、保存処理、Rules、Functions は変更していない。

## 2. 作業 branch

`feat/phase1b3-tsusho-hidden-integration`

- main の `db9982a5` から作成した。
- worktree の作成時にできた `worktree-phase1b3-tsusho-hidden` も同じ commit を指している（変更なし）。

## 3. 作業開始時の HEAD

`db9982a5`（main = origin/main。本番リリース済み）

開始前の共有チェックアウトに、tracked な変更はなかった。未追跡の5項目（`.claude/`、docs の png/pptx、統合・リリースレポート）には触れていない。

## 4. 変更ファイル一覧（変更7・新規3）

| 区分 | ファイル | 内容 |
|---|---|---|
| 変更 | `src/app/t/[tenantId]/constants/certPages.ts` | `tsusho` を `CERT_TYPES` に追加。`lineEnabled` / `adminVisible` フラグを追加。`adminCertTypeOptions` / `lineCertTypeOptions` / `isCertTypeSelectable` を追加。`PageDefinition` を構造型に変更。tsusho の7ページを登録 |
| 変更 | `src/app/t/[tenantId]/constants/certLayoutMap.ts` | tsusho のレイアウトID 7つと、対応表を追加 |
| 変更 | `src/app/t/[tenantId]/components/certLayouts.tsx` | `EditableCertCell` に `export` を付与（処理は変更なし）。tsusho のレイアウトを `LAYOUT_COMPONENTS` に登録 |
| 変更 | `src/app/t/[tenantId]/lib/parsers/parseCertText.ts` | `CERT_PAGE_PARSERS.tsusho = TSUSHO_PAGE_PARSERS` |
| 変更 | `src/app/t/[tenantId]/CertImportFlow.tsx` | 種別選択を `adminCertTypeOptions()` に変更。既存利用者の種別の初期選択を `isCertTypeSelectable(…, variant)` に変更。effect の依存配列に `variant` を追加。**保存処理は変更なし** |
| 変更 | `src/app/line/import/LineCertImportView.tsx` | 種別選択を `lineCertTypeOptions()` に変更（1行＋import）。**保存処理は変更なし** |
| 変更 | `src/lib/tsusho/isolation.test.ts` | 「未接続」のテストを「Phase 1-B3 の境界」のテストへ**意図的に更新** |
| 新規 | `src/app/t/[tenantId]/components/tsushoLayouts.tsx` | 一〜七面のレイアウト |
| 新規 | `src/app/t/[tenantId]/constants/certTypeVisibility.test.ts` | 種別・表示・ページ定義のテスト |
| 新規 | `src/app/t/[tenantId]/lib/parsers/tsushoRegistry.test.ts` | parser の登録のテスト |

`git diff --stat`：既存7ファイル、+198 / −25。

## 5. CertTypeId の変更

- `CertTypeId = "mobility" | "adult" | "child" | "tsusho"`。`CERT_TYPES` から導出される型なので、自動的に変わる。
- 追加の結果、`Record<CertTypeId, …>` でエントリが必須になった3か所すべてに `tsusho` を追加した。
  - `PAGE_DEFINITIONS_BY_CERT_TYPE`（certPages）
  - `CERT_LAYOUT_IDS`（certLayoutMap）
  - `CERT_PAGE_PARSERS`（parseCertText）
- `Partial<Record<CertTypeId, …>>`（LINE の `TYPE_SWATCH`、`FALLBACK_ALLOWED_PAGES`）は追加不要。tsusho の色見本は定義していない。

## 6. CERT_TYPES の変更

| id | label | enabled | lineEnabled | adminVisible | statusLabel |
|---|---|---|---|---|---|
| mobility | 移動支援・地域活動支援 受給者証 | false | **false** | **true** | 今後実装予定 |
| adult | 障害福祉サービス受給者証（18歳以上） | true | **true** | **true** | （空） |
| child | 障害福祉サービス受給者証（18歳未満） | true | **true** | **true** | （空） |
| **tsusho** | **通所受給者証** | **false** | **false** | **false** | 準備中 |

- 既存3種別の `label` / `shortLabel` / `colorName` / `themeClass` / `enabled` / `statusLabel` と並び順は変えていない（テストで固定）。
- `child` は障害福祉サービス受給者証（18歳未満）のまま。`tsusho` は別の種別で、改名・転用はしていない。

## 7. enabled / lineEnabled の設計

- **`enabled`**：取込で選択できるか（従来どおり）。
- **`lineEnabled`**：LINE に出すか。LINE は `enabled && lineEnabled` の種別だけを表示する。
- **`adminVisible`**（追加）：管理Webに表示するか。
  - 管理Webは従来、`CERT_TYPES` をすべて表示し、`enabled: false` の mobility も「今後実装予定」として押せない状態で見せていた。
  - そのため `enabled` だけでは「tsusho を出さない」と「mobility を押せない状態で見せる」を両立できず、`adminVisible` を足した。
- 画面側は `CERT_TYPES` を直接 map せず、次を使う。
  - `adminCertTypeOptions()`（`adminVisible` のもの）
  - `lineCertTypeOptions()`（`enabled && lineEnabled` のもの）
- 既存利用者の種別の初期選択は `isCertTypeSelectable(id, variant)` で行う（enabled かつ、管理Webなら adminVisible、LINE なら lineEnabled）。adult / child / mobility の結果は従来の `sameType?.enabled` と同じ。

## 8. 7ページの定義

- `getPageDefinitions("tsusho")` は7ページを返す。正本は `src/lib/tsusho/constants.ts` の `TSUSHO_PAGE_DEFINITIONS`。
  - 通所受給者証（一面）
  - 障害児通所給付費の給付決定内容（二面）
  - 障害児通所給付費の給付決定内容（三面）
  - 障害児相談支援給付費の支給内容（四面）
  - 利用者負担に関する事項（五面）
  - 障害児通所支援事業者記入欄（六面）
  - 障害児通所支援事業者記入欄（七面）
- 型の都合で、`PageDefinition` を「8ページ配列の要素の literal 型」から構造型 `{ pageNo; title; shortTitle; sampleImagePath? }` へ広げた（型のみ。`sampleImagePath` は既存コードのどこからも参照されていない）。
- **`PAGE_COUNT` は 8 のまま。** 画面のページ移動は7ページに対応させていない（1-B4 で `getPageCount` を導入する予定）。

## 9. レイアウト

`tsushoLayouts.tsx`（新規）。キーは `src/lib/tsusho/constants.ts` を正としている。adult / child のレイアウトは流用していない。

| 面 | レイアウトID | 項目 |
|---|---|---|
| 一 | `tsushoBasic` | 受給者証番号 `number`／通所給付決定保護者（`guardianAddress`・`guardianFurigana`・`guardianName`・`guardianBirthday`）／児童（`furigana`・`name`・`birthday`）／`issueDate`／`cityName` |
| 二 | `tsushoDecision2` | 行1・2（`serviceType`・`serviceAmount`・`servicePeriod` の1・2）、`decision2ExtraRows`（値がある場合のみ表示）、`decision2SpecialNotes`、`decision2Memo` |
| 三 | `tsushoDecision3` | 行3・4、`decision3ExtraRows`、`decision3SpecialNotes`、`decision3Memo` |
| 四 | `tsushoConsultation` | `supportPeriod`、`planOfficeName`、`monitoringPeriod`、`consultationMemo` |
| 五 | `tsushoBurden` | `burdenLimitAmount`、`burdenPeriod`、`mealProvisionStatus`、`mealProvisionPeriod`、`managementTargetStatus`、`managementOfficeName`、`burdenSpecialNotes`、`burdenMemo` |
| 六・七 | `tsushoProvider6` / `tsushoProvider7` | **入力欄なし**。「画像の保存のみ対応、読み取りは未対応」と案内するだけ（架空の項目は作っていない） |

その他：
- `certLayouts.tsx` と `tsushoLayouts.tsx` は相互に import している（`EditableCertCell` と、登録用のレイアウト）。モジュールの評価順に依存しないよう、tsusho のレイアウトはすべて関数宣言にした（巻き上げられる）。
- 範囲外のページ（tsusho の8ページ目）は、従来どおり `getCertLayoutId` の共通フォールバック（`userBurden`）になる。画面から到達できないため変更していない（25章）。

## 10. parser の登録

- `CERT_PAGE_PARSERS.tsusho = TSUSHO_PAGE_PARSERS`（Phase 1-B2 のもの）
  - index 0〜4（一〜五面）＝ `parseTsushoFace1〜5`
  - index 5・6（六・七面）＝ parser なし
- adult（0〜3）・child（空）・mobility（空）は変更していない。child の parser は実装しておらず、tsusho の parser も流用していない。
- `FALLBACK_ALLOWED_PAGES` は空のまま。

## 11. parseCertText との接続

- `parseCertText(text, pageIndex, "tsusho")` は `normalizeText` を適用し、そのあと登録した各面の parser を呼ぶ。
- 登録したのは normalize 済みのテキストを受け取る parser そのもので、`normalizeText` を内部で行う `parseTsushoCertText` は登録していない。**`normalizeText` は二重に適用されない。**
- `parseCertText(…, "tsusho")` と `parseTsushoCertText(…)` の結果が一致することをテストで固定した。

## 12. 管理Webで非表示

- 「受給者証の種類」は `adminCertTypeOptions()` で表示する。結果は従来どおり mobility（今後実装予定・押せない）／adult／child の3種類・同じ順番で、tsusho は出ない。
- 押せる種別も従来どおり adult / child だけ。
- テスト：tsusho は `CERT_TYPES` の中にはあるが、管理Webの選択肢には無いことを固定した。あわせて、CertImportFlow が `CERT_TYPES.map(` を直接使っていないことをソースで確認するテストも入れた。

## 13. LINE で非表示

- LINE の種別選択は `lineCertTypeOptions()` で表示する。結果は従来（`CERT_TYPES.filter(enabled)`）と同じ adult / child だけで、tsusho は出ない（`lineEnabled === false`、`enabled === false`）。
- LINE の保存処理・新規登録・既存利用者の更新は変更していない（`LineCertImportView.tsx` の差分は import と1行だけ）。

## 14. isolation テストの更新

`src/lib/tsusho/isolation.test.ts` は削除せず、「Phase 1-B3 の境界」のテストへ書き換えた（3件 → 7件）。

| テスト | 内容 |
|---|---|
| import 元の限定 | `src/lib/tsusho` を import してよいアプリのコードは `certPages.ts` と `parseCertText.ts` だけ（テストは除く） |
| 非公開 | tsusho は `CERT_TYPES` にあるが、`enabled` / `lineEnabled` / `adminVisible` はすべて false |
| 期限処理・profile | `certificateModel.ts` と `beneficiaries.ts` に tsusho の記述が無い（1-B5 で接続予定） |
| Functions・Rules | `functions/src`、`firestore.rules`、`storage.rules` に tsusho の記述が無い |
| currentCertificateId | 単一のまま（`currentCertificateIds` は導入していない） |
| PAGE_COUNT | 8 のまま |
| 画面 | 管理Web・LINE が、公開可能な種別だけを返す関数を通している |

## 15. 新規・更新したテスト

| ファイル | 件数 | 内容 |
|---|---|---|
| `constants/certTypeVisibility.test.ts`（新規） | 11 | A：tsusho の定義と非公開／tsusho と child は別の種別。B：既存3種別の定義・新しいフラグが変わっていない。C：管理Webは従来の3種類で tsusho なし・押せるのは adult / child。D：LINE は adult / child で tsusho なし。`isCertTypeSelectable`。G：tsusho は7ページ・既存は8ページで `PAGE_COUNT` は 8。レイアウトID |
| `lib/parsers/tsushoRegistry.test.ts`（新規） | 7 | E：一〜五面が 1-B2 の parser に接続、六・七面と範囲外は parser なし、adult は無変更・child / mobility は空。`parseCertText` と `parseTsushoCertText` が一致。F：`parseCertText` 経由でも保護者と児童を分離し、氏名1つなら割り当てない。child として解析しても tsusho の parser は使われない |
| `src/lib/tsusho/isolation.test.ts`（更新） | 3 → 7 | 14章 |

**新規・更新の合計：25件**（新規18＋isolation 7件）。テスト件数は 185 → **207**（＋22。isolation が3件から7件に増えたため）。

## 16. Phase 1-B2 の既存テストの結果

`node --experimental-strip-types --test "src/lib/tsusho/**/*.test.ts"`：**77/77 成功**

- Phase 1-B2 の parser・ロジックのテスト70件（人物の取り違え防止を含む）はすべて変更せずに成功。
- 残りは isolation の7件。

## 17. 全体テストの結果

`npm test`：**207/207 成功**（既存の期待値は、isolation 以外は変更していない）

## 18. TypeScript

`npx tsc --noEmit -p .`：**成功（エラー0）**

## 19. Rules テスト

`npm run test:rules`（エミュレーター、JAVA_HOME=openjdk@17）：**10/10 成功**

## 20. ESLint

- 変更・新規ファイル（`src/lib/tsusho`、`constants/`、`lib/parsers/`、`components/certLayouts.tsx`・`tsushoLayouts.tsx`、`CertImportFlow.tsx`、`LineCertImportView.tsx`）で**エラー0**。
- 今回の変更で出た警告（effect の依存配列に `variant` が無い）は、依存配列に追加して解消した。`variant` は props の固定値で、挙動は変わらない。
- 残っている警告3件は、変更前からある既存のもの（`CertImportFlow.tsx` の `<img>`、`certLayouts.tsx` の未使用の `pageTitle` ×2。Phase 1-A 報告書9章に記載）。

## 21. Build

`npx next build`：**成功**

- worktree には `.env.local`（Git の無視対象）が無いため、共有チェックアウトの既存ファイルへ一時的にシンボリックリンクを張って実行し、**実行後に削除した**。
- Production には接続していない。値を補ってもいない。

## 22. Production Core への影響

**ユーザーに見える挙動の変化はない**（tsusho は管理Web・LINE のどちらからも選択できないため）。

| Production Core | 影響 |
|---|---|
| 受給者証の画像取込・OCR | 選択できる種別が従来どおりで、tsusho の経路には入れない |
| 新規登録・既存利用者の更新（管理Web・LINE） | 保存処理は無変更。種別の初期選択も、adult / child / mobility では従来と同じ結果 |
| 利用者一覧・カルテ・current certificate・履歴 | 無変更 |
| 種別の表示（受給者証タブ・LINE 詳細） | `CERT_TYPES.find` を使う箇所は無変更。tsusho のデータは存在しないため表示されない |
| バンドル | tsusho の定義・parser・レイアウトが本番のバンドルに含まれるようになる（hidden integration のため想定どおり）。画面からは到達しない |

## 23. 変更していない重要ファイル

`git diff` で差分0であることを確認した。

- `src/app/t/[tenantId]/lib/firestore/certificateModel.ts`（期限・summary）
- `src/app/t/[tenantId]/lib/firestore/beneficiaries.ts`（profile・保存・`currentCertificateId`）
- `firestore.rules`、`storage.rules`
- `functions/`
- `package.json`、`package-lock.json`
- LINE の利用者一覧・詳細・完了画面・検索（`src/app/line/beneficiaries`、`import/done`、`lib`）
- `CertImportFlow.tsx` の保存処理（`handleSaveBeneficiary`）とOCR処理（`performOcr`）
- `PAGE_COUNT`

## 24. 実物の OCR は未検証であること

- tsusho の parser は、架空の fixture でだけ検証している（Phase 1-B2）。
- 実物の通所受給者証を Cloud Vision に通した出力では**未検証**。
- 実物サンプルでの検証は、tsusho を画面で有効化する（1-B6）前に必須。

## 25. 次の 1-B4 へ進む前の注意事項

1. **ページ数の種別化**：`getPageCount(certType)`（adult / child / mobility = 8、tsusho = 7）を導入する。
   - `CertImportFlow`（`PAGE_COUNT` の参照が約15か所）、`LineCertImportView`、`CertificatesPanel`（`padPages`）を置き換える。
   - adult / child の8ページの挙動を E2E で回帰確認する。
2. **範囲外のレイアウト**：tsusho の8ページ目は、共通のフォールバック（adult の `userBurden`）になる。7ページ化と同時に tsusho 専用の扱いにすることを推奨する（既存テスト「範囲外は全種別 userBurden」の意図的な更新が必要）。
3. **種別を切り替えたときのクリア**：tsusho と他の種別では `name` などのキーの意味が違う。切り替えたときに取込内容をクリアする処理が必要（設計書5.3）。
4. **サンプル画像**：PageTabs・LINE は `/cert-samples/${certType}/page-N.png` を表示する。tsusho を画面に出す段階で、個人情報を含まない画像（公式の空様式から作成）が必要になる。今回は不要のため追加していない。
5. **LINE の色見本**：LINE は「受給者証の色」で選ばせている。tsusho の用紙の色は公式に定めが無いため、LINE 対応時に文言の変更が必要。
6. **境界テスト**：tsusho を画面へ接続する段階（1-B4 以降）では、`isolation.test.ts` と `certTypeVisibility.test.ts` の該当部分を意図的に更新する。
7. **1-B5（期限・profile 保護）**：`certificateModel` / `beneficiaries` への接続は、isolation テストで「未接続」を固定している。

## 26. Git 状態

- 場所：`paperlesscare-web/.claude/worktrees/phase1b3-tsusho-hidden/`
- branch：`feat/phase1b3-tsusho-hidden-integration`（HEAD `db9982a5`、**未コミット**）
- `git status --short`：
  ```
   M src/app/line/import/LineCertImportView.tsx
   M src/app/t/[tenantId]/CertImportFlow.tsx
   M src/app/t/[tenantId]/components/certLayouts.tsx
   M src/app/t/[tenantId]/constants/certLayoutMap.ts
   M src/app/t/[tenantId]/constants/certPages.ts
   M src/app/t/[tenantId]/lib/parsers/parseCertText.ts
   M src/lib/tsusho/isolation.test.ts
  ?? src/app/t/[tenantId]/components/tsushoLayouts.tsx
  ?? src/app/t/[tenantId]/constants/certTypeVisibility.test.ts
  ?? src/app/t/[tenantId]/lib/parsers/tsushoRegistry.test.ts
  ?? PHASE1B_B3_IMPLEMENTATION_REPORT.md（本報告書）
  ```
  - `node_modules` は共有チェックアウトへのシンボリックリンク（Git の無視対象）。
- 共有チェックアウト（`paperlesscare-web/`）は main `db9982a5` のまま、無変更。

## 27. commit / push / deploy をしていないこと

commit・push・deploy はしていない。main は変更していない。ユーザーのレビュー待ち。

## 28. Production へ接続していないこと

- Firebase・Vercel・Production の Firestore / Storage / Functions には接続していない。
- 実行したのは、ローカルの tsc・単体テスト・ESLint・`next build` と、エミュレーター（`demo-paperlesscare`）での Rules テストだけ。
