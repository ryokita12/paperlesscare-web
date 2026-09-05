# PaperlessCare Phase 2 実装報告：adult／child共通layout基盤＋child page6差分対応

> 対象リポジトリ: `/Users/rkita/Desktop/React/PaperlessCare/paperlesscare-web`
> 実施日: 2026-09-05
> 作業ブランチ: `main`
> 作業開始時HEAD: `4257d660 共通parser基盤と安全なfallbackを実装`（Phase 1）
> **デプロイ・本番操作・git push・commit は一切行っていません。** `child.enabled = false` を維持し、`cors.json` にも触れていません。

---

## 1. 実装概要

### 1.1 Phase 2の目的

OCR parser や値抽出ロジックを実装することではなく、**adult の既存画面表示を維持したまま、adult／child で共通する帳票layoutを整理し、明確な構造差が確認できている child page6 の「問い合わせ先」だけを安全に表現できるlayout基盤を作ること**。

### 1.2 実装した内容

| # | 内容 | 対象 |
|---|---|---|
| **2-A** | adult／child 共通layout基盤の明示化（page1〜5・7） | `constants/certLayoutMap.ts` |
| **2-B** | child page6 の「問い合わせ先」差分layout | `components/certLayouts.tsx` + `constants/certLayoutMap.ts` |
| **T** | adult回帰4件・child共通4件・child page6差分4件・page8 3件・feature flag 3件（計18件）の追加 | `constants/certLayoutVariant.test.ts`（新規） |

### 1.3 実装しなかった内容（意図的）

- child parser / adult parser / `parseCertText` / `parseFallback` / parser registry の変更（**parser関連ファイルに差分ゼロ**）
- adult page1 の `address` 抽出バグ修正
- page5〜8 の専用parser実装
- **page8 のlayout実装・様式の推測**
- 新規人物系フィールド（`guardianName` 等）・`cityCode` の追加
- `FormDataType` / Firestoreスキーマ / 保存処理の変更
- layoutへの種別色の追加（第4.6章で理由を記載）
- `child.enabled = true` への変更、childの通常UIへの公開
- Firebase・Vercel設定変更 / `cors.json` の変更 / 各種デプロイ / git push / PR / commit

### 1.4 最終判定

# PHASE 2 COMPLETE

| 成功条件 | 結果 |
|---|---|
| 実装前の既存テストがすべてPASS | **達成**（44件中43件はそのまま、1件は要件により意図的に更新。第7.5章） |
| 新規テストを含む全テストがPASS | **達成**（62 / 62） |
| TypeScriptエラーなし | **達成**（root / functions とも 0） |
| production build成功 | **達成** |
| 今回の変更ファイルのlint指摘0件 | **達成**（新規追加は0件。残る2件は既存由来で、今回1件**減少**） |
| プロジェクト全体のlint件数が実装前より増えていない | **達成**（19件 → **18件**） |
| adult page1〜7の既存表示仕様が変わっていない | **達成**（回帰テスト＋描画結果の同一性を第4.5章で検証） |
| adult page6に「問い合わせ先」が追加されていない | **達成**（テストで固定） |
| child page6だけに問い合わせ先差分を表現できる | **達成** |
| parserコードに変更がない | **達成**（`git diff` で確認） |
| Firestore関連コードに変更がない | **達成** |
| `child.enabled = false` を維持 | **達成**（テストで固定） |
| page8を実装していない | **達成**（テストで固定） |
| デプロイ未実施 | **達成** |
| `cors.json` を変更していない | **達成**（差分ハッシュ一致で確認） |

---

## 2. 実装前調査

### 2.1 リポジトリ状態

```
作業ブランチ : main
開始時HEAD   : 4257d660 共通parser基盤と安全なfallbackを実装
             （その前: 667e1826 18歳未満受給者証対応の土台修正）
```

Phase 1 の変更がコミット済みであることを確認しました。

### 2.2 作業開始時の `git status`

```
 M cors.json
```

### 2.3 `cors.json` の保護状況

作業開始時に差分の内容ハッシュを記録し、作業完了後に照合しました。

```
開始時: 49f3c333e94da90cac182c90b74bee1dca98d1795fccaf1c4426621fce11aac2
完了時: 49f3c333e94da90cac182c90b74bee1dca98d1795fccaf1c4426621fce11aac2
→ 完全一致
```

**変更・削除・復元・ステージング・上書きのいずれも行っていません。**

### 2.4 リポジトリの作業指示

`CLAUDE.md` / `AGENTS.md` / `.cursorrules` は**存在しません**。`README.md` は `create-next-app` の既定内容です。

### 2.5 layout関連ファイル構成

```
src/app/t/[tenantId]/
├── constants/
│   ├── certPages.ts          … CERT_TYPES（enabled / themeClass）、PAGE_DEFINITIONS、getPageTitle
│   ├── certLayoutMap.ts      … CertLayoutId、ADULT_LAYOUT_IDS、getCertLayoutId
│   └── certLayoutMap.test.ts
└── components/
    ├── certLayouts.tsx       … LayoutType1〜7、LAYOUT_COMPONENTS、getCertLayout、CertLayoutRenderer
    └── PageTabs.tsx
```

### 2.6 layout呼び出し経路

```
取込画面   src/app/t/[tenantId]/page.tsx:823
編集画面   src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/page.tsx:246
   ↓ <CertLayoutRenderer certType={...} pageIndex={...} pageTitle={...} page={...} onChangeField={...} />
CertLayoutRenderer（certLayouts.tsx）
   ↓ getCertLayout(certType, pageIndex)
   ↓ getCertLayoutId(certType, pageIndex)   ← constants/certLayoutMap.ts（純粋データ）
   ↓ LAYOUT_COMPONENTS[layoutId]
LayoutType1〜7
```

