# PaperlessCare Phase 1-B6 実装報告書 ― 管理Webで「通所受給者証」を有効化する

- 作成日：2026-10-03
- 状態：**未 commit・未 push・未 deploy（レビュー待ちで停止）**
- 公開範囲：**管理Webのみ**（LINE は非公開のまま）
- 最終判定：**C**（B6 のコードは完成・検証済み。ただし実物の通所受給者証 OCR が未検証のため Production deploy は保留）

---

## 1. 実装概要

B3〜B5 で準備した tsusho（通所受給者証）を、管理Webの受給者証取込画面から選択・取込・保存できるようにした。再実装はせず、次だけを行った。

| 変更 | 内容 |
|---|---|
| 公開設定 | `CERT_TYPES` の tsusho を `enabled = true / adminVisible = true`（`lineEnabled = false` のまま）、`statusLabel` の「準備中」を空に |
| 見本画像 404 対策 | 見本画像の無い種別（tsusho）は画像を参照せず「見本画像なし」を表示（`getSampleImagePath`） |
| 表示の整え | tsusho のテーマ色（`cert-type-tsusho`）を追加。色名＝名称の tsusho で「通所受給者証」を2回表示しない |
| 公開に伴う表示不具合の修正 | 受給者証タブ「主な内容」の利用者負担・サービスを、tsusho は五面・二〜三面から読む（従来は8ページ様式の7・8ページ固定で「未取得」になっていた） |
| 更新時の初期証種（レビュー指摘で追加） | 管理Webで既存利用者の「受給者証を更新」を開くと、現在の受給者証の種別を初期選択（tsusho なら7ページ）。新規は adult、種別なし・未知・取得不可は adult。取込セッションの復元を優先。LINE は従来どおり |
| テスト | B6 用テスト 26 件を新規追加（公開範囲 16 件＋初期証種 10 件）、B3 の「非公開」固定テストを意図的に更新 |

## 2. branch / start commit

- branch：`feat/phase1b6-enable-tsusho-admin`
- start commit：`bb976f5c`（Phase 1-B5）
- 開始前：`git status --short` は空（clean）、branch `feat/phase1b5-tsusho-save-validity`、`git log -5`：bb976f5c → d09cdc29 → 8377b0b6 → ffb1ea21 → db9982a5（origin/main）

## 3. 管理Web公開設定

`src/app/t/[tenantId]/constants/certPages.ts`

```ts
{
  id: "tsusho",
  label: "通所受給者証",          // 既存の定義のまま
  shortLabel: "通所受給者証",     // 既存の定義のまま
  colorName: "通所受給者証",      // 既存の定義のまま（用紙の色は公式に定めが無いため名称）
  themeClass: "cert-type-tsusho", // "" → 追加（進捗バー等が無色にならないよう）
  enabled: true,                  // false → true
  lineEnabled: false,             // 変更なし
  adminVisible: true,             // false → true
  statusLabel: "",                // "準備中" → ""（選択可能な種別にバッジを出さない既存の規則に合わせる）
}
```

表示名は既存の定数（「通所受給者証」）をそのまま使い、別名称は作っていない。

## 4. LINE非公開設定

- `lineEnabled = false` のまま。LINE の取込画面は `lineCertTypeOptions()`（enabled かつ lineEnabled）を通すため tsusho は出ない
- LINE の UI・保存処理は一切変更していない（`src/app/line` の差分なし）

## 5. 証種別表示

管理Webの「①受給者証の種類を選択してください」は次の4種類（既存の順番の後ろに tsusho）。

```
[ 移動支援・地域活動支援 受給者証 ]（今後実装予定・押せない）
[ 障害福祉サービス受給者証（18歳以上） ]
[ 障害福祉サービス受給者証（18歳未満） ]
[ 通所受給者証 ]  ← 選択可能
```

既存の3列グリッドのため、4枚目は2段目に表示される（レイアウトは変更していない）。tsusho は `colorName` が表示名と同じため、カードの2行目と「現在の取込状況」の見出しで同じ文言を重ねて出さないようにした（`CertImportFlow.tsx`、条件分岐のみ）。

## 6. 7ページUI

B4 の `getPageCount(certType)` をそのまま使用（新しいページ数ロジックなし）。E2E で確認：

