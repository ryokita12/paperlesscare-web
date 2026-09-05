# PaperlessCare Phase 1 実装報告：共通parser基盤の切り出し＋安全なfallback化

> 対象リポジトリ: `/Users/rkita/Desktop/React/PaperlessCare/paperlesscare-web`
> 実施日: 2026-09-05
> 作業ブランチ: `main`
> 作業開始時HEAD: `667e1826 18歳未満受給者証対応の土台修正`（指定コミットと一致）
> **デプロイ・本番操作・git push・commit は一切行っていません。** `child.enabled = false` を維持しています。

---

## 1. 実装概要

### 1.1 目的

child parser を実装することではなく、**adult parser の既存挙動を維持したまま共通基盤を整理し、専用parserが存在しないページで誤った人物情報を生成しない安全なfallbackへ変更すること**。

### 1.2 実装した内容

| # | 内容 | 対象 |
|---|---|---|
| **1-A** | 共通parser helperの切り出し | `lib/parsers/common/helpers.ts`（新規）＋ adult page1〜4 |
| **1-B** | 安全なfallback化 | `lib/parsers/parseCertText.ts` |
| **T** | 出力互換性テスト（6件）・fallback安全性/registryテスト（16件）の追加 | 新規テスト2ファイル |

### 1.3 実装していない内容（意図的）

- child parser / child layout の実装
- `child.enabled = true` への変更
- **adult page1 の `address` 抽出バグ修正**（既知バグをテストで固定して温存）
- page5〜8 の専用parser実装
- page8 の様式推測
- `cityCode` 等の新規フィールド追加
- `pickSections` の共通化（第3.5章で理由を記載）
- Firestore migration / Firebase・Vercel設定変更 / 各種デプロイ / git push / PR作成 / commit

### 1.4 最終判定

# PHASE 1 COMPLETE

| 成功条件 | 結果 |
|---|---|
| 実装前に存在した既存テストがすべてPASS | **達成**（22件中21件はそのまま、1件は要件により意図的に更新。第6.5章） |
| 新規テストを含む全テストPASS | **達成**（44 / 44） |
| TypeScriptエラーなし | **達成**（root / functions とも 0） |
| lintエラーなし（今回分） | **達成**（新規・変更ファイルの指摘 0件。残る19件はすべて既存由来） |
| production build成功 | **達成** |
| adult page1〜4 の出力に変更なし | **達成**（全項目 deepEqual で固定・検証） |
| 未実装の非人物ページで人物フィールドが汚染されない | **達成**（16件のテストで検証） |
| child parser 未実装 | **達成** |
| `child.enabled = false` 維持 | **達成**（テストでも固定） |
| デプロイ未実施 | **達成** |
| 対象外ファイルへの不要な変更なし | **達成** |

---

## 2. 実装前調査

### 2.1 リポジトリ状態

```
作業ブランチ : main
開始時HEAD   : 667e1826 18歳未満受給者証対応の土台修正
```

`git log --oneline 667e1826..HEAD` は空 ＝ **HEAD は指定コミット `667e1826` と完全に一致**していました。

### 2.2 作業開始時の `git status`

```
 M cors.json
?? docs/paperlesscare-under18-real-form-ocr-investigation-2026-09-05.md
```

| ファイル | 扱い |
|---|---|
| `cors.json` | **作業開始前から存在するユーザーの未コミット変更。今回一切触れていません**（上書き・削除・巻き戻しなし） |
| `docs/...investigation...md` | 前フェーズ（実物様式・OCR調査）の成果物。未追跡のまま保持 |

今回の変更対象（parser関連）とは重ならないため、保護のための特別な対応は不要でした。

### 2.3 リポジトリの作業指示

`CLAUDE.md` / `AGENTS.md` / `.cursorrules` は**存在しません**。`README.md` は `create-next-app` の既定内容で、作業上の指示はありませんでした。

### 2.4 パッケージマネージャとコマンド

| 項目 | 内容 |
|---|---|
| lockfile | `package-lock.json` のみ（`yarn.lock` / `pnpm-lock.yaml` / `bun.lockb` なし） |
| パッケージマネージャ | **npm** |
| typecheck | `npx tsc --noEmit` / `npx tsc -p functions/tsconfig.json --noEmit` |
| lint | `npm run lint`（= `eslint`） |
| test | `npm test`（= `node --experimental-strip-types --test`） |
| build | `npm run build`（= `next build`） |

### 2.5 parser関連の構成（変更前）

```
src/app/t/[tenantId]/lib/parsers/
├── normalizeText.ts
├── parseCertText.ts          … parseFallback / CERT_PAGE_PARSERS / getCertPageParser / parseCertText
├── parseCertText.test.ts
└── adult/
    ├── page1.ts              … getLines, pickLineAfter, pickLineBefore, NAME_BLOCK_RE,
    │                            ERA_DATE_RE, cleanNameValue, normalizeEraDate, extractNameBlocks
    ├── page1.test.ts
    ├── page2.ts              … getLines, PERIOD_RE
    ├── page2.test.ts
    ├── page3.ts              … getLines, pickSections
    └── page4.ts              … getLines, pickSections
```