`CertLayoutRenderer` は `createElement(..., { key: `${certType}-${pageIndex}`, ... })` でページごとに再マウントします（Phase 0 でページ7/8間のstate混入を防ぐために導入済み）。

### 2.7 pageIndexの基準

**0始まり**です。`page.tsx` が `activePageIndex`（0始まり）をそのまま渡し、`ADULT_LAYOUT_IDS[0] = "certificate1"`（page1）に対応します。**今回変更していません**（テストでも固定）。

### 2.8 certTypeによるlayout分岐方法

Phase 0 で導入済みの2層構造です。

1. `constants/certLayoutMap.ts` … 「どの種別のどのページがどのレイアウトIDを使うか」を**JSXを含まない純粋データ**として保持
2. `components/certLayouts.tsx` … レイアウトID → Reactコンポーネントの対応

`LAYOUT_COMPONENTS` は `Record<CertLayoutId, CertLayout>` 型のため、**レイアウトIDを追加すると実装漏れがコンパイルエラーになります**（実際に今回、追加直後にエラーで検出されました）。

### 2.9 adultとchildの配色指定方法

| 場所 | 内容 |
|---|---|
| `constants/certPages.ts` | `CERT_TYPES[].themeClass`（adult: `cert-type-purple` / child: `cert-type-green` / mobility: `cert-type-cream`） |
| `app/globals.css` | `.cert-type-purple` / `.cert-type-green` / `.cert-type-cream` の定義 |
| `page.tsx:648, 695, 705` | 種別選択カード・現在の種別表示・進捗バーに `themeClass` を適用 |

**帳票レイアウト（`certLayouts.tsx`）は種別色を一切使っていません**（`cert-type-*` の参照ゼロ）。色はレイアウト外で表現される設計です。

### 2.10 実装前のベースライン

| 項目 | コマンド | 結果 |
|---|---|---|
| root TypeScript | `npx tsc --noEmit` | **PASS**（エラー0） |
| functions TypeScript | `npx tsc -p functions/tsconfig.json --noEmit` | **PASS**（エラー0） |
| 全テスト | `npm test` | **44 / 44 PASS**（依頼文の想定と一致） |
| プロジェクト全体lint | `npm run lint` | **19問題**（error 8 / warning 11） |
| layout関連ファイルのみlint | `npx eslint <3ファイル>` | **3 warnings**（`certLayouts.tsx` の `pageTitle` 未使用 × 3：LayoutType2 / LayoutType6 / LayoutType7） |
| production build | `npm run build` | **PASS** |

パッケージマネージャは `package-lock.json` のみ存在するため **npm** を使用しました。

---

## 3. adult／child画像比較

`public/cert-samples/adult/` と `public/cert-samples/child/` の page1〜7 を、**目視**と**ローカルOCR（macOS Vision framework）によるラベル構造の機械diff**の両方で比較しました。

> ローカルOCRツールは一時的に自作したもので、**課金なし・本番非接触・完全ローカル**です。調査後に削除済みです。

### 3.1 比較結果

| ページ | 構造 | 色 | 明確な差分 | 共通化可否 |
|---|---|---|---|---|
| **page1** | 受給者証（Ⅰ）／受給者証番号・支給決定障害者等（居住地・フリガナ・氏名・生年月日）・**児童**（フリガナ・氏名・生年月日）・障害種別・交付年月日・支給市町村名及び印。**adult / child 一致** | adult=薄紫 / child=薄緑 | **なし**（OCR差分は `月`/`日` の分割位置、`及び印` の分割、縦書き「児童」の拾い方といった認識ゆれのみ） | **共通化可** |
| **page2** | 介護給付費の支給決定内容／障害支援区分・認定有効期間・サービス種別×3組・予備欄。**adult / child 一致** | 同上 | **なし**（OCR完全一致） | **共通化可** |
| **page3** | サービス種別×2組・予備欄（見出しなし・つづきページ）。**adult / child 一致** | 同上 | **なし**（OCR完全一致） | **共通化可** |
| **page4** | 訓練等給付費の支給決定内容／サービス種別×3組・予備欄・**問い合わせ先**。**adult / child 一致** | 同上 | **なし**（OCR完全一致） | **共通化可** |
| **page5** | 受給者証（Ⅱ）／page1と同一構成。**adult / child 一致** | 同上 | **なし**（OCR差分は認識ゆれのみ） | **共通化可** |
| **page6** | 計画相談支援給付費の支給内容（支給期間・指定特定相談支援事業所名・モニタリング期間・開始年月日）＋特定障害者特別給付費の支給内容（支給額・適用期間・変更前×2）・予備欄 | 同上 | **あり。child にのみ最下部に「問い合わせ先」欄がある**（adult は大きな「（予備欄）」で終わる） | **child専用layoutが必要** |
| **page7** | 利用者負担に関する事項／負担上限月額・適用期間・変更前×2・**ラベルなしの空行**・利用者負担上限額管理対象者該当の有無・利用者負担上限額管理事業所名・開始年月日・特記事項欄・問い合わせ先。**adult / child 一致** | 同上 | **なし**（OCR完全一致） | **共通化可** |

### 3.2 page6 の差分の裏付け

OCRのdiffだけでは「検出漏れ」と「本当の構造差」を区別できないため、両方の画像を目視でも確認しました。

```
adult page-6（末尾）        child page-6（末尾）
...                         ...
変更前の適用期間            変更前の適用期間
（予備欄）  ← 大きな枠      （予備欄）  ← やや小さい枠
                            問い合わせ先   ← child にのみ存在
```

