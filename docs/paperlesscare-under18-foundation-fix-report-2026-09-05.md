# PaperlessCare 18歳未満対応前 土台修正 実装報告

> 対象リポジトリ: `/Users/rkita/Desktop/React/PaperlessCare/paperlesscare-web`
> 実施日: 2026-09-05
> 起点コミット: `0781b391 OCRをStorage依存から直接画像送信方式へ変更`（ブランチ `main`）
> 前提資料: `docs/paperlesscare-current-status-recipient-certificate-under18.md`（現状調査）
> デプロイ・本番データ変更・Firebase設定変更は一切行っていません。

---

## 1. 実施概要

「障害福祉サービス受給者証（18歳未満）＝ `child`」を安全に載せられる土台を作るための第1弾。
**既存 adult 版の挙動を壊さないこと**を最優先に、以下を実施しました。

| # | 実施項目 | 状態 |
|---|---|---|
| 1 | 個人情報を含むOCRログの除去（クライアント／Cloud Functions） | 完了 |
| 2 | ページ2のデータモデル正常化（人物系フィールドの流用を解消） | 完了 |
| 3 | `serviceType1` / `servicePeriod1` / `serviceAmount1` の正式な型定義化 | 完了 |
| 4 | 旧データ互換（読み取り時の移送）実装 | 完了 |
| 5 | `certType` を軸にした帳票分岐構造の整備 | 完了 |
| 6 | 取込画面・編集画面の両方で `certType` を利用 | 完了 |
| 7 | `CertTypeId` 重複定義の解消 | 完了 |
| 8 | ページ7/8のstate混入の確認と修正 | 完了（混入を1件発見・修正） |
| 9 | スマホ撮影往復での画像消失の修正 | 完了（IndexedDBへの一時退避を実装） |
| 10 | 旧スナップショットによるlintノイズ整理 | 完了 |
| 11 | テスト追加（22件）＋テストデータの匿名化 | 完了 |
| 12 | `child` の本格実装 | **今回は未実施（意図どおり）**。`enabled: false` を維持 |

### 実施しなかったこと（意図的）

- `child` 専用OCRパーサの実装（実機OCRサンプルが未収集のため）
- `child` 専用レイアウトの作成（現時点では adult と同一様式のため共有）
- `child` の有効化（本番で誤って選択されないよう `enabled: false` を維持）
- Firestore の一括migration（アプリ側の互換処理で対応。第6章に将来の推奨方針を記載）

### 自主判断した主な事項

指示に従い、以下は確認を求めず自主判断しました。判断理由は各章に記載しています。

| 判断事項 | 選んだ方針 | 章 |
|---|---|---|
| 旧データ互換の実装場所 | Firestore読み取り時に正規化（表示helperではなく） | 6 |
| 旧フィールドの扱い | コピーではなく「移動」（移送元は空にする） | 6 |
| `certType` 分岐の実現方法 | レイアウト対応表を純粋データとして別ファイルへ分離 | 7 |
| ページ7/8 state混入の修正方法 | `key` によるページ単位の再マウント | 10 |
| 撮影往復の画像保持方式 | IndexedDB への一時退避（Storage先行アップロードは採らない） | 11 |
| 旧スナップショットの扱い | 削除せず tsconfig / eslint の対象外へ | 13 |
| ページ2の支給決定期間の抽出 | 「支給決定期間」ラベル起点＋従来動作へフォールバック | 5 |
| テスト実行方法 | `node --experimental-strip-types --test` を `npm test` に登録 | 14 |

---

## 2. 修正前の問題点

現状調査で特定し、今回対処した問題です。

| # | 問題 | 該当箇所（修正前） | 危険性 |
|---|---|---|---|
| P-1 | OCR生テキスト（氏名・住所・生年月日・受給者番号）がブラウザコンソールへ全文出力 | `page.tsx:384,392`<br>`parseCertText.ts:51-55` | 高 |
| P-2 | 同じくCloud Loggingへ全文出力 | `functions/src/index.ts:57-60` | 高 |
| P-3 | ページ2の1組目を人物情報用フィールド（`name`/`birthday`/`childName`）へ流用 | `certLayouts.tsx:215-233`<br>`adult/page2.ts:23-29` | 高 |
| P-4 | `serviceType1`/`servicePeriod1`/`serviceAmount1` が `emptyFormData()` にあるのに型定義に無い | `types/cert.ts`<br>`certPages.ts:111-113` | 中 |
| P-5 | 帳票レイアウトが `pageIndex` のみで決まり、`certType` で分岐できない | `certLayouts.tsx:690-761` | 高 |
| P-6 | 編集画面が保存済みの `certType` を無視 | `beneficiaries/[beneficiaryId]/page.tsx:233-244` | 高 |
| P-7 | `CertTypeId` 相当のunion型が2箇所に重複定義 | `PageTabs.tsx:6` | 中 |
| P-8 | ページ7/8が同一レイアウトのため編集中stateが引き継がれ、別ページへ書き込まれる | `certLayouts.tsx:740-757` | 中 |
| P-9 | スマホ撮影往復で、それまでに選択した全ページの画像が失われる | `page.tsx:150-166,446` | 高 |
| P-10 | 旧スナップショット2式がlint/tsc対象で、現行コードの指摘が埋もれる | `tsconfig.json:26-33` | 低 |
| P-11 | テストフィクスチャに実在の個人情報と思われる値 | `adult/page1.test.ts:9-37` | 高 |
| P-12 | Firestoreの読み出しが無検証キャストで、`summary` 欠落時に画面が落ちる | `beneficiaries.ts:63,134` | 中 |

---

## 3. 個人情報ログの修正

### 3.1 クライアント側

**なぜ**: OCR結果には氏名・住所・生年月日・受給者番号が含まれます。ブラウザのコンソールに全文が残ると、画面共有・サポート対応・拡張機能経由での漏えい経路になります。

#### `src/app/t/[tenantId]/lib/parsers/parseCertText.ts`

**変更前**（修正前 `:51-55`）

```ts
console.log("PARSE CERT", {
  pageIndex,
  selectedCertType,
  normalized,      // ← OCR全文
});
```

**変更後**: ログを完全に削除。パース処理は純粋関数に戻しました。

#### `src/app/t/[tenantId]/page.tsx:462-473`

**変更前**（修正前 `:384,392`）

```ts
console.log("OCR RAW TEXT", text);           // ← OCR全文
const parsed = parseCertText(...);
console.log("PARSED CERT DATA", parsed);     // ← 氏名・生年月日・住所
```

**変更後**

```ts
// OCR本文・抽出結果には氏名/住所/受給者番号などが含まれるため出力しない。
// 調査に必要な範囲（どのページ・どの種別で何文字取れたか）だけを残す。
console.info("[OCR] completed", {
  pageNo: activePageIndex + 1,
  certType: selectedCertType,
  textLength: text.length,
  filledFieldCount: Object.values(parsed).filter(Boolean).length,
});
```

OCR精度の調査に必要な「どのページ・どの種別で・何文字取れて・何項目埋まったか」は残しつつ、値そのものは一切出しません。

### 3.2 Cloud Functions側

#### `functions/src/index.ts`

**変更前**（修正前 `:57-64`）

```ts
logger.info("ocrFromImageData raw text", {
  textLength: text.length,
  text,                          // ← Cloud Loggingに全文が保持期間中残る
});
...
logger.error("ocrFromImageData error", err);   // ← エラーオブジェクト全体
```

**変更後**（`functions/src/index.ts:83-101`）

```ts
logger.info("ocrFromImageData completed", {
  ...logContext,                 // pageNo / certType のみ
  textLength: text.length,
});
...
const { code, message } = err as { code?: unknown; message?: unknown };
logger.error("ocrFromImageData failed", {
  ...logContext,
  code,
  message,                       // オブジェクト全体ではなくコード・メッセージのみ
});
```

`logContext` は新設した `buildLogContext()`（`functions/src/index.ts:27-45`）が生成します。
クライアントから届いた値をそのまま出力せず、以下のように検証してから記録します。

- `pageNo`: 1〜8の整数のみ採用
- `certType`: `LOGGABLE_CERT_TYPES`（`mobility` / `adult` / `child`）に一致する場合のみ採用

これによりログインジェクションも防いでいます。

### 3.3 クライアント→Functions の受け渡し

`page.tsx:37-44` に `OcrRequest` 型を追加し、`imageBase64` に加えて `pageNo` / `certType` を送るようにしました（`page.tsx:456-460`）。いずれも個人情報を含まない診断用メタデータです。

**互換性**: 双方向に後方互換です。

- 新クライアント × 旧Function: 追加フィールドは無視される
- 旧クライアント × 新Function: `pageNo`/`certType` が `undefined` になるだけ

### 3.4 残るログ（意図的に残したもの）

| 箇所 | 内容 | 判断 |
|---|---|---|
| `LoginClient.tsx:61` | `console.error("[LOGIN] ERROR", e)` | Firebase Authのエラー。個人情報はメールアドレスのみで、ログイン失敗調査に必要なため据え置き |
| `LogoutClient.tsx:26,32` | `console.warn` | サインアウト失敗のみ。個人情報なし |

### 3.5 影響

- **既存データ**: 影響なし
- **adult版**: 影響なし（ログ出力のみの変更で、処理フローは同一）
- **child実装時**: `certType` がログに出るため、childのOCR不調をログから切り分けられます

> **注意**: `functions/lib/` にある**コンパイル済みの旧コード**（PIIログを含む）は git管理外のビルド成果物です。デプロイ時の `predeploy` フック（`firebase.json:14`）が `npm --prefix functions run build` を実行して再生成するため、デプロイすれば解消します。

---

## 4. データモデルの修正

### 4.1 `FormDataType` への正式な型定義追加

#### `src/app/t/[tenantId]/types/cert.ts:15-27`