### 2.6 呼び出し経路の確認

```
page.tsx / performOcr
  → parseCertText(text, activePageIndex, selectedCertType)
      → normalizeText(text)
      → getCertPageParser(certType, pageIndex)
          → CERT_PAGE_PARSERS[certType][pageIndex]
      → 専用parser or parseFallback   ← ここを Phase 1-B で変更
```

`pageIndex` は **0始まり**であることをコードから確認しました（`CERT_PAGE_PARSERS.adult` の `0: parseAdultPage1`、および `page.tsx` が `activePageIndex`（0始まり）をそのまま渡している）。この前提は変更していません。

### 2.7 実装前のテスト結果（ベースライン）

```
$ npm test
ℹ tests 22
ℹ suites 0
ℹ pass 22
ℹ fail 0
```

**22 / 22 PASS**。依頼文の想定件数と一致しました。ベースラインでの失敗はありません。

内訳:

| ファイル | 件数 |
|---|---|
| `constants/certLayoutMap.test.ts` | 4 |
| `lib/compat/legacyPage2.test.ts` | 7 |
| `lib/parsers/adult/page1.test.ts` | 3 |
| `lib/parsers/adult/page2.test.ts` | 3 |
| `lib/parsers/parseCertText.test.ts` | 5 |

---

## 3. 共通helper化（Phase 1-A）

### 3.1 新規作成したファイル

**`src/app/t/[tenantId]/lib/parsers/common/helpers.ts`**（新規・33行）

配置先の判断: 既存の `lib/` 配下は `firestore/` `storage/` `image/` `compat/` `parsers/` と役割ごとのディレクトリに分かれています。parser専用の共通処理であるため `lib/parsers/common/` としました。前フェーズの調査報告書で提案した構成とも一致します。

### 3.2 切り出した関数・定数

| 名前 | 種別 | 切り出し前の所在 | 重複数 |
|---|---|---|---|
| `getLines` | 関数 | page1 / page2 / page3 / page4 | **4箇所で完全重複** |
| `pickLineAfter` | 関数 | page1 | 1（汎用） |
| `pickLineBefore` | 関数 | page1 | 1（汎用） |
| `ERA_DATE_RE` | 正規表現定数 | page1 | 1（汎用） |
| `normalizeEraDate` | 関数 | page1 | 1（汎用） |

いずれも**帳票のラベルや行位置に依存しない、純粋な文字列処理**です。

### 3.3 選定理由

| 観点 | 判断 |
|---|---|
| 重複解消 | `getLines` は4ファイルで完全に同一の実装でした |
| 帳票非依存 | 5つとも、特定の様式・ラベル・行オフセットに依存しません |
| 依頼文の候補と一致 | 依頼文に列挙された候補そのものです |
| 純粋性 | 副作用・状態を持ちません |
| 共有の安全性 | `ERA_DATE_RE` は非グローバル正規表現（`g` フラグなし）で `String.prototype.match()` からのみ使われるため、`lastIndex` の状態共有問題は発生しません |

### 3.4 adult出力互換性を維持するために行ったこと

| # | 対策 |
|---|---|
| 1 | **切り出しは「実装をそのまま移動しただけ」**。関数本体・正規表現・戻り値を1文字も変更していません |
| 2 | **リファクタリング前に出力固定テストを先に追加**し、変更前の実際の挙動が期待値と一致することを確認してから移動しました（第6.3章） |
| 3 | 戻り値オブジェクト全体を `assert.deepEqual` で比較。値だけでなく**キーの有無・オブジェクトの形**まで固定しています |
| 4 | **既知の不具合もそのまま固定**（`address` が縦書きラベルや受給者証番号を拾う挙動、`issuerAddress` が正規化されない挙動）。「望ましい値」へ書き換えていません |
| 5 | `git diff` で `address` 抽出行が差分に含まれていないことを機械的に確認 |

### 3.5 あえて共通化しなかった処理と理由

