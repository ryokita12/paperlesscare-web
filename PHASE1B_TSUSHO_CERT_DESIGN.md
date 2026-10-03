# PaperlessCare Phase 1-B 「通所受給者証」対応 実装設計書

- 作成日：2026-10-03
- 対象：`paperlesscare-web/`（branch `feat/phase1a-beneficiary-chart`。Phase 1-A は未コミットで作業ツリー上にある）
- 種別：**調査・設計のみ**。ソースコード、テスト、Rules、`package.json`、Firebase データは変更していない。deploy・commit・push もしていない。Production には接続していない。既存の `PHASE1B_RESEARCH_REPORT.md` も変更していない
- 一次情報（取得して直接読んだもの）
  - こども家庭庁「障害児通所給付費に係る通所給付決定事務等について」（令和8年3月版 PDF）。以下「CFA要領」
  - こども家庭庁 **様式第9号 通所受給者証（例）**（xlsx、令和7年2月3日掲載）。以下「様式9」
  - 厚生労働省 **様式第11号 障害福祉サービス受給者証（例）**（xls）。以下「様式11」。現行 adult / child との比較に使用
- 表記
  - 「確認済み」：コードまたは公式資料で確認
  - 「未確認」：確認できていない
  - 「要実物確認」：記入済みの実物でしか確認できない
  - 「要人間判断」：方針として決めてもらう必要がある

---

## 1. 結論・推奨設計

1. **新しい証種 `tsusho` を、第3の独立した `certType` として追加する。** 既存の `adult` / `child`（いずれも様式11系）は**一切変更しない**。
2. **ページ構成は様式9の一〜七面の7ページ**とする。八・九面は定型文の注意事項なので撮影対象外。
   - 一〜五面：OCR対象
   - 六・七面：事業者記入欄。画像保存と手入力のみ
3. **利用者本人と保護者をキー名で明確に分ける。**
   - `name` / `furigana` / `birthday`：**児童**（＝利用者本人）
   - `guardianName` / `guardianFurigana` / `guardianBirthday` / `guardianAddress`：**通所給付決定保護者**
   - こうすると、既存の `buildSummary`、`profile`、LINE の `isNameMismatch` と「氏名」入力欄が、**変更なしで児童の氏名を扱う**。保護者名を利用者名として扱う事故を、構造的に防げる（8章）。
4. **支給決定サービスは、ページ上は既存と同じ連番キーで保持する。**
   - 二面は1〜2行目、三面は3〜4行目。キーは `serviceTypeN` / `serviceAmountN` / `servicePeriodN`
   - **構造化した `services[]` は、保存せずに読み取り時に純粋関数で作る**（9章）。既存の `updateCertificatePages` は決まったフィールドしか更新しないため、保存した派生データは古くなる。それを避けるため。
5. **一覧の「期限」は「放課後等デイサービスの給付決定期間の終了日」とする。** 該当が無ければ全サービスから選ぶ。
   - 算出は `buildCertificateContent` に `certType === "tsusho"` の分岐を1つ加えて行う。結果は既存の `validFrom` / `validTo` に入る。
   - これで一覧・カルテ上部・LINE 詳細の期限表示が自動で動く。adult / child の計算経路は変えない（10章）。
6. **OCR結果はカルテを上書きしない。** 証の保存後に、カルテの「受給者証」タブで差分候補を出す。スタッフが選んだ項目だけを、新しいトランザクション関数で反映する（11章）。
7. **最初のリリースは管理Webのみとする**（16章、案A）。
   - LINE 版では `tsusho` を選べないようにする。そのために `CERT_TYPES` に「LINE で選択可」のフラグを足し、LINE の絞り込みを1行変える。
8. **再来週の施設リリースより前に入れてよいのは、アプリから参照されない新規ファイルだけ**とする。新規ファイルは純粋ロジック・parser・テストに限る。Production Core に触る段階は、リリース後に分けて出す（19章）。
9. 公式様式だけで parser の骨格は書ける。**値の取れ方と自治体差は、記入済みの実物で確認する必要がある。** 最小構成は「主要自治体の記入済み証 2冊、一〜五面（＋可能なら六・七面）」（17章）。

---

## 2. 現行 adult / child 構造（要約）

| 項目 | 現状（確認済み） |
|---|---|
| 証種 | `CERT_TYPES`（`constants/certPages.ts:5-33`）：`mobility`（無効）／`adult`（紫・有効）／`child`（黄緑・有効）。`CertTypeId` はこの配列から導出 |
| 対応する公式様式 | adult・child とも**様式11（障害福祉サービス受給者証）**。child のサンプル画像の表題は「障害福祉サービス受給者証（Ⅰ）」 |
| ページ | `PAGE_COUNT = 8` で固定。3種別とも同じ `PAGE_DEFINITIONS` を使う（`PAGE_DEFINITIONS_BY_CERT_TYPE`） |
| レイアウト | `CERT_LAYOUT_IDS`（`certLayoutMap.ts`）。child は page6 だけ別（問い合わせ先あり） |
| parser | `CERT_PAGE_PARSERS`：adult は page1〜4、child と mobility は空 |
| formData | `FormDataType = Record<string,string> & {既定キー}`。既定キー以外の文字列キーも型上は許される |
| 保存 | `createBeneficiaryWithCertificate`（新規）、`addCertificateToBeneficiary`（更新・トランザクション）。証の内容は `buildCertificateContent` で組み立てる。`summary` は `pages[0]` の `name`・`furigana`・`birthday`・`number`・`cityName` から作る。`validFrom`・`validTo` は page2 の `servicePeriod1`、無ければ page7 の `burdenPeriod` から作る |
| 利用者名 | 表示の優先順位：管理Webは `personal` → `profile` → `summary`、LINE は `profile` → `summary`。更新時は `mergeProfile` が `profile` を証の値で上書きする |
| 現在の証 | 利用者doc の `currentCertificateId` は**1つだけ**。新しい証を保存すると、旧証は種別に関係なく `superseded` になる |

詳細は `PHASE1B_RESEARCH_REPORT.md`（前回の調査）を参照。

---

## 3. 通所受給者証の公式様式

### 3.1 根拠

- 記載事項（CFA要領 Ⅳ-3、則第18条の18）：①通所給付決定保護者の氏名・居住地・生年月日 ②障害児の氏名・生年月日 ③交付年月日・受給者証番号 ④障害児通所支援の種類・支給量 ⑤通所給付決定の有効期間 ⑥負担上限月額等 ⑦その他
- 様式例は**標準様式**である（CFA要領 Ⅳ-2）。市町村は「基本的なレイアウトに著しい変更がなく、必要な記載事項が網羅され」ていれば工夫してよい。公式に挙がっている工夫の例は次の3つ。
  - 「障害児」の表記を「児童」にする
  - 項目ごとの欄を増やし、変更履歴が分かるようにする
  - 事業者記入欄を切り離す
  - **→ 自治体ごとに、欄の数・表記・面の構成が違いうる**（要実物確認）。