**なぜ**: `emptyFormData()` は `serviceType1` / `servicePeriod1` / `serviceAmount1` を生成していたのに、`FormDataType` の型定義に存在しませんでした。`FormDataType` が `Record<string, string>` との交差型のため型エラーにならず、「型定義と実データの不一致」がコンパイル時に検出されない状態でした。

**変更後**

```ts
certPeriod?: string;

// ページ2：介護給付費の支給決定内容 1組目
// 以前は人物情報用の name / birthday / childName を流用していたが、
// 2〜8組目と同じ命名（serviceType/servicePeriod/serviceAmount + 連番）に統一した。
// 旧構造で保存済みのデータは lib/compat/legacyPage2.ts で読み取り時に移送する。
serviceType1?: string;
servicePeriod1?: string;
serviceAmount1?: string;

serviceType2?: string;
```

`serviceType2..8` と同じく optional にしています。各パーサが必ずしも全組を返さない既存の実装パターンに合わせるためです。

### 4.2 `emptyFormData()` の補完

#### `src/app/t/[tenantId]/constants/certPages.ts:151-169`

**なぜ**: `emptyFormData()` は1〜3組目しか生成しておらず、4〜8組目が欠けていました。「空のフォーム」という契約と型定義がずれていたため補完しました。

**変更後**: `serviceType4..8` / `servicePeriod4..8` / `serviceAmount4..8` を空文字で追加（15項目）。

**影響**: 新規保存時に空文字フィールドが15個増えるのみ。既存データ・表示・パース結果への影響はありません。

### 4.3 Firestore読み出し時の正規化

#### `src/app/t/[tenantId]/lib/firestore/beneficiaries.ts:51-78`

**なぜ**: `snap.data() as Omit<BeneficiaryRecord, "id">` という無検証キャストのため、`summary` を持たないドキュメントがあると `item.summary.name` で `TypeError` になり、一覧画面・編集画面が丸ごと落ちます（現状調査 9.11）。今回 `certType` を実際に使い始めるため、欠落時の既定値も必要になりました。

**変更後**（新設 `normalizeBeneficiaryData`）

```ts
function normalizeBeneficiaryData(
  data: Omit<BeneficiaryRecord, "id">
): Omit<BeneficiaryRecord, "id"> {
  const pages = Array.isArray(data.pages) ? data.pages : [];

  return {
    ...data,
    certType: data.certType ?? "adult",
    summary: { ...EMPTY_SUMMARY, ...(data.summary ?? {}) },
    pages: pages.map((page, index) => {
      if (!page?.formData || !isPage2(page.pageNo, index)) return page;
      return { ...page, formData: migrateLegacyPage2FormData(page.formData) };
    }),
  };
}
```

`getBeneficiary`（`:89-96`）と `listBeneficiaries`（`:164-170`）の両方に適用しています。

**`certType` の既定値を `"adult"` とした理由**: `child` / `mobility` は一度も選択可能になったことがないため、`certType` を持たない旧データは必ず adult です。

---

## 5. serviceType1系への移行

### 5.1 帳票レイアウト

#### `src/app/t/[tenantId]/components/certLayouts.tsx:224-243`（`LayoutType2`）

**なぜ**: ページ2の1組目が人物情報用フィールドを流用しており、`pages[0].formData.name` は「氏名」、`pages[1].formData.name` は「サービス種別」という、ページによって意味の変わるフィールドになっていました。18歳未満のパーサをこの上に載せると、誤った構造が複製されます。

| 帳票上の欄 | 変更前 | 変更後 |
|---|---|---|
| サービス種別 | `page.formData.name` | `page.formData.serviceType1 \|\| ""` |
| 支給決定期間 | `page.formData.birthday` | `page.formData.servicePeriod1 \|\| ""` |
| 支給量等 | `page.formData.childName` | `page.formData.serviceAmount1 \|\| ""` |

**UIの見た目は一切変更していません**。ラベル・グリッド構成・`multiline` 指定はすべて据え置きで、参照するフィールド名だけを差し替えています。

### 5.2 パーサ

#### `src/app/t/[tenantId]/lib/parsers/adult/page2.ts`

**変更前**

```ts
return {
  ...
  name: serviceName,      // サービス種別
  birthday: period,       // 支給決定期間
  childName: amount,      // 支給量等
};
```

**変更後**（`adult/page2.ts:27-57`）

```ts
return {
  number: "", address: "", furigana: "",
  name: "", birthday: "",
  childFurigana: "", childName: "", childBirthday: "",
  disabilityType: "", issueDate: "", cityName: "", issuerAddress: "",

  // 1組目。page3 / page4 と同じ serviceType / servicePeriod / serviceAmount + 連番に揃える。
  // 以前はそれぞれ name / birthday / childName に格納していた。
  serviceType1: serviceName,
  servicePeriod1: period,
  serviceAmount1: amount,
};
```

`page3.ts` / `page4.ts` と同じ「必須12項目を空文字で返し、サービス組だけを埋める」構造に統一しました。

### 5.3 支給決定期間の抽出範囲（意図的な狭い挙動変更）

**これは今回唯一、adult のOCR抽出結果が変わりうる変更です。** テストを書く過程で既存バグを発見したため、限定的に修正しました。

**発見した問題**: 期間の抽出が `text.match(PERIOD_RE)` でテキスト全体の先頭から探していました。ページ2には「支給決定期間」より**手前**に「認定有効期間」があるため、実際の帳票では**認定有効期間の値が支給決定期間①として取り込まれます**。

実際に、現実的なフィクスチャで検証したところ再現しました。

```
認定有効期間  令和7年4月1日から令和10年3月31日まで   ← これが取り込まれていた
支給決定期間  令和7年4月1日から令和8年3月31日まで    ← 本来こちら
```

**変更後**（`adult/page2.ts:12-19`）

```ts
// 「支給決定期間」ラベル以降に現れる最初の和暦期間を1組目の支給決定期間とみなす。
// ページ2にはその手前に「認定有効期間」があり、テキスト全体の先頭から探すと
// そちらを拾ってしまうため、ラベルを起点にする。
// ラベルがOCRで欠けた場合のみ、従来どおりページ全体の最初の期間へフォールバックする。
const periodSection = text.split(/支給決定期間/)[1] ?? text;
const period = periodSection.match(PERIOD_RE)?.[0] ||
  text.match(PERIOD_RE)?.[0] ||
  "";
```

**リスク評価**: 挙動が変わるのは「OCRテキストに『支給決定期間』というラベルが含まれる場合」だけで、それはまさに従来の結果が誤っていたケースです。ラベルがOCRで欠けた場合は従来どおりの動作にフォールバックするため、退行しません。

**サービス種別・支給量等の抽出ロジックは変更していません**（`短期入所` を含む行 / `日/月` を含む行を拾う既存ヒューリスティック）。これらは精度改善の余地がありますが、adult の実データでの挙動を変えないため今回は据え置き、第19章に残課題として記載しています。

### 5.4 影響

- **既存データ**: 直接の影響なし。読み取り時に第6章の互換処理が働きます
- **adult版**: フィールド名の付け替えのみ（5.3を除く）。UI・保存処理は同一
- **child実装時**: `lib/parsers/child/page2.ts` を書く際、最初から正しいフィールドへ格納できます

---

## 6. 旧データ互換対応

### 6.1 新設モジュール

#### `src/app/t/[tenantId]/lib/compat/legacyPage2.ts`（54行・新規）

既存の `lib/firestore/` `lib/parsers/` `lib/storage/` `lib/image/` と同じ粒度で `lib/compat/` を追加しました。

**移送ルール**

| 旧フィールド | 新フィールド |
|---|---|
| `name` | `serviceType1` |
| `birthday` | `servicePeriod1` |
| `childName` | `serviceAmount1` |

```ts
export function migrateLegacyPage2FormData(formData: FormDataType): FormDataType {
  const moves = LEGACY_PAGE2_FIELD_MAP.filter(
    ({ legacy, current }) => !formData[current] && !!formData[legacy]
  );

  if (moves.length === 0) return formData;   // 不要な再レンダリングを避ける

  const migrated: FormDataType = { ...formData };
  for (const { legacy, current } of moves) {
    migrated[current] = formData[legacy];
    migrated[legacy] = "";
  }
  return migrated;
}
```

### 6.2 自主判断した設計と、その理由

#### (a) 「新フィールドが空 かつ 旧フィールドに値あり」の場合のみ移送

旧データも `emptyFormData()` 由来の `serviceType1: ""` を**持っています**（`certPages.ts` は当時から1〜3組目を生成していたため）。したがって「キーの有無」では判定できず、**空文字かどうか**で判定する必要があります。

#### (b) コピーではなく「移動」（移送元を空にする）

コピーにすると、ユーザーがサービス種別を意図的に空欄へ直した際、次回読み込みで旧 `name` の値が復活してしまいます。移動にすることでこの矛盾を防ぎ、さらにユーザーが一度保存した時点でそのドキュメントだけ新構造へ揃います（**段階的migration**）。

#### (c) 項目ごとに独立して判定

3項目をまとめて判定すると、一部だけ新形式・一部だけ旧形式という中間状態のデータで取りこぼします。テスト（`legacyPage2.test.ts`）でこのケースを検証しています。

#### (d) 適用場所は「Firestore読み取り時」

表示用helperではなく読み取り時に正規化した理由:

- 編集画面の `editedPages` が最初から新構造になるため、レイアウト側に互換ロジックを持ち込まずに済む
- ユーザーが保存すればFirestore側も自然に新構造へ移行する
- 互換ロジックが1箇所に閉じ、単体テストできる

#### (e) ページ2の判定

`isPage2(pageNo, index)`（`legacyPage2.ts:29-31`）で、`pageNo` があればそれを、無ければ配列添字を使います。`pageNo` を持たない旧データにも対応するためです。

### 6.3 動作

