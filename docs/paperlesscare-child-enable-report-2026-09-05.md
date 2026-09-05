# PaperlessCare 実装報告：18歳未満受給者証の選択有効化（feature flag）

> 対象リポジトリ: `/Users/rkita/Desktop/React/PaperlessCare/paperlesscare-web`
> 実施日: 2026-09-05
> 作業ブランチ: `main`
> 作業開始時HEAD: `4257d660 共通parser基盤と安全なfallbackを実装`
> **デプロイ・本番操作・git add・commit・push は一切行っていません。** `cors.json` にも触れていません。

---

## 1. 実装概要

### 1.1 目的

Phase 2 で実装した child layout を画面上で動作確認できるようにするため、**feature flag を有効化して「障害福祉サービス受給者証（18歳未満）」を帳票種別選択画面から選べるようにする**こと。

### 1.2 変更内容

| # | 変更 | ファイル |
|---|---|---|
| **1** | child の `enabled` を `false` → `true`、`statusLabel` を `"今後実装予定"` → `""`（**実装変更はこの2行のみ**） | `constants/certPages.ts` |
| **2** | 旧仕様（child無効）を固定していたテスト4件を新仕様へ更新 | `constants/certLayoutVariant.test.ts` / `lib/parsers/fallbackSafety.test.ts` |
| **3** | 有効化に伴い必要になった確認テスト2件を追加 | `constants/certLayoutVariant.test.ts` |

**UI・layout・parser・Firestore のコードは一切変更していません。**

### 1.3 最終判定

# CHILD ENABLED

| 成功条件 | 結果 |
|---|---|
| 実装前のテストが、新仕様への正当な更新を除いてすべてPASS | **達成**（62件中58件は無変更のままPASS、4件を新仕様へ更新） |
| 新規テストを含む全テストがPASS | **達成**（66 / 66） |
| `child.enabled === true` | **達成** |
| adult と child が選択可能 | **達成**（`["adult", "child"]`） |
| mobility 等の状態に意図しない変更がない | **達成**（mobility は `enabled: false` のまま。テストで固定） |
| child page6 の差分layoutが維持されている | **達成**（`planSupportWithContact`） |
| adult layout に変更がない | **達成**（Phase 2 の差分のみ。今回の追加変更なし） |
| parser関連コードに変更がない | **達成**（`parseCertText.ts` / `adult/` / `common/` すべて差分ゼロ） |
| child parser が未実装のまま | **達成**（registry は `child: {}`。テストで固定） |
| 安全なfallbackが維持されている | **達成**（テスト11件がPASS） |
| TypeScriptエラーなし | **達成**（root / functions とも 0） |
| production build成功 | **達成** |
| 今回の変更による新規lint問題なし | **達成**（変更ファイルの指摘 0件、全体件数も 18件で変化なし） |
| `cors.json` を変更していない | **達成**（差分ハッシュ一致） |
| デプロイ未実施 | **達成** |

---

## 2. 実装前の状態

### 2.1 ブランチとHEAD

```
ブランチ : main
HEAD     : 4257d660 共通parser基盤と安全なfallbackを実装
```

### 2.2 作業開始時の `git status`

```
 M cors.json                                                        ← ユーザーの既存変更
 M src/app/t/[tenantId]/components/certLayouts.tsx                  ← Phase 2
 M src/app/t/[tenantId]/constants/certLayoutMap.test.ts             ← Phase 2
 M src/app/t/[tenantId]/constants/certLayoutMap.ts                  ← Phase 2
?? docs/paperlesscare-layout-foundation-phase2-report-2026-09-05.md ← Phase 2
?? src/app/t/[tenantId]/constants/certLayoutVariant.test.ts         ← Phase 2
```

### 2.3 Phase 2 の未コミット変更

**Phase 2 の変更は作業ツリーに存在し、すべて保持しています。** 削除・復元・上書きのいずれも行っていません。

| ファイル | 状態 |
|---|---|
| `components/certLayouts.tsx` | 保持（今回の追加変更なし） |
| `constants/certLayoutMap.ts` | 保持（今回の追加変更なし） |
| `constants/certLayoutMap.test.ts` | 保持（今回の追加変更なし） |
| `constants/certLayoutVariant.test.ts` | 保持（今回、feature flag テストのみ更新） |
| `docs/paperlesscare-layout-foundation-phase2-report-2026-09-05.md` | 保持 |