**OCRノイズではなく実際の様式差**であると確認しました。

### 3.3 画像から確認できないこと（明記）

| 項目 | 状態 |
|---|---|
| **page8 の様式** | **確認できません。** `adult/page-8.png` と `child/page-8.png` は、それぞれ `page-1.png` と**バイト単位で同一**（MD5・サイズ・更新時刻・OCR出力すべて一致）。page8 として使える情報はありません |
| **正確な色コード** | 確認していません。画像は紙の色を含むスキャン/レンダリング画像で、UI上の色として使うべき値は読み取れません（第4.6章） |
| **page7 のラベルなし空行の用途** | 確認できません。実装側には「食事提供体制加算」というラベルがありますが、adult / child どちらの様式画像にも印字がありません（今回は変更していません） |
| **自治体差の有無** | 確認できません。サンプルは各種別1式のみで、発行自治体も不明です。page6 の差が「18歳以上/未満の差」なのか「自治体差」なのかは判断できません |

---

## 4. 共通layout基盤（Phase 2-A）

### 4.1 前提：共通基盤はPhase 0で既に存在していた

`certLayoutMap.ts` では既に3種別が `ADULT_LAYOUT_IDS` を共有しており、child page1〜7 は adult と同じレイアウトコンポーネントへ解決されていました。

ただしそれは **「まだ差が判明していないので暫定的に同じにしている」** 状態で、コメントにも「現時点では3種別とも同一の様式を参照している」と書かれていました。

**Phase 2 では、この共有を「様式比較の結果に基づく意図的な共通化」として明示し、差分（page6）を分離しました。**

### 4.2 変更した既存ファイル

| ファイル | 変更内容 |
|---|---|
| `constants/certLayoutMap.ts` | `CertLayoutId` に `planSupportWithContact` を追加。`CHILD_LAYOUT_IDS` を新設して `CERT_LAYOUT_IDS.child` に割り当て。`hasContactInfoRow()` を追加。ヘッダコメントを様式比較の結果に更新 |
| `components/certLayouts.tsx` | `LayoutType6` の本体を `PlanSupportLayout`（`withContactInfo` で切替）へ切り出し、`LayoutType6`（adult）と `LayoutType6WithContactInfo`（child）の2つの薄いラッパを定義。`LAYOUT_COMPONENTS` に `planSupportWithContact` を登録 |

### 4.3 共通化したページ

| ページ | レイアウトID（adult / child 共通） |
|---|---|
| page1 | `certificate1` |
| page2 | `careBenefit1` |
| page3 | `careBenefit2` |
| page4 | `trainingBenefit` |
| page5 | `certificate2` |
| page7 | `userBurden` |

**これらは adult / child がまったく同じコンポーネントインスタンスを共有します。**

### 4.4 共通化しなかったページと理由

| ページ | 判断 | 理由 |
|---|---|---|
| **page6** | **child専用layout** | 様式に構造差（問い合わせ先の有無）が確認できたため。差を無視して共通化していません |
| **page8** | **今回は対象外** | サンプル画像が page1 の複製で様式を確認できないため。**新しいレイアウトを作らず、adult の既存割り当て（`userBurden`）をそのまま踏襲**しています。これは Phase 2 の決定ではなく、既存状態の維持です |
| **mobility 全ページ** | **今回は対象外** | サンプルが4枚を2周させた仮素材で様式を確認できないため。既存どおり `ADULT_LAYOUT_IDS` を参照します |

### 4.5 adultの既存表示を維持した方法

**最重要条件は「adultの現在の表示を変えない」ことでした。** 次の方法で担保しています。

| # | 対策 |
|---|---|
| 1 | **`ADULT_LAYOUT_IDS` を1文字も変更していない**（`git diff` で確認）。adult のレイアウト割り当ては完全に不変 |
| 2 | **LayoutType1〜5・7 に一切手を触れていない**。差分は page6 周辺と `LAYOUT_COMPONENTS` への1行追加のみ |
| 3 | **page6 の共通化は「行の追加を条件分岐にした」だけ**。既存の全行（支給期間・指定特定相談支援事業所名・モニタリング期間・開始年月日・支給額・適用期間・変更前×2・予備欄）は文字列・class・フィールドとも無変更 |
| 4 | **予備欄の className が adult で完全一致することを設計で保証**。<br>`` `grid grid-cols-[140px_1fr] ${withContactInfo ? "border-b " : ""}cert-row-lg` ``<br>→ `withContactInfo=false` のとき `"grid grid-cols-[140px_1fr] cert-row-lg"` となり、**変更前の文字列と完全一致**します |
| 5 | 問い合わせ先の行は `{withContactInfo && (...)}` で囲んでおり、**adult では要素そのものが生成されません** |
| 6 | 回帰テスト4件で adult page1〜7 の割り当てと「adult page6 に問い合わせ先がないこと」を固定 |

**維持できていることを確認した項目**: ページ構造 / 項目名 / 項目順 / 行数・列数 / セル結合（grid定義） / editable の扱い（`EditableCertCell`） / 表示するデータフィールド / 余白・枠線・文字サイズ・背景色（class文字列） / ページ見出し / pageIndexとの対応 / 保存対象フィールド / イベント処理（`onChangeField`）。

### 4.6 variantまたはcertTypeの扱い

**採用した方式: レイアウトIDを分ける（`planSupport` / `planSupportWithContact`）**