- 交付方法（CFA要領 Ⅳ-6）：新しいサービスを決定したとき、支給量を変えたとき、有効期間が満了して再決定したときは、**交付済みの証に追加記入する方法と、新しく交付する方法の両方がある**。同じ証の中に古い行と新しい行が並ぶことがある。

### 3.2 面ごとの構成（様式9。セル配置から抽出、確認済み）

凡例：
- OCR＝OCR対象にすべきか
- 保存＝certificate に保存すべきか
- 候補＝カルテ連携の候補か
- 不要＝OCR不要

| 面 | 見出し | 項目（原文） | OCR | 保存 | 候補 | 備考 |
|---|---|---|---|---|---|---|
| 一 | 通所受給者証 | 受給者証番号 | ○ | ○ | ×（証の情報） | 10桁。10桁目は検証番号。**同じ保護者でも障害児ごとに別番号**（CFA要領）。検証番号の計算方法は今回の資料に記載なし（未確認） |
| | | 通所給付決定保護者：居住地 / フリガナ / 氏名 / 生年月日 | ○ | ○ | 氏名・フリガナ・居住地は○ | 居住地は保護者の欄。原則は住民票上の住所 |
| | | 児童：フリガナ / 氏名 / 生年月日 | ○ | ○ | ○ | **児童欄に居住地は無い** |
| | | 交付年月日 | ○ | ○ | × | |
| | | 支給市町村名及び印 | ○（市町村名） | ○ | × | 市町村番号・名称・所在地・電話を記載（CFA要領）。印影はOCR不要 |
| | | （18歳以上の通所者） | — | — | — | 「保護者欄と児童欄の両方に本人を記載する」（CFA要領）。8章で扱う |
| 二 | 障害児通所給付費の給付決定内容 | 〔2行〕支援の種類 / 支給量等 / 給付決定期間 | ○ | ○ | ×（証の情報。期限管理に使う） | 支援の種類は4区分：児童発達支援、放課後等デイサービス、居宅訪問型児童発達支援、保育所等訪問支援（CFA要領） |
| | | 特記事項欄 / 予備欄 | ○（原文のまま） | ○ | × | |
| 三 | 同上（続き） | 二面と同じ（2行＋特記事項・予備欄） | ○ | ○ | × | 様式例では二・三面で**計4行** |
| 四 | 障害児相談支援給付費の支給内容 | 支給期間（**年月**まで） / 指定相談支援事業所名 / モニタリング期間 / 予備欄 | ○ | ○ | 事業所名は○ | 記載例：「6月ごと（令和○年○月～令和○年○月）」。特別地域加算の対象者は予備欄に記載 |
| 五 | 利用者負担に関する事項 | 負担上限月額（円） / 適用期間 | ○ | ○ | × | 無償化対象児童は「0円」などと記載し、特記事項にも記載 |
| | | 食事提供加算対象者 / 適用期間 | ○ | ○ | × | 「該当」または「該当者」と記載 |
| | | 利用者負担上限額管理対象者該当の有無 / 利用者負担上限額管理事業所名 | ○ | ○ | × | |
| | | 特記事項欄（第2子（第3子以降）軽減対象児童、無償化対象児童〔対象期間〕） / 予備欄 | ○（原文） | ○ | × | |
| 六 | 障害児通所支援事業者記入欄 | 〔番号1〜3〕事業者及びその事業所の名称 / 支援の内容 / 契約支給量 / 契約日 / 当該契約支給量による支援提供終了日 / 支援提供終了月中の終了日までの既提供量 | ×（初期） | ○（手入力） | 後段で contract の候補 | 事業者が記入する。手書き・ゴム印の可能性があり、OCR精度は要実物確認 |
| 七 | 同上 | 〔番号4〜6〕同上 | ×（初期） | ○（手入力） | 同上 | |
| 八・九 | 注意事項欄 | 定型文（1〜11） | 不要 | 不要 | × | 6番に「給付決定期間を経過する前に再申請」とある。給付決定期間が実務上の期限であることの根拠 |

様式11（adult / child）にはあって様式9には**無い**もの：障害支援区分、認定有効期間、介護給付費・訓練等給付費、特定障害者特別給付費、受給者証（Ⅱ）、一面の「障害種別」欄。

---

## 4. 新 certType 設計

### 4.1 内部値

**`tsusho` を推奨する。**

- 既存の値は英小文字1語（`mobility` / `adult` / `child`）。この形に合う。
- `child` と意味が紛れない。英訳（例：`dayService`）にすると、「障害児通所支援」と「障害福祉サービスの日中活動」が混同されやすい。
- 公式名称「**通所**受給者証」と直接対応する。

Firestore の `certType` は文字列で、Rules の検証も無いため、値の追加に制約は無い（確認済み）。最終決定は要人間判断。

### 4.2 `CERT_TYPES` への追加案

```ts
{ id: "tsusho", label: "通所受給者証（児童福祉法）", shortLabel: "通所受給者証",
  colorName: "通所受給者証", themeClass: "cert-type-…", enabled: false /*段階的に*/,
  lineEnabled: false /*新設フラグ*/, statusLabel: "準備中" }
```

- **`colorName`**：通所受給者証の用紙の色は公式資料に定めが無い（未確認）。色名ではなく名称で示す。
- **LINE の種別選択**：LINE は「お手元の受給者証の**色**を選んでください」と色で選ばせている（`LineCertImportView.tsx:222`）。LINE 対応時は、表題で選ぶ文言にする必要がある。

### 4.3 影響ファイル一覧（`certType` を1つ追加した場合）

