# PaperlessCare Phase 1-B 実装前調査報告書 ―「受給者証 → 利用者カルテ自動化」

- 作成日：2026-10-03
- 対象：`paperlesscare-web/`（branch `feat/phase1a-beneficiary-chart`、Phase 1-A は未コミットのまま作業ツリー上に存在）
- 種別：**調査のみ**。ソースコード・テスト・Rules・データ・設定は一切変更していない。commit / push / deploy なし。Production（Firebase `paperlesscare` / Vercel）へは接続していない
- 実行したもの：コードの読み取り・検索、`npm test`（112/112 成功。実行前後で `git status` に差分がないことを確認）。Functions のテストは `npm run build` で `functions/lib` を書き換えるため実行していない
- 表記：「確認済み」＝コードで確認／「資料による」＝既存 docs の記載に基づく（コードでは未確認）／「判断できない」＝現行コード・資料から分からない

---

## 0. 要約（先に結論）

1. **child（18歳未満）は選択可能だが parser が空**。OCR（Cloud Vision）自体は child でも毎回実行され、OCR全文は Firestore に保存されるが、`CERT_PAGE_PARSERS.child = {}` のため formData はすべて空（手入力のみ）。
2. **child 用 parser の大半は adult の延長で書ける見込み**（既存調査では page6 以外は様式が同一）。ただし **記入済みの child 実物OCRサンプルは0件**で、値の取れ方は未検証。
3. **最大の設計上の論点は「誰の氏名か」**。様式上、page1 の `name` / `birthday` / `address` は「支給決定障害者等」（18歳未満では多くの場合 保護者、と既存資料に記載）で、児童本人は `childName` / `childBirthday`。ところが **`buildSummary` は `name` を利用者の代表名として summary / profile に入れる**。child の page1 parser をそのまま有効化すると、**新規登録では保護者名が利用者名になり、更新では `mergeProfile` が profile を保護者名で上書きし、LINE版の「氏名が違います」警告も毎回出る**。
4. **テストデータ（`tests/e2e/seed-emulator.mjs`）は child 証の `name` に児童名を入れている**＝様式上の意味（支給決定障害者等）と食い違っている。Phase 1-A の動作確認はこの前提の上に成り立っている。
5. **期限管理は `validTo` が埋まれば自動で動く**（カルテ側の変更不要）。`validTo` は page2 の `servicePeriod1`、無ければ page7 の `burdenPeriod` から算出。adult でも page7 parser は無く、page2 は「短期入所」を含む行しかサービス種別として拾わない決め打ち実装。
6. **放課後等デイサービスの支給決定が、現行の8ページ様式のどのページ・どの欄に記載されるかは、現行コード・資料からは判断できない**（テストデータでは page2「介護給付費の支給決定内容①」の `serviceType1` に入れているが架空データ）。Phase 1-B の期限管理の成否に直結する。
7. 差分確認・反映ロジックは、**純粋関数（`src/lib/beneficiaryChart/` 配下）＋既存の `saveChartPersonal` で書く**形にすれば、`CertImportFlow.tsx` / `beneficiaries.ts` / Functions / LINE版を変更せずに実装できる。

---

## 1. 現在のOCR処理フロー

### 1.1 図

```
[画像の入力元]
 ├─ 管理Web PC：ファイル選択 / クリップボード貼り付け
 │     CertImportFlow.tsx  onPickClick → onFileSelected (L531) / onPasteImage (L588)
 ├─ 管理Web スマホ：ガイド枠付き撮影画面 /t/{t}/capture
 │     capture/page.tsx  枠内をcanvasで切り抜き → 高さ1400px・JPEG 0.88 → dataURLを sessionStorage へ
 │     → 取込画面へ戻ると CertImportFlow の effect (L409-429) が File 化して onFileSelected → performOcr を自動実行
 └─ LINE版：端末標準カメラ / 写真選択（<input>）
       LineCertImportView → onFileChosen (L583) → onFileSelected → performOcr を自動実行
        │
        ▼
[画像の前処理]（ブラウザ内）
  compressImageToJpeg（lib/image/compressImage.ts）
   - EXIF回転の反映（createImageBitmap imageOrientation:"from-image"）
   - 長辺1800pxへ縮小、JPEG quality 0.85
   - capture経由（previewOverrideあり）は対象外（capture側で切り抜き・圧縮済み）
  ※ 傾き補正・二値化・コントラスト補正・トリミング自動検出は無い
        │
        ├─▶ IndexedDB に一時退避（importImageStore.savePageImage、L569）※Storageにはまだ上げない
        ▼
[OCR呼び出し] CertImportFlow.performOcr (L608-664)
  fileToBase64(file) → httpsCallable(functions, "ocrFromImageData")
  payload: { imageBase64, pageNo: activePageIndex+1, certType }   ← pageNo/certTypeはログ用のみ
        │
        ▼
[Firebase Functions] functions/src/index.ts  ocrFromImageData (L57-116)
  - 認証必須（req.auth）。10MB上限
  - new ImageAnnotatorClient().documentTextDetection({ image: { content: buffer } })  (L81)
    ※ imageContext（languageHints 等）指定なし
  - text = result.fullTextAnnotation?.text ?? ""   (L85)
    ※ pages/blocks/paragraphs/words・bounding box・confidence は捨てている
  - ログは textLength のみ（本文は出さない）
  - return { text }   (L94)
  - Storage / Firestore には一切アクセスしない
        │
        ▼
[OCR text] res.data.text （フロントで受け取り、L634）
        │
        ▼
[parser] parseCertText(text, activePageIndex, selectedCertType)  lib/parsers/parseCertText.ts (L121)
  normalizeText（記号・空白・元号誤認識の補正）
  → getCertPageParser(certType, pageIndex)：CERT_PAGE_PARSERS[certType][pageIndex]
      adult: 0→parseAdultPage1, 1→Page2, 2→Page3, 3→Page4 / child: {} / mobility: {}
  → parser が無く FALLBACK_ALLOWED_PAGES にも無い（現在は全種別で空）→ emptyFormData()
        │
        ▼
[formData] updateCurrentPage → pages[i] = { ocrText: text, formData: parsed }  (L647)
  - 画面：CertLayoutRenderer（components/certLayouts.tsx）が帳票レイアウトで表示、セル単位で手修正可
  - LINE：1ページ目のみ KEY_FIELDS（name/furigana/number/birthday/issueDate/cityName）を大きな入力欄で表示
  - OCR全文（ocrText）は画面には表示しない
  - 取込中の状態は sessionStorage（formData/ocrText）＋ IndexedDB（画像）に退避
        │
        ▼ 「確定して保存」
[保存] handleSaveBeneficiary (L671-776)
  1. 画像があるページだけ Storage へアップロード（ここで初めて）
       tenants/{t}/recipients/{beneficiaryId}/certificates/{certificateId}/page{N}.jpg
  2. savedPages = [{ pageNo, title, formData, ocrText, storagePath }] × 8
  3. 新規：createBeneficiaryWithCertificate / 既存：addCertificateToBeneficiary（lib/firestore/beneficiaries.ts）
  4. 失敗時は今回アップロードした画像を削除し、入力内容は保持
        │
        ▼
[Firestore]
  tenants/{t}/beneficiaries/{b}                        … profile / summary / currentCertificateId / certType 等
  tenants/{t}/beneficiaries/{b}/certificates/{c}       … pages[]（formData・ocrText・storagePath）/ summary / issueDate / validFrom / validTo / status
```

