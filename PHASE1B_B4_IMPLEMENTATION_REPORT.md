# PaperlessCare Phase 1-B4 実装報告書 ― 受給者証のページ数を種別ごとにする（tsusho = 7ページ）

- 作成日：2026-10-03
- 状態：**実装・ローカル検証まで完了**。未コミット・未push・未デプロイ（レビュー待ち）。Production には接続していない
- 作業場所：git worktree `paperlesscare-web/.claude/worktrees/phase1b3-tsusho-hidden/`（branch `feat/phase1b4-cert-page-count`）
  - 本報告書もこの worktree の直下にある。

---

## 1. 実装概要

固定のページ数 `PAGE_COUNT = 8` に依存していた取込・表示の処理を、種別ごとのページ数 `getPageCount(certType)` に置き換えた。

| 種別 | ページ数 |
|---|---|
| mobility / adult / child | 8 |
| tsusho | 7 |
| 種別が無い・未知の旧データ | 8（従来互換） |

あわせて、次を入れた。

- tsusho の範囲外ページ（8ページ目等）で adult のレイアウトを表示しないようにした。
- 様式の系統が変わる種別の切り替え（8ページの種別 ⇔ tsusho）では、ブラウザ上の未保存の取込内容を作り直すようにした。

tsusho は引き続き非公開で、管理Web・LINE のどちらにも表示されない。保存・期限・profile の処理には触れていない。

## 2. branch

`feat/phase1b4-cert-page-count`（Phase 1-B3 の branch は変更していない）

## 3. 開始 commit

`ffb1ea21` ― feat: integrate tsusho certificate type as hidden (Phase 1-B3)。開始時の作業ツリーはクリーン。

## 4. PAGE_COUNT の参照の調査結果

| 場所 | 参照 | 対応 |
|---|---|---|
| `CertImportFlow.tsx` | 開始ページの clamp ×2、ページ配列の初期化、ステータス文言 ×4、空ページでのリセット ×3、取込済みの件数 ×2（取込状況・保存欄）、進捗バー、現在ページの表示、次へボタン ×2（**計16か所**。import を除く） | すべて `pageCount` / `initialPageCount` / `createEmptyPages(selectedCertType)` に置き換え |
| `LineCertImportView.tsx` | 最終ページの判定、撮影済みの件数、ページ表示（3か所） | `getPageCount(certType)` |
| `CertificatesPanel.tsx` | `padPages`、ページ表示（2か所） | `padPagesForCertType` / `getPageCount(selectedCertificate.certType)` |
| `certPages.ts` | 定義 | 種別が不明なときの既定値（8）として残した（コメントで明記） |
| テスト（`certLayoutVariant` / `certLayoutMap` / `fallbackSafety` / `certTypeVisibility` / `isolation`） | 8ページの種別のループ・範囲外の値 | `certLayoutVariant` の範囲外テスト1件と isolation を意図的に更新（16章）。それ以外は adult 等の8ページを意味するため、そのまま |

**更新後**：アプリの画面コードで `PAGE_COUNT` を参照しているのは `certPages.ts`（定義と fallback）だけ。テストで固定した。

## 5. 暗黙の8ページ固定の調査

| 場所 | 内容 | 対応 |
|---|---|---|
| `CertImportFlow.tsx` | 「`{activePageIndex + 1}/8`」の固定表示 ×4（ページ見出し・画像・サムネイル・結果） | `/{pageCount}` に変更 |
| `PageTabs.tsx` | 「下段（5〜8ページ）」と `pages.slice(4, 8)` | 「下段（5〜{pages.length}ページ）」と `pages.slice(4)` に変更（8ページなら表示は同じ） |
| `functions/src/index.ts` | ログに出す `pageNo` の範囲チェック（1〜8） | 対象外（変更禁止。tsusho は7ページ以内なので影響なし） |
| `importImageStore.ts` | コメントの「×8ページ」 | 対象外（コメント。処理は pageIndex をキーにしており、ページ数に依存しない） |
| その他の「8」 | 数値計算・CSS 等 | 受給者証のページ数ではないため対象外 |

## 6. getPageCount の設計（`constants/certPages.ts`）

```ts
getPageCount(certType)  // = PAGE_DEFINITIONS_BY_CERT_TYPE[certType].length。無い・未知なら PAGE_COUNT（8）
isValidPageIndex(certType, pageIndex)
createEmptyPages(certType)                       // その種別のページ数の空ページ
shouldResetPagesOnCertTypeChange(from, to)       // 様式の系統が変わるか
pagesAfterCertTypeChange(pages, from, to)        // 切り替え後の取込ページ
padPagesForCertType(pages, certType, makeEmpty)  // 保存済みの証を種別のページ数にそろえる
```