| 処理 | 所在 | 共通化しなかった理由 |
|---|---|---|
| **`pickSections`** | page3 / page4（**完全重複**） | **帳票固有の抽出条件**のため。`"サービス種別"` というラベル文字列と `+1 / +3 / +5` 行という行オフセットを内包しており、依頼文の「帳票固有の抽出条件は共通helperへ移動しない」に該当します。重複は認識していますが、Phase 3 で `common/careBenefitPage.ts` / `trainingBenefitPage.ts` を作る際にそちらへ吸収するのが自然です（前フェーズ調査報告書 第15.2章の設計）。今回は範囲を広げません |
| `NAME_BLOCK_RE` | page1 | 「氏名」ラベルの表記ゆれという**受給者証（Ⅰ）（Ⅱ）固有**の知識 |
| `cleanNameValue` | page1 | `フリガナ` / `氏名` / `等` という**様式のラベル**を除去する処理 |
| `extractNameBlocks` | page1 | 「出現順1番目＝本人、2番目＝児童」という**様式固有の前提**を内包 |
| `PERIOD_RE` | page2 | `令和…から…まで` という**支給決定期間欄固有**の書式。使用箇所も1つのみで、共通化する利点がありません |

**将来のchild実装を推測したAPI設計（引数の一般化・オプション追加など）は行っていません。** 現在必要な形のまま移動しています。

### 3.6 変更した既存ファイル

| ファイル | 変更内容 |
|---|---|
| `adult/page1.ts` | ローカル定義していた `getLines` / `pickLineAfter` / `pickLineBefore` / `ERA_DATE_RE` / `normalizeEraDate` を削除し、`common/helpers.ts` から import。**ロジック本体は無変更**（29行削減） |
| `adult/page2.ts` | `getLines` のローカル定義を削除し import に置換 |
| `adult/page3.ts` | 同上 |
| `adult/page4.ts` | 同上 |

import の拡張子について: 既存コード（`parseCertText.ts`）が `./normalizeText.ts` のように `.ts` 付きで書いており、`tsconfig.json` の `allowImportingTsExtensions: true` と Node のテストランナー（ESM解決）の両方に必要なため、**既存の記法に合わせて `.ts` 付き**にしています。

循環importは発生していません（`common/helpers.ts` は何も import しません）。

---

## 4. fallbackの安全化（Phase 1-B）

### 4.1 変更前の挙動

```ts
export function parseCertText(text, pageIndex, certType): FormDataType {
  const normalized = normalizeText(text);
  const parser = getCertPageParser(certType, pageIndex);
  return parser ? parser(normalized) : parseFallback(normalized);   // ← 全ページで無条件fallback
}
```

`parseFallback` はページの意味を区別せず、`name` / `birthday` / `address` などの人物情報を抽出しようとします。

**実際に確認された汚染**（前フェーズ調査で実行検証済み）:

| 入力ページ | `parseFallback` の結果 |
|---|---|
| ページ2（介護給付費） | `birthday: "令和7年4月1日"` ← **支給決定期間の先頭が生年月日として保存される** |
| ページ3（介護給付費②） | 同上 |
| ページ6（計画相談支援） | 同上 |

原因は `parseFallback` の次の行です。

```ts
birthday: text.match(/(昭和|平成|令和)[^\n]*?日/)?.[0] || "",
```

ページ2以降には和暦の**期間**が多数あるため、その先頭部分が生年月日として保存されます。

### 4.2 変更後の挙動

```
専用parserが存在する
  → 登録済みの専用parserを使用（従来どおり）

専用parserが存在しない
  → FALLBACK_ALLOWED_PAGES に明示的に許可された組み合わせのみ parseFallback
  → それ以外は emptyFormData() を返す（人物フィールドを推測で埋めない）
```

実装（`parseCertText.ts`）:

```ts
const FALLBACK_ALLOWED_PAGES: Readonly<
  Partial<Record<CertTypeId, readonly number[]>>
> = {};   // ← 現在は空＝どの種別・どのページでも許可しない

export function isFallbackAllowed(certType: CertTypeId, pageIndex: number): boolean {
  return FALLBACK_ALLOWED_PAGES[certType]?.includes(pageIndex) ?? false;
}

export function parseCertText(text, pageIndex, certType): FormDataType {
  const normalized = normalizeText(text);

  const parser = getCertPageParser(certType, pageIndex);
  if (parser) return parser(normalized);

  if (isFallbackAllowed(certType, pageIndex)) {
    return parseFallback(normalized);
  }

  return emptyFormData();
}
```

### 4.3 設計判断：なぜ「空の許可リスト」という形にしたか

単に `return emptyFormData()` と書くこともできましたが、明示的な許可リストを採用しました。

| 理由 | 内容 |
|---|---|
| 依頼文の要件 | 「fallbackの許可範囲がある場合は、コード上で対象条件が明示的に分かるようにする」「暗黙的に全ページへ `parseFallback` を適用しない」を、**空のリスト＝どこにも許可がない**という形で最も直接的に表現できます |
| 将来の拡張 | Phase 2以降で実サンプルにより安全性が確認できたページを、1行追加するだけで許可できます |
| デッドコード回避 | `parseFallback` が参照され続けるため、未使用によるlintエラーが出ません。テスト済みの既存ロジックを削除せずに保持できます |
| テスト可能性 | `isFallbackAllowed` を export したことで、「現在どこにも許可がない」ことをテストで固定できます |