### 1.2 補足（Phase 1-B に効く事実）

| 事実 | 根拠 | Phase 1-B への意味 |
|---|---|---|
| child でも OCR（Vision）は毎回実行され、`ocrText` は certificates doc に保存される | `performOcr` に certType による分岐なし／`savedPages` に ocrText を含む | 本番に既に child 証が保存されていれば、その OCR 全文が Firestore に残っている（個人情報。扱いは要判断）。parser 実装後の「再解析」も技術的には可能 |
| 同じページでOCRをやり直すと、そのページの手入力はすべて消える | `performOcr` 冒頭で `formData: emptyFormData()`（L615-619） | OCR精度を上げても「手修正→再OCR」で修正が消える挙動は残る |
| 取込中に種別（adult/child）を切り替えても再解析されない | 種別変更で performOcr は呼ばれない | child parser 導入後、種別を選び間違えて撮影した場合は再OCRが必要 |
| Vision のレスポンスのうち使っているのは全文テキストだけ | `functions/src/index.ts:85` | 座標を使った抽出（近傍・枠位置）をするには Functions のレスポンス拡張が必要 |

---

## 2. adult / child の違い

### 2.1 種別の定義

| 箇所 | adult | child | mobility |
|---|---|---|---|
| `CERT_TYPES`（`constants/certPages.ts:5-33`） | 紫・enabled | 黄緑・**enabled**（2026-09-05 に有効化） | クリーム・disabled |
| ページ定義 `PAGE_DEFINITIONS_BY_CERT_TYPE`（L97-104） | 共通の8ページ | **同じ8ページ定義** | 同じ |
| レイアウト `CERT_LAYOUT_IDS`（`constants/certLayoutMap.ts:27-61`） | page6 = `planSupport` | page6 = **`planSupportWithContact`**（問い合わせ先欄あり）。他は adult と同一 | adult と同じ |
| parser `CERT_PAGE_PARSERS`（`lib/parsers/parseCertText.ts:58-70`） | page1〜4（index 0〜3） | **空** | 空 |
| fallback `FALLBACK_ALLOWED_PAGES`（L99-101） | なし | なし | なし |

### 2.2 adult の parser 詳細

| ページ | 関数 | 抽出項目（formData key） | ロジック |
|---|---|---|---|
| page1 受給者証（Ⅰ） | `parseAdultPage1`（`adult/page1.ts`） | `number` | 本文中の最初の「10桁の数字（空白許容）」 |
| | | `name` / `birthday` | `/氏\s*名\s*([^\n]*)/g` の**出現順1番目**のブロック。直後の最初の和暦日付を生年月日とする |
| | | `childName` / `childBirthday` | 「児童…氏名…生年月日」の見出しマッチを優先、失敗時は**出現順2番目**のブロック |
| | | `address` | 「居住地」を含む行の**前の行**、無ければ次の行（**既存バグあり**：受給者証番号や縦書きラベル「支給決定障害者等」を拾う。資料による：`docs/paperlesscare-under18-real-form-ocr-investigation-2026-09-05.md` 5.5章。テストは address を検証していない） |
| | | `disabilityType` | 「障害種別」の次の行 |
| | | `issueDate` | 「交付年月日」〜「支給市(区)町村名」の間の和暦日付 |
| | | `cityName` / `issuerAddress` | 「支給市(区)町村名」の次の行 / 前の行 |
| | | `furigana` / `childFurigana` | **常に空**（抽出しない） |
| page2 介護給付費① | `parseAdultPage2` | `servicePeriod1` | 「支給決定期間」以降で `令和N年N月N日から令和N年N月N日まで` に一致する最初の文字列（**令和のみ**） |
| | | `serviceType1` | **「短期入所」を含む行**（決め打ち。他のサービス名は取れない） |
| | | `serviceAmount1` | **「日/月」を含む行**（`時間/月` 等は取れない） |
| | | `serviceType2/3`・`certPeriod`（認定有効期間）・`disabilityType`（障害支援区分） | 未抽出 |
| page3 介護給付費② | `parseAdultPage3` | `serviceType4/5`・`servicePeriod4/5`・`serviceAmount4/5` | 「サービス種別」行の **+1 / +3 / +5 行目**を決め打ち（`pickSections`） |
| page4 訓練等給付費 | `parseAdultPage4` | `serviceType6〜8` 等 | 同上 |
| page5〜8 | なし | — | 空のフォーム |

共通ヘルパ：`lib/parsers/common/helpers.ts`（`getLines` / `pickLineAfter` / `pickLineBefore` / `ERA_DATE_RE` / `normalizeEraDate`）。adult/child 非依存として切り出し済み。

### 2.3 child の状況

| 項目 | 状態 |
|---|---|
| 種別選択・ページ構成・レイアウト | 実装済み（page6 のみ問い合わせ先あり） |
| parser | **未実装**（全ページ空のフォームを返す）。テストで「child は adult の parser を流用しない」ことを固定している：`parseCertText.test.ts:22`、`fallbackSafety.test.ts:124, 214, 234` |
| 記入済み child の OCR サンプル | **0件**（`public/cert-samples/child/` は未記入の空様式。page-8.png は page-1.png のバイト同一コピー。資料による） |
| adult の再利用可否（資料による。macOS Vision での空様式OCR＋架空値差し込みで検証、Cloud Vision では未検証） | page1：`parseAdultPage1` はほぼ流用可（address バグ修正が前提）／page2〜4：構造同一で流用可（ただし上記の決め打ちは child でも同じ制約）／page5：page1 と同構造（adult にも parser 無し）／page6：child のみ問い合わせ先あり（adult にも parser 無し）／page7：構造同一（adult にも parser 無し）／page8：**様式不明** |

**再利用時の注意**：child 用 parser を作るとき adult の関数を `CERT_PAGE_PARSERS.child` に直接登録すると、adult の parser 修正が child に波及する（逆も同様）。既存の設計方針（`parseCertText.ts:52-57` のコメント）は `lib/parsers/child/pageN.ts` を追加して登録する形。

---

## 3. 現在の受給者証データ項目一覧

凡例：OCR列は「parser が値を入れるか」。✓=抽出する／△=条件付き・既知の不具合あり／✗=抽出しない（手入力のみ）／—=該当なし。
保存列：formData はすべて `certificates/{c}.pages[n].formData` に保存される（手入力値を含む）。