| 案 | 評価 |
|---|---|
| **A. レイアウトIDを分ける（採用）** | Phase 0 で作った2層構造の設計どおりの使い方。`certLayoutMap.ts` が「種別ごとの様式差の一覧」として読める。JSXを含まないため単体テストできる。`Record<CertLayoutId, CertLayout>` によりコンポーネント実装漏れがコンパイルエラーになる |
| B. `LayoutProps` に `certType` を追加して分岐 | 全レイアウトの props 型が変わり、`CertLayoutRenderer` を含む広範囲に波及する。様式差が `certLayoutMap.ts` から見えなくなる |

さらに、**「どのレイアウトが問い合わせ先を持つか」の宣言を1箇所に集約**しました。

```ts
// constants/certLayoutMap.ts
const CONTACT_INFO_LAYOUT_IDS: ReadonlySet<CertLayoutId> = new Set([
  "trainingBenefit",        // page4：adult / child とも
  "planSupportWithContact", // page6：child のみ
  "userBurden",             // page7：adult / child とも
]);

export function hasContactInfoRow(layoutId: CertLayoutId): boolean;
```

`certLayouts.tsx` のラッパは**この関数を参照して** `withContactInfo` を決めます。

```tsx
function LayoutType6(props: LayoutProps) {
  return <PlanSupportLayout {...props} withContactInfo={hasContactInfoRow("planSupport")} />;
}
function LayoutType6WithContactInfo(props: LayoutProps) {
  return <PlanSupportLayout {...props} withContactInfo={hasContactInfoRow("planSupportWithContact")} />;
}
```

これにより、**テストが検証する宣言と実際の描画が同じ1つの定義を参照する**ため、両者がずれることがありません。JSXを含む `certLayouts.tsx` を直接テストできない制約（第7.1章）への対処でもあります。

### 4.7 色の扱い

**layoutに色を追加していません。**

| 判断 | 理由 |
|---|---|
| 既存のchild色定義を優先 | `themeClass: "cert-type-green"`（`certPages.ts:29`）と `.cert-type-green`（`globals.css`）が**既に存在**します |
| layoutに色を入れない | 現在の帳票レイアウトは**種別色を一切使っていません**（`cert-type-*` の参照ゼロ）。ここに色を足すと **adult の表示が変わってしまう**ため、禁止事項に該当します |
| 暫定色を決めない | サンプル画像からUI用の色コードを推測することはしていません |

**結論: 色は既存設計（種別選択カード・進捗バーへの `themeClass` 適用）で既に表現されており、Phase 2 で追加すべき色対応はありません。** 構造だけを共通化しました。

### 4.8 データフィールドを変更していないこと

| 対象 | 状態 |
|---|---|
| `FormDataType`（`types/cert.ts`） | **無変更**（`git diff` に現れません） |
| 新規人物系フィールド | **追加なし**（`guardianName` / `guardianBirthday` 等） |
| child専用の `FormDataType` | **追加なし** |
| Firestoreスキーマ | **無変更** |
| フィールドマッピング | **無変更**（既存の `supportPeriod` / `planOfficeName` / … / `memo` / `contactInfo` をそのまま使用） |
| field key のリネーム | **なし** |
| 保存処理 | **無変更**（`lib/firestore/beneficiaries.ts` に差分なし） |

---

## 5. child page6差分（Phase 2-B）

### 5.1 adult page6との違い

| | adult page6 | child page6 |
|---|---|---|
| 計画相談支援給付費の支給内容（支給期間・事業所名・モニタリング期間・開始年月日） | ○ | ○（同一） |
| 特定障害者特別給付費の支給内容（支給額・適用期間・変更前×2） | ○ | ○（同一） |
| （予備欄） | ○（最終行・大きい） | ○（最終行ではない） |
| **問い合わせ先** | **なし** | **あり（最終行）** |

### 5.2 「問い合わせ先」の配置

**childサンプル画像を根拠に、（予備欄）の直下・最終行**に配置しました。

実装は、同じリポジトリ内の**既存の前例をそのまま踏襲**しています。`LayoutType4`（page4）は「（予備欄）→ 問い合わせ先」という同じ並びを持ち、adult page-4 の画像とも一致しています。

```tsx
{withContactInfo && (
  <div className="grid grid-cols-[140px_1fr]">
    <div className="border-r flex items-start justify-center cert-cell text-center">問い合わせ先</div>
    <div className="cert-cell text-sm font-medium">
      <EditableCertCell value={page.formData.contactInfo || ""} field="contactInfo" onChangeField={onChangeField} multiline />
    </div>
  </div>
)}
```

見出し文言（`問い合わせ先`）・セル構成・`multiline` 指定はすべて `LayoutType4` / `LayoutType7` と同一です。

### 5.3 使用した既存フィールド

**`contactInfo`（既存）を使用しました。新規フィールドは追加していません。**

判断根拠（依頼文7.2の基準に沿って検討）:

| 基準 | 検討結果 |
|---|---|
| **意味が完全に一致するか** | **一致します。** `contactInfo` は `LayoutType4`（page4 問い合わせ先）と `LayoutType7`（page7 問い合わせ先）で既に使われており、帳票上の「問い合わせ先」欄そのものを表します。page6 の「問い合わせ先」も同じ意味です |
| **名前が似ているだけではないか** | 名前だけでなく**用途・ラベル・入力形式（複数行）が完全に同一**です |
| **adult側への影響** | **ありません。** adult page6 は `withContactInfo=false` のため、この行そのものが描画されません。adult の `pages[5].formData.contactInfo` は従来どおり空文字のままです |
| **ページ間で値が衝突しないか** | **しません。** `formData` は `pages[]` の**ページごとに独立したオブジェクト**です（`SavedCertPage.formData`）。page4 / page6 / page7 の `contactInfo` はそれぞれ別の値を保持します |

### 5.4 新規フィールドを追加しなかったこと