過度な抽象化を避けるため、helper は `isFallbackAllowed` の1関数のみに留めています。

### 4.4 fallbackを許可したページ・帳票種別

**ありません。** `FALLBACK_ALLOWED_PAGES` は空です。

### 4.5 fallbackを許可しなかったページ・帳票種別

| 種別 | ページ | 理由 |
|---|---|---|
| adult | page5〜8（index 4〜7） | 第4.6章（page5）／page6〜8は非人物ページで汚染が確認済み |
| child | 全ページ | 専用parser未実装。人物フィールドを埋める根拠がない |
| mobility | 全ページ | 同上 |
| 未知の certType | 全ページ | 許可リストに存在しないため自動的に不許可 |

### 4.6 page5をどのように扱ったか

## **page5 も `emptyFormData` としました（fallbackを許可しない）。**

依頼文の5つの判断基準に沿って検討した結果です。

| 判断基準 | 検討結果 |
|---|---|
| **現在の利用フローで page5 のfallback結果が意図的に利用されているか** | **いいえ。** `CERT_PAGE_PARSERS.adult` に index 4 の登録がなく、意図的な設計ではなく「未実装だから既定のfallbackに落ちていた」状態です。前フェーズの調査でも page5 は「parser未実装」と整理されています |
| **page5 のOCR内容と人物フィールドの対応がコード・仕様上明確か** | **いいえ。** page5（受給者証Ⅱ）は page1 と同一構造で、**「支給決定障害者等」と「児童」の2ブロック**を持ちます。ところが `parseFallback` にはブロックを区別するロジックがなく、`childName` / `childBirthday` は常に空文字を返します |
| **意味の違うフィールドへ値が入らないと保証できるか** | **いいえ。** 具体的な汚染経路が2つあります。<br>① `name: /氏名\s*([^\n]+?)\s*生年月日/` は最初の該当箇所を取るため、**本人欄が空で児童欄だけ記入されている場合、児童の氏名が `name`（本人）に入ります**。<br>② `birthday: /(昭和\|平成\|令和)[^\n]*?日/` はページ内最初の和暦日付を取るため、**生年月日欄が空の場合は交付年月日が生年月日として保存されます** |
| **既存adult挙動への影響** | adult の page5 で自動入力されていた値がなくなります。ただし上記のとおり値の正しさは保証されておらず、画面上は `EditableCertCell` で手入力できるため、**誤った値が保存されるリスクを排除する方が有益**と判断しました |
| **実サンプルなしでも安全性を説明できるか** | **いいえ。** 記入済みの page5 サンプルが1件も存在せず、実際にどの値が拾われるか検証できません |

5基準すべてで「安全性を証明できない」となったため、依頼文の**「少しでも不確実な場合は、page5も `emptyFormData` としてください」**に従いました。

なお page5 の正式な専用parserは Phase 2 で実装予定です（page1 と同一構造のため、`common/certificatePage.ts` を両者で共有する設計）。その時点で page5 は自動抽出に戻ります。

### 4.7 未知の certType / 想定外の pageIndex の扱い

| 入力 | 挙動 |
|---|---|
| 未知の `certType`（例: 保存済みデータの破損） | `CERT_PAGE_PARSERS[certType]` が `undefined` → `?.` で `null` → 許可リストにも無いため `emptyFormData()`。**例外を投げません** |
| 範囲外の `pageIndex`（`-1` / `8` / `99`） | 同上 |
| 非整数の `pageIndex`（`1.5` / `NaN`） | 同上 |

いずれもテストで検証済みです（第6.4章）。

### 4.8 変更していないもの

| 対象 | 状態 |
|---|---|
| `parseFallback` の実装 | **無変更**（呼び出し条件のみ変更） |
| `emptyFormData` の定義 | **無変更**。`constants/certPages.ts` の既存実装をそのまま利用 |
| 戻り値の型契約 | **無変更**（`FormDataType` を返す） |
| UI（`page.tsx` 等） | **無変更** |
| Firestore保存処理 | **無変更** |

---

## 5. parser registry確認

### 5.1 adult page1〜4 のマッピング

| pageIndex | 解決されるparser | 変更前後 |
|---|---|---|
| 0 | `parseAdultPage1` | **不変** |
| 1 | `parseAdultPage2` | **不変** |
| 2 | `parseAdultPage3` | **不変** |
| 3 | `parseAdultPage4` | **不変** |

`CERT_PAGE_PARSERS` の登録内容・型・lookup方法（`getCertPageParser`）はいずれも**変更していません**。関数参照の同一性をテストで固定しています。

### 5.2 未実装ページの扱い

| 種別 | pageIndex | `getCertPageParser` の戻り値 |
|---|---|---|
| adult | 4, 5, 6, 7 | `null`（別ページのparserへ流れないことをテストで確認） |
| child | 0〜7 | `null` |
| mobility | 0〜7 | `null` |