| 項目 | formData key（ページ） | 画面表示（取込・受給者証タブ） | OCR adult | OCR child | 受給者証doc以外への写し | カルテ表示 |
|---|---|---|---|---|---|---|
| 氏名（支給決定障害者等） | `name`（p1・p5） | ✓（p1・p5 レイアウト、LINE「氏名」） | ✓（p1のみ） | ✗ | `summary.name`（p1から）→ `profile.name` | ヘッダー等（personal→profile→summary の順） |
| フリガナ（同） | `furigana`（p1・p5） | ✓ | ✗ | ✗ | `summary.furigana` → `profile.furigana` | 同上 |
| 生年月日（同） | `birthday`（p1・p5） | ✓ | ✓（p1） | ✗ | `summary.birthday` → `profile.birthday` | 年齢・学年の計算元（フォールバック） |
| 居住地（同） | `address`（p1・p5） | ✓ | △（バグ） | ✗ | なし | なし |
| 児童 氏名 | `childName`（p1・p5） | ✓ | ✓（p1） | ✗ | **なし**（summaryに入らない） | なし |
| 児童 フリガナ | `childFurigana`（p1・p5） | ✓ | ✗ | ✗ | なし | なし |
| 児童 生年月日 | `childBirthday`（p1・p5） | ✓ | ✓（p1） | ✗ | なし | なし |
| 受給者証番号 | `number`（p1・p5） | ✓ | ✓（p1） | ✗ | `summary.number` | 要点カード（p1から直接）、一覧検索 |
| 障害種別 | `disabilityType`（p1・p5） | ✓ | ✓（p1） | ✗ | なし | なし |
| 交付年月日 | `issueDate`（p1・p5） | ✓ | ✓（p1） | ✗ | 受給者証doc `issueDate`（p1から） | 要点カード「交付日」、LINE詳細 |
| 支給市区町村 | `cityName`（p1・p5） | ✓ | ✓（p1） | ✗ | `summary.cityName` | 要点カード（p1から直接） |
| 発行者住所 | `issuerAddress`（p1のみ。p5レイアウトには欄なし） | ✓（p1） | ✓（p1） | ✗ | なし | なし |
| 障害支援区分 | `disabilityType`（**p2**。p1の「障害種別」と同じキー名を別ページで使用） | ✓ | ✗ | ✗ | なし | なし |
| 認定有効期間 | `certPeriod`（p2） | ✓ | ✗ | ✗ | なし | なし |
| サービス種別 | `serviceType1〜3`（p2）/`4〜5`（p3）/`6〜8`（p4） | ✓ | △（1：「短期入所」のみ、2・3：✗、4〜8：行オフセット決め打ち） | ✗ | なし | 要点カード（p2〜4から） |
| 支給決定期間 | `servicePeriod1〜8`（同上） | ✓ | △（1：令和の「から…まで」形式のみ） | ✗ | **`servicePeriod1` → 受給者証doc `validFrom`/`validTo`** | 要点カード、有効期間、状態判定 |
| 支給量 | `serviceAmount1〜8`（同上） | ✓ | △（1：「日/月」を含む行のみ） | ✗ | なし | 要点カード |
| 計画相談 支給期間 | `supportPeriod`（p6） | ✓ | ✗ | ✗ | なし | なし |
| 指定特定相談支援事業所名 | `planOfficeName`（p6） | ✓ | ✗ | ✗ | なし | なし（カルテの `consultationSupport.officeName` とは未連携） |
| モニタリング期間 | `monitoringPeriod`（p6） | ✓ | ✗ | ✗ | なし | なし |
| 計画相談 開始年月日 | `planStartDate`（p6） | ✓ | ✗ | ✗ | なし | なし |
| 特定障害者特別給付費 | `specialPaymentAmount` / `specialPaymentPeriod` / `specialPaymentPrevAmount` / `specialPaymentPrevPeriod`（p6） | ✓ | ✗ | ✗ | なし | なし |
| 利用者負担上限月額 | `burdenLimitAmount`（p7・p8） | ✓ | ✗ | ✗ | なし | 要点カード |
| 負担 適用期間 | `burdenPeriod`（p7・p8） | ✓ | ✗ | ✗ | **`servicePeriod1` が無いときの `validFrom`/`validTo`（p7のみ）** | 要点カード |
| 変更前の上限月額・適用期間 | `burdenLimitAmountPrev` / `burdenPeriodPrev` | ✓ | ✗ | ✗ | なし | なし |
| 食事提供体制加算 | `mealProvisionStatus`（p7・p8） | ✓ | ✗ | ✗ | なし | なし（※サンプル様式には該当ラベルが印字されていない。資料による） |
| 上限額管理対象者該当の有無 | `managementTargetStatus`（p7・p8） | ✓ | ✗ | ✗ | なし | 要点カード「上限額管理」 |
| 上限額管理事業所名 | `managementOfficeName`（p7・p8） | ✓ | ✗ | ✗ | なし | 要点カード |
| 開始年月日（負担） | `startDate`（p7・p8） | ✓ | ✗ | ✗ | なし | なし |
| 特記事項 | `specialNotes`（p7・p8） | ✓ | ✗ | ✗ | なし | なし |
| 問い合わせ先 | `contactInfo`（p4・p6[child]・p7・p8） | ✓ | ✗ | ✗ | なし | なし |
| 予備欄 | `memo`（p2・p3・p4・p6） | ✓ | ✗ | ✗ | なし | なし |
| OCR全文 | `ocrText`（各ページ） | ✗（表示しない） | 保存 | 保存 | なし | なし |

### 3.1 受給者証doc（`certificates/{c}`）・利用者doc の受給者証関連フィールド

| doc | フィールド | 生成元 |
|---|---|---|
| certificates | `certType`, `pages[]`, `summary{name,furigana,number,birthday,cityName}`, `issueDate`, `validFrom`, `validTo`（ISO or null）, `status`（current/superseded）, `supersededBy`, `source`（mobile/web/legacy）, `createdBy/At`, `updatedBy/At` | `buildCertificateContent`（`certificateModel.ts:193-202`） |
| beneficiaries | `profile{name,furigana,birthday}`, `summary{…}`, `currentCertificateId`, `certificateCount`, `certType`, `status`（active/inactive） | 取込保存時（後述 7・8章）|
| beneficiaries（Phase 1-A） | `personal` / `guardian` / `contract` / `school` / `consultationSupport` | カルテ保存時のみ |

**`summary` は page1（`pages[0]`）だけから作られる**（`buildSummary`、`certificateModel.ts:61-70`）。page5 は参照されない。

---

## 4. child 受給者証ページ構造

ページ名称・入力項目はコード（`certPages.ts` / `certLayouts.tsx` / `certLayoutMap.ts`）から確認。様式との一致は 2026-09-05 の空様式調査（資料による）に基づく。

| No | 画面上の名称 | レイアウト | 入力項目（formData key） | 現在のOCR対象か | Phase 1-B の OCR 候補 |
|---|---|---|---|---|---|
| 1 | 障害福祉サービス受給者証（Ⅰ） | `certificate1` | `number`, `address`, `furigana`, `name`, `birthday`, `childFurigana`, `childName`, `childBirthday`, `disabilityType`（障害種別）, `issueDate`, `issuerAddress`, `cityName` | Vision は実行・**parser無し** | **最優先**：`childName`, `childBirthday`, `childFurigana`, `name`, `furigana`, `birthday`, `number`, `issueDate`, `cityName`。`address` は既存バグを直してから |
| 2 | 介護給付費の支給決定内容① | `careBenefit1` | `disabilityType`（障害支援区分）, `certPeriod`, `serviceType1〜3`, `servicePeriod1〜3`, `serviceAmount1〜3`, `memo` | 同上 | **高**：`servicePeriod1`（期限管理の主ソース）, `serviceType1〜3`, `serviceAmount1〜3`。ただし放課後等デイサービスがこのページに載るかは**判断できない** |
| 3 | 介護給付費の支給決定内容② | `careBenefit2` | `serviceType4〜5`, `servicePeriod4〜5`, `serviceAmount4〜5`, `memo` | 同上 | 中 |
| 4 | 訓練等給付費の支給決定内容 | `trainingBenefit` | `serviceType6〜8`, `servicePeriod6〜8`, `serviceAmount6〜8`, `memo`, `contactInfo` | 同上 | 低〜中（18歳未満で記載があるかは**判断できない**） |
| 5 | 障害福祉サービス受給者証（Ⅱ） | `certificate2` | page1 と同じ人物項目（`issuerAddress` 欄なし） | 同上 | 中：page1 と同内容かは**判断できない**（資料の確認事項 C-6）。summary は page5 を見ない |
| 6 | 計画相談支援給付費の支給内容 | `planSupportWithContact`（child のみ問い合わせ先あり） | `supportPeriod`, `planOfficeName`, `monitoringPeriod`, `planStartDate`, `specialPayment*`×4, `memo`, `contactInfo` | 同上 | 中：`planOfficeName`（カルテ相談支援の候補）, `monitoringPeriod`, `supportPeriod`。問い合わせ先の有無が年齢差か自治体差かは**判断できない** |
| 7 | 利用者負担に関する事項① | `userBurden` | `burdenLimitAmount`, `burdenPeriod`, `burdenLimitAmountPrev`, `burdenPeriodPrev`, `mealProvisionStatus`, `managementTargetStatus`, `managementOfficeName`, `startDate`, `specialNotes`, `contactInfo` | 同上 | **高**：`burdenLimitAmount`, `burdenPeriod`（期限の第2ソース）, `managementTargetStatus`, `managementOfficeName`。`mealProvisionStatus` は様式上のラベル不明 |
| 8 | 利用者負担に関する事項② | `userBurden`（page7 と共有） | page7 と同じ | 同上 | **現行コードからは判断できない**。名称・レイアウトとも推測で置かれている（サンプル画像は page1 の複製）。adult も同じ状態 |