- 「0 / 7 ページ取込済み」、ページタブは上段 1〜4・下段 5〜7（「下段（5〜7ページ）」）
- 1/7〜7/7 を表示。7/7 で「次のページ」は無効、8ページ目には到達できない

## 7. layouts

B3 の tsusho レイアウト（`tsushoLayouts.tsx`）を変更なしで使用：一面（通所給付決定保護者・児童）、二面・三面（給付決定内容）、四面（相談支援）、五面（利用者負担）、六・七面（事業者記入欄・画像保存のみ）。フォーム項目の追加・変更なし。

## 8. parser接続

- 一〜五面：B2 の `TSUSHO_PAGE_PARSERS` が `parseCertText.ts` の registry に登録済み（B3）。変更なし
- 六・七面：parser なし
- parser のロジック変更なし。テストで registry（一〜五面＝B2 の関数そのもの、六・七面＝null、adult/child の登録も不変）を固定
- OCR の Function（`functions/`）は certType をログ用途にのみ使い、tsusho も通常どおり処理する（tsusho はログ上 certType 未記録になるだけ）。functions は変更していない
- ローカル E2E では Vision を呼ばない設定（認証情報を無効化）のため OCR は失敗し、値は手入力した

## 9. 見本画像404対策

調査結果：

- 見本画像はページタブのサムネイル（`components/PageTabs.tsx`）と LINE の撮影画面（`LineCertImportView.tsx`）で `/cert-samples/{certType}/page-N.png` を参照する
- `public/cert-samples/` にあるのは adult・child・mobility の各8枚のみ。**tsusho の非PII見本画像の元資料はリポジトリに無い**（設計書 PHASE1B_TSUSHO_CERT_DESIGN.md でも「リポジトリに通所受給者証の画像は無い」と確認済み）

対応：**方針 B**（架空の様式は作らない・Web から取得しない）

- `certPages.ts` に `getSampleImagePath(certType, pageIndex)` を追加。見本画像がある種別（mobility / adult / child）だけパスを返し、tsusho・未知の種別・範囲外のページは `null`
- `PageTabs.tsx` は `null` のとき `<img>` を出さず、ページ番号と「見本画像なし」を表示
- LINE は tsusho を選べないため変更していない

E2E：tsusho 選択時にサムネイルの `<img>` は 0 件、`cert-samples` へのリクエスト 0 件、400 以上の応答 0 件。adult に切り替えると従来どおり8枚の見本画像を表示（404 なし）。

## 10. 種別切替・更新時の初期証種

### 10-1. 更新時の初期証種（レビュー指摘により追加）

**最終仕様（管理Webのみ）**

| 開き方 | 初期選択 |
|---|---|
| 新規利用者 | adult / 8ページ（従来どおり） |
| 既存利用者の更新・現在の証が tsusho | **tsusho / 7ページ（1/7）** |
| 既存利用者の更新・現在の証が adult | adult / 8ページ |
| 既存利用者の更新・現在の証が child | child / 8ページ |
| certType なし・未知・管理Webで選べない種別（mobility）・利用者を取得できない | adult / 8ページ |

「現在の証の種別」は利用者doc の `certType`。保存処理（B5）で `currentCertificateId` と同じ書き込みで更新されるため、現在の受給者証の certType と一致する。旧データ（currentCertificateId なし）は従来どおり adult として正規化される。

**取込を勝手に消さないための条件**（次のいずれかなら初期選択を変えない）

- 同じ利用者の取込セッションを復元した（スマホ撮影の往復などで `new=1` が付かずに戻った場合。復元した種別・ページ・入力を優先）
- 利用者の取得（非同期）を待つ間に、ユーザーが種別を選び直した
- 様式の系統が変わる（8ページ系 ⇔ tsusho）のに、すでに取込内容（画像・OCR結果・入力）がある

カルテの「受給者証を更新」は `new=1` 付きで開くため、前回の取込セッションは復元されず、現在の証の種別で始まる（従来の仕様）。sessionStorage には取込画面の状態が常に自動保存されるため、「復元した＝優先」を「同じ利用者の取込を復元した場合」に限定した（別の利用者・新規取込のセッションが残っていても、取込内容が無ければ現在の証の種別にする。取込内容があれば変えない）。

**実装**