### 5.3 child 未実装ページの扱い

**child は全ページで `null`** です。adult のparserへ暗黙的にフォールバックしていないことをテストで固定しました（`registry: child の未実装ページが adult のパーサへ暗黙的に流れない`）。

`certType` と `pageIndex` は独立したキーとして扱われており、adult と child を同じ登録キーとして混同していないことも確認済みです。

### 5.4 `child.enabled = false` の確認結果

```ts
// src/app/t/[tenantId]/constants/certPages.ts
{
  id: "child",
  ...
  enabled: false,          // ← 維持
  statusLabel: "今後実装予定",
}
```

**維持しています。** さらに、意図しない有効化を検知できるよう `child は無効のまま（enabled = false を維持）` というテストを追加しました。

### 5.5 pageIndex の基準

**0始まり**であることをコードから確認し、変更していません。`registry: pageIndex は0始まり（ページ1が index 0 に対応する）` というテストで固定しています。

---

## 6. テスト

### 6.1 実行結果

| 確認項目 | 実行コマンド | 結果 |
|---|---|---|
| 実装前テスト | `npm test` | **PASS**（22 / 22） |
| TypeScript（root） | `npx tsc --noEmit` | **PASS**（エラー0） |
| TypeScript（functions） | `npx tsc -p functions/tsconfig.json --noEmit` | **PASS**（エラー0） |
| lint | `npm run lint` | **PASS（今回分）**／19問題（error 8・warning 11）はすべて既存由来 |
| parser関連テスト | `npm test`（parser関連 30件） | **PASS** |
| 全テスト | `npm test` | **PASS**（44 / 44） |
| production build | `rm -rf .next && npm run build` | **PASS**（10ルート生成） |

### 6.2 テスト件数

| 区分 | 件数 |
|---|---|
| 実装前の既存テスト | **22** |
| 追加したテスト | **22** |
| 実装後の総テスト件数 | **44** |
| PASS | **44** |
| FAIL | **0** |

追加分の内訳:

| ファイル | 件数 | 目的 |
|---|---|---|
| `lib/parsers/adult/outputCompat.test.ts`（新規） | 6 | adult page1〜4 の出力互換性の固定 |
| `lib/parsers/fallbackSafety.test.ts`（新規） | 16 | fallback安全性（11件）＋ registry回帰（5件） |

### 6.3 adult page1〜4 の出力互換性確認結果

**手順**（依頼文の実装方針11-6に従い、リファクタリング前にテストを追加）:

1. リファクタリング前の実際の出力を採取
2. その値を期待値としたテストを作成
3. **リファクタリング前に実行 → 6件PASS**（現行挙動と一致することを確認）
4. 共通helperへ切り出し
5. **リファクタリング後に実行 → 6件PASS**（出力が変わっていないことを確認）

**検証した内容**:

| 対象 | 方法 |
|---|---|
| 各フィールドの値 | 戻り値オブジェクト全体を `assert.deepEqual` |
| 空文字の扱い | 同上（`""` も期待値に含む） |
| `undefined` の扱い | 同上（キーが存在しないこと自体が deepEqual で検出される） |
| 戻り値オブジェクトの形 | 同上（余分なキーがあれば失敗する） |
| 和暦日付の正規化結果 | `令和 6 年 4 月 1 日` → `令和6年4月1日`（issueDate）を固定 |
| OCR行の選択順序 | 本人＝1番目 / 児童＝2番目 のブロック対応を2パターンで固定 |
| 例外を投げないこと | 空文字入力で4parserすべてを実行 |

**固定した既知の不具合**（今回は修正しません）:

| 入力パターン | `address` の実際の値 | 本来あるべき値 |
|---|---|---|
| 居住地ラベルが値と結合 | `"支給決定障害者等"`（縦書きラベル） | 住所 |
| 居住地が独立行 | `"1111111111"`（受給者証番号） | 住所 |

加えて `issuerAddress` が `normalizeEraDate` を通らず `"令和 6 年 4 月 1 日"` とスペースを含んだままになる挙動も固定しました。

テストファイル冒頭に「これは**あるべき仕様ではなく現在の挙動**であり、期待値を望ましい値へ書き換えてはいけない」旨を明記しています。

`git diff` でも、`address` 抽出行が差分に含まれていないことを機械的に確認しました。

### 6.4 fallbackによる人物フィールド汚染防止の確認結果

**検証に使った入力**（旧 `parseFallback` なら誤抽出し得る要素を意図的に含む）:

```
介護給付費の支給決定内容
支給決定期間 令和8年4月1日から令和9年3月31日まで   ← birthday に化けやすい
受給者証番号 1234567890                          ← number / address に化けやすい
架空県架空市架空町1丁目2番3号                      ← address に化けやすい
山田 太郎                                        ← name に化けやすい
支給量等
7日/月
```