**ページ数そのもの（8ページ）が実物と一致するかも、現行コードからは判断できない**（`PAGE_COUNT = 8` 固定）。

---

## 5. 受給者証 → 利用者カルテの項目マッピング（候補。自動上書きは前提にしない）

カルテ側の項目は `src/lib/beneficiaryChart/model.ts` で確認。

### 5.1 child 証（18歳未満）の場合

様式上の意味は既存資料（13章）に基づく。「支給決定障害者等＝保護者」は**未確定**（資料の確認事項 C-5）。

| 受給者証の項目 | formData key | カルテ側の候補 | 備考 |
|---|---|---|---|
| 児童 氏名 | `childName` | `personal.name` | **現在の summary/profile は `name` 側を使っている**（6章） |
| 児童 フリガナ | `childFurigana` | `personal.furigana` | parser 未抽出 |
| 児童 生年月日 | `childBirthday`（和暦文字列） | `personal.birthDate`（YYYY-MM-DD） | `normalizeDateText`（`dates.ts`）で変換可 |
| 支給決定障害者等 氏名 | `name` | `guardian.name` | 続柄（`guardian.relationship`）は証に無い |
| 支給決定障害者等 フリガナ | `furigana` | `guardian.furigana` | |
| 支給決定障害者等 生年月日 | `birthday` | （カルテに対応項目なし） | |
| 居住地 | `address` | `personal.address` または `guardian.address`（**どちらか判断が必要**） | 様式上は支給決定障害者等の欄。郵便番号は証に無い（`postalCode` は候補なし） |
| 計画相談 事業所名 | `planOfficeName`（p6） | `consultationSupport.officeName` | 相談支援専門員名・電話・メールは証に無い |
| 支給量（例：23日/月） | `serviceAmountN` | （参考）`contract.contractedAmount` | **意味が異なる**（支給決定量 ≠ 契約支給量）。自動反映の対象にしない方が安全 |
| 受給者証番号・支給市区町村・交付日・有効期間・上限月額・上限額管理・モニタリング期間 | 各 key | カルテに対応項目なし | 受給者証doc側の情報として保持（要点カードで表示済み） |
| （学校・学年・担任・契約日等） | — | `school.*` / `contract.*` | 証に記載なし |

### 5.2 adult 証（18歳以上）の場合

| 受給者証 | key | カルテ |
|---|---|---|
| 氏名・フリガナ・生年月日 | `name` / `furigana` / `birthday` | `personal.name` / `furigana` / `birthDate` |
| 居住地 | `address` | `personal.address` |
| 児童欄 | `childName` 等 | （adult 利用者では通常空。扱いは判断が必要） |

→ **certType によってマッピングが変わる**。マッピング関数は `certType` を引数に取る設計が必要。

---

## 6. personal / profile / summary の関係

### 6.1 それぞれの性格

| | 置き場所 | 形 | 書き込む処理 | 意味 |
|---|---|---|---|---|
| `personal` | 利用者doc | name / furigana / birthDate(ISO) / postalCode / address / phone / usageStatus | **`saveChartPersonal` のみ**（カルテの本人情報保存） | Phase 1-A でカルテの正本と定義 |
| `profile` | 利用者doc | name / furigana / birthday（自由文字列） | `createBeneficiaryWithCertificate`（summaryの写し）／`createBeneficiaryWithoutCertificate`（入力値）／**`addCertificateToBeneficiary`（`mergeProfile` で上書き）**／`saveChartPersonal`（personal の写し、生年月日は「2016年8月15日」形式） | 旧来の「利用者の本人情報」 |
| `summary` | 利用者doc ＋ 受給者証doc | name / furigana / number / birthday / cityName | 新規作成（buildSummary）／更新（`mergeSummary`）／OCR訂正（`updateCertificatePages`＝mergeSummary、旧データは `updateBeneficiary`＝buildSummary で丸ごと） | 現在の受給者証 page1 の写し |

### 6.2 読む画面

| 画面 | 氏名 | フリガナ | 生年月日 | 番号等 | 根拠 |
|---|---|---|---|---|---|
| 管理Web 利用者一覧 | personal→profile→summary | 同左 | personal.birthDate→profile.birthday→summary.birthday | 検索に summary.number | `beneficiaries/page.tsx:111`、`resolveChartIdentity` |
| 管理Web カルテ ヘッダー・基本情報 | 同上 | 同上 | 同上 | — | `[beneficiaryId]/page.tsx:107` |
| カルテ 本人情報 編集初期値 | 同上で補完 | | | | `initialPersonalForm` |
| カルテ 受給者証タブ 要点カード | — | — | — | page1 の formData を直接（summaryではない） | `certificateHighlights.ts` |
| 取込画面（既存利用者の表示） | profile→summary | | | | `CertImportFlow.tsx:789, 895` |
| LINE 利用者一覧・選択 | profile→summary | profile→summary | — | summary.number（検索） | `line/lib/beneficiarySearch.ts:23-36` |
| LINE 利用者詳細 | profile→summary | profile→summary | profile.birthday→summary.birthday | 現在の証の summary.number・issueDate、利用者 summary.cityName | `line/beneficiaries/[beneficiaryId]/page.tsx:116-187` |
| LINE 取込 氏名不一致チェック | 対象：profile→summary ／ 比較相手：**page1 の `name`** | | | | `LineCertImportView.tsx:136-139`, `isNameMismatch` |
| LINE 完了画面 | profile→summary | | | | `line/import/done/page.tsx:23` |

**LINE版は personal を一切読まない**。カルテで保存した値は profile への写しを通じてのみ LINE に届く。

### 6.3 処理ごとの書き込み

| 操作 | personal | profile | summary（利用者doc） |
|---|---|---|---|
| 受給者証から新規登録（`createBeneficiaryWithCertificate`） | 書かない | `profileFromSummary(page1)` | buildSummary(page1) |
| 受給者証なしで新規登録（一覧の「新しい利用者を登録」） | 書かない | 入力値 | `{...EMPTY_SUMMARY, ...profile}` |
| 受給者証更新・初回登録（`addCertificateToBeneficiary`） | 触れない | **`mergeProfile`：新しい証の値が空でなければ上書き** | `mergeSummary`：同上 |
| 受給者証タブで OCR 結果を訂正（`updateCertificatePages`） | 触れない | **触れない** | 現在の証なら mergeSummary（空欄にはできない） |
| 同上・旧データ（`updateBeneficiary`） | 触れない | 触れない | buildSummary で丸ごと置換 |
| カルテ本人情報保存（`saveChartPersonal`） | 置換 | personal の写しで置換（生年月日未入力なら既存値を残す） | 触れない |