- `certPages.ts`：純粋関数 `resolveInitialCertTypeForUpdate`（判定）・`hasImportWork`（取込内容の有無。種別切替の確認ダイアログの判定と共通化）
- `CertImportFlow.tsx`：利用者取得後の effect で、管理Webのときだけ判定を使う。tsusho へ切り替える場合は7ページの空ページで作り直す。ユーザーが種別を選んだら記録する（`userChangedCertTypeRef`）
- LINE：effect の LINE 側は従来のコードのまま（tsusho は LINE で選択できないため初期選択にもならない）。`lineEnabled = false` 維持

**E2E（Firebase Emulator・管理Web・カルテの「受給者証を更新」ボタンから）**

| # | ケース | 結果 |
|---|---|---|
| 1 | 現在の証が tsusho の利用者（架空） | 通所受給者証 / 0 / 7 ページ / 現在 1/7・ページタブ7 ✅ |
| 2 | 現在の証が adult の利用者（架空） | 18歳以上 / 0 / 8 / 現在 1/8 ✅ |
| 3 | 現在の証が child（b-valid） | 18歳未満 / 0 / 8 / 現在 1/8 ✅ |
| 4 | certType なし（b-weird）・旧データ（b-legacy） | どちらも 18歳以上 / 1/8 ✅ |
| 4' | 存在しない利用者ID（取得できない） | 18歳以上 / 1/8 ✅ |
| 5 | 新規利用者（取込画面 → 新規登録を開始） | 18歳以上 / 1/8 ✅ |
| 6A | tsusho の利用者で adult に選び直して入力 → `new` なしで戻る（復元） | 18歳以上 / 1/8・入力が残る（現在の証の tsusho で上書きしない）✅ |
| 6B | tsusho の利用者で三面に入力 → `new` なしで戻る（復元） | 通所受給者証 / 現在 3/7・入力が残る ✅ |
| 6C | 6A の取込が残った状態でカルテから開き直す（`new=1`） | 前回の取込は復元されず 通所受給者証 / 1/7 から ✅ |
| LINE | tsusho の利用者を LINE で更新 | 色の選択は 紫・黄緑 のみ（従来どおり）✅ |

### 10-2. 種別切替（ユーザー操作）

B4 の仕様のまま（`shouldResetPagesOnCertTypeChange`）。E2E（`window.confirm` はブラウザ操作が止まらないよう、ページ内で記録用に差し替えて確認）：

| 操作 | 結果 |
|---|---|
| tsusho → adult（取込なし） | 確認なし、0/8、見本画像8枚 |
| adult（1ページ取込済み）→ child | 確認なし、1/8 のまま（従来どおり保持） |
| child（取込あり）→ tsusho、確認でキャンセル | 確認ダイアログ1回、8ページ・1/8 のまま |
| 同上、確認で OK | 7ページ・0/7 に作り直し（画像・OCR結果・入力・ページ状態をリセット） |

## 11. 新規tsusho保存E2E

管理Web → 新規受給者を登録 → 通所受給者証 → 一面（架空の児童 架空 次世・保護者 架空 一郎）・二面・四面・五面を手入力、一面・七面に画像 → 確定して保存。

| 項目 | 結果 |
|---|---|
| beneficiary.personal | 児童（架空 次世・カクウ ツギヨ・birthDate 2017-08-09）、住所・郵便番号は空 ✅ |
| beneficiary.guardian | 通所給付決定保護者（架空 一郎・カクウ イチロウ・居住地）、guardianBirthday の保存先なし ✅ |
| summary / profile | 児童 ✅ |
| certificate | certType tsusho・pages 7・Storage page1.jpg / page7.jpg ✅ |
| currentCertificateId | 新しい tsusho 証、status current ✅ |

## 12. 既存利用者追加E2E

既存利用者 b-valid（personal.name = 鈴木 大翔、profile.name = 鈴木 大翔、guardian.name = 鈴木 保護者〔Emulator 上で付与した架空データ〕）に、カルテの「受給者証を更新」から tsusho（childName = 架空 三太、guardianName = 架空 二郎）を保存。

| 項目 | 結果 |
|---|---|
| personal / profile / guardian | 保存前のスナップショットと**完全一致** ✅ |
| certificate | page1.name = 架空 三太、guardianName = 架空 二郎 ✅ |
| 旧証（child） | superseded、supersededBy = 新しい tsusho 証 ✅ |
| 利用者 certType | tsusho ✅ |

## 13. personal/profile/guardian保護

B5 の `resolveProfileOnCertificateAdd` が管理Web経由の実保存でも成立（12・16 の2回の保存とも、personal / profile / guardian は保存前と完全一致）。