| ファイル | 影響 | 必須か |
|---|---|---|
| `constants/certPages.ts` | `CERT_TYPES` に追加。`PAGE_DEFINITIONS_BY_CERT_TYPE` は `Record<CertTypeId>` なので**エントリ追加が型で強制される**。tsusho 専用のページ定義を追加 | 必須 |
| `constants/certLayoutMap.ts` | `CERT_LAYOUT_IDS` は `Record` なのでエントリ追加が必須。`CertLayoutId` に新しいID | 必須 |
| `components/certLayouts.tsx` | `LAYOUT_COMPONENTS` は `Record<CertLayoutId>` なので新IDの登録が必須。`EditableCertCell` は**非公開**なので、新しいファイルから使うには `export` が必要 | 必須（追加のみ） |
| 新規 `components/tsushoLayouts.tsx` | 一〜七面のレイアウト | 新規 |
| `lib/parsers/parseCertText.ts` | `CERT_PAGE_PARSERS` は `Record<CertTypeId>` なので、`tsusho: {}` の追加が必須。後で parser を登録 | 必須 |
| 新規 `lib/parsers/tsusho/*.ts` | 一〜五面の parser | 新規 |
| `lib/firestore/certificateModel.ts` | `buildCertificateContent` に tsusho の期限分岐 | 推奨（10章） |
| `lib/firestore/beneficiaries.ts` | tsusho 更新時の profile 保護（12章） | 要人間判断 |
| `CertImportFlow.tsx` | 7ページ化（`PAGE_COUNT` を15か所前後で参照）、種別切替時のクリア、管理Webでの選択可否 | 7ページ化を選ぶ場合は必須 |
| `line/import/LineCertImportView.tsx` | `CERT_TYPES.filter(t => t.enabled)` を**そのまま表示する**ので、`enabled: true` にした瞬間に LINE にも出る。`PAGE_COUNT`・`TYPE_SWATCH`・キー項目の文言 | 案Aでも絞り込みの1行は必須 |
| `line/beneficiaries/[beneficiaryId]/page.tsx` | `certTypeLabel`（`CERT_TYPES.label`） | 変更不要（自動で表示される） |
| `components/PageTabs.tsx` | `/cert-samples/${certType}/page-N.png` | 画像の追加が必要 |
| `public/cert-samples/tsusho/page-1〜7.png` | サムネイル。様式9の空様式から作成でき、個人情報を含まない | 新規 |
| `beneficiaries/[beneficiaryId]/chart/CertificatesPanel.tsx` | `padPages`・表示が `PAGE_COUNT` 固定。`certTypeLabel` は `colorName` を使う | 7ページ化を選ぶ場合 |
| `chart/CertificateHighlightsCard.tsx`、`src/lib/beneficiaryChart/certificateHighlights.ts` | 要点は page 2〜4 と 7・8 を固定で見ている。tsusho では負担が五面にあるため、種別ごとの関数が必要 | 必須（Phase 1-A の範囲） |
| `types/cert.ts` | 新キーを任意プロパティとして追加。型の上では無くても動く | 推奨（追加のみ） |
| テスト | `certLayoutVariant.test.ts`：選択可能な種別が `["adult","child"]` と固定され、範囲外ページは全種別で `userBurden` に落ちる前提。`fallbackSafety.test.ts`・`certLayoutMap.test.ts`：`CERT_TYPES` × `PAGE_COUNT` のループ | **意図的な更新が必要** |
| Functions `ocrFromImageData` | `LOGGABLE_CERT_TYPES` に無い種別は、ログに certType を出さないだけ。OCR は種別に関係なく動く | **変更不要** |
| `firestore.rules` / `storage.rules` | certType の検証が無い。Storage は `certificates/{certificateId}/{fileName}` で、ファイル名も自由 | **変更不要** |
| 利用者一覧・カルテ上部 | `validTo` を読むだけ | 変更不要（10章の分岐で自動対応） |

**旧フロントとの互換**：tsusho の証を保存した後に古いタブが残っていても、表示が崩れて落ちることはない。

- `getPageDefinitions` やレイアウトは adult の定義にフォールバックする。
- LINE の種別名は空文字になる。

---

## 5. ページ構成

### 5.1 tsusho 専用のページ定義（案）

既存の `PAGE_DEFINITIONS` は**複製しない**。新しい定数 `TSUSHO_PAGE_DEFINITIONS` を作り、`PAGE_DEFINITIONS_BY_CERT_TYPE.tsusho` に登録する。

| No | title | shortTitle | layoutId（新） | OCR |
|---|---|---|---|---|
| 1 | 通所受給者証（一面） | 一面 基本情報 | `tsushoBasic` | ○ |
| 2 | 障害児通所給付費の給付決定内容（二面） | 二面 給付決定① | `tsushoDecisionA`（1〜2行目） | ○ |
| 3 | 障害児通所給付費の給付決定内容（三面） | 三面 給付決定② | `tsushoDecisionB`（3〜4行目） | ○ |
| 4 | 障害児相談支援給付費の支給内容（四面） | 四面 相談支援 | `tsushoConsultation` | ○ |
| 5 | 利用者負担に関する事項（五面） | 五面 利用者負担 | `tsushoBurden` | ○ |
| 6 | 障害児通所支援事業者記入欄（六面） | 六面 事業者① | `tsushoProviderA`（番号1〜3） | ×（手入力） |
| 7 | 障害児通所支援事業者記入欄（七面） | 七面 事業者② | `tsushoProviderB`（番号4〜6） | ×（手入力） |

八・九面（注意事項）は扱わない。

### 5.2 7ページを扱う方法（要人間判断）

`PAGE_COUNT = 8` は CertImportFlow（約15か所）、LINE（ページ数表示・最終ページ判定・タブ）、CertificatesPanel（`padPages`・表示）、テストで固定値として使われている。

| 案 | 内容 | Production Core の変更 | 評価 |
|---|---|---|---|
| **P1 種別ごとのページ数（推奨）** | `getPageCount(certType)` を新設（adult / child は8、tsusho は7）。内部のページ配列は8枠のまま（セッション退避・保存ループは変えない）。ページ移動・タブ・「n/N」表示だけを `getPageCount` で行う | 中（参照の機械的な置換） | 実在しない8ページ目を作らずに済む。adult / child は戻り値が8で挙動が変わらないことをテストで固定する |
| P2 8ページ目を「撮影不要」とする | 8ページ目を空の定義にする | 低 | 公式様式に無いページが画面に出る。誤入力の温床。非推奨 |
| P3 tsusho 専用の取込コンポーネント | CertImportFlow を複製する | 既存は無変更 | セッション・IndexedDB・アップロード・保存の約1,200行が二重になり、将来の修正漏れの危険が大きい。非推奨 |

P1 では、保存される tsusho の `pages` に8枠目（空）が残る。保存時に `getPageCount` で切り詰めると保存ループ（Production Core）に手が入る。そのため、**最初は8枠のまま保存し、表示側で7ページだけ見せる**ことを推奨する。

### 5.3 種別切替時のクリア

- 現状、取込中に種別を切り替えても `pages` は残る（`CertImportFlow.tsx:921-930`）。
- tsusho と他の種別ではキーの意味が違う。例えば `name` は、tsusho では児童、adult / child では支給決定障害者等を指す。
- **tsusho との間で切り替えるときは、確認のうえ取込内容をクリアする**必要がある。CertImportFlow の変更になる。

---

## 6. OCR対象フィールド一覧

分類：①OCR対象 ②certificate保存対象 ③カルテ反映候補 ④表示のみ ⑤今回対象外