### 2.4 `cors.json` の保護状況

作業開始時に差分の内容ハッシュを記録し、完了後に照合しました。

```
開始時: 49f3c333e94da90cac182c90b74bee1dca98d1795fccaf1c4426621fce11aac2
完了時: 49f3c333e94da90cac182c90b74bee1dca98d1795fccaf1c4426621fce11aac2
→ 完全一致
```

**変更・復元・ステージング・上書きのいずれも行っていません。**

### 2.5 実装前のテスト件数と結果

```
$ npm test
ℹ tests 62
ℹ suites 0
ℹ pass 62
ℹ fail 0
```

**62 / 62 PASS**。依頼文の想定と一致しました。

| 項目 | コマンド | 結果 |
|---|---|---|
| root TypeScript | `npx tsc --noEmit` | PASS（エラー0） |
| functions TypeScript | `npx tsc -p functions/tsconfig.json --noEmit` | PASS（エラー0） |
| プロジェクト全体lint | `npm run lint` | 18問題（error 8 / warning 10）※既存由来 |

パッケージマネージャは `package-lock.json` のみ存在するため **npm** を使用しました。

### 2.6 実装前の child 設定

```ts
{
  id: "child",
  label: "障害福祉サービス受給者証（18歳未満）",
  shortLabel: "障害福祉サービス受給者証（18歳未満）",
  colorName: "黄緑色の受給者証",
  themeClass: "cert-type-green",
  enabled: false,          // ← 今回の変更対象
  statusLabel: "今後実装予定",
}
```

---

## 3. feature flag変更

### 3.1 変更ファイル

`src/app/t/[tenantId]/constants/certPages.ts`

### 3.2 変更前後

```diff
     colorName: "黄緑色の受給者証",
     themeClass: "cert-type-green",
-    enabled: false,
-    statusLabel: "今後実装予定",
+    enabled: true,
+    statusLabel: "",
```

**実装コードの変更はこの2行のみです**（`2 insertions(+), 2 deletions(-)`）。
`enabled` が有効化本体、`statusLabel` は追加のご依頼によるバッジ削除です（第3.5章）。

### 3.3 選択UIへの反映方法

取込画面（`src/app/t/[tenantId]/page.tsx:635-647`）は `CERT_TYPES` の `enabled` を直接参照しています。

```tsx
{CERT_TYPES.map((type) => {
  const active = selectedCertType === type.id;
  const disabled = !type.enabled;          // ← ここが false になる

  return (
    <button
      disabled={disabled}                   // ← ボタンが押せるようになる
      onClick={() => {
        if (disabled) return;               // ← 早期リターンも通過する
        setSelectedCertType(type.id);       // ← selectedCertType が "child" になる
      }}
      className={`... ${type.themeClass} ...`}   // ← cert-type-green がそのまま適用される
    >
```

`enabled: true` にするだけで、

- child の選択ボタンが `disabled` ではなくなる
- クリックで `selectedCertType` が `"child"` になる
- 既存の `themeClass`（`cert-type-green`）がそのまま適用される
- 以降の描画は Phase 2 の child layout mapping（`CHILD_LAYOUT_IDS`）を通る

という流れがすべて成立します。

### 3.4 UI側の追加変更が必要だったか

## **不要でした。**

選択UIは `enabled` を正しく参照する設計になっており、`page.tsx` には**一切変更を加えていません**（差分ゼロ）。

### 3.5 補足：`statusLabel` は追加のご依頼で削除しました

当初は「原則 `enabled` の1行だけ」という範囲に従い `statusLabel: "今後実装予定"` を残していましたが、
**選択可能なカードに「今後実装予定」バッジが残るのは表示として矛盾する**ため、追加のご依頼を受けて削除しました。

```diff
-    statusLabel: "今後実装予定",
+    statusLabel: "",
```

取込画面は `{type.statusLabel && (...)}`（`page.tsx:657`）でバッジを描画しているため、
空文字にするだけで非表示になり、**UI側の変更は不要**でした。
これで child のカードは adult と同じくバッジなしで表示されます。

mobility は未実装のままのため、`statusLabel: "今後実装予定"` を維持しています。

---

## 4. テスト変更

### 4.1 更新したテスト（4件）

`enabled` を変更した結果、旧仕様（child無効）を固定していた**ちょうど4件**が失敗しました。いずれも今回の仕様変更と正面から矛盾するテストです。

