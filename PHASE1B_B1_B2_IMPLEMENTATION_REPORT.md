# PaperlessCare Phase 1-B1 + 1-B2 実装報告書 ― 通所受給者証「未接続ロジック＋OCR Parser」

- 作成日：2026-10-03
- 仕様の正：`PHASE1B_TSUSHO_CERT_DESIGN.md`、および今回の依頼で人間判断済みとされた10項目
- 状態：**実装・ローカル検証まで完了**。未接続・未コミット・未push・未デプロイ。Production には接続していない
- 作業場所：git worktree `.claude/worktrees/phase1b-tsusho-b1b2`（19章を参照）

---

## 1. 実装概要

| 段階 | 内容 |
|---|---|
| 1-B1 純粋ロジック | 型定義、ページ定義・キー一覧（純粋データ）、比較用の正規化、支援の種類の判定、支給量（日／月）の解釈、給付決定期間の ISO 変換、`extractTsushoServices`、代表給付決定期間 `extractTsushoValidity`、カルテ反映候補 `buildTsushoChartCandidates` |
| 1-B2 OCR Parser | 一〜五面の parser（`parseTsushoFace1〜5`）と入口 `parseTsushoCertText`。fixture（架空の OCR テキスト）。**`CERT_PAGE_PARSERS` には登録していない** |

- 置き場所はすべて `src/lib/tsusho/` に集めた（parser は `src/lib/tsusho/parsers/`）。
  - 依頼文の例 `src/lib/parsers/tsusho/` とは異なる。この配置にしたのは、「未接続」を1つのディレクトリへの参照の有無だけで検証できるようにするため。
  - 検証はテストで固定した（13章「isolation」）。
- 既存の parser は `src/app/t/[tenantId]/lib/parsers/` にあるが、そこには置いていない。

---

## 2. 新規ファイル一覧（21件。すべて `src/lib/tsusho/` 配下）

| ファイル | 内容 |
|---|---|
| `types.ts` | `TsushoServiceKind` / `TsushoServiceRow` / `TsushoServiceDecision` / `TsushoRepresentativeValidity` / `TsushoPageLike` |
| `constants.ts` | `TSUSHO_CERT_TYPE = "tsusho"`、`TSUSHO_PAGE_COUNT = 7`、`TSUSHO_PAGE_DEFINITIONS`（一〜七面）、各面のキー一覧、`TSUSHO_SERVICE_ROWS`（行とページ・キーの対応） |
| `normalize.ts` | 比較専用の正規化（氏名・フリガナ・住所・日付） |
| `period.ts` | 和暦日付・期間の読み取り（元年・全角数字・空白・「～」「〜」区切り）、`parseTsushoDayPeriod` |
| `services.ts` | `normalizeTsushoServiceKind`、`parseDaysPerMonth`、`extractTsushoServices` |
| `validity.ts` | `selectRepresentativeService`、`extractTsushoValidity` |
| `candidates.ts` | `buildTsushoChartCandidates`（反映候補の生成。書き込みなし） |
| `parsers/helpers.ts` | 行・ラベルの処理、分割ラベルの結合、長音の復元、`toFormData` |
| `parsers/face1.ts` | 一面（基本情報） |
| `parsers/decisionFaces.ts` | 二面・三面（給付決定内容） |
| `parsers/face4.ts` | 四面（障害児相談支援給付費） |
| `parsers/face5.ts` | 五面（利用者負担） |
| `parsers/index.ts` | `TSUSHO_PAGE_PARSERS`（index 0〜4）、`parseTsushoCertText` |
| `parsers/fixtures.ts` | テスト用の架空 OCR テキスト |
| `*.test.ts`（7件） | `candidates` / `services` / `validity` / `isolation` / `parsers/face1` / `parsers/decisionFaces` / `parsers/face4and5` |

---

## 3. 既存ファイル変更一覧

**0件。**