| 面 | 項目 | formData キー（案） | 分類 | 備考 |
|---|---|---|---|---|
| 一 | 受給者証番号 | `number`（既存） | ①② | 10桁。同一人物判定の補助に使う |
| 一 | 保護者 居住地 | `guardianAddress`（新） | ①②③ | 反映先は guardian.address（8章） |
| 一 | 保護者 フリガナ | `guardianFurigana`（新） | ①②③ | → guardian.furigana |
| 一 | 保護者 氏名 | `guardianName`（新） | ①②③ | → guardian.name |
| 一 | 保護者 生年月日 | `guardianBirthday`（新） | ①②④ | カルテに受け皿が無い |
| 一 | 児童 フリガナ | `furigana`（既存） | ①②③ | → personal.furigana |
| 一 | 児童 氏名 | `name`（既存） | ①②③ | → personal.name。summary・profile・LINE の氏名もこの値を使う |
| 一 | 児童 生年月日 | `birthday`（既存） | ①②③ | → personal.birthDate（ISO に正規化） |
| 一 | 交付年月日 | `issueDate`（既存） | ①② | 証doc の `issueDate` に入る（既存処理） |
| 一 | 支給市町村名 | `cityName`（既存） | ①② | |
| 一 | 市町村の所在地・連絡先 | `issuerAddress`（既存） | ②④ | OCR は任意 |
| 二・三 | 支援の種類（行1〜4） | `serviceType1〜4`（既存キーを流用） | ①② | 4区分のどれかに正規化した値は読み取り時に作る |
| 二・三 | 支給量等（行1〜4） | `serviceAmount1〜4` | ①②④ | 原文で保存。日数／月は読み取り時に解釈。加算区分（医療的ケア区分など）の構造化は⑤ |
| 二・三 | 給付決定期間（行1〜4） | `servicePeriod1〜4` | ①② | 期限管理に使う |
| 二・三 | 特記事項欄 / 予備欄 | `specialNotes` / `memo`（面ごと） | ①②④ | |
| 四 | 支給期間 | `supportPeriod`（既存） | ①②④ | 年月まで |
| 四 | 指定相談支援事業所名 | `planOfficeName`（既存） | ①②③ | → consultationSupport.officeName |
| 四 | モニタリング期間 | `monitoringPeriod`（既存） | ①②④ | |
| 四 | 予備欄 | `memo` | ②④ | |
| 五 | 負担上限月額 / 適用期間 | `burdenLimitAmount` / `burdenPeriod`（既存） | ①②④ | |
| 五 | 食事提供加算対象者 / 適用期間 | `mealProvisionStatus`（既存）/ `mealProvisionPeriod`（新） | ①②④ | |
| 五 | 上限額管理対象者の有無 / 管理事業所名 | `managementTargetStatus` / `managementOfficeName`（既存） | ①②④ | |
| 五 | 特記事項欄（多子軽減・無償化） / 予備欄 | `specialNotes` / `memo` | ①②④ | |
| 六・七 | 番号n：事業者・事業所名 / 支援の内容 / 契約支給量 / 契約日 / 支援提供終了日 / 既提供量 | `providerNameN` / `providerServiceN` / `providerContractAmountN` / `providerContractDateN` / `providerEndDateN` / `providerProvidedAmountN`（新、N=1〜6） | ②（手入力）、③は後段、①は⑤ | 自事業所の行は、contract.providerEntryNumber・contractDate・contractedAmount の候補になりうる。最初のリリースでは扱わない |

**`services[]` にするかについて**：様式は2行×2面の**繰り返し構造**で、追記によって古い行と新しい行が並ぶこともある。保存形は既存のセル単位の編集UIとの互換のため、平たいキーのまま（`serviceType1〜4`）とする。そのうえで、**読み取り時に `services[]` へ変換する純粋関数を正とする**（9章）。

---

## 7. certificate データモデル

| フィールド | tsusho での意味 | 生成 |
|---|---|---|
| `certType` | `"tsusho"` | 既存 |
| `pages[]` | 8枠（表示は7）。`formData` は6章のキー | 既存 |
| `summary` | `buildSummary(pages[0])`：name・furigana・birthday が**児童**、number、cityName | 既存（変更なし） |
| `issueDate` | 一面の交付年月日 | 既存 |
| `validFrom` / `validTo` | **代表給付決定期間**（10章の規則） | `buildCertificateContent` の tsusho 分岐（新） |
| `status` / `supersededBy` / `source` / 作成・更新者 | 既存どおり | 既存 |
| `chartReview`（新・任意） | 差分候補の確認記録（11章） | カルテ側の新関数だけが書き込む |

方針：
- **派生データ（`services[]`、代表サービス名など）は保存しない。** `updateCertificatePages`（受給者証タブでのOCR訂正）は、`pages`・`summary`・`issueDate`・`validFrom`・`validTo` だけを更新する。保存した派生データは訂正のたびに古くなる。`validFrom` / `validTo` は `buildCertificateContent` を通るので、訂正時にも再計算される。
- adult / child の docs は形も値も変わらない。

---

## 8. 児童・保護者マッピング

| 証の項目 | カルテの反映候補 | 初期チェック | 根拠・注意 |
|---|---|---|---|
| 児童 氏名 / フリガナ / 生年月日 | `personal.name` / `furigana` / `birthDate` | カルテ側が空なら ON、差分があれば OFF | 児童＝利用者本人 |
| 保護者 氏名 / フリガナ | `guardian.name` / `furigana` | 同上 | 続柄は証に無い |
| 保護者 生年月日 | （受け皿なし） | — | 表示のみ |
| **居住地** | **`guardian.address` を第一候補** | 同上 | 様式上は**保護者の欄**で、児童欄に居住地は無い |
| 居住地 | `personal.address`（**補助候補**） | **常に OFF** | 児童の住所としては記載されていない。「保護者の居住地を利用者の住所にも使う」と明示した場合だけ反映する。要人間判断 |
| 指定相談支援事業所名 | `consultationSupport.officeName` | 同上 | 専門員名・連絡先は証に無い |
| 郵便番号 | （証に無い） | — | `postalCode` の候補は作らない |

**居住地の判断**：
- 様式9の「居住地」は通所給付決定保護者の欄で、原則は住民票上の住所。
- 児童が保護者と同居しているかどうかは証からは分からない。
- このため、`personal.address` を第一候補にするのは様式の意味に反する。
- `guardian.sameAddressAsBeneficiary === true` の場合は、guardian.address を反映すれば、カルテ上の利用者住所も同じ値として表示される（`resolveGuardianAddress`）。

**18歳以上の通所者**：保護者欄と児童欄の両方に本人が記載される（CFA要領）。保護者欄と児童欄の氏名・生年月日が一致する場合は、**guardian の候補を出さない**。

**parser の安全規則**：
- 一面では「氏名」のブロックを**ちょうど2つ**検出できたときだけ、1番目を保護者、2番目を児童として埋める。
- 1つしか取れないときは、どちらも空欄にする。保護者名が `name` に入る事故を防ぐため。
- 縦書きの見出し（「通所給付決定保護者」「児童」）は、OCRで欠落しやすい。これは様式11での調査結果で、様式9での確認は要実物確認。見出しには依存しない。

---

## 9. 支給決定サービス構造

読み取り時の型（案。新規 `src/lib/tsusho/services.ts`）：

```ts
type TsushoServiceKind = "jidoHattatsu" | "houkagoDay" | "kyotakuHoumon" | "hoikushoHoumon" | "unknown";
type TsushoServiceDecision = {
  row: 1 | 2 | 3 | 4;          // 二面1・2、三面3・4
  kind: TsushoServiceKind;      // 正規化した区分（NFKC・空白除去後の部分一致。不一致は unknown）
  kindText: string;             // 証の記載どおり
  amountText: string;           // 支給量等の原文（加算・変更年月日を含む）
  daysPerMonth: number | null;  // 「23日／月」等を読めたときだけ
  periodText: string;
  validFrom: string | null;     // 給付決定期間（ISO）
  validTo: string | null;
};
function extractTsushoServices(pages): TsushoServiceDecision[]   // 種類・量・期間がすべて空の行は除く
```