**検証対象フィールド**: `name` / `birthday` / `address` / `furigana` / `childName` / `childBirthday` / `childFurigana`

| # | テスト | 結果 |
|---|---|---|
| 1 | 専用parserが無い adult の非人物ページ（index 4〜7）で人物フィールドが汚染されない | **PASS** |
| 2 | 支給期間らしい和暦日付があっても `birthday` に入らない | **PASS** |
| 3 | 氏名らしい文字列があっても対象外ページの `name` に入らない | **PASS** |
| 4 | 住所らしい文字列があっても対象外ページの `address` に入らない | **PASS** |
| 5 | 受給者証番号らしい10桁があっても `number` / `address` に入らない | **PASS** |
| 6 | child は全8ページで人物フィールドが汚染されない | **PASS** |
| 7 | mobility も全8ページで汚染されない | **PASS** |
| 8 | 想定外のページ番号（`-1` / `8` / `99` / `1.5` / `NaN`）でも汚染されない | **PASS** |
| 9 | 未知の `certType` でも汚染されない | **PASS** |
| 10 | 空のフォームでも必須12項目が文字列で揃う（型契約の維持） | **PASS** |
| 11 | 許可リストが現在すべて空である | **PASS** |

### 6.5 【重要】意図的に更新した既存テスト 1件

| 項目 | 内容 |
|---|---|
| ファイル | `lib/parsers/parseCertText.test.ts` |
| 変更前のテスト名 | `parseCertText: 専用パーサが無い場合もフォールバックで必須項目を返す` |
| 変更後のテスト名 | `parseCertText: 専用パーサが無い場合は空のフォームを返す（推測で埋めない）` |
| 変更前の期待値 | child page1 で `number === "1234567890"` / `disabilityType === "3"` / `cityName === "架空市"` |
| 変更後の期待値 | 同じ入力で `number === ""` / `disabilityType === ""` / `cityName === ""` / `name === ""` |

**なぜ更新が必要だったか**

このテストは「専用parserが無いページで `parseFallback` が値を埋める」という**今回まさに変更対象となった挙動**を固定していました。依頼文の要件10-2「childの未実装ページで人物フィールドが汚染されない」と直接矛盾するため、両立できません。

**「テストを通すための安易な書き換え」ではない根拠**

| 観点 | 内容 |
|---|---|
| 削除・skip・無効化 | **していません**。テストは残し、新しい契約を検証しています |
| 検証の意図 | 変更前後とも「専用parserが無いときの挙動」を検証しており、テストの目的は同じです |
| 型契約の検証 | 変更前が保証していた「例外を投げず必須項目が文字列で揃う」という検証は**そのまま残しています** |
| 記録 | テストコード内に「挙動を意図的に変更したテスト」であることをコメントで明記しました |

**この1件を除く既存21件は、すべて無変更のままPASSしています。**

### 6.6 lint の内訳

```
✖ 19 problems (8 errors, 11 warnings)
```

**今回の新規・変更ファイル8つを個別にlintした結果は、指摘0件**です。

```
$ npx eslint <今回の変更ファイル8つ>
（出力なし）
```

残る19件はすべて今回触っていないファイルの既存指摘です（`AppShell.tsx` / `UnhandledRejectionGuard.tsx` / `LoginClient.tsx` / `LogoutClient.tsx` / `SignupClient.tsx` / `beneficiaries/page.tsx` / `capture/page.tsx` / `SideNav.tsx` / `PageTabs.tsx` / `certLayouts.tsx` / `page.tsx`）。内容は `no-explicit-any`・`react-hooks/set-state-in-effect`・`no-img-element`・`no-unused-vars` で、**件数は実装前と変わっていません**。

---

## 7. 変更ファイル一覧

### 7.1 新規作成（3ファイル）

| ファイルパス | 変更内容 | 変更理由 |
|---|---|---|
| `src/app/t/[tenantId]/lib/parsers/common/helpers.ts` | 共通ヘルパ5つ（`getLines` / `pickLineAfter` / `pickLineBefore` / `ERA_DATE_RE` / `normalizeEraDate`）を定義 | Phase 1-A。4ファイルに重複していた `getLines` の解消と、帳票非依存の汎用処理の集約 |
| `src/app/t/[tenantId]/lib/parsers/adult/outputCompat.test.ts` | adult page1〜4 の出力を deepEqual で固定（6件） | リファクタリング前後で出力が変わらないことの保証。既知バグも含めて現行挙動を固定 |
| `src/app/t/[tenantId]/lib/parsers/fallbackSafety.test.ts` | fallback安全性11件 + registry回帰5件 | Phase 1-B の検証。人物フィールド汚染の防止と、adultマッピングの回帰検知 |

### 7.2 変更（6ファイル）