### 6.4 食い違いが起きる具体例

| # | 状況 | 結果 |
|---|---|---|
| D-1 | カルテで `personal.name = 田中 太郎` を保存済み → 受給者証更新で OCR が「田中 太朗」（誤読）を返し、そのまま保存 | profile/summary = 太朗、personal = 太郎。**管理Webは太郎、LINE は太朗**を表示 |
| D-2 | **child 証で page1 parser を有効化**（`name` に支給決定障害者等＝保護者名が入る） | 新規登録：profile/summary が保護者名 → 管理Web一覧・LINE とも**保護者名を利用者名として表示**。更新：mergeProfile が profile を保護者名で上書き。personal 未保存の利用者はカルテ表示も保護者名に変わる |
| D-3 | 同上で LINE から既存利用者（児童名で登録済み）を更新 | `isNameMismatch(児童名, 保護者名)` が true → **毎回「氏名が違います」の確認が必要**になる |
| D-4 | 一覧から証なしで作成（profile のみ、personal なし）→ 初回の証を取込 | profile が証の `name` で上書きされ、カルテ表示名が変わる（personal が無いため） |
| D-5 | 受給者証タブで氏名の OCR 誤りを訂正 | summary だけ直り profile は残る。表示は profile 優先のため**訂正が画面に出ない**。また mergeSummary のため「空欄にする」訂正はできない |
| D-6 | Phase 1-B で OCR 値を personal に反映（saveChartPersonal 経由） | profile は写されるが summary は証の値のまま。child なら summary.name＝保護者名が残る（検索にはヒットし続ける） |
| D-7 | 生年月日の形式 | personal：`2016-08-15`／profile：カルテ保存後は `2016年8月15日`（西暦）、取込由来は `平成28年8月15日`（和暦）／summary：和暦。**比較は必ず正規化（`normalizeDateText`）してから**行う必要がある。LINE は profile の文字列をそのまま表示するので、カルテ保存で和暦→西暦表記に変わる |
| D-8 | テストデータ | `seed-emulator.mjs` は child 証の `name` に**児童名**を入れている（様式上は支給決定障害者等の欄）。実物OCR導入後の挙動とは前提が異なる |

---

## 7. 新規登録フロー（A：新しい利用者＋初回受給者証）

| 順 | 処理 | 場所 |
|---|---|---|
| 1 | 入口：管理Web「新しい利用者」（`RecipientImportModeSelect` → new）／LINE `/line/import/start` →「新しい利用者」（`/line/import?new=1`） | `CertImportFlow.tsx:846-875` |
| 2 | **利用者IDと受給者証IDをクライアントで事前採番**（`reserveBeneficiaryId` / `reserveCertificateId`） | L247-255, L864-865 |
| 3 | **利用者の特定：行わない**（重複チェック・受給者証番号での既存検索なし。常に新しいID） | — |
| 4 | ページごとに撮影 → OCR → formData（手修正可） | `performOcr` |
| 5 | LINE のみ：page1 の `name` が空だと保存不可（`missingNewName`） | `LineCertImportView.tsx:139, 263` |
| 6 | 「確定して保存」→ 画像を Storage へ順次アップロード | L697-723 |
| 7 | `createBeneficiaryWithCertificate`：`buildCertificateContent` で summary / issueDate / validFrom / validTo を算出 → **writeBatch 1回**で利用者doc（profile＝summaryの写し、summary、currentCertificateId、certificateCount=1、status=active、certType）と受給者証doc（status=current）を set | `beneficiaries.ts:258-301` |
| 8 | `personal` 等のカルテマップは**作られない**（カルテ表示は profile/summary へのフォールバック） | — |
| 9 | 遷移：管理Web → `/t/{t}/beneficiaries/{id}?tab=certificates`／LINE → `/line/import/done` | `importRoutes` |

**OCR結果をカルテ初期値に使えるタイミング（調査9）**

| タイミング | 可能性 | 影響 |
|---|---|---|
| (a) 保存処理の中で personal も書く | 技術的には `createBeneficiaryWithCertificate` の batch に足せば可能 | Production Core（beneficiaries.ts）変更。LINE も同時に変わる。**スタッフ確認なしの自動保存になる**ため前提に反する |
| (b) 保存直後、カルテ（`?tab=certificates` で既に遷移している）で「受給者証の内容を本人情報に取り込む」確認カードを出す | personal が空の利用者に限定すれば差分は「空 → 候補」だけで単純 | CertImportFlow 変更不要。LINE 新規は完了画面に行くため対象外（管理Webで後から実施） |
| (c) 基本情報タブの本人情報「編集」初期値に候補を入れる（保存は従来どおりスタッフ操作） | `initialPersonalForm` は既に profile/summary から補完している。child の場合は `childName` 等を使うよう分岐が必要 | 画面だけの変更。保存しなければ何も起きない |
| (d) 取込画面内（保存前）に「カルテ初期値」確認ステップを追加 | 可能 | CertImportFlow（LINE共通）の変更で高リスク |

---

## 8. 更新フロー（B：既存利用者＋受給者証更新）

| 順 | 処理 | 場所 |
|---|---|---|
| 1 | 入口：カルテ受給者証タブ「受給者証を更新」→ `/t/{t}?beneficiaryId=…&new=1`／LINE 利用者選択・詳細 → `/line/import?beneficiaryId=…&new=1` | `CertificatesPanel.tsx:183`、`line/beneficiaries/select/page.tsx:95` |
| 2 | **利用者の特定：スタッフが選んだ利用者IDで確定**。管理Webは照合なし。LINE は page1 `name` と profile/summary の氏名の不一致警告のみ | `LineCertImportView.tsx:138` |
| 3 | 対象利用者を読み、現在の証と同じ種別を初期選択 | `CertImportFlow.tsx:350-369` |
| 4 | 新しい受給者証IDを事前採番（利用者IDは既存） | L253 |
| 5 | 撮影 → OCR → formData → 画像アップロード | 同上 |
| 6 | `addCertificateToBeneficiary`（**runTransaction**）：<br>① 利用者docを読む（無ければエラー）<br>② `currentCertificateId === 今回のID` なら何もしない（再試行の冪等性）<br>③ 旧データ（`currentCertificateId` 欠落＋直下pages）なら `certificates/legacy` を status=superseded で作成／それ以外で現在の証があれば **旧証を status=superseded・supersededBy=新ID に update**<br>④ 新証を status=current で set<br>⑤ 利用者docを update：`currentCertificateId`、`certType`、`summary=mergeSummary`、**`profile=mergeProfile`**、`certificateCount` 加算 | `beneficiaries.ts:344-430` |
| 7 | personal / guardian / contract / school / consultationSupport は**触れない**（Phase 1-A でエミュレーター確認済み・資料による） | — |

**差分確認ロジックを置く場所（調査10）**