- 4区分の名称は CFA要領 Ⅳ-4(2) の列挙を正とする。略記（例：「放デイ」）の扱いは要実物確認。
- 期間は、既存の `parseWarekiPeriod`（令和・平成・昭和・元年、「から」「〜」「~」）を再利用できる。
- **既存の adult / child とは統一しない。** 互換性はキー名の流用（`serviceTypeN` など）と、読み取り関数の分離で保つ。

---

## 10. 期限管理

### 10.1 定義を分ける

| 概念 | tsusho での実体 | 保存先 |
|---|---|---|
| 証そのものの有効期限 | **様式9に単一の項目は無い**（確認済み） | 作らない |
| サービスの給付決定期間 | 二・三面の各行 | `pages` |
| 代表給付決定期間（一覧の期限） | 下の規則で1つ選ぶ | 証doc の `validFrom` / `validTo` |
| 負担上限月額の適用期間 | 五面 | `pages`（表示のみ。期限には混ぜない） |
| 相談支援の支給期間 | 四面 | `pages`（表示のみ） |

### 10.2 代表期間の規則（案。要人間判断）

1. 対象行：`kind === "houkagoDay"` の行が1つでもあれば、その行だけ。無ければ全サービス行。
2. その中で **`validTo` が最も遅い行**を代表にする。`validFrom` もその行の値を使う。
   - 追記によって、古い行と新しい行が同じ証に並ぶ場合にも対応できる。
   - 「今日」に依存しないので、保存時に決まった値になる。
3. 期間が読めた行が1つも無ければ `null`。一覧の表示は既存どおり「期限未入力」になる。

| ケース | 結果 |
|---|---|
| 放デイあり | 放デイ行のうち、終了日が最も遅い期間 |
| 児発のみ | 児発の期間（一覧では「（児童発達支援）」と根拠を表示） |
| 複数サービス・期間がばらばら | 放デイがあれば放デイ。無ければ最も遅い終了日。他の期間はカルテの詳細で一覧表示 |
| 次期の決定が先に記載されている（開始日が未来） | 未来の行が代表になり、状態は「有効」。現行期間の終了前に次期の決定が済んでいる、という意味として扱う。表示で開始日を示す |

### 10.3 実装位置

- `certificateModel.ts` の `buildCertificateContent` に、次の1分岐を加える。
  ```
  ...(input.certType === "tsusho" ? extractTsushoValidity(input.pages) : extractValidity(input.pages))
  ```
- `extractTsushoValidity` は新規ファイルに置く。
- adult / child は既存の `extractValidity` をそのまま通る。
- これで以下が**変更なしで**動く。
  - 一覧（`getCurrentCertificateValidity` → `getCertificateStatus`）
  - カルテ上部
  - LINE 詳細の「期限切れ」表示

### 10.4 表示名（要人間判断）

- tsusho の証では、「受給者証期限」ではなく **「給付決定期限」**（ツールチップ等に「放課後等デイサービス 〜令和8年3月31日」）を推奨する。
- 一覧の列名は、種別が混在するので **「決定期間の期限」** などの共通名にする。行ごとに根拠のサービス名を表示する。
- 根拠のサービス名は読み取り時に計算する。保存しない。

---

## 11. OCR → カルテ差分候補

### 11.1 流れ

1. 証を保存する（既存処理）。
2. 管理Web は `?tab=certificates` に遷移する（Phase 1-A の既存処理）。
3. **現在の証が tsusho で、未確認の候補がある**場合、受給者証タブの上部にカードを出す：「受給者証から新しい情報が見つかりました（n件）」
4. 比較表を出す：項目 ／ 現在のカルテ ／ 受給者証 ／ ☐反映
5. スタッフが「選択した内容をカルテへ反映」を押す。

### 11.2 構成要素（すべて新規。Phase 1-A の範囲）

| 要素 | 置き場所 | 内容 |
|---|---|---|
| 候補抽出 | `src/lib/beneficiaryChart/tsushoCandidates.ts`（純粋関数） | 8章の対応表で、証の pages から候補を作る。certType が tsusho 以外なら空配列（adult / child は対象外） |
| 正規化比較 | 同上 | 氏名：NFKC＋空白除去。フリガナ：ひらがなをカタカナに（既存の `normalizeForChartSearch`）。日付：`normalizeDateText`。住所：NFKC＋空白除去＋ハイフン類の統一（「‐－ー−」→「-」）。**一致判定にだけ使い、表示は原文** |
| 差分の状態 | 同上 | `same`（出さない）／`chartEmpty`（初期 ON）／`different`（初期 OFF）／`certEmpty`（出さない） |
| UI | 新 `chart/CertificateCandidatesCard.tsx` | 全選択・全解除、反映、「今回は反映しない」、閉じる（キャンセル） |
| 反映 | `chartStore.ts` に新関数 `applyCertificateCandidates` | `runTransaction` の中で、利用者doc を読み、**画面に表示したときのカルテ値と今の値が一致することを確かめてから**、`personal.name` などを項目単位（フィールドパス）で更新する。personal の氏名・フリガナ・生年月日を更新した場合は、既存の `buildPersonalUpdate` と同じ規則で `profile` にも写す。`summary` には触れない。同じトランザクションで、証doc に `chartReview` を書く |

### 11.3 「反映しない」と再表示の制御（要人間判断）

- **推奨**：証doc に `chartReview = { decisions: { [fieldKey]: { action: "applied"|"dismissed", certValueNormalized, at, by } } }` を持たせる。
- 同じ証の同じ値について一度判断した候補は、もう出さない。
- 受給者証タブでOCR値を訂正し、値が変わった場合は、その項目だけ再び候補に出す。
- 新しい証を登録したときは、新しい doc なので候補は最初からやり直しになる。
- 記録を持たない案（毎回出す）は単純だが、住所の表記ゆれなどが毎回表示されて使われなくなる恐れがある。
- **既存処理との関係**：`chartReview` は既存のどの関数も書き込まない。`updateCertificatePages` は特定のフィールドだけを `update` するので、`chartReview` は消えない（確認済み）。Rules の変更も不要。

---

## 12. personal / profile / summary

### 12.1 Phase 1-B 完了後の責務（提案）

| | 責務 | 書き込むもの |
|---|---|---|
| `personal` | **利用者本人の正本** | カルテ編集、候補の反映（スタッフ操作）だけ |
| `profile` | 既存画面（LINE・取込画面）向けの**表示用の写し**。personal に従う | personal の保存・反映時。personal が無い利用者は従来どおり証から |
| `summary` | **現在の証の写し**（証番号・市町村などを含む） | 証の保存・訂正時（既存どおり）。カルテ情報ではない |

### 12.2 タイミング別（tsusho）