`FormDataType` に問い合わせ先に相当する既存フィールド（`contactInfo`）があり意味が完全に一致したため、**新規フィールドの追加は不要**でした。`types/cert.ts` に差分はありません。

### 5.5 保存対象にしたかどうか

**保存されます。ただしFirestoreスキーマの変更は伴いません。**

`contactInfo` は既に `FormDataType` に定義され、`emptyFormData()` でも生成され、`saveBeneficiary` / `updateBeneficiary` が `formData` を丸ごと保存する既存の仕組みに含まれています。**保存処理・スキーマともに変更していません。**

### 5.6 OCR parserを変更していないこと

**問い合わせ先の値抽出parserは実装していません。**

| 対象 | 状態 |
|---|---|
| `lib/parsers/parseCertText.ts` | **差分なし** |
| `lib/parsers/adult/page1〜4.ts` | **差分なし** |
| `lib/parsers/common/helpers.ts` | **差分なし** |
| OCRテキストからの問い合わせ先抽出 | **未実装** |

現状、page6 は adult / child とも専用parserが未登録のため（Phase 1 の安全なfallbackにより）`emptyFormData()` が返ります。したがって **child page6 の問い合わせ先欄は「空欄の表示構造」として実装され、値は画面上で手入力**します。

これは依頼文7.1の「固定文言または既存データだけで安全に表示できない場合は、空欄または表示構造だけに留める」に沿った選択です。

### 5.7 推測実装を避けた箇所

| # | 避けた推測 | 取った対応 |
|---|---|---|
| 1 | **child page6 の（予備欄）の高さ** | 画像では child の予備欄が adult より小さく見えますが、正確な寸法は決められません。**adult と同じ `cert-row-lg` を維持**し、構造上必要な `border-b` の付与のみ行いました |
| 2 | **問い合わせ先の初期値・固定文言** | 自治体名や電話番号を推測せず、**空欄**にしました |
| 3 | **問い合わせ先のOCR抽出ルール** | 記入済みサンプルがないため**実装していません** |
| 4 | **page8 の様式** | **一切実装していません**。既存の割り当てを維持 |
| 5 | **child の帳票色** | UI用の色コードを画像から推測せず、既存の `themeClass` 設計に委ねました |
| 6 | **page7 のラベルなし空行の意味** | 「食事提供体制加算」という既存ラベルの当否は判断せず、**今回は触れていません** |

---

## 6. mappingとfeature flag

### 6.1 adult page1〜7のmapping（変更なし）

| pageIndex | ページ | レイアウトID |
|---|---|---|
| 0 | page1 | `certificate1` |
| 1 | page2 | `careBenefit1` |
| 2 | page3 | `careBenefit2` |
| 3 | page4 | `trainingBenefit` |
| 4 | page5 | `certificate2` |
| 5 | page6 | `planSupport` |
| 6 | page7 | `userBurden` |

`ADULT_LAYOUT_IDS` は**1文字も変更していません**。

### 6.2 child page1〜7の内部mapping

| pageIndex | ページ | レイアウトID | adultとの関係 |
|---|---|---|---|
| 0 | page1 | `certificate1` | **共通** |
| 1 | page2 | `careBenefit1` | **共通** |
| 2 | page3 | `careBenefit2` | **共通** |
| 3 | page4 | `trainingBenefit` | **共通** |
| 4 | page5 | `certificate2` | **共通** |
| 5 | page6 | **`planSupportWithContact`** | **child専用** |
| 6 | page7 | `userBurden` | **共通** |

### 6.3 page8を登録していないこと

`CHILD_LAYOUT_IDS` の index 7 は `"userBurden"` としていますが、これは**新規登録ではなく、adult の既存割り当ての踏襲**です。

- 変更前も child page8 は（`ADULT_LAYOUT_IDS` 共有により）`"userBurden"` に解決されていました
- **page8 用の新しいレイアウトID・コンポーネントは作っていません**
- 仮に index 7 を省略しても、フォールバックにより同じ `"userBurden"` に解決されるため**挙動は同一**です
- テスト（`page8: 新しいレイアウトを実装しておらず、adult の既存割り当てを踏襲している` ほか3件）で固定しています

### 6.4 通常UIへの公開状況

**childは通常UIに公開されていません。**

取込画面の種別選択（`page.tsx:635-647`）は次の**二重ガード**になっています。

```tsx
const disabled = !type.enabled;
<button disabled={disabled} onClick={() => { if (disabled) return; setSelectedCertType(type.id); }}>
```

`child.enabled = false` のため、ボタンは `disabled` 属性で押せず、仮にクリックイベントが発火しても早期リターンします。

**レイアウトをregistryへ登録してもUIへの露出は発生しません。** 露出は `CERT_TYPES[].enabled` のみで制御されており、`certLayoutMap.ts` は「解決だけを行う純粋な参照表」だからです。したがって依頼文8の「登録すると露出してしまう場合は登録しない」には該当せず、**安全に登録できました**。

childを選択可能にするUI・URLパラメータ等の仕組みは**追加していません**。一時的な有効化による手動確認も行っていません。

### 6.5 `child.enabled = false` の確認

```ts
// src/app/t/[tenantId]/constants/certPages.ts
{ id: "child", ..., enabled: false, statusLabel: "今後実装予定" }
```

- `certPages.ts` に**差分なし**（`git diff` で確認）
- テスト2件で固定（`child.enabled === false` / 選択可能な種別が `["adult"]` のみ）

---

## 7. テスト

### 7.1 実行結果