## 14. representative validity

架空データ：二面1行目＝児童発達支援（2026-04-01〜2028-03-31）、2行目＝放課後等デイサービス（2026-04-01〜2027-03-31）、四面 相談支援（〜2029-03-31）、五面 利用者負担（〜2030-03-31）。

- 代表 validFrom = **2026-04-01**、validTo = **2027-03-31** ✅（1行目の他サービス・相談支援・利用者負担は採用されない）
- 利用者一覧の有効期限「2027年3月31日」、カルテ上部の「現在の受給者証の有効期間 2026年4月1日 〜 2027年3月31日」に反映 ✅

## 15. 受給者証タブ

保存した tsusho をカルテの「受給者証」タブで確認：

- 「現在 通所受給者証」、期間 2026-04-01 〜 2027-03-31 ✅
- 取り込み画像のページボタンは 1〜7（8 なし）、「1/7：通所受給者証（一面）」〜「7/7：障害児通所支援事業者記入欄（七面）」✅
- 保存した入力内容（一面の保護者・児童、二面のサービス）を表示 ✅
- 保存した画像を表示（七面の画像も表示）✅
- **修正**：「主な内容」の利用者負担上限月額が「未取得」と表示されていた（`certificateHighlights.ts` が8ページ様式の7・8ページ固定で読んでいたため）。tsusho は二・三面／五面から読むよう修正し、「4,600円」と表示されることを確認 ✅
- console：アプリ由来のエラーなし。※ Firestore SDK の `AbortError: signal is aborted without reason`（`PersistentListenStream` の接続を閉じる処理）が Emulator / 開発環境で出るが、adult の画面操作でも同じく発生しており（29件、すべて同一）、tsusho・B6 とは無関係

## 16. history

同じ b-valid に2件目の tsusho（放デイ 2027-04-01〜2028-03-31）を保存：

| 証 | status | supersededBy | 期間 | ページ |
|---|---|---|---|---|
| b-valid-c（child） | superseded | 1件目の tsusho | 2026-04-06〜2027-04-01 | 8 |
| 1件目の tsusho | superseded | 2件目の tsusho | 2026-04-01〜2027-03-31 | 7 |
| 2件目の tsusho | **current** | — | 2027-04-01〜2028-03-31 | 7 |

「過去の受給者証（2件）」から1件目の tsusho を閲覧可能（閲覧のみ）。ページは 1〜7、主な内容（利用者負担 4,600円 等）も表示 ✅

## 17. adult/child回帰

- 管理Web：adult 8ページ（見本画像8枚）、child 8ページ、adult ⇔ child は取込内容を保持（10 参照）✅
- adult 新規保存（管理Web）：certType adult・8ページ・current・profile＝入力した氏名、カルテ（personal / guardian）は作られない ✅
- 自動テスト：adult / child の期間・profile・ページ定義・レイアウト・parser 登録は既存テストどおり全件 pass

## 18. LINE回帰

Emulator ＋モック LIFF（B4/B5 と同じ環境）で確認：

- 新しい利用者の「受給者証の色は？」：**紫色（18歳以上）・黄緑色（18歳未満）のみ**、tsusho なし ✅
- tsusho が現在の証になった既存利用者（b-valid）の更新：同じく紫・黄緑のみ ✅
- LINE の利用者詳細（b-valid）：種類「通所受給者証」・有効期間・受給者番号・以前の受給者証2件を表示、404 なし ✅
- 保存処理・UI は未変更（B5 で LINE の保存 E2E 済み）

## 19. 検索/summary

- 管理Webの利用者一覧：b-valid は **鈴木 大翔**（カルテの氏名）で表示、新規 tsusho 利用者は 架空 次世（9歳・小学3年）✅
- 証の氏名（summary.name＝架空 三太）での検索：管理Web・LINE とも b-valid がヒット（B5 で確定した現在の仕様を維持）✅
- カルテの氏名（鈴木）での検索もヒット ✅
- summary の仕様は変更していない（テストで固定）

## 20. 実物OCR未検証

**実物の通所受給者証（または自治体の実様式）による OCR 精度は未検証。** 今回の E2E は Vision を呼ばず、架空データを手入力して保存・表示・履歴を確認したもの。parser は B2 の fixture テストでのみ検証されている。

## 21. 変更ファイル（変更9・新規2）