- worktree と共有チェックアウトを `diff -rq` で比較した。差は `src/lib/tsusho/` だけ。
- `firestore.rules`、`storage.rules`、`package.json`、`firebase.json`、`tsconfig.json`、`tests/`、`functions/src` は同一（19章）。
- 既存ファイルの変更が必要になる場面は無かった。
- 既存の安全な純粋関数を、新規ファイルから **import して再利用しているだけ**（変更していない）：
  - `parseWarekiPeriod`（`certificateModel.ts`）
  - `normalizeDateText`（`src/lib/beneficiaryChart/dates.ts`）
  - `emptyFormData`（`certPages.ts`）
  - `normalizeText`（`lib/parsers/normalizeText.ts`）
  - `FormDataType`（型のみ）
  - テストでは `EMPTY_SECTIONS`（`beneficiaryChart/model.ts`）、`CERT_TYPES`、`getCertPageParser` も読む

---

## 4. 型定義

```ts
type TsushoServiceKind = "jidoHattatsu" | "houkagoDay" | "kyotakuHoumon" | "hoikushoHoumon" | "unknown";
type TsushoServiceDecision = { row: 1|2|3|4; kind; kindText; amountText; daysPerMonth: number|null;
                               periodText; validFrom: string|null; validTo: string|null };
type TsushoRepresentativeValidity = { validFrom: string|null; validTo: string; row; serviceKind; serviceKindText; periodText };
```

**formData のキー**（tsusho のみの意味づけ。`types.ts` の先頭にも明記）：

| 面 | キー |
|---|---|
| 一 | `number`, `guardianAddress`, `guardianFurigana`, `guardianName`, `guardianBirthday`, `furigana` / `name` / `birthday`（**児童**）, `issueDate`, `cityName` |
| 二 | `serviceType1・2`, `serviceAmount1・2`, `servicePeriod1・2`, `decision2SpecialNotes`, `decision2Memo`, `decision2ExtraRows` |
| 三 | `serviceType3・4`, `serviceAmount3・4`, `servicePeriod3・4`, `decision3SpecialNotes`, `decision3Memo`, `decision3ExtraRows` |
| 四 | `supportPeriod`, `planOfficeName`, `monitoringPeriod`, `consultationMemo` |
| 五 | `burdenLimitAmount`, `burdenPeriod`, `mealProvisionStatus`, `mealProvisionPeriod`（新）, `managementTargetStatus`, `managementOfficeName`, `burdenSpecialNotes`, `burdenMemo` |

**設計書からの変更点**：

- **特記事項・予備欄は面ごとに別のキーにした**（`decision2…` / `decision3…` / `consultationMemo` / `burden…`）。今回の依頼の指示による。
  - 設計書では、既存の `specialNotes` / `memo` を流用する案だった。
  - 既存の `specialNotes` / `memo` は adult / child の画面や要点の抽出で別の意味に使われており、取り違えを避けた。
  - 既存キーとの衝突が無いことは grep で確認済み。
- **`decision2ExtraRows` / `decision3ExtraRows` を追加した。** 自治体の工夫で1面に3行以上ある場合、3行目以降を原文で残す（情報を捨てない）。
- parser の戻り値は既存の `FormDataType` の形にした（`emptyFormData()` に tsusho のキーを足す）。将来 `CERT_PAGE_PARSERS` に登録したときの型互換のため。
  - 既存のキー（`address` / `childName` 等）は空のまま。tsusho では使わない。

---

## 5. サービス抽出

**`normalizeTsushoServiceKind`**：
- NFKC と空白除去のあと、`-` 類を長音に戻して、4区分のうち**ちょうど1つ**を含むときだけその区分を返す。該当なし・複数該当・空は `unknown`。
- 「居宅訪問型児童発達支援」は「児童発達支援」を含むため、先に判定して二重に数えない。
- 「放デイ」などの略記には対応していない（実物で未確認）。

**`parseDaysPerMonth`**：
- NFKC のあと、`N日/月`（全角スラッシュ・空白を許容）の値が**ちょうど1種類**のときだけ、その数値を返す。
- 読めない形式・複数の異なる値・1〜31以外は `null`。
- 原文は必ず `amountText` に残す。