| 場面 | personal | profile | summary |
|---|---|---|---|
| 新規登録（管理Web） | 書かない（候補として提示） | 既存どおり証から作成（＝児童名。スタッフが取込画面で確認・修正した値） | 既存どおり |
| 既存利用者の更新 | 書かない（候補として提示） | **personal があれば上書きしない**（要人間判断。下記） | 既存どおり `mergeSummary` |
| LINE 取込（後段） | 書かない | 管理Web と同じ | 同じ |
| 候補の反映 | 項目単位で更新 | personal の写し | 触れない |

**profile 保護の論点**：
- 既存の `addCertificateToBeneficiary` は、証の値が空でなければ `mergeProfile` で profile を上書きする。
- tsusho でもこのままだと、OCR の誤読（例：「太郎」→「太朗」）が LINE の表示名にそのまま出る。前回レポートの D-1。
- **推奨**：`certType === "tsusho"` で、かつ利用者doc に `personal.name` がある場合は profile を更新しない。この条件分岐だけを加える。
- adult / child の挙動は変えない。
- `beneficiaries.ts`（Production Core・高リスク）の変更になるため、施設リリース後に単独のステップとして行う。要人間判断。

---

## 13. 新規利用者フロー

```
管理Web「新しい利用者」→ 証種「通所受給者証」→ 一〜五面を撮影（六・七面は任意）→ OCR
→ 一面の確認：児童の氏名・フリガナ・生年月日、保護者の氏名を表示し、修正できる
→ 確定して保存（既存の createBeneficiaryWithCertificate。summary/profile は児童名）
→ カルテ（受給者証タブ）→ 候補カード（personal が空なので chartEmpty が初期 ON）→ スタッフが反映
```

- **作成に必要な最低限**：児童氏名（`name`）だけ。
  - 管理Web は現在、氏名が空でも保存できる。LINE は保存できない。
  - tsusho の新規登録で児童氏名を必須にする場合は、CertImportFlow の変更になる。任意、要人間判断。
- **取込画面で確認した値を profile / summary に入れることは「自動上書き」ではない。** 既存の新規登録と同じ扱いで、スタッフが保存ボタンで確定した値である。personal には書かない。
- **重複登録の警告**：受給者証番号・児童氏名・生年月日で、既存の利用者を探して警告する。現在は未実装。任意の後段ステップ。

---

## 14. 既存利用者の更新フロー

```
カルテ「受給者証を更新」→ 証種 tsusho → 撮影・OCR → 本人照合の表示 → 保存
（addCertificateToBeneficiary：旧証は superseded、personal は無変更、profile は12章の規則）
→ 受給者証タブ → 差分候補（different は初期 OFF）
```

### 14.1 同一人物の判定

| 情報 | 使い方 | 根拠 |
|---|---|---|
| 受給者証番号 | 前回の証の `summary.number` と一致すれば強い一致 | 障害児ごとに付番（CFA要領）。転居・再交付で番号が変わるかは未確認 |
| 児童氏名＋生年月日 | 主な照合。正規化して比較 | |
| 保護者氏名 | **照合に使わない** | 兄弟姉妹は保護者が同じで、別人の児童になる |

### 14.2 既存ロジックとの整合

- LINE の `isNameMismatch(target.name, pages[0].name)` は、tsusho では `name` が児童なので、**児童名どうしを比べることになる**（変更不要、確認済み）。
- `missingNewName` も児童名を要求することになる。
- 管理Web には照合が無い。追加する場合は CertImportFlow の変更になる。任意。

### 14.3 現在の証は1つという制約（要人間判断）

- 同じ児童が、障害福祉サービス受給者証（例：短期入所）と通所受給者証を**同時に**持つことはありうる。
  - これは、様式11に児童欄があることからの推論で、利用者の実態は未確認。
- 現在の構造（`currentCertificateId` は1つ）では、tsusho を登録すると、有効な child 証も `superseded` になる。
- **Phase 1-B の推奨**：通所受給者証を主とする。種類の違う証を置き換えるときは、取込画面で注意を表示する。
- 種別ごとに現在の証を持つ設計（例：`currentCertificateIds`）は、Production Core の大きな変更になるため Phase 1-B では行わない。

---

## 15. 管理Web UI

| 画面 | 変更 |
|---|---|
| 取込：種別選択 | 「通所受給者証」を追加（`md:grid-cols-3` のグリッドで4つ目は次の行に出る）。種別を切り替えるときに確認してクリア |
| 取込：ページタブ・レイアウト | 一〜七面。サムネイルは `public/cert-samples/tsusho/` |
| カルテ：受給者証タブ | tsusho 用の要点カード：給付決定の一覧（種類・支給量・期間、代表期間に印）、相談支援、負担上限・適用期間、食事提供加算、上限額管理。その上に候補カード |
| カルテ上部・一覧 | 期限は `validTo`（自動）。根拠のサービス名を表示（読み取り時に計算） |
| 過去の証 | 閲覧のみ（既存どおり）。候補カードは現在の証だけに出す |

---

## 16. LINE版

### 16.1 対応に必要な変更（後段）

- 種別選択の文言：色ではなく表題で選ばせる。`TYPE_SWATCH` に tsusho のエントリ、または名称表示を追加。
- `PAGE_COUNT` の参照を `getPageCount` に置き換える。
- キー項目（`KEY_FIELDS`）の見出し：「氏名」を「児童氏名」にする。tsusho のときは保護者氏名も表示。
- 完了画面に「カルテへの反映は管理画面で確認してください」と案内。
- 差分候補UI は LINE では出さない（推奨）。

### 16.2 比較

| 軸 | A：管理Web 先行 | B：管理Web＋LINE 同時 |
|---|---|---|
| Production Core リスク | 低〜中：LINE は絞り込みの1行だけ | 中〜高：LINE の取込画面全体（PAGE_COUNT・種別選択・キー項目） |
| 実装量 | 小 | 中（＋LINE の画面4〜5か所） |
| テスト量 | 管理Web の E2E＋LINE の回帰（tsusho が出ないこと） | ＋LINE の新規・更新の E2E、実機確認 |
| 現場運用 | 通所受給者証の取込は PC で行う。LINE は従来の証種のみ | スマホで完結する |
| 後から LINE 対応する難易度 | 低：parser・保存・候補は共通。LINE は表示だけ | — |

**推奨：A。** LINE で tsusho を選ばせないためには、`CERT_TYPES` に `lineEnabled` を足し、LINE の `CERT_TYPES.filter(t => t.enabled)` を `t.enabled && t.lineEnabled` に変える必要がある。この1行の変更は必須になる。既存利用者の種別の自動選択（`CertImportFlow.tsx:359-360`）も、同じ判定関数（例：`isCertTypeSelectable(type, variant)`）に揃える。

---

## 17. 実物サンプルの必要性