| 区分 | ファイル | 内容 |
|---|---|---|
| 変更 | `src/app/t/[tenantId]/constants/certPages.ts` | tsusho の公開設定・`getSampleImagePath`・`resolveInitialCertTypeForUpdate`・`hasImportWork` |
| 変更 | `src/app/t/[tenantId]/components/PageTabs.tsx` | 見本画像が無い種別は「見本画像なし」 |
| 変更 | `src/app/t/[tenantId]/CertImportFlow.tsx` | 色名＝名称の種別で同じ文言を重ねない（表示）／管理Webの更新時の初期証種（LINE の分岐は従来のまま） |
| 変更 | `src/app/globals.css` | `.cert-type-tsusho` |
| 変更 | `src/lib/beneficiaryChart/certificateHighlights.ts` | 種別ごとのページ構成（tsusho＝二・三面／五面） |
| 変更 | `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificateHighlightsCard.tsx` | certType を渡す |
| 変更 | `src/app/t/[tenantId]/constants/certTypeVisibility.test.ts` | B3 の「非公開」固定を B6 の公開範囲へ意図的に更新 |
| 変更 | `src/app/t/[tenantId]/constants/certLayoutVariant.test.ts` | 選択可能な種別に tsusho を追加（意図的に更新） |
| 変更 | `src/lib/tsusho/isolation.test.ts` | 境界を「管理Webのみ公開」へ意図的に更新 |
| 新規 | `src/app/t/[tenantId]/constants/tsushoAdminEnable.test.ts` | B6 のテスト 16 件（公開範囲・見本画像・主な内容 等） |
| 新規 | `src/app/t/[tenantId]/constants/initialCertTypeForUpdate.test.ts` | 更新時の初期証種のテスト 10 件 |
| 新規 | `PHASE1B_B6_IMPLEMENTATION_REPORT.md` | 本報告書 |

`certificateModel.ts`・`beneficiaries.ts` は変更不要と判断し、変更していない。

## 22. 新規/変更テスト

新規 `tsushoAdminEnable.test.ts`（16件）：

- adminCertTypeOptions に tsusho（enabled / adminVisible = true、管理Webで選択可）
- 表示名は既存の定義のまま
- lineEnabled = false、lineCertTypeOptions は adult / child のみ、LINE で選択不可
- LINE の取込画面のコードが tsusho を直接参照していない
- themeClass が globals.css に定義されている
- ページ数 tsusho 7 / adult・child・mobility 8
- 種別切替（8ページ系 ⇔ tsusho は作り直し、adult ⇔ child は保持）
- 見本画像：tsusho は全ページ null・`public/cert-samples/tsusho` は存在しない
- 見本画像：adult / child / mobility は8ページ分のファイルが実在、範囲外は null
- PageTabs が getSampleImagePath を通している
- parser registry の維持（一〜五面＝B2 の関数、六・七面なし、adult / child 不変）
- candidates 未接続
- summary：現在の証の代表情報を保持
- summary：表示はカルテ優先、summary.name で検索ヒット（現在の仕様）
- 主な内容：tsusho は二・三面／五面から読む
- 主な内容：adult / child / 種別なしは従来どおり

新規 `initialCertTypeForUpdate.test.ts`（10件）：

- 現在の証が tsusho → tsusho・7ページ（作り直し）
- adult → adult・8ページ／child → child・8ページ（作り直さない）
- 種別なし・空・未知・mobility → adult・8ページ（tsusho が選ばれた状態からでも adult に戻す）
- 同じ利用者の取込セッションを復元した場合は上書きしない
- ユーザーが種別を選び直した場合は上書きしない
- 8ページ系 ⇔ tsusho で取込内容がある場合は切り替えない
- adult ⇔ child は取込内容があっても切り替える（ページは保持）
- hasImportWork（画像・OCR結果・入力）
- 管理Webだけが判定を使い、LINE は従来の分岐のまま・新規は adult のまま（コードの構造を確認）

意図的に更新した既存テスト（削除・弱体化はしていない。LINE に出ないことの検証は残し、追加もした）：

- `certTypeVisibility.test.ts`：tsusho の公開状態、管理Webの選択肢（4種類）・押せる種別（adult / child / tsusho）、isCertTypeSelectable（tsusho は admin のみ true）
- `certLayoutVariant.test.ts`：enabled の種別に tsusho を追加
- `isolation.test.ts`：公開範囲の境界（管理Webのみ・LINE 非公開）