#### (1) `constants/certLayoutVariant.test.ts`

| | 変更前 | 変更後 |
|---|---|---|
| テスト名 | `feature flag: child.enabled は false のまま` | `feature flag: child.enabled は true で選択可能` |
| 期待値 | `child.enabled === false` | `child.enabled === true` |

| | 変更前 | 変更後 |
|---|---|---|
| テスト名 | `feature flag: 選択可能な種別に child が含まれない` | `feature flag: 選択可能な種別に adult と child が含まれる` |
| 期待値 | `selectable === ["adult"]` かつ child を含まない | `selectable === ["adult", "child"]` |

| | 変更前 | 変更後 |
|---|---|---|
| テスト名 | `feature flag: child のレイアウトは無効でも内部的には解決できる（テスト用の経路）` | `feature flag: child を有効化しても page6 の差分レイアウトが維持されている` |
| 期待値 | `child.enabled === false` ＋ child page6 が `planSupportWithContact` | `child.enabled === true` ＋ child page6 が `planSupportWithContact` ＋ **adult page6 が `planSupport` のまま**（検証を1つ追加） |

#### (2) `lib/parsers/fallbackSafety.test.ts`

| | 変更前 | 変更後 |
|---|---|---|
| テスト名 | `child は無効のまま（enabled = false を維持）` | `child は選択可能（enabled = true）だが、専用パーサは未実装のまま` |
| 期待値 | `child.enabled === false` | `child.enabled === true` ＋ **child 全8ページで parser が未登録** ＋ **page1 で人物フィールドが汚染されない** |

### 4.2 変更理由

これら4件は「child はまだ選択できない」という**今回まさに変更対象とした仕様**を固定していました。`enabled: true` にすると必然的に矛盾するため、**同じ目的を保ったまま期待値を新仕様へ更新**しています。

特に `fallbackSafety.test.ts` のテストは、単に期待値を反転させるのではなく、**「有効化された今こそ重要になる不変条件」**（parser未実装でも人物フィールドを汚染しない）を追加で固定する形に強化しました。

### 4.3 削除・skip・無効化していないこと

| 確認項目 | 結果 |
|---|---|
| テストの削除 | **していません**（件数は 62 → 66 で増加） |
| `skip` / `todo` の付与 | **していません** |
| assertion のコメントアウト | **していません** |
| lint設定・テスト設定の緩和 | **していません** |
| 期待値変更の範囲 | **child有効化に直接関係する4件のみ**。他58件は無変更のままPASS |

各テストには「【仕様変更に伴い更新したテスト】」というコメントを入れ、変更理由が分かるようにしています。

### 4.4 追加したテスト（4件）

依頼文5.1の「mobility等の状態は意図せず変わっていない」「adultは引き続き有効」を明示的に固定するため、2件追加しました。

| テスト | 検証内容 |
|---|---|
| `feature flag: mobility は引き続き無効（今回の有効化で状態が変わっていない）` | `mobility.enabled === false` |
| `feature flag: adult は引き続き有効` | `adult.enabled === true` |
| `feature flag: 選択可能な種別には「今後実装予定」バッジを出さない` | `enabled === true` の種別は `statusLabel === ""` であること |
| `feature flag: 未実装の mobility にはバッジが残っている` | `mobility.statusLabel === "今後実装予定"` |

---

## 5. 動作仕様

### 5.1 帳票種別の選択可否

| 種別 | `enabled` | 選択可否 | 変更 |
|---|---|---|---|
| 移動支援・地域活動支援（mobility） | `false` | **選択不可**（「今後実装予定」バッジ・グレーアウト） | **変更なし** |
| 障害福祉サービス受給者証（18歳以上）（adult） | `true` | **選択可能** | **変更なし** |
| **障害福祉サービス受給者証（18歳未満）（child）** | **`true`** | **選択可能**（今回有効化） | **`false` → `true`** |

### 5.2 child page1〜7 のlayout

Phase 2 の mapping がそのまま使われます。

| pageIndex | ページ | child のレイアウト | adult との関係 |
|---|---|---|---|
| 0 | page1 | `certificate1` | **共通** |
| 1 | page2 | `careBenefit1` | **共通** |
| 2 | page3 | `careBenefit2` | **共通** |
| 3 | page4 | `trainingBenefit` | **共通** |
| 4 | page5 | `certificate2` | **共通** |
| 5 | page6 | **`planSupportWithContact`** | **child専用** |
| 6 | page7 | `userBurden` | **共通** |