| ファイルパス | 変更内容 | 変更理由 |
|---|---|---|
| `src/app/t/[tenantId]/lib/parsers/adult/page1.ts` | ローカル定義5つを削除し `common/helpers.ts` から import（-29行）。**抽出ロジックは無変更** | Phase 1-A |
| `src/app/t/[tenantId]/lib/parsers/adult/page2.ts` | `getLines` を import に置換 | Phase 1-A |
| `src/app/t/[tenantId]/lib/parsers/adult/page3.ts` | `getLines` を import に置換 | Phase 1-A |
| `src/app/t/[tenantId]/lib/parsers/adult/page4.ts` | `getLines` を import に置換 | Phase 1-A |
| `src/app/t/[tenantId]/lib/parsers/parseCertText.ts` | `emptyFormData` の import 追加、`FALLBACK_ALLOWED_PAGES` と `isFallbackAllowed` を新設、`parseCertText` のfallback分岐を安全側へ変更、コメント更新 | Phase 1-B |
| `src/app/t/[tenantId]/lib/parsers/parseCertText.test.ts` | fallback挙動を検証する1件を新しい契約に合わせて更新（第6.5章） | Phase 1-B に伴う必須の更新 |

### 7.3 差分規模

```
 src/app/t/[tenantId]/lib/parsers/adult/page1.ts        | 29 +++-------------
 src/app/t/[tenantId]/lib/parsers/adult/page2.ts        |  4 +--
 src/app/t/[tenantId]/lib/parsers/adult/page3.ts        |  4 +--
 src/app/t/[tenantId]/lib/parsers/adult/page4.ts        |  4 +--
 src/app/t/[tenantId]/lib/parsers/parseCertText.test.ts | 19 ++++++---
 src/app/t/[tenantId]/lib/parsers/parseCertText.ts      | 55 ++++++++++++++++++--
```

（新規3ファイルは未追跡のため上記に含まれません）

### 7.4 変更していないファイル（明示）

| ファイル | 状態 |
|---|---|
| `constants/certPages.ts` | **無変更**（`child.enabled = false` を含め一切変更なし） |
| `constants/certLayoutMap.ts` | **無変更** |
| `components/certLayouts.tsx` | **無変更** |
| `types/cert.ts` | **無変更** |
| `lib/firestore/beneficiaries.ts` | **無変更** |
| `lib/compat/legacyPage2.ts` | **無変更** |
| `page.tsx` / 編集画面 / 一覧画面 | **無変更** |
| `firebase.json` / `.firebaserc` / `firestore.rules` / `storage.rules` / `firestore.indexes.json` | **無変更** |
| `package.json` / `package-lock.json` / `tsconfig.json` / `eslint.config.mjs` | **無変更**（依存追加なし） |
| `public/cert-samples/` | **無変更**（サンプル画像に手を加えていません） |
| `cors.json` | **作業開始前からのユーザー変更。今回一切触れていません** |

---

## 8. 対象外事項の確認

| # | 事項 | 状態 |
|---|---|---|
| 1 | child parser 未実装 | **確認済み**（`CERT_PAGE_PARSERS.child` は `{}` のまま。テストでも固定） |
| 2 | child layout 未実装 | **確認済み**（`certLayoutMap.ts` / `certLayouts.tsx` とも無変更） |
| 3 | `child.enabled = false` 維持 | **確認済み**（コード確認＋テストで固定） |
| 4 | page1 `address` バグ未修正 | **確認済み**（抽出条件は無変更。`git diff` に該当行なし。現行挙動をテストで固定） |
| 5 | page5〜8 専用parser 未実装 | **確認済み**（registry に登録追加なし） |
| 6 | Firestore migration 未実施 | **確認済み** |
| 7 | Firebase設定変更なし | **確認済み**（`firebase.json` / `.firebaserc` / rules / indexes すべて無変更） |
| 8 | Vercel設定変更なし | **確認済み**（該当ファイルなし・無変更） |
| 9 | 本番データ変更なし | **確認済み**（本番への接続を一切行っていません） |
| 10 | 本番デプロイ未実施 | **確認済み**（デプロイ関連コマンドを1つも実行していません） |
| 11 | Git push 未実施 | **確認済み** |
| 12 | PR作成 未実施 | **確認済み** |
| 13 | commit 未実施 | **確認済み**（依頼にないため作業ツリーのまま） |
| 14 | 新規フィールド追加なし | **確認済み**（`cityCode` / `guardianName` 等いずれも未追加） |
| 15 | 依存パッケージ追加なし | **確認済み**（`package.json` / lockfile 無変更） |

---

## 9. 残課題

### 9.1 Phase 1 では意図的に対応しなかったもの