**給付決定期間（`parseTsushoDayPeriod`）**：
- 「年月日〜年月日」（「から」「～」「〜」区切り、元年・全角数字可）を、既存の `parseWarekiPeriod` で ISO にする。
- 既存の `normalizeDateText` で実在しない日付を弾く。
- **片方でも読めない、または開始日が終了日より後なら、両方 `null`**。片方が誤読なら期間全体が信用できないため。

**`extractTsushoServices(pages)`**：
- 二面（pageNo 2）の行1・2、三面（pageNo 3）の行3・4だけを読む。
- 種類・支給量・期間がすべて空の行は除く。
- `pageNo` が無ければ配列の位置で判断する。
- 他のページにある `serviceTypeN` は読まない。
- 保存しない派生データとして毎回生成する。

---

## 6. 代表期間ロジック（`extractTsushoValidity` / `selectRepresentativeService`）

1. 放課後等デイサービスの行が1つでもあれば、放デイの行だけを対象にする。
2. 対象の中で `validTo` が最も遅い行を選ぶ。
   - 終了日が同じなら、開始日が遅い行。それも同じなら行番号が小さい行。
3. 放デイの行が無ければ、全サービスから同じ規則で選ぶ。
4. 対象に `validTo` が無ければ `null`。
   - **放デイの行はあるが期間を読めない場合も、他サービスの期間で代用せず `null`**。根拠の違う期限を「放デイの期限」と誤表示しないため。

その他：
- 返り値に根拠（`row`、`serviceKind`、`serviceKindText`、`periodText`）を含め、UI で表示できるようにした。
- 「今日」に依存しない。
- Firestore には保存しない。

---

## 7. 候補生成（`buildTsushoChartCandidates(pages, chart, options?)`）

| 受給者証 | 反映候補 | 比較方法 |
|---|---|---|
| 一面 `name` / `furigana` / `birthday`（児童） | `personal.name` / `personal.furigana` / `personal.birthDate` | 氏名：NFKC＋空白除去。フリガナ：ひらがなをカタカナに＋長音・`-` を統一。生年月日：和暦と ISO を `normalizeDateText` で比較（反映するなら ISO） |
| 一面 `guardianName` / `guardianFurigana` / `guardianAddress` | `guardian.name` / `guardian.furigana` / `guardian.address` | 住所：NFKC＋空白除去＋ハイフン類（‐ － ー − 等）の統一 |
| 四面 `planOfficeName` | `consultationSupport.officeName` | 氏名と同じ |

**状態の扱い**：

| 状態 | 表示（`visible`） | 初期チェック（`initiallySelected`） |
|---|---|---|
| `same` | しない | OFF |
| `chartEmpty` | する | ON |
| `different` | する | OFF |
| `certEmpty` | しない | OFF |

- 生年月日を日付として読めない場合も `certEmpty` とし、`certUnreadable: true` を立てる。

**扱いの詳細**：
- **`guardianBirthday` は候補にしない**。カルテに受け皿が無いため。
- **`personal.address` は既定では作らない。**
  - `includeAuxiliaryPersonalAddress: true` を指定したときだけ補助候補として作る。
  - その場合も**型で `initiallySelected: false` に固定**し、`auxiliary: true` を付ける。
- **保護者欄と児童欄が同一人物の場合は、`guardian.*` の候補を作らない**（`guardianSameAsChild: true`）。
  - 同一人物の判定：氏名が一致し、かつ生年月日も一致すること。
  - これは18歳以上の通所者の扱い（CFA要領）に対応したもの。
- カルテで「保護者の住所は利用者と同じ」が指定されているときは、`guardianUsesBeneficiaryAddress` で知らせる。将来の UI で注意を出すため。
- **正規化した値は比較にしか使わない。** `certValue` / `chartValue` は原文のまま。入力の `pages`・カルテを書き換えないことはテストで固定した。
- Phase 1-A の `BeneficiaryChartSections` を、そのまま `chart` として渡せる。

