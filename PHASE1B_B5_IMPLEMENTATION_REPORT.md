# PaperlessCare Phase 1-B5 実装報告書 ― 通所受給者証（tsusho）の保存対応（代表期間・profile 保護・新規カルテ初期値）

- 作成日：2026-10-03
- branch：`feat/phase1b5-tsusho-save-validity`（開始 commit `d09cdc29`）
- 状態：**未 commit・未 push・未 deploy（レビュー待ちで停止）**
- tsusho：**非公開のまま**（enabled / lineEnabled / adminVisible = false）
- 最終判定：**C**（コードは完成・検証済み。ただし実物の通所受給者証 OCR が未確認のため、B6 公開可とは判定しない）

---

## 1. 実装概要

通所受給者証（tsusho）を「保存したときに正しく扱える」ようにした。画面は非公開のまま。

| 項目 | 内容 |
|---|---|
| 代表期間 | tsusho の証の validFrom / validTo を、Phase 1-B1 の `extractTsushoValidity`（放課後等デイサービス優先）で求める。期間ロジックは重複実装しない |
| 既存利用者への追加 | personal（カルテ）がある利用者は **profile / personal / guardian を一切更新しない**。OCR の値は証（certificates）にだけ残る |
| personal の無い旧データ | profile は従来値を優先し、空欄の項目だけ証の値で補う（表示名を変えない・消さない） |
| 新規利用者 | personal（児童）・guardian（通所給付決定保護者：氏名・フリガナ・居住地）を初期化。guardianBirthday・郵便番号は作らない |
| adult / child / mobility | 保存の挙動は従来と完全に同じ（期間・profile・カルテとも） |
| 構造 | currentCertificateId は単一のまま。履歴（superseded / supersededBy）も従来どおり |

## 2. branch

`feat/phase1b5-tsusho-save-validity`（B4 の `feat/phase1b4-cert-page-count` からの新 branch。B4 branch は変更していない：`d09cdc29` のまま）

## 3. 開始 commit

`d09cdc29 docs: add Phase 1-B4 UI regression report`

## 4. 代表期間の設計

`certificateModel.ts` の `buildCertificateContent` で、期間の求め方だけを種別で分けた。

```ts
...(input.certType === "tsusho"
  ? extractTsushoCertificateValidity(input.pages)   // ← B1 の extractTsushoValidity を呼ぶだけ
  : extractValidity(input.pages)),                  // ← adult / child / mobility は従来どおり
```

`extractTsushoCertificateValidity` は `extractTsushoValidity(pages)` の結果から `{ validFrom, validTo }` を取り出すだけの薄い関数。二・三面のキー（servicePeriod2〜4 等）やサービス名（放課後等デイサービス）を certificateModel 側では一切扱わない（isolation test で固定）。

## 5. 代表期間の規則（B1 の規則をそのまま使用）

1. 二・三面の給付決定の行のうち、**放課後等デイサービス**の行があれば、その中で終了日が最も遅い行
2. 放デイが無ければ、全サービスの中で終了日が最も遅い行
3. **利用者負担（五面）・相談支援（四面）の期間は使わない**
4. 読めなければ両方 null（一覧では「期限未入力」）

## 6. 代表期間のテストケース A〜G

| ケース | 内容 | 結果 |
|---|---|---|
| A | 放デイ1件 | その期間 ✅ |
| B | 放デイ＋終了日が遅い他サービス | 放デイを採用 ✅ |
| C | 放デイが複数（旧期間＋新期間、三面にも放デイ） | 終了日が最も遅い放デイ ✅ |
| D | 放デイなし | 全サービスで終了日が最も遅い期間 ✅ |
| E | 利用者負担の期間だけ | null ✅ |
| F | 相談支援の期間だけ | null ✅ |
| G | 期間なし・読めない・pages 空 | null ✅ |
| 追加 | 1行目が他サービス・2行目が放デイ | adult 規則なら1行目、tsusho は放デイ ✅ |

## 7. summary / issueDate

tsusho の一面は `name` が児童本人のため、従来の `buildSummary`（一面の name / furigana / number / birthday / cityName）と `issueDate` の組み立てで正しい値になる。変更なし。保護者の値（guardianName 等）は summary に入らず、証の pages にだけ残る（テストで固定）。

## 8. 既存利用者へ tsusho を追加したときの profile 保護

`resolveProfileOnCertificateAdd`（certificateModel.ts）に集約し、beneficiaries.ts はこれを呼ぶだけにした。