| データの状態 | 表示結果 |
|---|---|
| 旧構造のみ（`name`/`birthday`/`childName` に値） | 新フィールドへ移送して正しく表示 |
| 新構造のみ（`serviceType1` 等に値） | そのまま表示 |
| 混在（一部が新・一部が旧） | 項目ごとに判定して表示 |
| 両方に値（新を優先） | 新フィールドを表示。旧フィールドは触らない |
| 空 | 空のまま（オブジェクトも同一参照を返す） |

### 6.4 将来のFirestore一括migrationについて（推奨・今回は未実施）

**今回は実施していません**（指示どおり）。ただし将来的に実施を推奨します。

**推奨する理由**

- 現在は「ユーザーが編集画面で保存したドキュメントだけ」が新構造へ移行します。一度も編集されない受給者は旧構造のまま残り続けます
- 互換コード（`lib/compat/legacyPage2.ts`）を恒久的に維持する必要があります

**推奨する手順**

1. Firestore を **エクスポートしてバックアップ**（`gcloud firestore export`）
2. Admin SDK のスクリプトで `tenants/*/beneficiaries/*` を走査
3. `pages[1]`（`pageNo === 2`）に対し `migrateLegacyPage2FormData` と同じロジックを適用
4. 変更があったドキュメントのみ `pages` を更新（`updatedAt` / `updatedBy` は**更新しない**。migrationは業務上の更新ではないため）
5. 全件が新構造になったことを確認したうえで `lib/compat/legacyPage2.ts` を削除

**注意点**: migrationは本番データの不可逆変更にあたるため、実行判断・バックアップ確認はユーザー側で行ってください。

---

## 7. certType分岐構造の変更

### 7.1 設計判断

**なぜこの形にしたか**: レイアウトの実体はReactコンポーネントで、JSXを含むため Node の型ストリッピング環境では単体テストできません。そこで「**どの種別のどのページがどのレイアウトを使うか**」というルールだけを**JSXを含まない純粋なデータ**として切り出しました。これにより、child を有効化する際に最も重要な「分岐が正しいか」を自動テストで担保できます。

```
constants/certLayoutMap.ts   ← 種別×ページ → レイアウトID（純粋データ・テスト可能）
        ↓
components/certLayouts.tsx   ← レイアウトID → Reactコンポーネント
```

### 7.2 新設: `src/app/t/[tenantId]/constants/certLayoutMap.ts`（55行・新規）

```ts
export type CertLayoutId =
  | "certificate1"     // 障害福祉サービス受給者証（Ⅰ）
  | "careBenefit1"     // 介護給付費の支給決定内容①
  | "careBenefit2"     // 介護給付費の支給決定内容②
  | "trainingBenefit"  // 訓練等給付費の支給決定内容
  | "certificate2"     // 障害福祉サービス受給者証（Ⅱ）
  | "planSupport"      // 計画相談支援給付費の支給内容
  | "userBurden";      // 利用者負担に関する事項

const ADULT_LAYOUT_IDS: readonly CertLayoutId[] = [
  "certificate1", "careBenefit1", "careBenefit2", "trainingBenefit",
  "certificate2", "planSupport", "userBurden", "userBurden",
];

const CERT_LAYOUT_IDS: Record<CertTypeId, readonly CertLayoutId[]> = {
  mobility: ADULT_LAYOUT_IDS,
  adult: ADULT_LAYOUT_IDS,
  child: ADULT_LAYOUT_IDS,
};

export function getCertLayoutId(certType: CertTypeId, pageIndex: number): CertLayoutId
```

**匿名の `LayoutType3` から意味のあるIDへ**: 副次的な効果として、レイアウトが「3番目」ではなく「介護給付費②」という業務上の意味で識別できるようになりました。

**現時点で3種別が同じ配列を参照している理由**: `public/cert-samples/` の画像を確認した結果、18歳未満（黄緑色）の様式は18歳以上（紫色）と色以外ほぼ同一だったためです（現状調査 4.4）。様式が異なるページが判明した時点で、**この表の該当要素だけ**を別IDに差し替えれば、呼び出し側は変更不要です。

### 7.3 `src/app/t/[tenantId]/components/certLayouts.tsx`

**変更前**（修正前 `:690-761`、72行の `switch (pageIndex)`）

```tsx
switch (pageIndex) {
  case 0: return <LayoutType1 pageTitle={pageTitle} page={page} onChangeField={onChangeField} />;
  case 1: return <LayoutType2 ... />;
  ...
  case 6: return <LayoutType7 ... />;
  case 7: return <LayoutType7 ... />;
  default: return <LayoutType7 ... />;
}
```

**変更後**（`certLayouts.tsx:695-735`）

```tsx
const LAYOUT_COMPONENTS: Record<CertLayoutId, CertLayout> = {
  certificate1: LayoutType1,
  careBenefit1: LayoutType2,
  careBenefit2: LayoutType3,
  trainingBenefit: LayoutType4,
  certificate2: LayoutType5,
  planSupport: LayoutType6,
  userBurden: LayoutType7,
};

export function getCertLayout(certType: CertTypeId, pageIndex: number): CertLayout {
  return LAYOUT_COMPONENTS[getCertLayoutId(certType, pageIndex)];
}

export default function CertLayoutRenderer({ certType, pageIndex, pageTitle, page, onChangeField }: Props) {
  return createElement(getCertLayout(certType, pageIndex), {
    key: `${certType}-${pageIndex}`,
    pageTitle,
    page,
    onChangeField,
  });
}
```

`Props` に `certType: CertTypeId` を追加（`certLayouts.tsx:11-17`）。**必須プロパティ**にしているため、渡し忘れがあればコンパイルエラーになります。

**`createElement` を使った理由**: JSX（`<Layout ... />`）で書くと eslint の `react-hooks/static-components` が「Cannot create components during render」として**エラー**を出します。実際にはモジュールトップレベルで定義済みのコンポーネントを選んでいるだけで新規作成はしていませんが、linterからは区別できません。`createElement` にすることで、`eslint-disable` を足さずにルールを満たしています。

### 7.4 ページ定義も certType 対応に

#### `src/app/t/[tenantId]/constants/certPages.ts:90-116`

レイアウトだけでなくページタイトルも種別ごとに差し替えられるようにしました。

```ts
const PAGE_DEFINITIONS_BY_CERT_TYPE: Record<CertTypeId, readonly PageDefinition[]> = {
  mobility: PAGE_DEFINITIONS,
  adult: PAGE_DEFINITIONS,
  child: PAGE_DEFINITIONS,
};

export function getPageDefinitions(certType: CertTypeId): readonly PageDefinition[]
export function getPageTitle(certType: CertTypeId, pageIndex: number): string
```

**なぜ**: `PAGE_TITLES` は adult 固有のタイトル（「介護給付費の支給決定内容①」等）です。child の様式でページ構成やタイトルが異なることが判明した場合、レイアウトだけ差し替えてもタイトルが adult のままでは不整合になります。

`PAGE_DEFINITIONS` / `PAGE_TITLES` は既存互換のため export したまま残しています。

### 7.5 影響

- **既存データ**: 影響なし
- **adult版**: `getCertLayoutId("adult", 0..7)` が従来の `switch` と同一の割り当てを返すことをテストで検証済み
- **child実装時**: `certLayoutMap.ts` の `child` 配列と、`certPages.ts` の `PAGE_DEFINITIONS_BY_CERT_TYPE.child` を差し替えるだけで対応できます

---

## 8. 取込画面の修正

### `src/app/t/[tenantId]/page.tsx`

| # | 変更 | 該当行 | 理由 |
|---|---|---|---|
| 8-1 | `CertLayoutRenderer` に `certType={selectedCertType}` を追加 | `:823` | 選択中の種別で帳票を描画する |
| 8-2 | `PAGE_TITLES[activePageIndex]` → `getPageTitle(selectedCertType, activePageIndex)` | `:187` | 画面表示のタイトルを種別対応に |
| 8-3 | 保存する `SavedCertPage.title` も `getPageTitle(selectedCertType, index)` に | `:536` | Firestoreに保存されるタイトルを種別対応に |
| 8-4 | `parseCertText(text, activePageIndex, selectedCertType)` の引数を必須化に合わせて整理 | `:465` | 型で渡し忘れを防ぐ |
| 8-5 | PIIログの除去（第3章） | `:467-473` | 個人情報保護 |
| 8-6 | `OcrRequest` 型を追加し `pageNo`/`certType` を送信 | `:37-44`, `:456-460` | Functions側の非個人情報ログ用 |
| 8-7 | 取込画像のIndexedDB退避・復元（第11章） | `:277-315`, `:404-409`, `:346` | 撮影往復での画像消失を防ぐ |
| 8-8 | 保存成功時・リセット時・新規取込開始時に退避画像をクリア | `:560`, `:611`, `:685` | 不要な一時データを残さない |

**`PageTabs` は `selectedCertType` を既に受け取っていた**ため（サムネイル画像パス `/cert-samples/{certType}/page-N.png` の切替に使用）、追加の配線は不要でした。

**child選択の状態**: 種別選択ボタンは `disabled={!type.enabled}`（`page.tsx` の種別選択セクション）のままで、`certPages.ts:30` の `enabled: false` を維持しています。**本番で誤って選択されることはありません。**

---

## 9. 編集画面の修正

### `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/page.tsx`

**なぜ**: 編集画面は `record.certType` を読み込んでいながら、レイアウト選択にもタイトルにも使っていませんでした（現状調査 P-6）。今後 child のデータが保存されるようになると、child の受給者証が adult のレイアウトで表示されます。

| # | 変更 | 該当行 |
|---|---|---|
| 9-1 | `const certType = record.certType;` を追加 | `:196` |
| 9-2 | `CertLayoutRenderer` に `certType={certType}` を渡す | `:246` |
| 9-3 | `EditPageSwitcher` に `certType={certType}` を渡す | `:228` |
| 9-4 | `PAGE_DEFINITIONS[...]` → `getPageTitle(certType, activePageIndex)` | `:197` |
| 9-5 | `padPages(pages, certType)` に変更（補完ページのタイトルも種別対応） | `:26-41`, `:77`, `:132` |