---

## 8. OCR parser 一面（`parseTsushoFace1`）

**人物の取り違え防止**（最重要）：

- 「氏名」ラベルが**ちょうど2つ**のときだけ割り当てる。1つ目は `guardianName`、2つ目は `name`。
- 1つ・3つ以上なら、**人物6項目（保護者・児童の氏名・フリガナ・生年月日）をすべて空**にする。
- 見出し・居住地が読めた場合は、位置が様式と矛盾しないかを確認する。矛盾すれば人物6項目を空にする。
  - 「児童」（または「童」だけ）が2つの氏名の間に無い
  - 「給付決定保護者」が1つ目の氏名より後にある
  - 「居住地」が1つ目の氏名より後にある
- 縦書きの見出しは欠落しうるので、**判定の必須条件にはしない**。
- 「最初の氏名を name へ」というフォールバックは持たない。
- 数字だけ・日付だけの値は、氏名として採用しない。

**ブロックの区切り**：
- 保護者ブロックは「保護者の氏名」から「児童のフリガナ／見出し／児童の氏名」の手前まで。生年月日はこの範囲の最初の和暦日付。
- 児童ブロックは「交付年月日」または「支給市町村名」の手前まで。交付年月日を児童の生年月日として拾わない。
- フリガナは、ちょうど2つあり、「フリガナ→氏名→フリガナ→氏名」の順に並ぶときだけ使う。

**その他の項目**：
- **受給者証番号**：「受給者証番号」ラベルの値の範囲にある10桁の数字。ラベルが読めない場合は、人物欄より前だけを探す。市町村の電話番号（10桁）を拾わないことはテストで確認済み。
- **居住地**：ラベルが1つで、1つ目の氏名より前にあるときだけ採用する。複数行は連結する。縦書き見出しの断片（「通」「所」等）の行は除く。
- **交付年月日**：「交付年月日」から「支給市町村名」の間の和暦日付。
- **支給市町村名**：ラベルの後の最初の行。「及び 印」の続き、番号、電話の行は除く。

---

## 9. OCR parser 二・三面（`parseTsushoFace2` / `parseTsushoFace3`）

- 「支援の種類」ラベルを行の起点にする。サービス名は決め打ちしない。
- 各行で次を読む。
  - 種類
  - 支給量等：複数行は改行で保持。加算の記載も含む
  - 給付決定期間：「…から…まで」に揃える
- **期間の扱い**：
  - 期間の形をしていないが数字を含む場合は、原文を残す（スタッフが確認できるように）。
  - 印字だけの「令和 年 月 日から…」（数字なし）は空にする。
  - 期間ラベルが読めない場合も、その行の範囲内にある期間はその行のものとみなす。
- 二面は行1・2、三面は行3・4。
- 1面に3行以上あるときは、3行目以降を `decisionNExtraRows` に原文で残す。他の面のキーへはあふれさせない。
- 特記事項欄（「特記事項欄」を1語として扱う）は `decisionNSpecialNotes`、予備欄は `decisionNMemo`。

---

## 10. OCR parser 四面（`parseTsushoFace4`）

- **支給期間**：年月の期間を「令和8年4月から令和9年3月まで」に揃える。年月日の形でも読む。数字を含む原文は残す。
- **相談支援事業所名**：「相談支援事業所名」を含むラベルで判定する。「指定障害児相談支援事業所名」等の表記揺れにも対応。
- **モニタリング期間**：原文。
- **予備欄**：`consultationMemo`。

---

## 11. OCR parser 五面（`parseTsushoFace5`）

- **2回出てくる「適用期間」の振り分け**：位置で決める。
  - 負担上限月額と食事提供加算の間 → `burdenPeriod`
  - 食事提供加算と上限額管理対象者の間 → `mealProvisionPeriod`