| 種別 | personal あり | personal なし（旧データ） |
|---|---|---|
| mobility / adult / child | 従来どおり `mergeProfile`（証の値を優先） | 同左 |
| tsusho | **null（profile を更新しない）** | 従来値を優先し、空欄だけ証の値で補う |

`addCertificateToBeneficiary` は `...(profile ? { profile } : {})` で update する。**personal / guardian / contract / school / consultationSupport には種別を問わず書き込まない**（従来から書いていない。今回も書かない）。

## 9. personal の有無の判定

`hasChartPersonal(raw)`：利用者 doc の `personal` がオブジェクト（配列・null・文字列は除く）なら true。中身が空欄でも「カルテがある」とみなす（スタッフがカルテを作った利用者を OCR で変えないため）。

## 10. 旧データ（personal なし）の表示名

profile は「従来値優先・空欄だけ補う」ため、既存の表示名は変わらず、OCR の氏名が空でも消えない（テスト2件＋E2E b-expired で確認）。

## 11. 新規 tsusho 利用者のカルテ初期化

新規ファイル `src/lib/tsusho/initialChart.ts`（純粋関数）。

| 保存先 | 値 | 備考 |
|---|---|---|
| personal.name / furigana | 一面の児童の氏名・フリガナ | |
| personal.birthDate | 一面の生年月日を ISO に変換 | 変換できなければ "" |
| personal.address / postalCode / phone | "" | 居住地は保護者の欄のため personal には入れない。郵便番号は証に無いため生成しない |
| guardian.name / furigana / address | 通所給付決定保護者の氏名・フリガナ・居住地 | |
| guardian の他項目 | EMPTY_GUARDIAN の既定値 | 続柄・電話等は証に無い |
| guardianBirthday | **保存先を作らない** | カルテに受け皿が無い。証の pages にだけ残る |

作らない場合：
- 児童の氏名が読めていない → personal を作らない（空の personal が profile / summary へのフォールバック表示を妨げるため）
- 保護者欄と児童欄が同一人物（18歳以上の通所者：氏名・生年月日が一致）→ guardian を作らない

`createBeneficiaryWithCertificate` は `...initialChartForNewBeneficiary(certType, pages)` を利用者 doc に展開する。tsusho 以外は `{}` のため従来と同じ。

## 12. profile（新規 tsusho）

新規は従来どおり `profileFromSummary(summary)`。summary.name は児童のため、profile も児童になる（personal と一致）。

## 13. currentCertificateId と履歴

変更なし。単一の `currentCertificateId`。種別の違う証（child → tsusho）を追加した場合も、新しい証が current、それまでの証は `superseded` + `supersededBy` になる。利用者 doc の `certType` は新しい証の種別（tsusho）になる。`currentCertificateIds` 等は導入していない（isolation test で固定）。

## 14. parser への影響

なし。B2/B3 の parser（`src/lib/tsusho/parsers/`・`parseCertText.ts`）は変更していない。

## 15. candidates（OCR → カルテ反映候補）

接続していない（Phase 1-B7）。アプリのコードから `lib/tsusho/candidates` を import していないことを isolation test で固定。

## 16. 非公開状態の維持

`CERT_TYPES` の tsusho は `enabled: false / lineEnabled: false / adminVisible: false` のまま（certPages.ts は未変更）。E2E でも管理Web の種別選択・LINE の色選択に tsusho が出ないことを確認。

## 17. 変更ファイル（変更3・新規3）

| 区分 | ファイル | 内容 |
|---|---|---|
| 変更 | `src/app/t/[tenantId]/lib/firestore/certificateModel.ts` | `extractTsushoCertificateValidity`・期間の種別分岐・`resolveProfileOnCertificateAdd`・`hasChartPersonal` |
| 変更 | `src/app/t/[tenantId]/lib/firestore/beneficiaries.ts` | 新規時のカルテ初期値・追加時の profile 判定（mergeProfile の直接呼び出しを置換） |
| 変更 | `src/lib/tsusho/isolation.test.ts` | B5 の接続境界へ意図的に更新 |
| 新規 | `src/lib/tsusho/initialChart.ts` | 新規 tsusho 利用者のカルテ初期値 |
| 新規 | `src/lib/tsusho/initialChart.test.ts` | 8件 |
| 新規 | `src/app/t/[tenantId]/lib/firestore/tsushoSaveModel.test.ts` | 15件 |
| 新規 | `PHASE1B_B5_IMPLEMENTATION_REPORT.md` | 本報告書 |

## 18. 新規・更新したテスト