### `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/EditPageSwitcher.tsx`

`certType: CertTypeId` を必須propsに追加し、`PAGE_DEFINITIONS.map` → `getPageDefinitions(certType).map` に変更しました。ページ切替ボタンの `title` 属性（ツールチップ）が種別ごとの正しいページ名になります。

**`certType` が欠けた旧データについて**: `normalizeBeneficiaryData`（第4.3章）が読み取り時に `"adult"` を補完するため、編集画面が `undefined` を受け取ることはありません。

---

## 10. ページ7・8のデータ分離確認

### 10.1 確認したこと

現状調査で「ページ7/8のstate混入リスク」が指摘されていたため、**データ（formData）** と **UIのstate** を分けて検証しました。

#### (a) formData のオブジェクト参照 — **問題なし**

| 生成箇所 | 検証結果 |
|---|---|
| `certPages.ts:171-177` `createEmptyPage()` | 呼び出しごとに `emptyFormData()` を実行し、新しいオブジェクトを返す |
| `page.tsx` の `Array.from({ length: PAGE_COUNT }, () => createEmptyPage())` | 第2引数はマッパー関数のため**要素ごとに**呼ばれる。8ページが同一オブジェクトを共有することはない |
| `[beneficiaryId]/page.tsx:26-41` `padPages()` | `Array.from({length}, (_, index) => ({ ..., formData: emptyFormData() }))` で同様に要素ごとに生成 |

#### (b) 更新処理のイミュータビリティ — **問題なし**

```ts
// page.tsx（取込画面）
setPages((prev) => prev.map((page, index) =>
  index === activePageIndex ? updater(page) : page));

// [beneficiaryId]/page.tsx:98-106（編集画面）
prev.map((page, index) => index === activePageIndex
  ? { ...page, formData: { ...page.formData, [field]: value } }
  : page);
```

いずれも対象ページのみ新しいオブジェクトに差し替えており、**ページ7を編集してページ8のデータが変わることはありません**。

#### (c) `EditableCertCell` の編集中state — **問題を発見**

`switch (pageIndex)` の `case 6` / `case 7` / `default` がすべて `<LayoutType7 .../>` を返していました。React は**同じ位置・同じコンポーネント型**の要素を同一インスタンスとして再利用するため、`EditableCertCell` 内の `editing` / `draft`（`certLayouts.tsx:41-42`）がページ切替後も保持されます。

**再現する操作**

1. ページ7で任意のセルの ✎ を押し、入力欄を開いて値を書き換える（まだ「保存」は押さない）
2. ページ8へ切り替える
3. 入力欄が開いたまま、ページ7の下書きが残っている
4. ここで「保存」を押すと、**ページ8のフィールドにページ7の値が書き込まれる**

### 10.2 修正内容

#### `src/app/t/[tenantId]/components/certLayouts.tsx:729-735`

```tsx
// レイアウトはモジュールトップレベルで定義済みのコンポーネントから選ぶだけで、
// 描画のたびに新しいコンポーネントを作っているわけではない。
// ページ7と8のように同じレイアウトを共有するページ間を移動したとき、
// EditableCertCell の編集中state（開いている入力欄と下書き）が
// 引き継がれて別ページへ書き込まれるのを防ぐため、keyでページごとに再マウントする。
return createElement(getCertLayout(certType, pageIndex), {
  key: `${certType}-${pageIndex}`,
  pageTitle,
  page,
  onChangeField,
});
```

`key` に `certType` と `pageIndex` を含めることで、同じレイアウトコンポーネントを使うページ間でも React が**再マウント**し、編集中stateが破棄されます。

**副次的な効果**: 将来 child 専用レイアウトを追加した際、種別切替時にも確実に再マウントされます。

**UIへの影響**: ページを切り替えると編集中の入力欄が閉じます。これは意図した挙動（誤った書き込みの防止）であり、確定済みの値は `formData` に保持されているため失われません。

### 10.3 影響

- **既存データ**: 影響なし
- **adult版**: 上記の誤書き込みが起きなくなる方向の改善のみ
- **child実装時**: 種別切替でもstateが混ざりません

---

## 11. スマホ撮影時の画像保持対応

### 11.1 確認した現象

現状調査の指摘どおりの状態を、コード上で確認しました。

1. モバイル判定時、「ファイルを選択」は `/t/{tenantId}/capture` へ **`router.push`** する（`page.tsx` の `onPickClick`）
2. **ルート遷移**なので取込画面はアンマウントされ、React state の `File` オブジェクトが消滅する
3. 戻ると `sessionStorage` から復元されるが、対象は `formData` / `ocrText` / `storagePath` のみ（`PersistedPageData`）
4. 結果、**それまでに選択した全ページの `selectedFile` が `null`、`previewUrl` が空**になる

**実害**

| 現象 | 影響 |
|---|---|
| `completedCount` が `selectedFile` 基準（`page.tsx:185`）のため進捗が戻る | 表示のみ |
| `PageTabs` の「済」バッジが消える | 表示のみ |
| **確定保存が `if (page.selectedFile)` の場合のみアップロードする** | **画像がStorageに保存されない** |

OCRテキストとフォーム内容は残るため、ユーザーは「保存できた」と誤認します。編集画面で初めて「この受給者の取り込み画像は保存されていません」と分かります。

### 11.2 方式の選定

| 候補 | 判断 |
|---|---|
| sessionStorage に dataURL で保持 | **不採用**。1ページ数MBのdataURLを8ページ分では容量上限（概ね5MB）を確実に超える |
| 撮影直後に Firebase Storage へ先行アップロード | **不採用**。確定保存前のデータが本番Storageに存在することになり、破棄された取込の孤児ファイル処理が必要。本番データ構造への影響が大きい |
| **IndexedDB に Blob のまま退避** | **採用**。Blobをそのまま保存でき容量にも余裕がある。完全にブラウザ内で完結し、Firestore / Storage のデータ構造に一切影響しない |

指示の「Storageへの一時保存など本番データ構造へ大きく影響する方式しか選択肢がない場合は無理に実装しない」に対し、**影響しない方式が存在した**ため実装しました。

### 11.3 新設: `src/app/t/[tenantId]/lib/storage/importImageStore.ts`（192行・新規）

既存の `lib/storage/useCertPageImage.ts` と同じディレクトリに配置しました。

```ts
const DB_NAME = "paperlesscare-import";
const STORE_NAME = "pageImages";   // keyPath: "key" = `${tenantId}::${beneficiaryId}::${pageIndex}`
const TENANT_INDEX = "tenantId";   // テナント単位の一括操作用インデックス

export async function savePageImage(params): Promise<void>
export async function loadPageImages(tenantId, beneficiaryId): Promise<RestoredPageImage[]>
export async function deletePageImage(params): Promise<void>
export async function clearPageImages(tenantId): Promise<void>
```

**設計上の判断**

- **すべて例外を投げない**: 取込の継続性のための保険であり、プライベートブラウジングや容量超過で失敗しても取込自体は続行できるべきです。失敗時は「従来どおり撮影往復で画像が失われる」挙動に戻るだけです
- **SSRガード**: `typeof window.indexedDB === "undefined"` で早期リターン
- **キーに `beneficiaryId` を含める**: 取込開始時に事前採番されるIDを使うことで、別の取込セッションの画像と混ざりません
- **クリアはテナント単位**: 中断された過去の取込（別の事前採番ID）の画像も残さないため

### 11.4 取込画面への組み込み

#### 保存: `page.tsx:404-409`

```ts
// スマホ撮影への往復・ページ再読み込みをまたいでも画像を失わないよう、
// 選択した時点でIndexedDBへ退避しておく（Firebaseへのアップロードは確定保存時のまま）。
void savePageImage({ tenantId, beneficiaryId, pageIndex: activePageIndex, file: finalFile });
```

`onFileSelected` の中に置いたため、**PCのファイル選択・クリップボード貼り付け・スマホ撮影のすべての経路**をカバーします。

#### 復元: `page.tsx:277-315`

```ts
useEffect(() => {
  if (loading || !user || !tenantId || !beneficiaryId) return;
  let cancelled = false;

  (async () => {
    const restored = await loadPageImages(tenantId, beneficiaryId);
    if (cancelled || restored.length === 0) return;

    const targets = restored.filter(
      (item) => !pagesRef.current[item.pageIndex]?.selectedFile
    );
    if (targets.length === 0) return;

    // blob URLの生成はsetPagesの更新関数の外で行う。
    // 更新関数を純粋に保つことで、Strict Modeの二重呼び出しでも
    // 同じURLが使われ、未解放のblob URLが増えないようにする。
    const previews = targets.map((item) => ({
      pageIndex: item.pageIndex,
      file: item.file,
      previewUrl: URL.createObjectURL(item.file),
    }));

    setPages((prev) => prev.map((page, index) => {
      // 撮影直後の復路でこのページに新しい画像が入っている場合は上書きしない
      if (page.selectedFile) return page;
      const match = previews.find((item) => item.pageIndex === index);
      if (!match) return page;
      return { ...page, selectedFile: match.file, previewUrl: match.previewUrl };
    }));
  })();

  return () => { cancelled = true; };
}, [tenantId, beneficiaryId, loading, user]);
```

**競合への配慮**: 撮影から戻った直後は、既存の「撮影画像取り込みeffect」がそのページに新しい画像をセットします。復元effectとの実行順は保証されないため、**`selectedFile` が既にあるページはスキップ**する二重のガード（`targets` のフィルタと更新関数内の判定）を入れています。