### 5.3 child page6 の差分

**維持されています。** child の page6 にのみ、（予備欄）の直下に「問い合わせ先」欄が表示されます（既存の `contactInfo` フィールドを使用）。adult の page6 には表示されません。

### 5.4 child parser は未実装

**未実装のままです。** `CERT_PAGE_PARSERS.child` は `{}` で、registry に変更はありません。

### 5.5 safe fallback の維持

Phase 1 の安全なfallbackがそのまま効きます。

```
child のどのページを取り込んでも
  → 専用parserが未登録
  → 許可リスト（FALLBACK_ALLOWED_PAGES）にも無い
  → emptyFormData() を返す
  → 人物フィールド（name / birthday / address / furigana / child*）は空のまま
```

**つまり child を選択して取り込むと、OCRは実行されるものの項目は自動入力されず、画面上で手入力する**動作になります。誤った値が人物フィールドへ入ることはありません（テスト11件で検証済み）。

### 5.6 page8 の既存状態

**変更していません。** adult / child とも `userBurden` レイアウトで表示されます。page8 の正式様式は未確認のままです（テストで固定）。

---

## 6. 検証結果

| 確認項目 | 実行コマンド | 結果 |
|---|---|---|
| 実装前テスト | `npm test` | **PASS**（62 / 62） |
| feature flagテスト | `npm test`（feature flag 7件＋parser側1件） | **PASS**（8 / 8） |
| layout関連テスト | `npm test`（adult回帰・child共通・child page6・page8 計15件） | **PASS**（15 / 15） |
| parser安全性テスト | `npm test`（安全fallback 11件＋registry 4件） | **PASS**（15 / 15） |
| 全テスト | `npm test` | **PASS**（**66 / 66**） |
| root TypeScript | `npx tsc --noEmit` | **PASS**（エラー0） |
| functions TypeScript | `npx tsc -p functions/tsconfig.json --noEmit` | **PASS**（エラー0） |
| 変更ファイルlint | `npx eslint <変更3ファイル>` | **PASS**（指摘0件） |
| プロジェクト全体lint | `npm run lint` | **FAIL（既存由来）**／18問題。実装前と**同数** |
| production build | `rm -rf .next && npm run build` | **PASS** |

### 6.1 テスト件数

| 区分 | 件数 |
|---|---|
| 実装前 | **62** |
| 更新（期待値変更・削除ではない） | 4 |
| 新規追加 | 4 |
| 実装後 総数 | **66** |
| PASS | **66** |
| FAIL | **0** |

### 6.2 lint件数の比較

| | 実装前 | 実装後 | 差 |
|---|---|---|---|
| プロジェクト全体 | 18（error 8 / warning 10） | **18（error 8 / warning 10）** | **±0** |
| 今回の変更3ファイル | — | **0件** | — |

```
プロジェクト全体lint：FAIL（既存由来 / error 8件はすべて今回未変更のファイル）
今回の変更ファイルlint：PASS（指摘0件）
実装前後のlint件数：18 → 18（増加なし）
```

残る18件は `AppShell.tsx` / `UnhandledRejectionGuard.tsx` / `LoginClient.tsx` / `LogoutClient.tsx` / `SignupClient.tsx` / `beneficiaries/page.tsx` / `capture/page.tsx` / `SideNav.tsx` / `PageTabs.tsx` / `certLayouts.tsx` / `page.tsx` のもので、`no-explicit-any`・`react-hooks/set-state-in-effect`・`no-img-element`・`no-unused-vars` です。**いずれも今回触っていないファイルの既存指摘**です。

---

## 7. 変更ファイル一覧

### 7.1 今回新しく追加した変更（3ファイル）

| ファイルパス | 変更内容 | 変更理由 |
|---|---|---|
| `src/app/t/[tenantId]/constants/certPages.ts` | child の `enabled` を `false` → `true`（1行） | 帳票種別選択画面から18歳未満を選べるようにするため |
| `src/app/t/[tenantId]/constants/certLayoutVariant.test.ts` | feature flag テスト3件を新仕様へ更新／mobility・adult の状態確認テスト2件を追加 | 旧仕様（child無効）を固定していたテストの更新と、意図しない状態変化の検知 |
| `src/app/t/[tenantId]/lib/parsers/fallbackSafety.test.ts` | `child は無効のまま` → `child は選択可能だが専用パーサは未実装のまま` へ更新（parser未登録・人物フィールド非汚染の検証を追加） | 同上。有効化後に重要となる不変条件を強化 |