- `tsushoSaveModel.test.ts`（15件）：代表期間 A〜G・adult 規則を使わないこと・summary（児童・番号・市町村・交付日、保護者は pages に残る）・adult / child の期間互換・profile 規則（adult/child/mobility は mergeProfile と同値、tsusho+personal は null、旧データは補完のみ、OCR 空でも消えない）・hasChartPersonal
- `initialChart.test.ts`（8件）：personal＝児童・guardian＝保護者・居住地を personal に入れない・guardianBirthday を作らない・児童名なしなら personal なし・同一人物なら guardian なし・生年月日が不正なら ""・他種別は `{}`
- `isolation.test.ts`（更新）：import してよいファイルを4つに更新、candidates 未使用、certificateModel が期間を重複実装していない、beneficiaries が mergeProfile を直接呼ばない

## 19. 全テストの結果

`npm test`：**248 件 pass / 0 fail**

## 20. TypeScript

`npx tsc --noEmit -p .`：エラーなし

## 21. Rules

`npm run test:rules`：**10 件 pass / 0 fail**（rules は未変更）

## 22. ESLint

変更・新規の6ファイルに対して `npx eslint`：エラー・警告なし

## 23. Build

`npx next build`：成功（.env.local は共有 checkout へ一時 symlink し、build 後に削除済み）。警告は worktree 由来の既存の「workspace root の推定」のみ。

## 24. 保存を伴う E2E（Emulator のみ）

環境：Firebase Emulator（demo-paperlesscare、auth / firestore / storage / functions）＋ Next dev（localhost:3100）。OCR は Vision に届かないよう認証情報を無効化（OCR は失敗 → 手入力）。LINE はモック LIFF ＋ローカルの偽 verify サーバー。**Production には一切接続していない。** 結果は Firestore Emulator の REST で読み出して確認。

### 管理Web

| # | ケース | 結果 |
|---|---|---|
| 1 | adult 新規 | profile / summary＝一面の氏名、personal なし、currentCertificateId＝新しい証（current・8ページ・Storage page1.jpg）、期間 null ✅ |
| 2 | child 新規 | summary / profile＝支給決定障害者等の氏名（従来どおり）、personal なし ✅ |
| 3 | 既存 child 更新（b-current） | 新しい証が current、count 3、旧証は superseded＋supersededBy の連鎖、profile は従来どおり証の値で更新、guardian 不変 ✅ |
| 4 | 受給者証タブでの修正保存 | 証と summary.number が更新、profile 不変 ✅ |
| 5 | adult 追加（personal あり、架空データを付与） | profile / summary は従来どおり証の値（E2E 成人 次郎）へ更新、**personal は不変**（E2E 成人 太郎）、旧証 superseded ✅ |

### LINE

| # | ケース | 結果 |
|---|---|---|
| 7 | adult 新規 | profile / summary＝入力値、certType adult、current 1件・8ページ・Storage あり、カルテ初期化なし ✅ |
| 8 | child 新規 | 同上（certType child）✅ |
| 9 | 既存更新（b-unknown、氏名は空・番号のみ入力） | 新しい証が current、旧証 superseded、count 2、profile / summary の氏名は従来値（高橋 結衣）を維持、summary.number は更新 ✅ |

LINE の色選択は 紫・黄緑 の2つだけ（tsusho は出ない）。

### tsusho（UI は非公開のため、取込セッションを sessionStorage へ注入し、管理Webの通常の保存処理で保存）

架空の一面（児童 架空 勇気／保護者 架空 太郎）、二面（保育所等訪問支援 R8.4.1〜R10.3.31・放デイ R7.4.1〜R8.3.31）、三面（放デイ R8.4.1〜R9.3.31）、四面（相談支援 R8.4.1〜R11.3.31）、五面（負担 R8.4.1〜R12.3.31）を注入し、七面に画像を1枚登録して保存。

| # | ケース | 結果 |
|---|---|---|
| 10 | 新規 tsusho | certType tsusho、current 1件・**7ページ**・Storage page7.jpg。personal＝児童（架空 勇気・カクウ ユーキ・2016-05-10、住所・郵便番号は空）、guardian＝保護者（架空 太郎・カクウ タロウ・居住地）、guardianBirthday の保存先なし、profile / summary＝児童 ✅ |
| 11 | 既存利用者（b-valid、personal あり）へ追加 | **personal / profile / guardian は保存前のスナップショットと完全一致**（鈴木 大翔／鈴木 保護者）。旧 child 証は superseded＋supersededBy、新 tsusho 証が current、count 2、利用者 certType＝tsusho ✅ |
| 12 | profile 保護（画面） | 利用者一覧・カルテとも 鈴木 大翔 のまま、保護者情報も不変 ✅ |
| 13 | validity | 3件とも validFrom 2026-04-01 / validTo 2027-03-31（最も遅い放デイ）。保育所等訪問（2028）・相談支援（2029）・負担（2030）は採用されていない。カルテの「現在の受給者証の有効期間」・一覧の有効期限にも反映 ✅ |
| 補足 | 旧データ（b-expired、personal なし）へ追加 | profile は 山田 花子 のまま、personal / guardian は作られない、旧証 superseded ✅ |