| 確認項目 | 実行コマンド | 結果 |
|---|---|---|
| 実装前テスト | `npm test` | **PASS**（44 / 44） |
| layout関連テスト | `npm test`（layout関連 22件） | **PASS** |
| 全テスト | `npm test` | **PASS**（62 / 62） |
| root TypeScript | `npx tsc --noEmit` | **PASS**（エラー0） |
| functions TypeScript | `npx tsc -p functions/tsconfig.json --noEmit` | **PASS**（エラー0） |
| 変更ファイルlint | `npx eslint <4ファイル>` | **今回追加の指摘0件**（既存warning 2件のみ） |
| プロジェクト全体lint | `npm run lint` | **FAIL（既存由来）**／18問題。**実装前19件から1件減少** |
| production build | `rm -rf .next && npm run build` | **PASS**（10ルート生成） |

### 7.2 テスト件数

| 区分 | 件数 |
|---|---|
| 実装前テスト件数 | **44** |
| 新規テスト件数 | **18** |
| 実装後総テスト件数 | **62** |
| PASS | **62** |
| FAIL | **0** |

### 7.3 lint件数の比較

| | 実装前 | 実装後 | 差 |
|---|---|---|---|
| プロジェクト全体 | 19（error 8 / warning 11） | **18（error 8 / warning 10）** | **−1** |
| `certLayouts.tsx` | 3 warnings | 2 warnings | −1 |

**増加はありません。** 減少の理由は、`LayoutType6` の本体を `PlanSupportLayout` へ移した際、未使用だった `pageTitle` を destructure しなくなったためです（既存warningを範囲外で修正したわけではなく、今回の変更の自然な副次効果です）。

残る2件（`certLayouts.tsx:206` / `:658` の `pageTitle` 未使用）は `LayoutType2` / `LayoutType7` のもので、**いずれも今回触っていない既存の指摘**です。

**プロジェクト全体lintの判定**:

```
プロジェクト全体lint：FAIL（既存由来 / error 8件はすべて今回未変更のファイル）
今回の変更ファイルのみlint：PASS（今回追加の指摘0件）
実装前後のlint件数：19 → 18（増加なし・1件減少）
```

### 7.4 adult表示回帰テストの内容（4件）

| テスト | 検証内容 |
|---|---|
| `adult回帰: page1〜7のレイアウト割り当てが Phase 2 前と変わっていない` | 期待値を配列で明示し、7ページすべてを固定 |
| `adult回帰: adult page6 は問い合わせ先を持たない` | `getCertLayoutId("adult", 5) === "planSupport"` かつ `hasContactInfoRow("planSupport") === false` |
| `adult回帰: child の差分レイアウトが adult 側へ混入していない` | 全8ページで `planSupportWithContact` が adult に現れないこと |
| `adult回帰: pageIndex は0始まりのまま（page1 が index 0）` | 基準が変わっていないこと |

加えて、既存の `getCertLayoutId: adult の8ページが想定どおりのレイアウトへ割り当てられる`（Phase 0 から存在）が**無変更のまま**回帰検知として機能しています。

### 7.5 【重要】意図的に更新した既存テスト 1件

| 項目 | 内容 |
|---|---|
| ファイル | `constants/certLayoutMap.test.ts` |
| 変更前 | `getCertLayoutId: child は現時点では adult と同じレイアウトを参照する` |
| 変更後 | `getCertLayoutId: child は page6 のみ adult と異なり、他のページは共通` |

**理由**: このテストは「様式差がまだ判明していない暫定状態」を固定していたもので、Phase 2 が**まさに変更対象とした仕様**です。page6 の構造差を実装すると必然的に矛盾します。

**「安易な書き換え」ではない根拠**:

- 削除・skip・無効化は**していません**
- 「page1〜5・7 は adult と共通」という**検証の大部分はそのまま維持**しています
- 変更したのは page6 の1ページ分だけで、その根拠は**様式画像の比較結果**です
- テストコード内に「挙動を意図的に変更したテスト」であることをコメントで明記しました

**この1件を除く既存43件は無変更のままPASSしています。**

### 7.6 child共通layoutテストの内容（4件）

| テスト | 検証内容 |
|---|---|
| `child共通: page1〜5・7は adult とまったく同じレイアウトを共有する` | 6ページで adult と同一IDに解決されること |
| `child共通: 共有ページの問い合わせ先の有無が adult と一致する` | 共有ページで問い合わせ先の有無に差が出ないこと |
| `child共通: page4 と page7 は adult / child とも問い合わせ先あり` | 様式で確認できた共通の問い合わせ先2ページ |
| `child共通: childのpageIndex対応が全ページで解決できる` | 例外を投げず全ページ解決できること |

**データフィールドの意味が adult / child で変わらないこと**は、共有ページが**同一のレイアウトコンポーネント**へ解決される（＝同じ `field` 指定を使う）ことで構造的に保証されます。child専用の人物フィールドは追加していません（`types/cert.ts` に差分なし）。

### 7.7 child page6差分テストの内容（4件）

| テスト | 検証内容 |
|---|---|
| `child page6: 専用レイアウトが割り当てられ、問い合わせ先を持つ` | `planSupportWithContact` かつ `hasContactInfoRow` が true |
| `child page6: adult page6 とはレイアウトが異なる` | adult と別IDであること |
| `child page6: 差分が page1〜5・7へ混入していない` | 他ページに `planSupportWithContact` が現れないこと |
| `child page6: 問い合わせ先を持つレイアウトは様式で確認できた3つだけ` | 全8レイアウトIDを走査し、`trainingBenefit` / `planSupportWithContact` / `userBurden` の3つだけであることを `deepEqual` で固定 |

**新規保存フィールドを追加していないこと**は `types/cert.ts` の差分ゼロで、**OCR parserへ影響していないこと**は parser関連ファイルの差分ゼロで担保しています。