### 7.2 Phase 2 の既存未コミット変更（保持・今回の追加変更なし）

| ファイルパス | 状態 |
|---|---|
| `src/app/t/[tenantId]/components/certLayouts.tsx` | **保持**（今回差分なし） |
| `src/app/t/[tenantId]/constants/certLayoutMap.ts` | **保持**（今回差分なし） |
| `src/app/t/[tenantId]/constants/certLayoutMap.test.ts` | **保持**（今回差分なし） |
| `docs/paperlesscare-layout-foundation-phase2-report-2026-09-05.md` | **保持** |

> `certLayoutVariant.test.ts` は Phase 2 で新規作成されたファイルですが、今回 feature flag テスト部分のみ更新しています。それ以外（adult回帰・child共通・child page6・page8）は無変更です。

### 7.3 ユーザーの既存変更（保護）

| ファイルパス | 状態 |
|---|---|
| `cors.json` | **未変更**（差分ハッシュ一致で確認） |

### 7.4 新規作成

| ファイルパス | 内容 |
|---|---|
| `docs/paperlesscare-child-enable-report-2026-09-05.md` | 本報告書 |

---

## 8. 対象外事項

| # | 事項 | 状態 |
|---|---|---|
| 1 | child parser 未実装 | **確認済み**（`CERT_PAGE_PARSERS.child` は `{}`。テストで固定） |
| 2 | adult parser 変更なし | **確認済み**（`lib/parsers/adult/` に差分ゼロ） |
| 3 | parser registry 変更なし | **確認済み**（`parseCertText.ts` に差分ゼロ） |
| 4 | `parseFallback` / parser helper 変更なし | **確認済み**（`common/helpers.ts` に差分ゼロ） |
| 5 | layout 追加修正なし | **確認済み**（`certLayouts.tsx` / `certLayoutMap.ts` は Phase 2 の差分のみ） |
| 6 | page8 変更なし | **確認済み**（テストで固定） |
| 7 | 新規人物フィールド追加なし | **確認済み**（`types/cert.ts` に差分ゼロ） |
| 8 | `cityCode` 追加なし | **確認済み** |
| 9 | Firestore 変更なし | **確認済み**（`lib/firestore/` に差分ゼロ） |
| 10 | Firebase設定変更なし | **確認済み**（`firebase.json` / `.firebaserc` / rules / indexes すべて差分ゼロ） |
| 11 | Vercel設定変更なし | **確認済み** |
| 12 | CORS設定・`cors.json` 変更なし | **確認済み**（差分ハッシュ一致） |
| 13 | package依存追加なし | **確認済み**（`package.json` / lockfile に差分ゼロ） |
| 14 | サンプル画像変更なし | **確認済み**（`public/` に差分ゼロ） |
| 15 | 警告表示・利用者制限の追加なし | **確認済み**（`page.tsx` に差分ゼロ） |
| 16 | 本番データ操作なし | **確認済み**（本番へ一切接続していません） |
| 17 | デプロイ未実施 | **確認済み** |
| 18 | git add 未実施 | **確認済み** |
| 19 | commit 未実施 | **確認済み** |
| 20 | push 未実施 | **確認済み** |
| 21 | Pull Request 作成なし | **確認済み** |

---

## 9. 最終差分確認

### 9.1 最終HEAD

```
4257d660 共通parser基盤と安全なfallbackを実装
```

**commit していません。** HEAD は作業開始時と同一です。

### 9.2 最終 `git status`

```
 M cors.json                                                        ← ユーザーの既存変更（保護・未変更）
 M src/app/t/[tenantId]/components/certLayouts.tsx                  ← Phase 2（保持）
 M src/app/t/[tenantId]/constants/certLayoutMap.test.ts             ← Phase 2（保持）
 M src/app/t/[tenantId]/constants/certLayoutMap.ts                  ← Phase 2（保持）
 M src/app/t/[tenantId]/constants/certPages.ts                      ← 今回（enabled 1行）
 M src/app/t/[tenantId]/lib/parsers/fallbackSafety.test.ts          ← 今回（テスト更新）
?? docs/paperlesscare-layout-foundation-phase2-report-2026-09-05.md ← Phase 2（保持）
?? docs/paperlesscare-child-enable-report-2026-09-05.md             ← 今回（本報告書）
?? src/app/t/[tenantId]/constants/certLayoutVariant.test.ts         ← Phase 2（今回テスト更新）
```