| 置き場所 | 評価 |
|---|---|
| `addCertificateToBeneficiary` のトランザクション内 | 非推奨。Production Core・LINE共通処理であり、ここで personal を書くと「確認なしの上書き」になる |
| `CertImportFlow.tsx` の state | 非推奨。管理Web・LINE 共通の 1,200行のコンポーネントで、sessionStorage 退避形式（`ImportSession`）にも影響 |
| **新規の純粋ロジック** `src/lib/beneficiaryChart/`（例：受給者証 → カルテ候補の抽出、正規化して比較、差分一覧の生成） | **推奨**。Firebase 非依存で `node --test` で検証できる（Phase 1-A と同じ構成）。入力は「受給者証doc の pages＋certType」と「`readChartSections` の結果」 |
| 反映（書き込み） | 既存 `saveChartPersonal` / `saveChartSection` を使えばカルテ保存と同じ経路（personal＋profile の写し）。ただし現在は personal マップを丸ごと置換するため、**画面を開いた後の同時編集で古い値に戻すリスク**がある。項目単位（`"personal.address"` 等の field path）またはトランザクションで書く関数の追加を検討 |

---

## 9. 差分確認UIの候補（決定はしない）

| 案 | 内容 | 既存コードへの影響 | LINE版への影響 | 管理Webへの影響 | 誤上書きリスク |
|---|---|---|---|---|---|
| **A. 保存前（取込画面内）** | 取込画面の「確定して保存」の前に「カルテとの比較」ステップを挟む | **大**：CertImportFlow（LINE共通）、ImportSession、保存処理の引数・トランザクション | 大：LINE も同じ処理。スマホの小さな画面に比較表 | 大 | 中：保存と同時に反映するため、OCR誤りがそのまま入る機会が多い。取消が難しい |
| **B. 保存処理で自動反映（空欄のみ等）** | `createBeneficiary…`/`addCertificate…` が personal も書く | 大：beneficiaries.ts（Production Core） | 大（全経路に効く） | 大 | **高**：スタッフ確認なし。要件に反する |
| **C. 保存後・カルテ「受給者証」タブに差分カード** | 現在の証とカルテの差分を一覧にし、項目ごとに「反映する」を選ぶ | 小：新規コンポーネント＋純粋ロジック。管理Webの保存後遷移は既に `?tab=certificates` | **なし**（LINE は完了画面へ行くので出ない。必要なら後で管理Webで実施） | 中：受給者証タブに1カード追加 | 低：明示選択。証を開くたびに見える |
| **D. 基本情報タブの本人情報カードに「受給者証と異なる」表示＋反映ボタン** | 差分がある項目にバッジ、編集時に候補を提示 | 小：BasicInfoTab の変更 | なし | 小 | 低。ただし毎回表示されるため「無視したい差分」（例：住所表記ゆれ）の扱いが必要 |
| **E. 専用確認ステップ（保存直後の別画面）** | 例：`/t/{t}/beneficiaries/{id}/certificate-review?certificateId=…`。新規なら「初期値として取り込む」、更新なら「変更候補」 | 中：新ルート＋管理Webの `afterSave` 1行（CertImportFlow の admin 分岐のみ。Phase 1-A でも同種の1行変更を実施済み） | なし（LINE 分岐は変えない） | 中 | 低：保存直後で流れが自然。スキップ可能にする必要あり |

共通の判断材料：
- **「反映しない」選択の記録**：何もしないと証を開くたびに同じ差分が出る。証ごとに「確認済み」を残すなら受給者証doc（certificates）か利用者docへの新フィールド追加が必要。Firestore Rules は beneficiaries・certificates にフィールド単位の検証が無いため **Rules 変更は不要**（`firestore.rules` 確認済み）。
- **差分のノイズ**：住所（丁目/番地/ハイフン/全角半角）、氏名の空白、フリガナのひらがな/カタカナ、和暦/西暦。正規化関数は `normalizeForChartSearch`・`normalizeDateText` が既にある。

---

## 10. 期限管理との接続

### 10.1 現在の仕組み

```
pages[1].formData.servicePeriod1（page2 支給決定期間①）
   └─ 無ければ pages[6].formData.burdenPeriod（page7 負担 適用期間）
        ↓ parseWarekiPeriod（「から」「〜」「~」で分割 → parseWarekiDate で令和/平成/昭和・元年対応）
   validFrom / validTo（"YYYY-MM-DD" or null） … extractValidity（certificateModel.ts:169-185）
        ↓ 受給者証docへ保存（取込時・OCR訂正時に再計算）
   getCurrentCertificateValidity（chartStore.ts:71-94）… 一覧は利用者ごとに現在の証docを1件ずつ読む
        ↓
   getCertificateStatus（certificateStatus.ts:27-50）
     証なし → 未登録 / validTo が ISO でない → 期限未入力 / 残日数<0 → 期限切れ / ≤30日 → 期限間近 / それ以外 → 有効
```

LINE 詳細は独自に `validTo < 今日` で期限切れ表示（`line/beneficiaries/[beneficiaryId]/page.tsx:33-43`）。

### 10.2 child OCR で期限管理が自動的に機能する条件

| 必須 | 内容 |
|---|---|
| 1 | **page2 の `servicePeriod1` に「(元号)N年N月N日から(元号)N年N月N日まで」等、`parseWarekiPeriod` が分割できる形で入ること**（`から`/`〜`/`~` 区切り）。または page7 の `burdenPeriod` が同形式で入ること |
| 2 | **放課後等デイサービスの支給決定期間が page2 の1組目に載ること**。載らない場合（別ページ・別様式・2組目以降）、現在の `extractValidity` は他サービスの期間か負担期間を有効期限として使う |
| 3 | page2 と page7 の期間が異なる場合、どちらを「受給者証の有効期限」とするか（現在は page2 優先） |

注意：
- adult の page2 parser の `PERIOD_RE` は**令和のみ**かつ「から…まで」形式限定。`servicePeriodN`（2組目以降）を期限計算に使う仕組みは無い。
- 一覧の期限は利用者ごとの追加読み込み（N+1）。件数が増えた場合に利用者docへ `validTo` を写す案は Phase 1-A 報告書12章に記載済み（実施すると CertImportFlow／beneficiaries.ts の変更＝Production Core 変更）。
- `DEFAULT_EXPIRING_SOON_DAYS = 30` は固定値（引数で変更可能な作りにはなっている）。

---

## 11. OCR精度向上の選択肢（Cloud Vision ＋ 既存 parser の延長）