| # | 残課題 | 対応予定 |
|---|---|---|
| **R-1** | **adult page1 の `address` 抽出バグ** — 縦書きラベルや受給者証番号を住所として拾う。現行挙動をテストで固定済み | Phase 2（実サンプル入手後） |
| **R-2** | **記入済みOCRサンプルの収集** — 現存するのは未記入の空様式のみ。値抽出ルールを検証できない | 業務側で収集 |
| **R-3** | **page8 の正式様式の確認** — `page-8.png` が `page-1.png` の複製で、adult でも様式不明 | 業務側で確認 |
| **R-4** | **page5〜7 の専用parser実装** — adult でも未実装。今回の変更により、これらのページは自動入力されず手入力になった | Phase 2〜4 |
| **R-5** | **child parser 本実装** | Phase 2〜4 |
| **R-6** | **`pickSections` の重複**（page3 / page4 に同一実装） | Phase 3（`common/careBenefitPage.ts` へ吸収） |
| **R-7** | `furigana` / `childFurigana` の抽出未実装（常に空） | Phase 2 |
| **R-8** | page2 のサービス抽出が `短期入所` / `日/月` の決め打ち | Phase 3 |
| **R-9** | `certPeriod`（認定有効期間）の抽出未実装 | Phase 3 |

### 9.2 今回の変更に伴う運用上の注意

| # | 内容 |
|---|---|
| **N-1** | **adult の page5〜8 は自動入力されなくなりました。** 変更前は `parseFallback` が値を埋めていましたが、その値の正しさは保証されておらず（生年月日欄に交付年月日が入る等）、誤データの保存を防ぐため空にしています。項目は画面上で手入力できます |
| **N-2** | 既にFirestoreへ保存済みのデータには影響しません（保存処理・読み取り処理とも無変更） |
| **N-3** | 本変更をユーザーが体感するのはフロントエンド（Vercel）反映後です。Cloud Functions の再デプロイは不要です（`functions/` に変更がないため） |

---

## 10. 最終差分確認

### 10.1 最終HEAD

```
667e1826 18歳未満受給者証対応の土台修正
```

**commit していません。** HEAD は作業開始時と同一です。

### 10.2 最終 `git status`

```
 M cors.json                                                        ← 作業開始前からのユーザー変更（未変更）
 M src/app/t/[tenantId]/lib/parsers/adult/page1.ts
 M src/app/t/[tenantId]/lib/parsers/adult/page2.ts
 M src/app/t/[tenantId]/lib/parsers/adult/page3.ts
 M src/app/t/[tenantId]/lib/parsers/adult/page4.ts
 M src/app/t/[tenantId]/lib/parsers/parseCertText.test.ts
 M src/app/t/[tenantId]/lib/parsers/parseCertText.ts
?? docs/paperlesscare-under18-real-form-ocr-investigation-2026-09-05.md   ← 前フェーズの成果物
?? docs/paperlesscare-parser-foundation-phase1-report-2026-09-05.md       ← 本報告書
?? src/app/t/[tenantId]/lib/parsers/adult/outputCompat.test.ts
?? src/app/t/[tenantId]/lib/parsers/common/
?? src/app/t/[tenantId]/lib/parsers/fallbackSafety.test.ts
```

### 10.3 対象外変更の有無

**ありません。** 以下を機械的に確認しました。

| 確認項目 | 結果 |
|---|---|
| 変更がparser・helper・関連テスト・報告書に限定されている | **確認済み** |
| `child.enabled` が `false` のまま | **確認済み** |
| Firebase設定に変更なし | **確認済み** |
| Vercel設定に変更なし | **確認済み** |
| Firestore関連設定に変更なし | **確認済み** |
| page1 `address` 抽出条件に意図しない変更なし | **確認済み**（`git diff` に該当行が現れない） |
| child parser / layout が追加されていない | **確認済み** |
| 依存パッケージが追加されていない | **確認済み** |
| 自動フォーマットによる無関係な大量差分なし | **確認済み**（差分は88行追加・43行削除のみ） |
| サンプル画像を変更していない | **確認済み** |
| デプロイ用設定やスクリプトを変更していない | **確認済み** |
| 作業開始前から存在したユーザーの変更（`cors.json`）を保護 | **確認済み**（差分内容が開始時と同一） |

### 10.4 デプロイしていないことの確認

以下のコマンドは**1つも実行していません**。

```
firebase deploy（全形式）
npm --prefix functions run deploy
vercel / vercel --prod
git push / git commit
gsutil cors set / gcloud
```

実行したのは以下のローカルコマンドのみです。

```
git status / git log / git diff        （読み取りのみ）
npm test
npx tsc --noEmit
npx tsc -p functions/tsconfig.json --noEmit
npm run lint
npx eslint <ファイル>
npm run build
```

**デプロイは依頼者側で実施してください。** 今回の変更は `src/` のみのため、必要なのは**フロントエンド（Vercel）の反映のみ**で、Cloud Functions の再デプロイは不要です。