### 7.8 feature flagテストの内容（3件）

| テスト | 検証内容 |
|---|---|
| `feature flag: child.enabled は false のまま` | 値の固定 |
| `feature flag: 選択可能な種別に child が含まれない` | `CERT_TYPES.filter(t => t.enabled)` が `["adult"]` のみであること |
| `feature flag: child のレイアウトは無効でも内部的には解決できる` | flagを有効化せずにchildのレイアウトを検証できること |

### 7.9 page8テストの内容（3件）

| テスト | 検証内容 |
|---|---|
| `page8: 新しいレイアウトを実装しておらず、adult の既存割り当てを踏襲している` | adult / child とも `userBurden` |
| `page8: page1 のレイアウトへ誤って解決されない` | コピー画像を根拠に `certificate1` を割り当てていないこと |
| `page8: 範囲外ページでも例外を投げず、別ページのレイアウトへ流れない` | 全種別 × 範囲外index で安全に解決されること |

### 7.10 テスト境界の選定について

帳票レイアウトの実体（`certLayouts.tsx`）はJSXを含み、現在のテスト環境（`node --experimental-strip-types`）では import できません。**依頼文11.1に従い、新しいテストライブラリは追加していません。**

代わりに、依頼文が挙げた「mapping」「variant判定関数」「ラベル定義」に相当する純粋な定義を境界としました。

- `getCertLayoutId(certType, pageIndex)` … 種別×ページ → レイアウトID
- `hasContactInfoRow(layoutId)` … そのレイアウトが問い合わせ先を持つか

重要な点として、**`certLayouts.tsx` はこの `hasContactInfoRow` を実際に呼び出して描画を決めています**。したがって、テストが固定した仕様と実際の描画がずれることはありません。

---

## 8. 変更ファイル一覧

### 8.1 新規作成（2ファイル）

| ファイルパス | 区分 | 変更内容 | 変更理由 |
|---|---|---|---|
| `src/app/t/[tenantId]/constants/certLayoutVariant.test.ts` | 新規 | Phase 2 のテスト18件（adult回帰4／child共通4／child page6差分4／page8 3／feature flag 3） | adult表示の回帰検知と、child差分の仕様固定 |
| `docs/paperlesscare-layout-foundation-phase2-report-2026-09-05.md` | 新規 | 本報告書 | 依頼文15の要件 |

### 8.2 変更（3ファイル）

| ファイルパス | 区分 | 変更内容 | 変更理由 |
|---|---|---|---|
| `src/app/t/[tenantId]/constants/certLayoutMap.ts` | 変更 | `CertLayoutId` に `planSupportWithContact` を追加／`CHILD_LAYOUT_IDS` を新設し `CERT_LAYOUT_IDS.child` に割当／`CONTACT_INFO_LAYOUT_IDS` と `hasContactInfoRow()` を追加／ヘッダコメントを様式比較の結果に更新 | Phase 2-A（共通と差分の明示）＋ 2-B（page6差分の宣言） |
| `src/app/t/[tenantId]/components/certLayouts.tsx` | 変更 | `LayoutType6` の本体を `PlanSupportLayout`（`withContactInfo` で切替）へ切り出し／`LayoutType6`（adult）と `LayoutType6WithContactInfo`（child）の薄いラッパを定義／`LAYOUT_COMPONENTS` に1行追加／`hasContactInfoRow` を import | Phase 2-B（child page6 に問い合わせ先を追加しつつ adult を不変に保つ） |
| `src/app/t/[tenantId]/constants/certLayoutMap.test.ts` | 変更 | 「child は adult と同じ」テストを「page6 のみ異なる」へ更新（第7.5章） | page6 の構造差を実装したことに伴う必須の更新 |

### 8.3 差分規模

```
 src/app/t/[tenantId]/components/certLayouts.tsx    | 52 +++++++++++++++++++--
 src/app/t/[tenantId]/constants/certLayoutMap.test.ts | 13 ++++-
 src/app/t/[tenantId]/constants/certLayoutMap.ts    | 56 +++++++++++++++++++---
```

（`cors.json` の16行はユーザーの既存差分で、今回の変更ではありません）

---

## 9. 対象外事項の確認

| # | 事項 | 状態 |
|---|---|---|
| 1 | child parser 未実装 | **確認済み**（`CERT_PAGE_PARSERS.child` は `{}` のまま） |
| 2 | adult parser 変更なし | **確認済み**（`lib/parsers/adult/` に差分ゼロ） |
| 3 | `parseCertText` 変更なし | **確認済み**（差分ゼロ） |
| 4 | `parseFallback` 変更なし | **確認済み** |
| 5 | parser registry 変更なし | **確認済み** |
| 6 | parser helper 変更なし | **確認済み**（`lib/parsers/common/helpers.ts` に差分ゼロ） |
| 7 | page1 `address` バグ未修正 | **確認済み** |
| 8 | page5〜8 parser 未実装 | **確認済み** |
| 9 | page8 layout 未実装 | **確認済み**（新規レイアウトID・コンポーネントなし。テストで固定） |
| 10 | 新規人物フィールド追加なし | **確認済み**（`types/cert.ts` に差分ゼロ） |
| 11 | `cityCode` 追加なし | **確認済み** |
| 12 | Firestore 変更なし | **確認済み**（`lib/firestore/` に差分ゼロ） |
| 13 | Firebase設定変更なし | **確認済み**（`firebase.json` / `.firebaserc` / rules / indexes すべて差分ゼロ） |
| 14 | Vercel設定変更なし | **確認済み** |
| 15 | `cors.json` 変更なし | **確認済み**（差分ハッシュ一致） |
| 16 | package依存追加なし | **確認済み**（`package.json` / lockfile に差分ゼロ） |
| 17 | サンプル画像変更なし | **確認済み**（`public/` に差分ゼロ） |
| 18 | `child.enabled = false` 維持 | **確認済み**（`certPages.ts` に差分ゼロ＋テストで固定） |
| 19 | 本番データ変更なし | **確認済み**（本番へ一切接続していません） |
| 20 | デプロイ未実施 | **確認済み** |
| 21 | git push 未実施 | **確認済み** |
| 22 | commit 未実施 | **確認済み** |
| 23 | Phase 1 コードの不要な修正なし | **確認済み** |
| 24 | 既存lintエラーの一括修正なし | **確認済み** |