- **ページ定義の件数を正本**にした。「7」「8」を別に持たない。
- Phase 1-B1 の `TSUSHO_PAGE_COUNT`（7）とも一致することをテストで固定した。
- 未知の文字列（`"constructor"` 等）で prototype のプロパティを拾わないよう、自分自身のキーだけを見る。

## 7. CertImportFlow の変更

- **初期化**：
  - 復元した取込の種別（無ければ adult）から `initialCertType` / `initialPageCount` を求める。
  - URL の `page` と復元したページ番号は、その範囲に clamp する。
  - ページ配列は `createEmptyPages(initialCertType)` で作る。復元した取込にそれより多いページがあっても読み込まない。
- **表示・移動**：`pageCount = getPageCount(selectedCertType)` で、ステータス文言・取込済みの件数・進捗バー・各ページ表示・次へボタン（上限と無効化）を切り替える。
- **リセット**：保存後・新規開始・「取込状況をリセット」の3か所を `createEmptyPages(selectedCertType)` にした。
- **保存**：保存処理（`handleSaveBeneficiary`）は無変更。取込のページ配列が種別のページ数になったので、保存するのは adult / child なら従来どおり8ページ、tsusho なら7ページになる。
- **OCR**：処理（`performOcr`）は無変更。有効なページ番号でしか呼ばれない。

## 8. 種別を切り替えたときの state の扱い

`changeCertType(next)`（管理Web・LINE の種別選択の両方から呼ぶ）：

- **様式の系統が変わる場合だけ**（`shouldResetPagesOnCertTypeChange`：8ページの種別 ⇔ tsusho）、ブラウザ上の未保存の取込内容を破棄し、新しい種別のページ数で作り直す。
  - 対象：画像（blob URL を解放し、IndexedDB の一時保存を `clearPageImages` で削除）、OCR結果、入力、ページ位置、ステータス、OCR のエラー表示、ファイル入力。
  - 取込済みの内容がある場合は、`window.confirm` で確認してから破棄する。
  - **Firestore / Storage の保存済みデータには触れない。**
- **adult ⇔ child の切り替えは、従来どおり取込内容を保持する**（ページ構成もキーの意味も同じため。本番の挙動を変えない判断）。
- **既存利用者を読み込んだときの種別の初期選択**（単なる初期化）では、データを消さない。
  - 系統が変わる場合は切り替えない（`setSelectedCertType((current) => …)`）。
  - adult / child では従来と同じ結果になる。
- 現時点では、tsusho は管理Web・LINE から選べないため、作り直しが発生する切り替えは画面からは起きない。1-B6 で tsusho を有効化したときのための安全策。

## 9. LINE の変更

`LineCertImportView.tsx`：最終ページの判定・撮影済みの件数・ページ表示を `getPageCount(certType)` にした（3か所）。

- LINE の種別選択（adult / child のみ）と、新規登録・既存利用者の更新・保存・完了画面・利用者検索は変更していない。
- 種別を変えたときは `changeCertType` を通るが、adult ⇔ child なので従来どおり。

## 10. CertificatesPanel の変更

- `padPages` を `padPagesForCertType(pages, certType, …)` にした。保存済みの証を、その証の `certType` のページ数にそろえる。
  - adult / child / mobility は8ページ。
  - tsusho は7ページ。
  - 種別が無い・未知なら8ページ。
- 「n/8」の表示を `getPageCount(selectedCertificate.certType)` にした。
- 足りないページを空ページで補う処理（タイトルの決め方を含む）は従来と同じ。
- 8ページ全部ある adult の証は、同じページ配列をそのまま返す（テストで固定）。

## 11. 範囲外のレイアウトへの対応

- `getCertLayoutId` に、種別ごとの範囲外レイアウト `OUT_OF_RANGE_LAYOUT_ID` を追加した。
  - mobility / adult / child：従来どおり `userBurden`。
  - **tsusho：`unavailablePage`**。新設したレイアウトで、「このページはありません」と表示するだけ。入力欄は無い。
- 未知の種別は従来どおり adult の定義と `userBurden`。
- 通常の画面操作では、tsusho の8ページ目には到達しない（ページ配列・次へボタン・clamp がすべて7ページ）。万一範囲外の番号が渡っても、adult の帳票は表示されない。

## 12. parser への影響

- 登録は Phase 1-B3 のまま（tsusho は一〜五面に parser あり、六・七面と8ページ目は parser なし。adult は一〜四面、child / mobility は空）。
- OCR は取込中のページ番号でしか呼ばれず、tsusho のページ番号は0〜6のため、8ページ目の parser を探しに行くことはない。

## 13. 保存処理への影響