| 方法 | 現在 | 実現性 | 変更箇所・リスク | 評価 |
|---|---|---|---|---|
| ページ単位 parser | adult 1〜4 のみ | 高。登録表 `CERT_PAGE_PARSERS` がそのまま使える | `lib/parsers/child/*`（新規）＋ `parseCertText.ts` の登録 | **最優先**。child のみに効き adult に影響しない |
| ラベル基準抽出（「サービス種別」「支給決定期間」等の見出しから値を取る） | page2 は決め打ち、page3/4 は行オフセット | 高 | parser 内 | 「短期入所」「日/月」決め打ちを、ラベル起点＋値パターン（期間・`N日/月`・`N時間/月`）照合に置換するのが現実的 |
| 正規表現の強化 | 和暦・10桁番号・期間 | 高 | parser / normalizeText | 平成・元年対応、`〜`区切り、全角数字。`normalizeText` は adult と共有のため変更は adult 回帰テスト必須 |
| 近傍テキスト（座標） | **使えない**（Functions が全文テキストのみ返す） | 中 | `ocrFromImageData` のレスポンスに blocks/words の座標を追加（**Functions 変更・デプロイ必要**）。ペイロード増、型追加 | 縦書きラベル・枠の位置で本人/児童/住所を区別できる可能性。ただしまず全文テキストで足りるかを実サンプルで確認してから |
| Vision の raw text の活用 | ocrText は保存済み | 高 | なし（読むだけ） | parser 改修後に保存済み ocrText で再解析・比較できる（個人情報の扱いが前提） |
| Vision のオプション（`imageContext.languageHints: ["ja"]` 等） | 指定なし | 中 | Functions 変更 | 効果は実サンプルで要検証 |
| 画像前処理 | 縮小（1800/1400px）・JPEG 圧縮・EXIF 回転のみ | 中 | `compressImage.ts` / `capture/page.tsx`（LINE・管理Web共通） | 傾き補正・コントラスト補正は既存の撮影体験に影響。解像度は Vision に十分な可能性が高いが未検証。**優先度は低** |
| ページ取り違え検出（見出し「受給者証（Ⅰ）」「介護給付費」等でページを判定） | なし | 高 | parser 層 | 撮影ページ違いによる誤入力を防げる。表示のみなら低リスク |
| 抽出値の妥当性チェック（10桁、日付の実在、期間の前後関係） | 一部（交付日の和暦形式） | 高 | 純粋関数 | 誤った値を「空欄＋要確認」にする方が安全 |

外部AIサービスの追加は行わない前提で評価した。

---

## 12. 実物サンプル画像の必要性

**結論：必要。** 現在リポジトリにある child 画像は未記入の空様式のみで、記入済み child の OCR 結果は0件。値の取れ方（改行位置、ラベルと値の結合、手書き・押印の混入、組数）は空様式からは分からない。

既存資料（2026-09-05）はページ別に「記入済み 21件以上」を挙げているが、Phase 1-B の目的（本人特定・期限管理・カルテ連携）に絞れば、まずは次の**最小構成**で着手判断ができる。

| 優先 | 必要なもの | 枚数の目安 | 目的 |
|---|---|---|---|
| 1 | 主要取引自治体の**記入済み child 証 1冊の全ページ**（page8 の実物を含む） | 1冊（8ページ前後） | ページ構成・page8 様式・放課後等デイサービスの記載位置・期間の書式の確定 |
| 2 | 条件の異なるもう1冊（別の利用者：サービス組数が違う／上限額管理あり 等。可能なら別自治体） | 1冊 | 組数・欄の可変性、自治体差の有無 |
| 3 | 優先1のうち page1・page2（または放デイ記載ページ）・page7 を、**スマホで通常の事務所環境で撮影したもの** | 各1〜2枚 | 実運用の撮影条件（傾き・照明・反射）での Cloud Vision の出方 |

撮影条件のバリエーション（傾き・照明・手書き）を網羅的に集めることは、最初の parser 設計には不要。まず上記で設計し、運用開始後に「読み取れなかった項目」を記録して追加判断する方が収集量を抑えられる。

取り扱い上の注意（既存方針の再掲）：
- 実物画像・OCR全文は**リポジトリにコミットしない**。テストfixtureは構造を保ったまま値を架空に置き換えたものだけ
- 本番 Firestore に既に保存されている child 証の `ocrText` を parser 開発に使うかどうかは、利用目的・同意の観点で人間が判断する（本調査では参照していない）
- 発行自治体名（個人情報ではない）は記録しておくと自治体差の判断に使える

---

## 13. Production Coreへのリスク

| ファイル | 変更の可能性 | リスク | 理由 |
|---|---|---|---|
| `lib/parsers/child/*.ts`（新規） | 高 | **低** | 新規ファイル。登録するまで動作に影響なし |
| `lib/parsers/common/helpers.ts` | 中 | 中 | adult と共有。挙動を変えると adult 回帰（`outputCompat.test.ts` で固定済み） |
| `lib/parsers/normalizeText.ts` | 中 | 中 | adult と共有 |
| **`lib/parsers/parseCertText.ts`** | 高（child 登録） | **中** | 1か所の登録で管理Web・LINE の child 取込すべてに効く。既存テスト4件（child に parser が無いことを固定）を意図的に更新する必要がある |
| `lib/parsers/adult/page1.ts`（address バグ修正） | 中 | 中〜高 | adult 本番の挙動が変わる。child と別フェーズにすべき |
| **`lib/firestore/certificateModel.ts`**（`buildSummary` / `mergeProfile` / `extractValidity`） | 中 | **高** | 全利用者の summary/profile/有効期限の算出元。certType 分岐（child は childName を代表名に 等）を入れると既存データとの不整合や表示名の変化が起きる |
| **`lib/firestore/beneficiaries.ts`**（`createBeneficiaryWithCertificate` / `addCertificateToBeneficiary`） | 低〜中 | **高** | 取込保存のトランザクション本体。管理Web・LINE 共通 |
| **`CertImportFlow.tsx`** | 低（案A/D以外は不要。案Eは admin の afterSave 1行） | **高** | 1,200行・LINE 共通・sessionStorage 退避形式あり |
| `types/cert.ts` / `constants/certPages.ts` | 低（新フィールド追加時のみ） | 中 | 全ページの formData 形に影響（emptyFormData・セッション復元） |
| `components/certLayouts.tsx` / `constants/certLayoutMap.ts` | 低（page8 判明時） | 中 | adult と共有のレイアウト |
| **Functions `ocrFromImageData`** | 低（座標・languageHints を使う場合のみ） | **高** | デプロイが必要。Callable の後方互換（`{text}` を維持し追加のみ）を守れば既存フロントは壊れない |
| **LINE版**（`LineCertImportView.tsx`・`beneficiarySearch.ts`） | 中（child の page1 parser を有効化する場合） | **中〜高** | `KEY_FIELDS` の「氏名」＝`name`、`isNameMismatch` の比較相手＝page1 `name`、新規保存条件 `missingNewName` が、child では保護者側の欄を見ている（6.4 D-3） |
| `src/lib/beneficiaryChart/*`（新規の候補抽出・差分） | 高 | **低** | 純粋関数・新規 |
| `chartStore.ts`（項目単位保存の追加） | 中 | 低〜中 | Phase 1-A 範囲。既存関数を変えず追加なら低 |
| カルテ UI（`chart/*`） | 高 | 低〜中 | 管理Webのみ。LINE 非影響 |
| `firestore.rules` / `storage.rules` | 低 | — | beneficiaries/certificates にフィールド検証が無いため、新フィールド追加では変更不要。新サブコレクションを作る場合のみ必要 |
| `tests/e2e/seed-emulator.mjs` | 中 | 低 | child 証の `name` に児童名を入れている前提の見直しが必要（6.4 D-8） |

---

## 14. Phase 1-Bの安全な実装分割案

現在の構造上の最大の危険は「child の page1 parser を登録した瞬間に summary/profile/LINE の氏名が保護者名に変わる」ことなので、**本人特定に関わらない項目から先に出し、氏名の扱いは決定後に別ステップで出す**順序を提案する。