---

## 10. 残課題

| # | 残課題 | 内容 | 対応予定 |
|---|---|---|---|
| **R-1** | **記入済みOCRサンプル収集** | 現存するのは未記入の空様式のみ。値抽出ルールを検証できない | 業務側で収集（最優先） |
| **R-2** | **adult page1 `address` バグ** | 縦書きラベルや受給者証番号を住所として拾う。Phase 1 で現行挙動をテスト固定済み | Phase 3（実サンプル入手後） |
| **R-3** | **page1／page5 人物parser** | 本人・児童の2ブロック判別を含む識別情報の抽出。adult / child 共通化を想定 | Phase 3 |
| **R-4** | **child parser 本実装** | page1〜7。adult と共通化して実装する設計 | Phase 3〜4 |
| **R-5** | **page2〜7 parser の検証** | page2 のサービス抽出が決め打ち、page3/4 が行位置依存、page5〜7 は未実装 | Phase 3〜4 |
| **R-6** | **page8 正式様式の確認** | サンプルが page1 の複製。**adult でも様式不明** | 業務側で確認 |
| **R-7** | **child 有効化** | `child.enabled = true`。parser実装と実機検証の完了が前提 | Phase 5 |
| **R-8** | **本番スモークテスト** | フロントエンド反映後の adult 回帰確認（特に page6 の表示） | デプロイ後 |
| **R-9** | page6 の差が「18歳以上/未満の差」か「自治体差」か | 複数自治体のサンプルがないと判断できない | 業務側で確認 |
| **R-10** | page7 のラベルなし空行（実装側の「食事提供体制加算」）の当否 | 様式画像に印字がない | 業務側で確認 |
| **R-11** | mobility の様式確認 | サンプルが仮素材。暫定的に adult と同じ対応 | 未定 |

---

## 11. 最終差分確認

### 11.1 最終HEAD

```
4257d660 共通parser基盤と安全なfallbackを実装
```

**commit していません。** HEAD は作業開始時と同一です。

### 11.2 最終 `git status`

```
 M cors.json                                                        ← ユーザーの既存変更（保護・未変更）
 M src/app/t/[tenantId]/components/certLayouts.tsx
 M src/app/t/[tenantId]/constants/certLayoutMap.test.ts
 M src/app/t/[tenantId]/constants/certLayoutMap.ts
?? src/app/t/[tenantId]/constants/certLayoutVariant.test.ts
?? docs/paperlesscare-layout-foundation-phase2-report-2026-09-05.md
```

### 11.3 対象外変更の有無

**ありません。** 以下を機械的に確認しました。

| 確認項目 | 結果 |
|---|---|
| 変更がlayout・mapping・関連テスト・報告書に限定されている | **確認済み** |
| parser関連ファイルに差分がない | **確認済み**（`src/app/t/[tenantId]/lib/` 全体で差分ゼロ） |
| `parseCertText.ts` に差分がない | **確認済み** |
| adult page1〜4 parser に差分がない | **確認済み** |
| `child.enabled = false` のまま | **確認済み** |
| Firestore関連ファイルに差分がない | **確認済み** |
| Firebase設定に差分がない | **確認済み** |
| Vercel設定に差分がない | **確認済み** |
| package dependency を追加していない | **確認済み** |
| page8 を実装していない | **確認済み** |
| サンプル画像を変更していない | **確認済み** |
| 自動フォーマットによる無関係な大量差分がない | **確認済み**（124行追加・13行削除のみ） |
| デプロイ関連ファイルを変更していない | **確認済み** |

### 11.4 `cors.json` の保護状況

```
開始時の差分ハッシュ: 49f3c333e94da90cac182c90b74bee1dca98d1795fccaf1c4426621fce11aac2
完了時の差分ハッシュ: 49f3c333e94da90cac182c90b74bee1dca98d1795fccaf1c4426621fce11aac2
→ 完全一致
```

**変更・削除・復元・ステージング・上書きのいずれも行っていません。**

### 11.5 一時ファイルの削除

調査で使用したローカルOCRツール（Swift）と検証スクリプトは、**すべて削除済み**です（スクラッチパッド内に0件）。リポジトリ内には一時ファイルを作成していません。

### 11.6 デプロイしていないことの確認

以下のコマンドは**1つも実行していません**。

```
firebase deploy（全形式）／ npm --prefix functions run deploy
vercel ／ vercel --prod
git push ／ git commit ／ git add
gsutil ／ gcloud
```

実行したのは以下のローカルコマンドのみです。

```
git status / git log / git diff / git ls-files   （読み取りのみ）
npm test
npx tsc --noEmit
npx tsc -p functions/tsconfig.json --noEmit
npm run lint / npx eslint <ファイル>
npm run build
swiftc（ローカルOCRツールのビルド。削除済み）
```

**デプロイは依頼者側で実施してください。** 今回の変更は `src/` のみのため、必要なのは**フロントエンド（Vercel）の反映のみ**で、Cloud Functions の再デプロイは不要です。