- `handleSaveBeneficiary`、`createBeneficiaryWithCertificate` / `addCertificateToBeneficiary` / `updateCertificatePages` は変更していない。
- 保存されるページ配列の長さは、取込中の種別のページ数になる。
  - adult / child は従来どおり8。
  - tsusho は7（画面からはまだ保存できない）。
- `certificateModel`（期限・summary）、`beneficiaries`（personal・profile・`currentCertificateId`）は無変更。

## 14. 既存データの fallback

- 種別が無い・未知の証は8ページとして表示する（`getPageCount` / `padPagesForCertType` / `getPageDefinitions`）。
- データの移行は行っていない。Firestore の既存データにも触れていない。

## 15. 変更ファイル（変更9・新規1）

| ファイル | 内容 |
|---|---|
| `constants/certPages.ts` | `getPageCount` / `isValidPageIndex` / `createEmptyPages` / `shouldResetPagesOnCertTypeChange` / `pagesAfterCertTypeChange` / `padPagesForCertType` を追加。`PAGE_COUNT` のコメント |
| `constants/certLayoutMap.ts` | `unavailablePage` と、種別ごとの範囲外レイアウト |
| `components/certLayouts.tsx` | `UnavailablePageLayout` の追加と登録 |
| `components/PageTabs.tsx` | 下段の見出しと slice をページ数に追従させた |
| `CertImportFlow.tsx` | 7・8章 |
| `line/import/LineCertImportView.tsx` | 9章 |
| `beneficiaries/[beneficiaryId]/chart/CertificatesPanel.tsx` | 10章 |
| `constants/certLayoutVariant.test.ts` | 範囲外のテスト1件を**意図的に更新**（tsusho は `unavailablePage`、それ以外は `userBurden` のまま） |
| `src/lib/tsusho/isolation.test.ts` | B4 の境界へ**意図的に更新**（16章） |
| `constants/certPageCount.test.ts`（新規） | 16章 |

`git diff --stat`：既存9ファイル、+234 / −57。

## 16. 新規・更新したテスト

| ファイル | 件数 | 内容 |
|---|---|---|
| `certPageCount.test.ts`（新規） | 16 | A：getPageCount（8・8・8・7）、定義の件数が正本、未知・null・prototype 名は8。B：adult / child / mobility は8ページ。C：tsusho は index 0〜6 だけ有効、adult は0〜7。D：tsusho の一〜七面のレイアウト、範囲外は `unavailablePage`（`userBurden` ではない）、adult / child は従来どおり。E：parser は一〜五面のみ、六・七面と8ページ目は無し。H：系統が変わるときだけ作り直す。8→7で8ページ目と前の氏名が残らない、7→8で8ページの新しい状態、児童名・保護者名を引き継がない、adult⇔child は保持。I：保存済みの証は種別のページ数にそろえる、種別不明は8、8ページそろった adult の証は不変 |
| `isolation.test.ts`（更新） | 7 → 8 | 「PAGE_COUNT は 8 のまま」を「ページ数は種別ごと（tsusho = 7、それ以外 = 8）、PAGE_COUNT は既定値8」に更新。さらに「取込・LINE・受給者証タブの画面コードは PAGE_COUNT を使わない」を追加 |
| `certLayoutVariant.test.ts`（更新） | 1件の期待値 | 範囲外は tsusho が `unavailablePage`、mobility / adult / child は `userBurden` |

- テストを削除・弱くしたものはない。
- Phase 1-B3 の `certTypeVisibility.test.ts`・`tsushoRegistry.test.ts` は無変更で成功。

## 17. 全テストの結果

`npm test`：**224/224 成功**（207 → 224。新規16件、isolation +1件）

`node --experimental-strip-types --test "src/lib/tsusho/**/*.test.ts"`：**78/78 成功**（Phase 1-B2 の70件は無変更で成功）

## 18. TypeScript

`npx tsc --noEmit -p .`：**成功（エラー0）**

## 19. Rules

`npm run test:rules`（エミュレーター）：**10/10 成功**

## 20. ESLint

変更したファイル群（`src/lib/tsusho`、`constants/`、`components/`、`lib/parsers/`、`CertImportFlow.tsx`、`CertificatesPanel.tsx`、`LineCertImportView.tsx`）で**エラー0**。

警告4件はすべて変更前からあるもの：
- `<img>` ×2（CertImportFlow・PageTabs）
- `certLayouts.tsx` の未使用の `pageTitle` ×2

今回の変更で増えた警告は無い。

## 21. Build

`npx next build`：**成功**

- 前回と同じく、共有チェックアウトの `.env.local` に一時的にシンボリックリンクを張って実行し、実行後に削除した。
- Production には接続していない。

## 22. adult / child の回帰