## 23. TypeScript

`npx tsc --noEmit -p .`：エラーなし

## 24. npm test

**274 件 pass / 0 fail**（B5 の 248 件＋B6 の 26 件）

## 25. Rules

`npm run test:rules`：**10 件 pass / 0 fail**（rules は未変更）

## 26. ESLint

変更ファイルを含む `src/app/t`・`src/lib/beneficiaryChart`・`isolation.test.ts` に対して実行。**変更ファイルのエラーは 0 件**。

- 範囲内のエラー1件は `src/app/t/[tenantId]/capture/page.tsx`（B6 で未変更の既存コード）
- 警告は既存のもの（`<img>` の LCP 警告：PageTabs の見本画像〔既存の `<img>` を条件付きにしただけ〕、CertImportFlow の別の箇所／certLayouts の未使用引数）

## 27. Build

`npx next build`：成功（.env.local は共有 checkout へ一時 symlink し、build 後に削除済み）。

## 28. Production未接続

- 検証はすべてローカル（Next dev ＋ Firebase Emulator：demo-paperlesscare）。Vision を呼ばないよう認証情報を無効化
- Production の Firestore / Storage / Functions に接続していない。書き込みなし
- Vercel / Firebase への deploy なし、push なし、commit なし
- E2E の一時ファイル（functions/node_modules の symlink、functions/.env.local、functions/lib）は削除済み

## 29. Git status

```
branch: feat/phase1b6-enable-tsusho-admin（HEAD = bb976f5c）
 M src/app/globals.css
 M src/app/t/[tenantId]/CertImportFlow.tsx
 M src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificateHighlightsCard.tsx
 M src/app/t/[tenantId]/components/PageTabs.tsx
 M src/app/t/[tenantId]/constants/certLayoutVariant.test.ts
 M src/app/t/[tenantId]/constants/certPages.ts
 M src/app/t/[tenantId]/constants/certTypeVisibility.test.ts
 M src/lib/beneficiaryChart/certificateHighlights.ts
 M src/lib/tsusho/isolation.test.ts
?? PHASE1B_B6_IMPLEMENTATION_REPORT.md
?? src/app/t/[tenantId]/constants/initialCertTypeForUpdate.test.ts
?? src/app/t/[tenantId]/constants/tsushoAdminEnable.test.ts
```

差分監査：firestore.rules・storage.rules・functions/・package.json・package-lock.json・`lib/firestore`（certificateModel / beneficiaries）・parser・`src/app/line`・`public` に差分なし。秘密情報・Production 固有情報・実在の個人情報・バイナリなし（テストデータはすべて架空）。

## 30. Production deploy前の残課題

**リリース条件（必須）**

1. 実物の通所受給者証（または自治体の実様式）で OCR を行い、次を確認する
   - 一面：児童欄と通所給付決定保護者欄の振り分け（児童が personal・保護者が guardian に入ること）
   - 二面・三面：サービス名（支援の種類）の読み取り
   - 「放課後等デイサービス」の判定
   - 給付決定期間（代表有効期間の根拠）の読み取り
2. 上記で parser の修正が必要になった場合は、別フェーズで fixture を追加して対応する

**運用上の注意・今後の候補（今回は仕様維持のため未対応）**

3. tsusho の見本画像は未整備（「見本画像なし」表示）。非PIIの空様式から作成できる資料が手に入れば `public/cert-samples/tsusho/` を追加し、`getSampleImagePath` の対象に加える
4. （対応済み）現在の証が tsusho の利用者で「受給者証を更新」を開くと adult が初期選択される問題は、レビュー指摘を受けて修正した（10-1）
5. LINE は tsusho を選べないため、tsusho の利用者を LINE で更新すると adult / child の証が現在の証になる。LINE 公開（lineEnabled）時に色ではなく名称で選ぶ文言とあわせて対応する
6. OCR → カルテ反映（candidates）は Phase 1-B7 まで未接続のまま
7. Production deploy では Rules・Functions の変更は不要（どちらも未変更）。Vercel（Web）の deploy のみで公開される

---

**最終判定：C** ― B6 のコードは完成し、管理Webでの選択・7ページ取込・保存・履歴・表示を Emulator で確認した。ただし実物の通所受給者証 OCR が未検証のため、Production deploy は保留。