- **負担上限月額**：「4,600円」形式。数字の無い「円」だけの印字は空。
- 「負担上限」「月額」が2行に分かれていても、1つのラベルとして扱う。
- **食事提供加算対象者**：様式11の「食事提供体制加算対象者」表記も同じ欄として扱う。
- **特記事項欄**：印字（第2子軽減・無償化対象児童）も原文のまま `burdenSpecialNotes` に残す。印字か記入かは未確認。

---

## 12. fixture（`parsers/fixtures.ts`）

- 様式9の欄の並びに沿った**架空の OCR テキスト**（normalizeText 前の生テキストとして記述）。
- 実在の人物・住所・番号は使っていない（「架空」を含む名前、`1234567890`、架空の市町村・事業所名）。
- **実物の Cloud Vision 出力ではない。**

| ケース | fixture |
|---|---|
| A 放デイのみ | `FACE2_HOUKAGO_ONLY`（2行目は印字だけ） |
| B 複数サービス | `FACE2_JIDO_AND_HOUKAGO`（児発＋放デイ、加算の記載）＋ `FACE3_OTHER_SERVICES`（保育所等訪問・居宅訪問型） |
| C 旧期間＋新期間 | `FACE2_OLD_AND_NEW` |
| D 保護者・児童の両方 | `FACE1_STANDARD`（電話番号10桁も含む） |
| E 氏名ブロック1つ | `FACE1_SINGLE_NAME_BLOCK`、追加で `FACE1_THREE_NAME_LABELS`・`FACE1_CHILD_HEADING_BEFORE_FIRST_NAME` |
| F OCR 崩れ・空欄 | `FACE1_NOISY`（見出しの分解、氏と名の分割、全角数字、元年、空欄）、`FACE2_NOISY`（同じ行のラベル、全角、「～」、unknown、2月30日） |
| その他 | `FACE1_ADULT_SELF`（18歳以上の本人）、`FACE2_THREE_ROWS`、`FACE4_STANDARD`、`FACE5_STANDARD`、`FACE5_BLANK` |

---

## 13. テスト内容（新規73件）

| ファイル | 件数 | 主な内容 |
|---|---|---|
| `parsers/face1.test.ts` | 14 | 保護者と児童の分離。保護者名が `name` に入らない。氏名1つ・3つ・見出しの矛盾・居住地の矛盾で何も割り当てない。番号・交付日・市町村・居住地。電話番号を拾わない。既存キー（address / childName）を使わない。OCR 崩れ。18歳以上。空入力。数字・日付を氏名として採用しない。長音の復元（番地のハイフンは戻さない） |
| `parsers/decisionFaces.test.ts` | 7 | ケースA・B・C・F。三面のキー。3行目を ExtraRows へ。特記事項・予備欄のキーの分離 |
| `parsers/face4and5.test.ts` | 6 | 四面。五面の2つの適用期間。特記事項の原文。空欄の印字。登録は index 0〜4 だけ。FormDataType の互換 |
| `services.test.ts` | 14 | 4区分＋unknown（複数該当・略記を含む）。23日／月・23日/月・全角・空白。不明形式は null。和暦→ISO（元年・～・〜）。不正値（不明・印字・2月30日・逆転）は null。行の構造化・並び・他ページを読まないこと |
| `validity.test.ts` | 8 | 放デイ優先。放デイ複数は最も遅い validTo。放デイなしは全体で最も遅い行。期間なしは null。放デイの期間が読めないときに代用しない。同日の扱い。pages からの算出 |
| `candidates.test.ts` | 21 | 正規化（氏名の空白、フリガナのひらがな・カタカナ・長音、住所のハイフン5種）。same / chartEmpty / different / certEmpty。保護者名を personal.name にしない。生年月日の和暦と ISO。読めない日付。guardian.address の候補。personal.address を既定で作らない。補助候補は初期 OFF。guardianBirthday を候補にしない。18歳以上は guardian 候補なし。同姓同名で生年月日違い。sameAddress の通知。入力を書き換えない。Phase 1-A の型をそのまま渡せる |
| `isolation.test.ts` | 3 | **未接続の固定**：src/lib/tsusho 以外から tsusho を import していない。`CERT_TYPES` に tsusho が無い。`CERT_PAGE_PARSERS` に tsusho が無い |