**blob URLの扱い**: 生成を更新関数の外に出し、更新関数を純粋に保っています。既存のアンマウント時クリーンアップ（`page.tsx` の `pagesRef.current.forEach(...revokeObjectURL)`）が、stateに入ったURLを解放します。

#### クリア

| タイミング | 該当行 | 処理 |
|---|---|---|
| ページ単位の「クリア」ボタン | `:346` | `deletePageImage({ ..., pageIndex: activePageIndex })` |
| 「取込状況をリセット」ボタン | `:611` | `clearPageImages(tenantId)` |
| 「新規受給者を登録」開始時 | `:685` | `clearPageImages(tenantId)` |
| 確定保存の成功時 | `:560` | `clearPageImages(tenantId)` |

### 11.5 結果

**複数ページを順番にスマホ撮影しても、それまでの画像が失われなくなりました。**
ページ再読み込み（F5）後も同様に復元されます。

### 11.6 影響

- **既存データ**: 影響なし。IndexedDBはブラウザ内の一時領域で、Firestore / Storage には触れません
- **adult版**: 画像が失われなくなる方向の改善のみ。確定保存時のアップロード処理は変更していません
- **child実装時**: 種別に依存しない仕組みのため、そのまま利用できます

### 11.7 残る制約

- IndexedDBが使えない環境（プライベートブラウジング等）では従来どおり画像が失われます。無視して続行する設計のため、エラーにはなりません
- 確定保存に失敗したまま**ブラウザを閉じた**場合、退避画像はテナント単位のクリアが走るまで残ります。次回「新規受給者を登録」または「取込状況をリセット」で削除されます

---

## 12. 型定義・重複定義の整理

### 12.1 `CertTypeId` の重複解消

#### `src/app/t/[tenantId]/components/PageTabs.tsx:1-8`

**変更前**

```ts
import { PAGE_DEFINITIONS } from "../constants/certPages";

type Props = {
  selectedCertType: "mobility" | "adult" | "child";   // ← 独自に再定義
  ...
};
```

**変更後**

```ts
import { getPageDefinitions, type CertTypeId } from "../constants/certPages";

type Props = {
  selectedCertType: CertTypeId;
  ...
};
```

**なぜ**: `CertTypeId` は `certPages.ts:35` で `(typeof CERT_TYPES)[number]["id"]` として `CERT_TYPES` から導出されています。`PageTabs` が独自にunionを書いていたため、種別を追加すると片方だけ修正漏れが起きます。正式な型をimportすることで、**`CERT_TYPES` に追加するだけで全箇所に伝播**します。

### 12.2 型定義の整理

| 対象 | 変更 | 該当行 |
|---|---|---|
| `FormDataType` | `serviceType1` / `servicePeriod1` / `serviceAmount1` を正式定義 | `types/cert.ts:15-27` |
| `emptyFormData()` | `serviceType4..8` 系 15項目を補完 | `certPages.ts:151-169` |
| `PageDefinition` | `PAGE_DEFINITIONS` の要素型を named export | `certPages.ts:90` |
| `CertLayout` | レイアウトコンポーネントの型を named export | `certLayouts.tsx:26` |
| `CertLayoutId` | レイアウト識別子の型を新設 | `certLayoutMap.ts:17-24` |
| `CertPageParser` | パーサ関数の型を新設 | `parseCertText.ts:9` |
| `OcrRequest` | Callable Functionの送信ペイロード型を新設 | `page.tsx:39-44` |
| `parseCertText` | `pageIndex` / `certType` を optional から**必須**に変更 | `parseCertText.ts:78-87` |

**`parseCertText` の引数を必須にした理由**: 変更前は `pageIndex?: number, selectedCertType?: string` で、`certType` が `string` 型だったため任意の文字列を渡せました。`CertTypeId` の必須引数にすることで、渡し忘れ・タイプミスがコンパイルエラーになります。

### 12.3 `functions/src/index.ts` の `any` 除去

ログ修正で触ったファイルのため、あわせて2箇所の `any` を解消しました。

| 変更前 | 変更後 | 該当行 |
|---|---|---|
| `const imageBase64 = (req.data as any)?.imageBase64 as string \| undefined;` | `as { imageBase64?: unknown }` で受けて `typeof === "string"` で検証 | `:61-67` |
| `catch (err: any)` + `err?.code` | `catch (err: unknown)` + 構造化した取り出し | `:92-107` |

型アサーションを外したことで、`imageBase64` が文字列でない場合も `invalid-argument` で弾けるようになりました（変更前は `!imageBase64` のみで、例えば数値の `1` は通過していました）。

---

## 13. 旧スナップショット・lint整理

### 13.1 判断

**削除せず、ビルド・lint・tscの対象外にしました。**

**なぜ削除しなかったか**

- `src_20260514_1/` `src_20260519_1/` は**git管理下**（コミット済み）で、意図的に残されたバックアップです
- 削除は git 履歴から復元可能ですが、ユーザーが手元で参照している可能性があります
- 対象外にするだけで目的（lintノイズの解消）は完全に達成できます

### 13.2 変更

#### `tsconfig.json:33-40`

```json
"exclude": [
  "node_modules",
  "functions",
  "functions/**",
  "src_20260514_1",
  "src_20260514_1/**",
  "src_20260519_1",
  "src_20260519_1/**"
]
```

`include` が `**/*.ts` / `**/*.tsx` のため、これらのディレクトリが `tsc --noEmit` の対象になっていました。

#### `eslint.config.mjs:11-24`

```js
globalIgnores([
  ".next/**",
  "out/**",
  "build/**",
  "next-env.d.ts",
  // 旧ソースのスナップショット。next build の対象外だがlint/tscには拾われ、
  // 現行コードの指摘が埋もれるため対象外にする（tsconfig.json の exclude と対）。
  "src_20260514_1/**",
  "src_20260519_1/**",
  // ビルド成果物・ベンダー配布物（いずれもgit管理外）。
  // functions/src は引き続きlint対象。
  "functions/lib/**",
  "google-cloud-sdk/**",
]),
```

**`functions/lib/` と `google-cloud-sdk/` も追加した理由**: lint実行時に、旧スナップショット以外にも以下がノイズになっていました。

- `functions/lib/index.js` — TypeScriptのコンパイル成果物（`functions/.gitignore` で除外済み）
- `google-cloud-sdk/**` — ベンダー配布のSDK（`.gitignore` の `**/google-cloud-sdk/` で除外済み）

いずれもgit管理外の生成物・配布物であり、lintする意味がありません。
**`functions/src/` は引き続きlint対象**にしています（実際のプロジェクトコードのため）。

### 13.3 効果

| | 変更前 | 変更後 |
|---|---|---|
| 総問題数 | 72 | **19** |
| error | 30 | **8** |
| warning | 42 | **11** |

現行コードの指摘だけが残り、レビューで埋もれなくなりました。

### 13.4 補足: `functions` 独自のlintは実行不可（既存問題）

`npm --prefix functions run lint` は以下のエラーで実行できません。**今回の変更とは無関係の既存の環境問題**です。

```
TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions':
Cannot read properties of undefined (reading 'allowShortCircuit')
```

`functions/` が eslint 8 を使う一方、ルールの解決がルートの `node_modules/eslint`（v9）を参照しているためです。
`functions` の型チェック（`tsc -p functions/tsconfig.json --noEmit`）は**成功**しており、デプロイ時の `predeploy` フックが実行する `npm --prefix functions run build` も同じ `tsc` です。第19章に残課題として記載しています。

---

## 14. テスト追加・変更内容

### 14.1 テスト実行環境の整備

#### `package.json:9`

```json
"test": "node --experimental-strip-types --test"
```

**なぜ**: テストファイルは以前から存在していましたが npm script が無く、実行されない状態でした。Node 25 の型ストリッピング＋標準テストランナーで、追加パッケージなしに実行できます。

引数なしの `--test` を使っているのは、ディレクトリパスに `[tenantId]` が含まれ、globのブラケットが文字クラスとして解釈されてしまうためです（カレントディレクトリからの再帰探索を使用）。

### 14.2 追加したテスト（新規19件）

#### `src/app/t/[tenantId]/lib/parsers/adult/page2.test.ts`（新規・3件）

指示の「adultページ2 parser」に対応します。

| テスト | 検証内容 |
|---|---|
| 1組目を `serviceType1` / `servicePeriod1` / `serviceAmount1` へ格納する | サービス種別①→`serviceType1`、支給決定期間①→`servicePeriod1`、支給量等①→`serviceAmount1` |
| 人物情報用フィールドへサービス情報を混入させない | `name` / `birthday` / `childName` が空のままであること |
| 該当行が無いOCR結果では1組目を空文字で返す | 例外を投げずに空文字を返すこと |

このテストが、第5.3章の「認定有効期間を支給決定期間として取り込んでしまう」既存バグを発見しました。

#### `src/app/t/[tenantId]/lib/compat/legacyPage2.test.ts`（新規・8件）

指示の「旧データ互換」に対応します。

| テスト | 検証内容 |
|---|---|
| `isPage2` の判定 | `pageNo` があればそれを、無ければ配列添字を使う |
| 旧フィールドの値を移送する | `name`/`birthday`/`childName` → `serviceType1`/`servicePeriod1`/`serviceAmount1` |
| 移送元は空にする（コピーではなく移動） | 移送後に旧フィールドが空になる |
| 新フィールドに値がある場合は上書きしない | 新形式が優先される |
| 項目ごとに独立して移送する | 一部だけ新形式という混在データでも正しく動く |
| 移送が不要なら同一オブジェクトを返す | 参照が変わらない（不要な再レンダリングを避ける） |
| 新形式の空データは変化しない | 空データを壊さない |

#### `src/app/t/[tenantId]/constants/certLayoutMap.test.ts`（新規・4件）

指示の「certType分岐」に対応します。