- **リポジトリに通所受給者証の画像は無い**（`public/cert-samples/` は adult・child・mobility だけ。確認済み）。
- 公式様式（様式9）から**分かること**：面の構成、欄名、行数（2行×2面、事業者欄3×2）、記載の書式（期間は年月日、相談支援は年月）。
- 公式様式からは**分からないこと**：記入済みの値の Cloud Vision での改行・結合、自治体の工夫（欄の追加・表記・切り離し）、追記行の並び方、支給量等の書き方、押印・手書きの混入。
- **判断**：レイアウト・ページ定義・データモデル・候補ロジックは公式様式だけで実装できる。parser は骨格までなら公式様式だけで書けるが、**有効化（`enabled: true`）の前に実物での検証が必須**。

### 最小限のサンプル（要人間判断）

| # | 内容 | 枚数 |
|---|---|---|
| 1 | 施設の主要な支給市町村の記入済み通所受給者証で、**放デイのみ**のもの | 一〜五面（5枚）＋六・七面（任意） |
| 2 | 同じ自治体（または2番目に多い自治体）で、**複数サービス、または追記行がある**もの | 一〜五面 |
| 3 | 上の1冊の一面・二面を、**スマホで事務所の通常環境で**撮影したもの | 2枚 |

### 個人情報を使わない補助手段

様式9（xlsx）に**架空の値を記入して印刷し、それを撮影して** Cloud Vision に通すと、様式どおりの OCR 構造を個人情報なしで得られる。これを最初の fixture にする。

- 本番の Function を使うかどうかは要人間判断。エミュレーターでは Vision が動かない。

### fixture の作り方（既存方針を踏襲）

- 実物の OCR 全文はローカルで扱う。改行と行の並びを保ったまま、値を架空に置き換えた**テキストだけ**をテストに入れる。
- 画像・実物の全文はコミットしない。
- 発行市町村名（個人情報ではない）は記録しておく。

---

## 18. Production Core リスク

### 18.1 新規ファイルだけで済むもの（リスク：低。adult / child / LINE への影響なし）

- `src/lib/tsusho/`：ページ定義の定数、キー一覧、services 抽出、期限の規則
- `lib/parsers/tsusho/page1〜5.ts`、fixture、テスト
- `src/lib/beneficiaryChart/tsushoCandidates.ts`、テスト
- `components/tsushoLayouts.tsx`
- `chart/CertificateCandidatesCard.tsx`
- `public/cert-samples/tsusho/*.png`

### 18.2 既存ファイルの変更

| ファイル | 変更内容 | adult | child | LINE | リスク |
|---|---|---|---|---|---|
| `constants/certPages.ts` | `CERT_TYPES` に追加、`lineEnabled`、tsusho のページ定義の登録、`getPageCount` | 無（テストで固定） | 無 | 選択肢の判定に関係 | 中 |
| `constants/certLayoutMap.ts` | tsusho のレイアウトID追加 | 無 | 無 | 無 | 低 |
| `components/certLayouts.tsx` | `EditableCertCell` の export、`LAYOUT_COMPONENTS` に新IDを登録 | 無 | 無 | 無（LINE も同じ部品を使う） | 低〜中 |
| `lib/parsers/parseCertText.ts` | `CERT_PAGE_PARSERS.tsusho` の登録 | 無 | 無 | tsusho を選べる場合のみ | 中 |
| `types/cert.ts` | 任意キーの追加 | 無 | 無 | 無 | 低 |
| `lib/firestore/certificateModel.ts` | `buildCertificateContent` の期限の分岐 | 無（分岐外。既存テストで固定） | 無 | 期限表示（tsusho のみ） | 中 |
| `lib/firestore/beneficiaries.ts` | tsusho のときの profile 保護 | 無（条件の外） | 無 | 表示名（tsusho のみ） | **高** |
| `CertImportFlow.tsx` | `getPageCount`、種別切替時のクリア、選択可否の判定、（任意）照合と児童氏名必須 | 無（8ページの挙動を固定） | 無 | **共通コンポーネントなので影響しうる** | **高** |
| `line/import/LineCertImportView.tsx` | 案A：絞り込みの1行。案B：画面全体 | 無 | 無 | 直接 | A：中 ／ B：高 |
| `chart/CertificatesPanel.tsx` | `getPageCount`・候補カードの配置 | 無 | 無 | 無 | 低〜中 |
| `chart/CertificateHighlightsCard.tsx` / `certificateHighlights.ts` | 種別ごとの要点 | 無（既存関数は維持） | 無 | 無 | 低 |
| `src/lib/beneficiaryChart/chartStore.ts` | `applyCertificateCandidates` の追加 | 無 | 無 | 無 | 低 |
| テスト3ファイル | 種別一覧・範囲外の前提を更新 | — | — | — | 低（ただし意図をコメントで明記） |
| Functions / Rules / Storage パス | **変更なし** | — | — | — | — |

**最大のリスク**：
- `CertImportFlow.tsx`（7ページ化と種別切替）
- `beneficiaries.ts`（profile 保護）

どちらも管理Web と LINE の取込・保存の共通処理である。施設リリース前には入れない。adult / child の8ページの動作を E2E で確認してから出す。

---

## 19. 安全な実装分割

前提：deploy はすべてフロント（Vercel）だけ。どの段階でも Functions・Rules の deploy は不要。

| 段階 | 変更内容 | 変更ファイル | テスト | Production Core への影響 | deploy できる単位か | 依存 |
|---|---|---|---|---|---|---|
| **1-B0** 決定・素材 | 22章の決定。様式9に架空値を記入したものの OCR。実物サンプルの手配 | なし | — | なし | — | — |
| **1-B1** 純粋ロジック（未接続） | ページ定義の定数、キー一覧、`extractTsushoServices`、`extractTsushoValidity`、候補・正規化 | 新規 `src/lib/tsusho/*`、`tsushoCandidates.ts`＋テスト | 単体 | **なし**（どこからも import しない） | ○（施設リリース前でも可） | 1-B0（規則の決定） |
| **1-B2** parser（未登録） | 一〜五面の parser、架空 fixture | 新規 `lib/parsers/tsusho/*`＋テスト | 単体（保護者と児童の取り違え防止を重点） | **なし** | ○（リリース前でも可） | 1-B1、架空 OCR |
| **1-B3** 証種の追加（非表示） | `tsusho` を `enabled: false`・`lineEnabled: false` で追加。レイアウト、サンプル画像、parser の登録 | certPages / certLayoutMap / certLayouts / parseCertText / types＋テスト更新 | 単体＋既存全件 | 低：画面では選べない | ○ | 1-B1・1-B2 |
| **1-B4** 種別ごとのページ数 | `getPageCount`。CertImportFlow・LINE・CertificatesPanel の参照置換。tsusho との種別切替時のクリア | CertImportFlow / LineCertImportView / CertificatesPanel＋テスト | 単体＋**adult / child の管理Web・LINE の新規・更新を E2E で回帰** | **中〜高** | ○（施設リリース後） | 1-B3 |
| **1-B5** 保存規則 | 期限の分岐（certificateModel）、tsusho 更新時の profile 保護（beneficiaries） | certificateModel / beneficiaries＋テスト | 単体（adult / child の出力不変を固定）＋E2E | **高** | ○ | 1-B1 |
| **1-B6** 管理Web で有効化 | tsusho を `enabled: true`（LINE は `false` のまま）。LINE の絞り込み1行。要点カード、期限の根拠表示 | certPages / LineCertImportView / Highlights | E2E：管理Web で tsusho の新規・更新・訂正。**LINE に tsusho が出ないこと** | 中 | ○（**実物検証の後**） | 1-B4・1-B5、実物サンプル |
| **1-B7** 差分候補・反映（管理Web） | 候補カード、`applyCertificateCandidates`、`chartReview` | 新規 UI / chartStore / CertificatesPanel | 単体＋E2E（反映・反映しない・再表示・同時編集） | 低 | ○ | 1-B6 |
| **1-B8**（任意） | 管理Web の本人照合、重複登録の警告、児童氏名の必須化 | CertImportFlow | E2E | 中 | ○ | 1-B6 |
| **1-B9** LINE 対応 | 16.1 の変更、`lineEnabled: true` | LineCertImportView ほか | LINE の E2E＋実機 | 中〜高 | ○ | 1-B6・1-B7 |