---

## 14. テスト結果

| コマンド | 結果 |
|---|---|
| `node --experimental-strip-types --test "src/lib/tsusho/**/*.test.ts"` | **73/73 成功** |
| `npx tsc --noEmit -p .` | **成功（エラー0）** |
| `npm test` | **185/185 成功**（既存112＋新規73。既存テストの期待値は変更していない） |
| `npm run test:rules`（JAVA_HOME=openjdk@17、エミュレーター） | **10/10 成功** |
| `npx eslint src/lib/tsusho` | **成功（指摘0）** |

- 作業前の基準：同じ worktree で `npm test` 112/112、`tsc` エラー0 を確認済み。
- 実行しなかったもの：
  - `npx next build`：tsusho はどこからも import されないためバンドルに入らない。また worktree には `.env.local`（gitignore 対象）が無く、環境変数に起因する失敗と区別できないため。
  - Functions のテスト：`functions/lib` を書き換えるうえ、Functions は無変更のため。

---

## 15. 既存 Production Core への影響

**なし。**

- **既存ファイルは1つも変更していない**（3章）。
- **既存のコードから tsusho を一切参照していない**。isolation テストで固定した。Next.js は import されたモジュールだけをバンドルするため、本番の画面・バンドルにも含まれない。
- `CERT_TYPES` / `CERT_PAGE_PARSERS` / `PAGE_COUNT` は無変更。**通所受給者証は画面に表示されない。**
- 次のものは無変更：
  - 取込・保存・profile / summary / `currentCertificateId`
  - LINE 版
  - Rules・Storage・Functions・`package.json`
- Firestore への書き込み処理、`chartReview` は実装していない。

---

## 16. 実物サンプルで確認が必要な点

1. Cloud Vision での**ラベルと値の並び**：同じ行か次の行か、複数行の値の分かれ方。fixture は推定。
2. **縦書きの見出し**（「通所給付決定保護者」「児童」）がどう読まれるか。欠落する、1文字ずつになる、「童」だけになる、など。
3. **氏名ラベル**が2つとも読めるか。読めないと、人物は安全側で空になる。その頻度が実用上許容できるか。
4. **居住地**の行の分かれ方と、見出しの断片が混ざる様子（様式11では住所行に見出しの文字が混入した例がある）。
5. **値の中にラベルと同じ語が含まれる場合**：例えば事業所名や特記事項に「予備欄」「特記事項」「支給期間」などが含まれると、その行をラベルとみなして値が途中で切れる（既知の制約。fixture 作成時に確認）。
6. **支給量等の書き方**：「23日／月」以外の表記、加算、変更年月日。
7. **給付決定期間の区切り記号**：`-`（ハイフン）区切りには対応していない（未確認の表記に対応を増やさない方針）。
8. **1面あたりの行数**、追記の並び、`ExtraRows` が実際に発生するか。
9. **五面の特記事項の印字**（第2子軽減・無償化）が印字なのか記入なのか。
10. **四面のラベルの表記**、「指定障害児相談支援事業所名」等の揺れ。
11. **受給者証番号**の枠の読まれ方。桁が行をまたいで分かれると読めない。
12. **長音の復元**：カタカナに挟まれた `-` を「ー」に戻す規則が、実物の氏名・事業所名で誤らないか。

---

## 17. 未実装事項（今回の対象外）

- `CERT_TYPES` / `CERT_PAGE_PARSERS` / ページ定義の本体への登録、レイアウト、サンプル画像（1-B3）
- `getPageCount` と、既存画面のページ数の種別化（1-B4）
- `certificateModel` の期限の分岐、profile 保護（1-B5）
- 管理Web での有効化、LINE の絞り込み（1-B6）
- 差分候補の UI、Firestore への反映、`chartReview` の書き込み（1-B7）
- 六・七面（事業者記入欄）のキー・parser
- LINE 版の対応
- 支給量等の加算の構造化、受給者証番号の検証番号（計算方法が未確認）