| テスト | 検証内容 |
|---|---|
| adult の8ページが想定どおりのレイアウトへ割り当てられる | **修正前の `switch (pageIndex)` と同じ割り当てであることの回帰テスト** |
| child は現時点では adult と同じレイアウトを参照する | 全8ページで一致 |
| 定義済みの全種別が全ページ分のレイアウトを解決できる | `CERT_TYPES` を走査。種別追加時の定義漏れを検出 |
| 範囲外のページはフォールバックする | 例外を投げない |

#### `src/app/t/[tenantId]/lib/parsers/parseCertText.test.ts`（新規・6件）

同じく「certType分岐」に対応します。

| テスト | 検証内容 |
|---|---|
| adult のページ1〜4は専用パーサへ振り分けられる | 関数参照の一致を検証 |
| adult のページ5〜8は専用パーサ未実装（null） | 現状を明示 |
| child / mobility は専用パーサ未登録で adult のものを流用しない | **誤って adult のパーサが使われないことの保証** |
| adult ページ2はサービス情報を `serviceType1` 系へ入れる | エンドツーエンドで確認（`name` が空であることも） |
| 専用パーサが無い場合もフォールバックで必須項目を返す | child で例外を投げず、必須項目が揃うこと |

### 14.3 変更したテスト

#### `src/app/t/[tenantId]/lib/parsers/adult/page1.test.ts`（既存3件・データを匿名化）

**なぜ**: `RAW_OCR_TEXT` に実在の個人情報と思われる値が含まれていました。

| 種別 | 変更前（推定・実在） | 変更後（架空） |
|---|---|---|
| 受給者証番号 | 10桁の実番号 | `1234567890` |
| 本人氏名 | 実名 | `架空 太郎` |
| 児童氏名 | 実名 | `架空 花子` |
| 居住地 | 実住所（区・町・番地・棟号室まで） | `架空県架空市架空町1番地の2 架空山住` |
| 本人生年月日 | 実在の日付 | `昭和50年1月2日` |
| 児童生年月日 | 実在の日付 | `平成30年3月4日` |
| 交付年月日 | 実在の日付 | `令和7年4月1日` |
| 支給市町村名・市町村番号 | 実在の市名・番号 | `架空市` / `999999` |

**OCRの揺れは維持しています**。このフィクスチャの価値は「`氏\n名` のようにラベルが改行で分断される」「`障害福祉廿一個` のような誤認識」「`児童` 見出しがOCRに出てこない」といった実際の揺れを再現している点にあるため、その構造はそのままに値だけを置換しました。テストのアサーションも新しい値に更新しています。

3件とも引き続きパスします。

**Git履歴について**: 指示どおり履歴の書き換えは行っていません。**過去のコミットには元の値が残っています**（第19章に記載）。

### 14.4 新規テストデータの方針

追加した4ファイルのテストデータは、すべて明らかな架空値です。

- 氏名: `架空 太郎` / `架空 花子` / `山田 太郎`（既存テストから維持。慣用的な架空名）
- 自治体: `架空市`
- 受給者証番号: `1234567890` / `1111111111`
- サービス種別: `短期入所` / `生活介護`（一般的なサービス名称で、個人を特定しません）
- 事業所名は使用していません

---

## 15. 動作確認結果

### 15.1 実行結果

| 確認項目 | 結果 | 備考 |
|---|---|---|
| TypeScript | **PASS** | `npx tsc --noEmit` — エラー0 |
| TypeScript (functions) | **PASS** | `npx tsc -p functions/tsconfig.json --noEmit` — エラー0 |
| ESLint | **PASS**（既存指摘のみ） | 19問題（**error 8 / warning 11**）。変更前は72問題（error 30 / warning 42）。**今回の変更由来の指摘は0件**。残る8件はすべて今回触っていないファイルの既存指摘 |
| Next.js Build | **PASS** | `npx next build` — 10ルートを生成。成功 |
| parser tests（既存） | **PASS** | `parseAdultPage1` 3件。匿名化後も全件パス |
| 今回追加したtest | **PASS** | 19件すべてパス（合計 **22件 / 22件 PASS**） |
| adult既存機能 | **一部確認** | コード上・ビルド上は確認済み。実データを伴う操作は未確認（15.3参照） |
| 旧データ互換 | **一部確認** | ロジックは単体テスト8件で確認済み。実際のFirestore旧データでの表示は未確認（15.3参照） |
| certType分岐 | **PASS** | 単体テスト10件（`certLayoutMap` 4件 + `parseCertText` 6件） |

### 15.2 残っているlint指摘の内訳（すべて既存由来）

**error 8件 — すべて既存由来（今回触っていないファイル）**

| ファイル:行 | ルール |
|---|---|
| `src/app/components/AppShell.tsx:31` | `react-hooks/set-state-in-effect` |
| `src/app/components/UnhandledRejectionGuard.tsx:8` | `no-explicit-any`（未使用コンポーネント） |
| `src/app/login/LoginClient.tsx:60` | `no-explicit-any` |
| `src/app/logout/LogoutClient.tsx:31` | `no-explicit-any` |
| `src/app/signup/SignupClient.tsx:25` | `no-explicit-any` |
| `src/app/t/[tenantId]/beneficiaries/page.tsx:38` | `react-hooks/set-state-in-effect` |
| `src/app/t/[tenantId]/beneficiaries/page.tsx:45` | `no-explicit-any` |
| `src/app/t/[tenantId]/capture/page.tsx:57` | `no-explicit-any` |

`functions/src/index.ts` にあった `no-explicit-any` 2件は、ログ修正で同ファイルを触ったついでに解消しました（第12.3章）。**同ファイルの指摘は0件になっています。**

**warning 11件 — すべて既存由来**

| ルール | 件数 | 箇所 |
|---|---|---|
| `@next/next/no-img-element` | 5 | `SideNav.tsx:38,51` / `capture/page.tsx:257` / `PageTabs.tsx:40` / `page.tsx:804` |
| `@typescript-eslint/no-unused-vars` | 6 | `AppShell.tsx:22`（`subtitle`）/ `LoginClient.tsx:5`（`db`）/ `capture/page.tsx:57`（`e`）/ `certLayouts.tsx:205,532,611`（`pageTitle`） |

**今回追加した4ファイル（`legacyPage2.ts` / `importImageStore.ts` / `certLayoutMap.ts` / 各テスト）には指摘0件です。**

### 15.3 実施していない確認

以下は**実データまたは実行環境が必要**なため、今回は実施していません（本番データへの書き込みは禁止のため）。

| 未確認項目 | 理由 | 推奨する確認方法 |
|---|---|---|
| 実際のOCR呼び出し | Cloud Functions のデプロイと Vision API の課金が発生する | ユーザー側で `npm run dev` ＋ 既存のデプロイ済みFunctionで確認 |
| Firestoreの旧構造データでのページ2表示 | 本番データの読み取りが必要 | ステージング、またはFirebase Emulatorに旧構造データを投入して確認 |
| スマホ実機での撮影往復 | 実機とHTTPS環境が必要 | ユーザー側で実機確認（15.4のシナリオ参照） |
| ページ7/8のstate混入が解消されたかのブラウザ上での確認 | React DOMのレンダリングが必要 | ユーザー側で `npm run dev` 実行後に手動確認 |
| Firebase Emulator での結合確認 | エミュレータ未起動 | `firebase emulators:start` で確認可能 |

### 15.4 ユーザー側で実施を推奨する確認シナリオ

`npm run dev` を実行し、以下を確認してください（**本番Firestoreへの保存を伴うため、ステージング環境またはテスト用テナントを推奨します**）。

**A. adult 回帰（最重要）**

1. `/t/{tenantId}` で「新規受給者を登録」→ 種別で「障害福祉サービス受給者証（18歳以上）」を選択
2. ページ2の画像を取り込み、**「サービス種別」に短期入所、「支給決定期間」に支給決定期間の値（認定有効期間ではない）** が入ることを確認
3. ✎ で手修正し、値が反映されることを確認
4. 「確定して保存」→ 受給者管理画面に表示されることを確認
5. 行をクリックして編集画面を開き、ページ2が正しく表示されることを確認

**B. 旧データ互換**

6. 今回の修正前に保存済みの受給者の編集画面を開き、**ページ2のサービス種別①・支給決定期間①・支給量等①が空欄になっていない**ことを確認
7. そのまま「保存する」を押し、再度開いて値が保持されることを確認

**C. ページ7/8の分離**

8. 編集画面でページ7のセルの ✎ を押して入力欄を開き、**保存せずに**ページ8へ切り替える
9. 入力欄が閉じており、ページ7の下書きが残っていないことを確認

**D. スマホ撮影の画像保持**

10. スマホでページ1を撮影 → ページ2へ移動して撮影 → ページ3へ移動して撮影
11. **ページ1・2の「済」バッジとサムネイルが残っている**ことを確認（進捗が `3/8` になること）
12. 保存後、編集画面でページ1〜3の画像がすべて表示されることを確認

**E. child が選択できないこと**

13. 種別選択で「障害福祉サービス受給者証（18歳未満）」が「今後実装予定」バッジ付きで**押せない**ことを確認

---

## 16. adult版への影響確認

指示の10項目について、コード上・ビルド上で確認した結果です。