1-B5（保存規則）は、1-B6（有効化）より**前**に出す。これで、tsusho を最初に保存した時点から期限と profile 保護が正しく働く。

---

## 20. テスト戦略

| 種類 | 内容 |
|---|---|
| parser 単体 | 架空 fixture（様式9の印刷物の OCR → 値を置換）。一面：保護者と児童の振り分け、ブロックが1つしか取れないときは両方空、18歳以上の本人重複。二・三面：2行×2面、追記行、4区分の正規化、未知の種類は unknown。期間の書式（令和・平成・元年・「〜」） |
| services・期限 | 10.2 の全ケース（放デイあり／児発のみ／複数／未来行／期間なし） |
| 候補・差分 | 正規化（空白・ひらがな・和暦・ハイフン）、状態（same / chartEmpty / different / certEmpty）、居住地は guardian が主で personal は常に OFF、本人重複で guardian 候補を出さないこと、`chartReview` で同じ値を再表示しないこと |
| 回帰（必須） | 既存の112件を維持。**adult / child の `buildCertificateContent`・`getPageCount`・レイアウト・parser 登録の出力が変わらないこと**を追加で固定。`PAGE_COUNT` 系テストは種別ごとのページ数に読み替える |
| 意図的な更新 | `certLayoutVariant.test.ts`（選択可能な種別、範囲外ページ）、`fallbackSafety.test.ts`、`certLayoutMap.test.ts`。変更理由をコメントに残す（child 有効化時と同じ流儀） |
| Rules | 変更しないが、`npm run test:rules` を回帰として実行する |
| E2E（エミュレーター） | 架空の tsusho データを seed に**追加**する（既存データは残す）。管理Web の新規 → 候補 → 反映、既存の更新 → 差分、OCR 訂正 → 候補の再表示。LINE：adult / child の新規・更新が従来どおり動き、tsusho が出ないこと |
| OCR 実地 | 架空の値を記入した様式と、実物サンプルを Cloud Vision に通す（エミュレーターでは不可。本番 Function を使うかは要人間判断） |

---

## 21. 未確定事項

| # | 事項 | 状態 |
|---|---|---|
| U-1 | 施設が扱う自治体の実際の様式（欄の追加、「障害児」と「児童」の表記、事業者欄の切り離し、面の数） | 要実物確認 |
| U-2 | 記入済みの値の Cloud Vision 出力（縦書き見出しの欠落、改行・結合） | 要実物確認 |
| U-3 | 追記と新規交付のどちらが行われるか（自治体の運用）、追記行の並び | 要実物確認 |
| U-4 | 受給者証番号は更新・転居で変わるか。検証番号の計算方法 | 未確認（今回の資料に記載なし） |
| U-5 | 支給量等の実際の書き方（「23日／月」、加算の表記、変更年月日） | 要実物確認 |
| U-6 | 通所受給者証の用紙の色（LINE の種別選択の文言に影響） | 未確認（公式の定めなし） |
| U-7 | 障害福祉サービス受給者証と通所受給者証を併せ持つ利用者がいるか、その頻度 | 未確認 |
| U-8 | 施設が児童発達支援も行っているか（多機能型）。代表期間の規則に影響 | 要人間判断 |
| U-9 | 「放デイ」などの略記が証に使われるか | 要実物確認 |
| U-10 | 18歳以上の通所者の扱い（受け入れの有無） | 要人間判断 |

---

## 22. 実装前に人間が決めること

1. 内部値を `tsusho` にしてよいか。
2. **tsusho では `name` / `furigana` / `birthday` ＝児童、`guardian*` ＝保護者**というキーの意味づけでよいか（8章）。
3. 7ページの扱い：P1（種別ごとのページ数）にするか（5.2）。
4. 居住地の反映先：guardian.address を主とし、personal.address は常に OFF の補助候補にする、でよいか。
5. 代表期間の規則（放デイ優先・終了日が最も遅い行）と、表示名（「給付決定期限」など）。
6. 「反映しない」を `chartReview` として証doc に記録するか。
7. tsusho の更新時に、personal があれば profile を上書きしない規則を入れるか（`beneficiaries.ts` の変更）。
8. 現在の証は1つのまま運用し、種類の違う証を置き換えるときは警告を出す、でよいか。
9. LINE は案A（管理Web 先行）でよいか。
10. 実物サンプルの範囲（17章）。架空記入の様式を本番の OCR Function に通してよいか。
11. **施設リリース前に入れてよいのは 1-B0〜1-B2（未接続の新規ファイル）だけ**、という線引きでよいか。

---

## Phase 1-B 推奨実装順序

1. **1-B0**：上の決定事項の確定と、架空記入の様式の OCR。実物サンプルの手配。
2. **1-B1・1-B2**（施設リリース前でも可）：純粋ロジックと parser を新規ファイルだけで作る。どこからも参照しない。
3. **施設リリース**（Production Core は今のまま）。
4. **1-B3**：tsusho を非表示で追加。
5. **1-B4**：種別ごとのページ数。adult / child の E2E 回帰を必須とする。
6. **1-B5**：保存規則（期限の分岐・profile 保護）。
7. **実物サンプルで parser を検証**してから **1-B6**：管理Web で有効化（LINE は非表示）。
8. **1-B7**：カルテの差分候補と、選んだ項目の反映。
9. （任意）**1-B8**：照合・重複警告。最後に **1-B9**：LINE 対応。

---

### 付録：参照した一次資料

- こども家庭庁「障害児通所給付費に係る通所給付決定事務等について」：https://www.cfa.go.jp/policies/shougaijishien/shisaku/jimushori_yoryo
  - 同 令和8年3月版 PDF：Ⅳ「通所受給者証の交付」1〜7
  - 同 様式第9号 通所受給者証（例）xlsx（令和7年2月3日）
- 厚生労働省「介護給付費等に係る支給決定事務等の事務処理要領」：https://www.mhlw.go.jp/stf/newpage_17797.html
  - 同 様式第11号 障害福祉サービス受給者証（例）xls