## 25. レビューで判断してほしい点（利用者 doc の summary）

既存利用者へ tsusho を追加すると、利用者 doc の **summary**（現在の証の代表値：氏名・番号・市町村 等）は従来どおり `mergeSummary` で新しい証の値になる（E2E 11 / 補足で summary.name＝架空 勇気）。

- **表示への影響なし**：画面の氏名表示はすべて personal → profile → summary の順で、summary はフォールバックのみ（一覧・カルテ・LINE とも 鈴木 大翔 を確認）
- **検索への影響あり**：LINE の利用者検索とカルテ一覧の検索は summary.name も対象のため、証の氏名（架空 勇気）でも b-valid がヒットする
- summary は「現在の証の写し」（受給者証番号・市町村は一覧・検索に必要）であるため、今回は既存の挙動を変えていない。証とカルテで氏名が違う状態の扱い（警告表示・候補化）は Phase 1-B7 の「候補 → 確認 → 反映」で扱うのが妥当と考える

## 26. adult / child の回帰

- 期間：adult / child は `extractValidity`（二面1行目 → 七面の負担期間）のまま（テストで同値を固定）
- profile：adult / child / mobility は personal の有無に関係なく `mergeProfile` と同値（テストで固定、E2E 3・5・9 で実保存も確認）
- 新規保存でカルテ（personal / guardian）を作らない（テスト＋E2E 1・2・7・8）

## 27. 変更していない重要ファイル

`firestore.rules`・`storage.rules`・`functions/`・`package.json`・`package-lock.json`・`src/lib/tsusho/parsers/`・`src/app/t/[tenantId]/lib/parsers/`・`src/app/t/[tenantId]/constants/certPages.ts`・`CertImportFlow.tsx`・`src/app/line/` 配下（UI 変更なし）。`git diff --name-only d09cdc29` でこれらに差分が無いことを確認。新しい依存関係の追加なし。

## 28. 差分監査

- 差分は 17 の6ファイル＋本報告書のみ
- 秘密情報・API キー・Production 固有の設定値の混入なし（diff を走査）
- バイナリ・画像・実在の個人情報なし（テストデータはすべて架空）
- E2E 用の一時ファイル（functions/node_modules の symlink、functions/.env.local、functions/lib、セッション生成スクリプト、.env.local の symlink）はすべて削除済み
- `firestore-debug.log` は gitignore 対象（commit 対象外）

## 29. Git 状態

```
branch: feat/phase1b5-tsusho-save-validity（HEAD = d09cdc29）
 M src/app/t/[tenantId]/lib/firestore/beneficiaries.ts
 M src/app/t/[tenantId]/lib/firestore/certificateModel.ts
 M src/lib/tsusho/isolation.test.ts
?? src/app/t/[tenantId]/lib/firestore/tsushoSaveModel.test.ts
?? src/lib/tsusho/initialChart.test.ts
?? src/lib/tsusho/initialChart.ts
?? PHASE1B_B5_IMPLEMENTATION_REPORT.md
```

## 30. commit / push / deploy / Production 接続

- commit：していない
- push：していない
- deploy：していない
- Production：接続していない（Emulator・ローカルのみ）

## 31. 最終判定と B6 への注意事項

**判定：C** ― B5 のコードは完成し、単体テスト・E2E とも期待どおり。ただし **実物の通所受給者証の OCR をまだ確認していない**ため、B6（公開）可とは判定しない。

B6 の前に必要なこと：
1. 実物（または自治体の実様式）の通所受給者証で OCR を行い、一面の児童／保護者の振り分け・二・三面のサービス名と給付決定期間の読み取り精度を確認する（代表期間は二・三面の読み取りに依存する）
2. 25 の summary（検索ヒット）の扱いを決める
3. 公開時は `enabled / lineEnabled / adminVisible` を変更し、isolation test の「非公開」部分を意図的に更新する
4. OCR → カルテ反映（candidates）は Phase 1-B7 まで接続しない