| # | 項目 | 結果 | 根拠 |
|---|---|---|---|
| 1 | adultを選択できる | **OK** | `certPages.ts:21` の `enabled: true` は変更していない。種別選択UIも変更なし |
| 2 | ページ1〜8を切り替えられる | **OK** | `PageTabs` は `getPageDefinitions(certType)` 経由になったが、adult は従来と同じ `PAGE_DEFINITIONS` を返す（テスト検証済み） |
| 3 | 画像を取り込める | **OK** | `onFileSelected` の処理フローは変更なし。IndexedDB退避を**追加**しただけで、失敗しても取込は継続する |
| 4 | OCR処理を呼び出せる | **OK** | Callable呼び出しは同一。`pageNo`/`certType` の追加フィールドは旧Functionでは無視される |
| 5 | ページ2のサービス①が正しいフィールドへ入る | **OK** | `page2.test.ts` 3件で検証。加えて既存バグ（認定有効期間の混入）も修正 |
| 6 | 手修正できる | **OK** | `EditableCertCell` 自体は無変更。`field` の指定先が `serviceType1` 系に変わっただけ |
| 7 | 保存処理が成立する | **OK** | `saveBeneficiary` は無変更。`title` の取得元が `getPageTitle(certType, index)` になったが adult では同一文字列 |
| 8 | 保存済みデータを編集画面で表示できる | **OK** | `getBeneficiary` に正規化を追加。`summary`/`pages` 欠落時の耐性が**向上** |
| 9 | 旧形式ページ2データも表示できる | **OK** | `legacyPage2.test.ts` 8件で検証 |
| 10 | `certType: adult` のレイアウトが正しく表示される | **OK** | `certLayoutMap.test.ts` が修正前の `switch` と同じ割り当てを回帰テストとして検証 |

### 16.1 adult版で意図的に挙動が変わる点（1件のみ）

**ページ2の「支給決定期間①」の抽出結果**（第5.3章）。

- **変更前**: ページ全体の最初の和暦期間 → 実帳票では「認定有効期間」の値が入っていた
- **変更後**: 「支給決定期間」ラベル以降の最初の和暦期間 → 正しい値が入る
- **フォールバック**: ラベルがOCRで欠けた場合は従来動作

これは誤りの修正であり、退行ではありません。ただし**既に保存済みのデータは自動修正されません**（誤った値のまま残ります）。編集画面で手修正するか、再取込が必要です。

### 16.2 UIの見た目の変更

**帳票レイアウトの見た目は変更していません。** ラベル・グリッド構成・行の高さ・`multiline` 指定はすべて据え置きです。

唯一の体感差は、**ページ切替時に開いていた編集欄が閉じる**ことです（第10.2章）。これは誤書き込み防止のための意図した挙動で、確定済みの値は失われません。

---

## 17. 変更ファイル一覧

### 17.1 新規作成（7ファイル）

| ファイル | 行数 | 内容 |
|---|---|---|
| `src/app/t/[tenantId]/constants/certLayoutMap.ts` | 55 | 種別×ページ → レイアウトIDの対応表（純粋データ） |
| `src/app/t/[tenantId]/constants/certLayoutMap.test.ts` | 47 | 上記のテスト（4件） |
| `src/app/t/[tenantId]/lib/compat/legacyPage2.ts` | 54 | ページ2の旧フィールド互換処理 |
| `src/app/t/[tenantId]/lib/compat/legacyPage2.test.ts` | 96 | 上記のテスト（8件） |
| `src/app/t/[tenantId]/lib/storage/importImageStore.ts` | 192 | 取込画像のIndexedDB一時退避 |
| `src/app/t/[tenantId]/lib/parsers/adult/page2.test.ts` | 51 | adultページ2パーサのテスト（3件） |
| `src/app/t/[tenantId]/lib/parsers/parseCertText.test.ts` | 74 | パーサ振り分けのテスト（6件） |

### 17.2 変更（15ファイル）

| ファイル | 主な変更 | 章 |
|---|---|---|
| `src/app/t/[tenantId]/types/cert.ts` | `serviceType1`/`servicePeriod1`/`serviceAmount1` の型定義追加 | 4.1 |
| `src/app/t/[tenantId]/constants/certPages.ts` | `getPageDefinitions`/`getPageTitle` 追加、`emptyFormData` 補完 | 4.2 / 7.4 |
| `src/app/t/[tenantId]/components/certLayouts.tsx` | ページ2のフィールド差し替え、`certType` 分岐、`key` による再マウント | 5.1 / 7.3 / 10.2 |
| `src/app/t/[tenantId]/components/PageTabs.tsx` | `CertTypeId` のimport、`getPageDefinitions` 使用 | 12.1 |
| `src/app/t/[tenantId]/lib/parsers/parseCertText.ts` | パーサレジストリ化、PIIログ除去、引数を必須化 | 3.1 / 7 / 12.2 |
| `src/app/t/[tenantId]/lib/parsers/adult/page2.ts` | `serviceType1` 系への格納、期間抽出のラベル起点化 | 5.2 / 5.3 |
| `src/app/t/[tenantId]/lib/parsers/adult/page1.test.ts` | テストデータの匿名化 | 14.3 |
| `src/app/t/[tenantId]/lib/firestore/beneficiaries.ts` | 読み取り時の正規化（旧データ互換・欠落補完） | 4.3 / 6 |
| `src/app/t/[tenantId]/page.tsx` | `certType` 伝播、PIIログ除去、IndexedDB連携 | 3.1 / 8 / 11.4 |
| `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/page.tsx` | `certType` を帳票描画へ伝播 | 9 |
| `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/EditPageSwitcher.tsx` | `certType` propsの追加 | 9 |
| `functions/src/index.ts` | PIIログ除去、`buildLogContext` 追加、`any` 除去 | 3.2 / 12.3 |
| `package.json` | `test` スクリプト追加 | 14.1 |
| `tsconfig.json` | 旧スナップショットを `exclude` へ | 13.2 |
| `eslint.config.mjs` | 旧スナップショット・ビルド成果物を `globalIgnores` へ | 13.2 |

**差分規模**: 16ファイル変更、443行追加・180行削除（新規7ファイル 569行を除く）

### 17.3 変更していないファイル（明示）

| ファイル | 理由 |
|---|---|
| `firestore.rules` / `storage.rules` | 今回の変更で権限モデルは変わらない |
| `firebase.json` / `.firebaserc` / `firestore.indexes.json` | Firebase設定の変更は禁止事項 |
| `src/app/t/[tenantId]/capture/page.tsx` | 撮影画面自体は無変更（画像保持は呼び出し元で対応） |
| `src/app/t/[tenantId]/beneficiaries/page.tsx` | 一覧画面。今回のスコープ外（検索機能等は第2弾以降） |
| `src/lib/firebase.ts` / `src/lib/auth.ts` | 認証・初期化は無変更 |
| `src_20260514_1/` / `src_20260519_1/` | 内容は無変更（ビルド対象外にしただけ） |
| `cors.json` | **今回の作業前から未コミットの変更が存在**（作業開始時の `git status` で確認）。触れていません |

---

## 18. 今回あえて対応しなかった事項

| # | 事項 | 理由 |
|---|---|---|
| 1 | `child` の有効化（`enabled: true`） | 専用パーサが無い状態で有効化すると、利用者が選択して「ほぼ全項目が空のまま保存される」状態になる。指示どおり `enabled: false` を維持 |
| 2 | `child` 専用OCRパーサ | 実機OCRサンプルが未収集。今回のスコープ外と明示されている |
| 3 | `child` 専用レイアウト | 現時点では adult と同一様式のため共有が妥当。様式差が確認できてから作る |
| 4 | Firestoreの一括migration | 指示により禁止。第6.4章に推奨手順を記載 |
| 5 | ページ2のサービス種別・支給量の抽出精度改善 | `短期入所` / `日/月` の決め打ちヒューリスティックは精度に課題があるが、adult の実データでの挙動を変えないため据え置き（第19章） |
| 6 | ページ3・4のパーサの行位置依存の改善 | 同上。今回のスコープ外 |
| 7 | ページ5〜8の専用パーサ | 今回のスコープ外。ページ5はページ1と同構造のため流用可能（第20章） |
| 8 | `certPeriod`（認定有効期間）の抽出 | 帳票には欄があるがパーサが未対応。精度改善のスコープ | 
| 9 | 既存の `no-explicit-any` / `set-state-in-effect` の解消 | 今回触っていないファイルの既存指摘。修正すると差分が広がり回帰リスクが増える（`functions/src/index.ts` のみ、触ったついでに解消） |
| 10 | 一覧画面の検索機能・削除機能・バリデーション | 第2弾以降のスコープ |
| 11 | `serviceType1` の旧フィールドのFirestore上からの物理削除 | 互換処理で無害化済み。migrationの範囲 |
| 12 | 旧スナップショットディレクトリの削除 | git管理下の意図的なバックアップのため、対象外化にとどめた（第13.1章） |
| 13 | `functions` 独自lintの環境修復 | eslintのバージョン競合。今回の変更とは無関係の既存問題（第13.4章） |
| 14 | Git履歴からの個人情報除去 | 指示により履歴の書き換えは禁止（第19章に記載） |

---

## 19. 残課題

### 19.1 高優先

| # | 課題 | 該当箇所 | 内容 |
|---|---|---|---|
| R-1 | **Git履歴に個人情報が残存** | `adult/page1.test.ts` の過去コミット | 作業ツリーは匿名化したが、`f043c105` 等の過去コミットには実在と思われる氏名・住所・受給者番号・生年月日が残る。リポジトリが非公開でも、アクセス権のある全員が閲覧可能。対処には `git filter-repo` 等による履歴書き換え（force push を伴う）が必要で、**ユーザーの判断が必要** |
| R-2 | **`functions/lib/` に旧コンパイル結果** | `functions/lib/index.js` | PIIログを含む旧コードのビルド成果物。git管理外で、デプロイ時の `predeploy` フックが再生成するため、**デプロイすれば解消**。ローカルで確認する場合は `npm --prefix functions run build` |
| R-3 | 保存済みデータのページ2「支給決定期間①」が誤っている可能性 | 既存Firestoreデータ | 第5.3章の既存バグにより、認定有効期間の値が入っている可能性がある。自動修正はされないため、編集画面での手修正または再取込が必要 |

### 19.2 中優先