### 9.3 Phase 2 の変更が保持されていること

| ファイル | 実装前 | 実装後 | 判定 |
|---|---|---|---|
| `certLayouts.tsx` | 52行追加 | 52行追加 | **保持（変化なし）** |
| `certLayoutMap.ts` | 56行追加 | 56行追加 | **保持（変化なし）** |
| `certLayoutMap.test.ts` | 13行追加 | 13行追加 | **保持（変化なし）** |
| `certLayoutVariant.test.ts` | 新規（未追跡） | 新規（未追跡・flagテストのみ更新） | **保持** |
| Phase 2 報告書 | 新規（未追跡） | 新規（未追跡） | **保持** |

**削除・復元・上書きは行っていません。**

### 9.4 今回の変更ファイル

```
src/app/t/[tenantId]/constants/certPages.ts               1 insertion(+), 1 deletion(-)
src/app/t/[tenantId]/constants/certLayoutVariant.test.ts  feature flag セクションのみ更新
src/app/t/[tenantId]/lib/parsers/fallbackSafety.test.ts   21 insertions(+), 2 deletions(-)
docs/paperlesscare-child-enable-report-2026-09-05.md      新規
```

**実装コードの変更は `certPages.ts` の1行のみです。**

### 9.5 `cors.json` の保護状況

```
開始時の差分ハッシュ: 49f3c333e94da90cac182c90b74bee1dca98d1795fccaf1c4426621fce11aac2
完了時の差分ハッシュ: 49f3c333e94da90cac182c90b74bee1dca98d1795fccaf1c4426621fce11aac2
→ 完全一致
```

### 9.6 対象外変更の有無

**ありません。** 以下のファイル群に差分がないことを機械的に確認しました。

```
src/app/t/[tenantId]/lib/parsers/parseCertText.ts
src/app/t/[tenantId]/lib/parsers/adult/
src/app/t/[tenantId]/lib/parsers/common/
src/app/t/[tenantId]/lib/firestore/
src/app/t/[tenantId]/types/
src/app/t/[tenantId]/page.tsx
firebase.json / .firebaserc / firestore.rules / storage.rules / firestore.indexes.json
package.json / package-lock.json
public/
```

### 9.7 デプロイしていないこと

以下のコマンドは**1つも実行していません**。

```
firebase deploy（全形式）／ npm --prefix functions run deploy
vercel ／ vercel --prod
git add ／ git commit ／ git push
gsutil ／ gcloud
```

実行したのは以下のローカルコマンドのみです。

```
git status / git log / git diff   （読み取りのみ）
npm test
npx tsc --noEmit
npx tsc -p functions/tsconfig.json --noEmit
npm run lint / npx eslint <ファイル>
npm run build
```

**デプロイは依頼者側で実施してください。** 今回の変更は `src/` のみのため、必要なのは**フロントエンド（Vercel）の反映のみ**で、Cloud Functions の再デプロイは不要です。

---

## 10. 動作確認の際の注意

キタ様が画面で確認される際の想定挙動です（実装上の制約であり、不具合ではありません）。

| # | 内容 |
|---|---|
| **1** | **child のカードからは「今後実装予定」バッジが消えています。** 追加のご依頼で `statusLabel` を空にしました（第3.5章）。未実装の mobility にはバッジが残ります |
| **2** | **child ではOCR後も項目が自動入力されません。** child 専用parserが未実装のため、安全なfallbackにより空フォームが返ります。各項目は ✎ ボタンから手入力してください |
| **3** | **child page6 に「問い合わせ先」欄が表示されます。** adult page6 には表示されません。これが Phase 2 の確認ポイントです |
| **4** | **page8 は adult / child とも「利用者負担に関する事項」のレイアウトで表示されます。** 正式様式が未確認のための暫定状態です |
| **5** | **保存・一覧・編集は adult と同じ仕組みで動作します。** `certType: "child"` として保存され、一覧では「黄緑色の受給者証」と表示されます |