| 段階 | 内容 | 主な変更 | Production Core 影響 | 前提 |
|---|---|---|---|---|
| **1-B0** 決定とサンプル | 15章の事項を決める。最小サンプル（12章）を入手し、Cloud Vision の出力を匿名化 fixture にする | なし（コード変更なし） | なし | — |
| **1-B1** child parser（人物以外） | page2〜4 のサービス・期間・支給量、page7 の負担上限・適用期間・上限額管理、page1 の `number` / `issueDate` / `cityName` / `disabilityType` のみ。**`name` / `birthday` / `childName` / `address` は空のまま返す** | `lib/parsers/child/*`（新規）、`parseCertText.ts` に登録、child の parser 非存在を固定したテストの更新 | 中（child 取込のみ）。**この時点で validTo が埋まり期限管理が自動で動く**。summary/profile の氏名には影響しない | 放デイの記載位置・期間書式が判明していること |
| **1-B2** 候補抽出・差分の純粋ロジック | `certType` 別のマッピング（5章）、正規化比較、差分一覧の生成。UI・書き込みなし | `src/lib/beneficiaryChart/` に新規＋テスト | なし | C-5（支給決定障害者等＝保護者か）、住所の帰属の決定 |
| **1-B3** カルテでの確認・反映 UI（管理Webのみ） | 9章の C/D/E のいずれか。項目ごとに選んで personal / guardian / consultationSupport へ反映（personal 保存時は従来どおり profile にも写す） | カルテ UI、必要なら chartStore に項目単位の保存関数を追加 | 低（CertImportFlow・LINE 非変更。案Eのみ admin afterSave 1行） | 1-B2 |
| **1-B4** 氏名の扱いの整理＋child 人物項目の parser | 決定に従い `buildSummary` / `mergeProfile` の certType 対応（または「personal があれば profile を上書きしない」等）。その後 child page1/page5 の人物項目を parser で埋める。LINE の `KEY_FIELDS`・不一致チェックの比較対象を child に合わせる | certificateModel.ts、beneficiaries.ts、LineCertImportView.tsx、seed データ | **高**（全取込経路・LINE・一覧表示名）。既存データの表示名が変わらないことの確認が必要 | 15章 #1〜#3 |
| **1-B5** 新規利用者の初期値 | 新規登録直後の「受給者証から本人情報を取り込む」（1-B3 の UI を personal 空の利用者に適用） | カルテ UI | 低 | 1-B3・1-B4 |
| **1-B6**（任意）期限管理の強化 | 期限間近日数の事業所設定、一覧用 `validTo` の利用者docへの写し、page8 判明後の対応 | 設定画面／（写しを持つ場合）保存処理 | 写しを持つ場合は高 | 運用要望 |

adult の `address` バグ修正・page2 の決め打ち解消は、child とは別の小さな変更として扱う方が回帰を切り分けやすい（child parser を adult と共有しない限り同時に直す必要はない）。

---

## 15. 実装前に人間が決める必要がある事項

| # | 事項 | 影響範囲 |
|---|---|---|
| H-1 | 18歳未満の証で「支給決定障害者等」欄は保護者か（例外はあるか） | マッピング全体 |
| H-2 | 利用者（カルテ本人・一覧・LINE）に表示する氏名は**児童欄**か。既存の summary / profile をどう扱うか（certType で代表名を切り替える／personal を正本として profile 上書きを止める／現状維持） | certificateModel・beneficiaries・LINE・一覧 |
| H-3 | 証の「居住地」はカルテの利用者住所・保護者住所のどちらの候補にするか | 差分UI |
| H-4 | 差分確認UIの位置（9章 A〜E） | 変更範囲・LINE 影響 |
| H-5 | 「反映しない」と選んだ差分を記録するか（記録するなら保存先） | データ構造 |
| H-6 | 受給者証の「有効期限」とする期間（放デイの支給決定期間／page2 1組目／負担の適用期間）と、複数期間がある場合の優先順位 | extractValidity・期限管理 |
| H-7 | 新規登録時に受給者証番号で既存利用者との重複を警告するか | 新規フロー |
| H-8 | LINE 版でも差分確認を行うか（行わないなら管理Webで後から確認する運用でよいか） | LINE 影響 |
| H-9 | 実物サンプルの入手範囲（12章）と、本番に保存済みの `ocrText` を開発に使ってよいか | 個人情報の取り扱い |
| H-10 | 既存テストデータ（child 証の `name` に児童名）の扱い | 検証の前提 |

---

## 16. 不明点・追加調査事項

| # | 不明点 | 解消方法 |
|---|---|---|
| U-1 | **放課後等デイサービスの支給決定が、現在の8ページ様式のどのページ・どの欄に記載されるか**。現行のページ名は「介護給付費」「訓練等給付費」で、障害児通所支援に該当するページ名はコード・資料に無い。（一般には障害児通所支援は別の受給者証で交付される場合があるとされるが、本調査では確認していない。**要確認の仮説**） | 実物（12章 優先1） |
| U-2 | page8 の正式な様式（adult も同じ）。ページ数が8で正しいか | 実物 |
| U-3 | page1 と page5 の記入内容は同一か | 実物 |
| U-4 | page6 の問い合わせ先の有無は年齢区分の差か自治体差か | 複数自治体の実物 |
| U-5 | page7 のラベルなし行（現在「食事提供体制加算」）の正体 | 実物 |
| U-6 | Cloud Vision での child 実物の出力（既存の様式調査は macOS Vision） | 実物を本番同等の Function で OCR（ローカルエミュレーターでは認証情報が無く Vision は動かない：資料による） |
| U-7 | 本番に child 証が既に保存されているか（件数）、その `ocrText` の有無 | 本番データの確認（今回は接続していない） |
| U-8 | Phase 1-A 未デプロイ状態で本番に存在する利用者の profile / summary の実態（手入力・OCR の比率） | 本番確認（要承認） |
| U-9 | certificates サブコレクション用 Rules（コミット `2bdbfb72`）が本番反映済みか（Phase 1-A 報告書でも未確認） | 本番 Rules の確認 |
| U-10 | 撮影画像の解像度（1400px / 1800px）が Cloud Vision の手書き・小さい文字に十分か | 実物での比較 |

---

## Phase 1-B 実装前に決めるべきこと（絞り込み版）

1. **child 証で利用者名として扱う欄**：児童欄（`childName`）を利用者本人、支給決定障害者等（`name`）を保護者として扱ってよいか（H-1・H-2）
2. **既存の summary / profile の扱い**：受給者証更新時に `mergeProfile` が profile を上書きする挙動を、Phase 1-B でも維持するか変えるか（H-2）
3. **放課後等デイサービスの支給決定がどこに載るか**を実物で確認し、何を「受給者証の有効期限」とするか決める（U-1・H-6）
4. **差分確認UIの位置**：保存後のカルテ（案C/D/E）にするか、保存前の取込画面（案A）にするか。LINE で差分確認を行うか（H-4・H-8）
5. **証の居住地の反映先**（利用者住所か保護者住所か）と、反映対象にする項目の範囲（H-3）
6. **「反映しない」選択を記録するか**（H-5）
7. **実物サンプルの範囲**：記入済み child 証 2冊（うち1冊は page8 を含む全ページ、一部スマホ撮影）で着手してよいか。本番保存済み `ocrText` の開発利用の可否（H-9）
8. **分割順序の承認**：人物項目を含まない child parser（1-B1）を先行し、氏名の扱い（1-B4）は決定後に別リリースとする方針でよいか

---

## 付録：今回の作業で行ったこと／行っていないこと

- 行ったこと：コード・テスト・docs の読み取り、`npm test`（112/112 成功）、本報告書の作成
- 行っていないこと：ソースコード・テスト・型・Rules・package.json・テストデータの変更、Firestore/Storage のデータ変更、Functions のビルド・デプロイ、commit / push、Production への接続
- 作成したファイル：`paperlesscare-web/PHASE1B_RESEARCH_REPORT.md`（本ファイル。未コミット）