---

## 18. 次の 1-B3 へ進む前の注意事項

1. **`isolation.test.ts` を意図的に更新する必要がある。** tsusho を `CERT_TYPES` / `CERT_PAGE_PARSERS` に登録すると失敗するように作ってある。更新時は理由をコメントに残す。
2. **依存関係**：tsusho は Phase 1-A の `src/lib/beneficiaryChart/dates.ts`（未コミット）を import している。**Phase 1-A を先に（または同時に）コミットする**必要がある。
3. **キーの意味の違い**：tsusho では `name` は児童で、`address` は使わない。adult / child の画面部品（例：`extractCertificateHighlights`、LINE の `KEY_FIELDS`）を tsusho にそのまま流用しないこと。
4. **parser の登録先**：`CERT_PAGE_PARSERS.tsusho` に `TSUSHO_PAGE_PARSERS` を登録する。`parseCertText` は登録前に `normalizeText` を適用するので、`parseTsushoCertText` と同じ手順になる。
5. **型**：`CertTypeId` に `tsusho` を加えると、`Record<CertTypeId>` の3か所（ページ定義・レイアウト・parser）でエントリが必須になる。既存テスト（選択可能な種別、範囲外ページ）の更新も必要（設計書 4.3）。
6. **長音の扱い**：既存の `normalizeText` が長音を `-` にする問題は adult でも起きている。今回は tsusho の parser の中でだけ戻している。共通化するかは別途判断。
7. **施設リリースとの関係**：今回の内容（未接続の新規ファイル）は、施設リリース前に取り込んでも本番の挙動を変えない。1-B3 以降は、設計書どおり施設リリース後に進めることを推奨する。

---

## 19. Git 状態

- **作業場所**：`paperlesscare-web/.claude/worktrees/phase1b-tsusho-b1b2`（branch `worktree-phase1b-tsusho-b1b2`、作成元 HEAD `7c6ee87c`）
  - このセッションの編集ガードにより、共有チェックアウトへ直接書き込めなかったため、worktree を使った。
  - Phase 1-A の未コミット変更は、共有チェックアウトから**ファイルをコピーして再現**した（共有チェックアウトは読み取りのみ）。`src/`・`tests/`・Rules・`package.json` が同一であることを確認済み。
  - `node_modules` は共有チェックアウトへのシンボリックリンク。
- **worktree の `git status`**：
  - Phase 1-A の再現分：`M firestore.rules / package.json / SideNav.tsx / CertImportFlow.tsx / [beneficiaryId]/page.tsx / beneficiaries/page.tsx / beneficiaries.ts / storage.rules`、`D page.module.css`、`?? chart/ components/ src/lib/beneficiaryChart/ tests/`。いずれも共有チェックアウトと同一内容。
  - 今回の追加：`?? src/lib/tsusho/`、本報告書。
- **commit・push はしていない**。main も変更していない。
- **共有チェックアウトへの取り込み**：ユーザーが実行する。共有チェックアウト（`paperlesscare-web/`）で次を実行する。
  ```
  cp -R .claude/worktrees/phase1b-tsusho-b1b2/src/lib/tsusho src/lib/
  cp .claude/worktrees/phase1b-tsusho-b1b2/PHASE1B_B1_B2_IMPLEMENTATION_REPORT.md .
  ```
  - 取り込みは、セッション終了時に worktree を削除する前に行う必要がある。

---

## 20. Production へ接続していないこと

- Firebase（`paperlesscare`）・Vercel・Production の Firestore / Storage / Functions には一切接続していない。Production のデータも参照していない。
- 実行したのは、ローカルの単体テスト・型検査・ESLint・Firebase エミュレーター（`demo-paperlesscare`）での Rules テストだけ。
- deploy・commit・push はしていない。