| # | 課題 | 内容 |
|---|---|---|
| R-4 | ページ2のサービス種別抽出が `短期入所` の決め打ち | `lines.find((line) => line.includes("短期入所"))`。他のサービス種別（居宅介護・行動援護等）では取得できない。`page3.ts`/`page4.ts` の `pickSections` 方式への統一を検討 |
| R-5 | ページ2の支給量抽出が `日/月` の決め打ち | `時間/月` 等の単位に対応していない |
| R-6 | `certPeriod`（認定有効期間）が未抽出 | 帳票には欄があるがパーサが値を入れない |
| R-7 | ページ3・4のパーサが行位置依存 | 「サービス種別」行の +1/+3/+5 行目を決め打ち。OCRの改行が1行ずれると全項目がずれる |
| R-8 | ページ5〜8に専用パーサが無い | adult でも `parseFallback` を通る。ページ5はページ1と同構造のため流用可能 |
| R-9 | `functions` 独自lintが実行不可 | eslint 8 と 9 の競合（第13.4章）。`functions/node_modules` の再インストール、または eslint 9 + flat config への移行で解消見込み |
| R-10 | Firestore一括migration | 第6.4章。実施すれば `lib/compat/legacyPage2.ts` を削除できる |

### 19.3 低優先

| # | 課題 | 内容 |
|---|---|---|
| R-11 | `LayoutType2` / `6` / `7` が `pageTitle` を使わずタイトルをハードコード | lint warning 3件の原因。child でタイトルを変えたい場合に問題化する可能性 |
| R-12 | `LayoutType6` に「問い合わせ先」欄が無い | サンプル帳票には存在（現状調査 4.4） |
| R-13 | `LayoutType7` の「食事提供体制加算」欄がサンプル帳票に無い | 様式確認が必要 |
| R-14 | `LayoutType1` と `LayoutType5` で識別項目が重複保持 | `pages[0]` と `pages[4]` に同じ氏名等が別々に入り、同期されない |
| R-15 | 既存の `no-explicit-any` 6件・`set-state-in-effect` 2件 | 今回触っていないファイルの既存指摘 |
| R-16 | `IndexedDB` が使えない環境でのフォールバック | 従来どおり画像が失われる。ユーザーへの通知は無し |

---

## 20. 次のステップ

### 20.1 child実装へ進める状態か

## **READY WITH CONDITIONS**

コード側の土台は整いました。ただし、**着手前に満たすべき条件が2つ**あります。

### 20.2 条件（コード側ではなく、情報・素材の準備）

| # | 条件 | 理由 | 誰が |
|---|---|---|---|
| **C-1** | **18歳未満の実物様式の確認** | `public/cert-samples/child/` の画像が実際の様式と一致するか。特に **8ページ目のサンプルが1ページ目の複製**（MD5一致）で、正しい様式が確認できない。自治体により様式が異なる可能性もある | ユーザー |
| **C-2** | **18歳未満の実機OCRサンプルの収集** | 各ページ2〜3枚。パーサはOCRの実際の揺れ（改行位置・誤認識）に合わせて書く必要があり、サンプルなしでは着手できない。**収集前に必ず今回のPIIログ修正をデプロイしてください**（第3章） | ユーザー |

### 20.3 満たされている前提（今回の成果）

| 前提 | 状態 |
|---|---|
| 個人情報がログに残らない | **済**（デプロイ後に有効） |
| データモデルが正しい（誤った構造を複製しない） | **済**（`serviceType1` 系へ統一） |
| 既存データが壊れない | **済**（読み取り時の互換処理＋テスト8件） |
| `certType` で帳票を差し替えられる | **済**（`certLayoutMap.ts` ＋ テスト4件） |
| `certType` でパーサを差し替えられる | **済**（`CERT_PAGE_PARSERS` ＋ テスト6件） |
| 取込画面・編集画面の両方で `certType` が効く | **済** |
| adult が壊れていない | **済**（回帰テスト＋ビルド確認） |
| child を有効化する手順が明確 | **済**（20.4） |
| テストを追加・実行できる | **済**（`npm test`） |

### 20.4 child を有効化する具体的な手順（次回作業）

条件が満たされた後、以下の順で進めるのが安全です。

**ステップ1: 様式の差分確認**

`public/cert-samples/child/` と実物を突き合わせ、adult と異なるページを特定する。

**ステップ2: 様式が異なるページのレイアウト追加**（差分がある場合のみ）

1. `components/certLayouts.tsx` に `LayoutTypeN` を追加
2. `constants/certLayoutMap.ts` の `CertLayoutId` に新しいIDを追加
3. `CERT_LAYOUT_IDS.child` を `ADULT_LAYOUT_IDS` の共有から独自配列に変更し、該当ページだけ新IDに差し替え
4. `certLayoutMap.test.ts` の「child は adult と同じ」テストを、新しい期待値に更新

**ステップ3: ページ定義（タイトル）の差し替え**（差分がある場合のみ）

`constants/certPages.ts` の `PAGE_DEFINITIONS_BY_CERT_TYPE.child` に child 用の定義を設定。

**ステップ4: child 用パーサの実装**

1. `lib/parsers/child/page1.ts` 〜 を作成（`adult/pageN.ts` と同じシグネチャ）
2. `lib/parsers/parseCertText.ts` の `CERT_PAGE_PARSERS.child` へ登録
3. ページごとに `lib/parsers/child/pageN.test.ts` を追加（**架空値のフィクスチャで**）
4. `parseCertText.test.ts` の「child は専用パーサ未登録」テストを更新

**ステップ5: 有効化**

`constants/certPages.ts:30-31` を `enabled: true` / `statusLabel: ""` に変更。

**ステップ6: 検証**

`npm test` → `npx tsc --noEmit` → `npm run lint` → `npx next build` → 実機での通し確認。

### 20.5 child 以外で優先度が高いと考えられる作業（参考）

現状調査で挙げた項目のうち、child 対応と並行または直後に着手すべきもの。

1. **バリデーション**（必須項目・日付形式）— 実運用の前提
2. **既存受給者の検索・更新フロー** — 年度更新運用に必要
3. **削除（または無効化）機能** — 誤登録の訂正手段
4. **一覧の検索・絞り込み** — 件数が増えると実用に耐えなくなる

---

## 21. 総括

### 21.1 やったこと

「18歳未満の受給者証を載せる前に、載せても壊れない土台を作る」という目的に対し、**12項目すべてを完了**しました。

特に重要だったのは次の4点です。

**1. データモデルの是正（第5章）**

ページ2の1組目が `name` / `birthday` / `childName` という人物情報用フィールドを流用していた問題を解消しました。これは「ページによってフィールドの意味が変わる」という構造上の欠陥で、**この状態のまま child のパーサを書くと負債が倍になる**ため、最初に片付ける必要がありました。

**2. 旧データを壊さない互換処理（第6章）**

読み取り時に旧フィールドから新フィールドへ「移送」する仕組みを入れ、単体テスト8件で検証しました。既存受給者のページ2が突然空欄になることはありません。ユーザーが編集画面で保存すれば、そのドキュメントは自然に新構造へ移行します。

**3. certType 分岐の構造化（第7章）**

`switch (pageIndex)` を、`certType × pageIndex → レイアウトID` の**純粋なデータ表**に置き換えました。JSXを含まないため単体テストでき、child を有効化する際に最も重要な「分岐が正しいか」を自動で担保できます。パーサ側も同じ考え方でレジストリ化しています。

**4. 撮影往復での画像消失の修正（第11章）**

調査で「モバイル運用が主導線なら18歳未満対応と同格の優先度」と評価した問題です。IndexedDB への一時退避という、Firestore / Storage のデータ構造に一切影響しない方式で解決できました。

### 21.2 想定外だった発見

テストを書く過程で、**ページ2の「支給決定期間①」に認定有効期間の値が入る既存バグ**を発見しました（第5.3章）。期間の抽出がテキスト全体の先頭から探しており、帳票上「支給決定期間」より手前にある「認定有効期間」を先に拾っていたものです。

ラベル起点の探索に変え、ラベルが欠けた場合は従来動作へフォールバックする形で修正しました。**今回唯一、adult の抽出結果が変わりうる変更**ですが、変わるのは従来が誤っていたケースだけです。

なお、**既に保存済みのデータは自動修正されません**。該当する受給者は編集画面での手修正か再取込が必要です（R-3）。

### 21.3 品質

| 項目 | 結果 |
|---|---|
| TypeScript | エラー 0（web / functions とも） |
| ESLint | 72問題 → **19問題**（error 30 → 8）。今回の変更由来は**0件** |
| Next.js Build | 成功 |
| テスト | **22件 / 22件 PASS**（既存3件 + 新規19件） |
| adult回帰 | コード上・ビルド上で10項目すべて確認。実データを伴う確認は未実施 |

### 21.4 正直に申し添えること

- **実データを伴う動作確認はできていません**。本番Firestoreへの書き込みが禁止されているためです。第15.4章に確認シナリオを用意したので、`npm run dev` で一通り確認してください。特に **B. 旧データ互換** と **D. スマホ撮影の画像保持** は、コードだけでは保証しきれない部分です。
- **Git履歴には個人情報が残っています**（R-1）。作業ツリーは匿名化しましたが、過去コミットの書き換えは指示により行っていません。対処するかどうかはユーザーの判断が必要です。
- **PIIログの修正はデプロイして初めて有効になります**（R-2）。child の実機OCRサンプルを収集する前に、Functions のデプロイをお願いします。

### 21.5 次にやること

**READY WITH CONDITIONS** — コード側の土台は整いました。

残る条件は2つ、いずれも**情報・素材の準備**です。

1. **18歳未満の実物様式の確認**（特に8ページ目。現在のサンプルは1ページ目の複製）
2. **18歳未満の実機OCRサンプルの収集**（各ページ2〜3枚。PIIログ修正のデプロイ後に）

この2つが揃えば、第20.4章の6ステップで child を有効化できます。様式が adult と同一であれば、実質的な作業は**パーサの実装のみ**です。