テストで次を確認した。

- ページ数は8、ページ定義は従来と同じオブジェクト、有効なページ番号は0〜7。
- レイアウトは8ページとも従来どおりで、範囲外は `userBurden`（既存の `certLayoutMap` / `certLayoutVariant` テストも成功）。
- parser の登録は adult が一〜四面、child は空のまま。
- adult ⇔ child の切り替えでは取込内容を保持する（従来の挙動）。
- 保存済みの8ページの証は、そのまま表示される。
- 管理Webの種別選択は従来の3種類、LINE は adult / child（B3 のテスト）。

保存直前のページ配列は、取込中の種別のページ数（adult / child = 8）。`createEmptyPages` / `getPageCount` のテストで確認した。

**画面の手動操作による E2E（エミュレーター）は今回実施していない**（26章）。

## 23. Phase 1-B3 の非公開状態の維持

tsusho の `enabled` / `lineEnabled` / `adminVisible` はすべて false のまま。管理Web（mobility / adult / child）・LINE（adult / child）とも表示は変わっていない。B3 のテストで確認済み。

## 24. Production Core への影響

| Production Core | 影響 |
|---|---|
| 取込・OCR（管理Web・LINE） | adult / child / mobility は8ページのまま。表示の「n/8」は、8ページの種別では同じ表示になる |
| 新規登録・既存利用者の更新・保存 | 保存処理は無変更。保存されるページ数も8のまま |
| 種別の切り替え | adult ⇔ child は従来どおり保持。系統が変わる切り替えは、現時点では画面から起きない |
| 受給者証タブ（表示・訂正・履歴） | adult / child / mobility と種別不明の証は8ページで表示（従来どおり） |
| ページタブ | 8ページの種別は表示が同じ（下段「5〜8ページ」） |

## 25. 変更していない重要ファイル

`ffb1ea21` 比の `git diff` で差分0を確認した。

- `lib/firestore/certificateModel.ts`
- `lib/firestore/beneficiaries.ts`
- `firestore.rules`、`storage.rules`
- `functions/`
- `package.json`、`package-lock.json`
- LINE の利用者一覧・詳細・完了画面・検索

`CertImportFlow` の保存処理・OCR処理と、parser の登録も無変更。

## 26. 次の Phase 1-B5 への注意事項

1. **期限**：`certificateModel.buildCertificateContent` に tsusho の分岐を入れる（`extractTsushoValidity`）。isolation テストの「certificateModel に tsusho なし」を意図的に更新する必要がある。
2. **profile 保護**：`beneficiaries.addCertificateToBeneficiary` に「tsusho かつ personal がある場合は profile を上書きしない」を入れる。高リスク。isolation テストの更新が必要。
3. **E2E**：今回はページ数に関する画面操作の E2E（エミュレーター）を行っていない。1-B5 の前か、遅くとも 1-B6（有効化）の前に、adult / child の新規・更新・訂正と、tsusho の7ページの取込を手動で確認することを推奨する。
4. **サンプル画像**：tsusho を画面に出す 1-B6 までに、個人情報を含まない `/cert-samples/tsusho/page-1〜7.png` が必要（PageTabs・LINE が参照する）。
5. **実物の OCR 検証**：有効化の前に必須（未検証のまま）。

## 27. Git 状態

- 場所：`paperlesscare-web/.claude/worktrees/phase1b3-tsusho-hidden/`
- branch：`feat/phase1b4-cert-page-count`（HEAD `ffb1ea21`、**未コミット**）
- `git status --short`：
  ```
   M src/app/line/import/LineCertImportView.tsx
   M src/app/t/[tenantId]/CertImportFlow.tsx
   M src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificatesPanel.tsx
   M src/app/t/[tenantId]/components/PageTabs.tsx
   M src/app/t/[tenantId]/components/certLayouts.tsx
   M src/app/t/[tenantId]/constants/certLayoutMap.ts
   M src/app/t/[tenantId]/constants/certLayoutVariant.test.ts
   M src/app/t/[tenantId]/constants/certPages.ts
   M src/lib/tsusho/isolation.test.ts
  ?? src/app/t/[tenantId]/constants/certPageCount.test.ts
  ?? PHASE1B_B4_IMPLEMENTATION_REPORT.md（本報告書）
  ```

## 28. commit / push / deploy なし

commit・push・deploy はしていない。`feat/phase1b3-tsusho-hidden-integration`（`ffb1ea21`）と main（`db9982a5`）は変更していない。

## 29. Production 接続なし

- Firebase・Vercel・Production の Firestore / Storage / Functions には接続していない。
- 実行したのは、ローカルの tsc・単体テスト・ESLint・`next build` と、エミュレーターでの Rules テストだけ。
