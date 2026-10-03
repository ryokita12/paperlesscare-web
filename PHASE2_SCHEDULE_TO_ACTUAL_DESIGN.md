# PaperlessCare Phase 2「予定 → 実績」実装設計

- 作成日：2026-10-04
- 対象コード：`origin/main` = `d8af33aa`（Phase 1 完了時点・Production 相当）
- 種別：調査・設計レポート（**コード変更・commit・push・deploy は行っていない**）

---

## 0. 結論（先に要点）

1. **「予定／実績」に相当する既存実装はゼロ**。データモデル・画面・モックとも存在しない。存在するのは「開発中」表示だけ（サイドメニュー「スケジュール」「実績管理」、カルテのタブ「利用予定」「実績」）。そのため **既存データとの移行・互換の問題はない**。
2. 推奨データモデルは **`tenants/{tenantId}/usageRecords/{YYYY-MM-DD}_{beneficiaryId}`**。
   **1件 =「1人の子の1日の利用」**で、その1件が `scheduled → attended / absent / cancelled` と状態遷移し、最後に「実績確定（confirmed）」される。予定と実績を別データに分けない。
3. 置き場所は **テナント直下のサブコレクション**（利用者配下でも、日付ドキュメント配下でもない）。理由は「今日の一覧（日付で全員分）」と「利用者別の月間（利用者で1か月分）」の両方を、**複合インデックスなし・collectionGroup なし**で引けるから。
4. 曜日固定の予定は **利用者doc に「基本の利用曜日（usagePlan）」を持たせ、月単位で usageRecords を一括生成**する（テンプレート → 実体化）。Cloud Functions のスケジューラは使わない。
5. 画面は **管理Web：「今日の利用」「利用予定（月間表）」「実績（月次の確認・確定）」**を新設し、カルテの「利用予定」タブを有効化。**LINEスタッフ版：TOP に「今日の利用」を追加**し、来所／欠席をワンタップで記録。
6. **Functions・Index の変更は不要**。**Rules は usageRecords の match 追加が必須**（既存 match は変更しない）。

---

## 1. 現在の Git 状態

| 項目 | 値 |
|---|---|
| メインのチェックアウト（`paperlesscare-web/`） | branch `main`、HEAD `639bf513`（**origin/main より 2 commit 遅れ**） |
| `origin/main` | `d8af33aa` feat: complete chart operations (Phase 1-C) ← その1つ前 `b46e3443`（Phase 1-B7） |
| `d8af33aa` を持つ作業場所 | worktree `.claude/worktrees/phase1c-chart-operations`（branch `feat/phase1c-chart-operations` = `d8af33aa`）。**本調査はこの worktree のコードで実施** |
| メインのチェックアウトの未追跡ファイル | `.claude/`、`PHASE1A_PHASE1B_INTEGRATION_REPORT.md`、`PHASE1A_PRODUCTION_RELEASE_REPORT.md`、`docs/paperlesscare-staff-certificate-guide-2026-10-02.{png,pptx}` |
| stash | `stash@{0}: On main: local cors change before pulling phase2`（以前からあるもの。触っていない） |
| worktree | 7個（line-mobile-ux / line-staff / phase1b-tsusho-b1b2 / phase1b3-tsusho-hidden（locked）/ phase1b7-chart-review / phase1c-chart-operations ほか） |

**Phase 2 実装開始前に必要な準備**：メインのチェックアウトで `git pull --ff-only`（`639bf513 → d8af33aa` の fast-forward）を行い、`main` から `feat/phase2-...` を切る。未追跡のレポート類と stash は Phase 2 と無関係なので触らない。

---

## 2. Phase 1 の現在構造

### 2.1 アプリ構成

| 区分 | 場所 | 認証 | Firestore へのアクセス |
|---|---|---|---|
| 管理Web | `src/app/t/[tenantId]/...`（`AppShell` + `SideNav`） | メール/パスワード | クライアントSDKで直接（Rules で保護） |
| LINEスタッフ版 | `src/app/line/...`（LIFF、1カラム、`max-w-md`） | LINE ID token → Functions `lineSignIn` → Custom Token（uid = `line_{sub}`） | **管理Webと同じクライアントSDK・同じ Rules**（`users/{uid}.tenantId` で判定） |
| Cloud Functions | `functions/src/index.ts`、`functions/src/line/*` | — | OCR（`ocrFromImageData`）と LINE 認証・認証キー管理のみ。業務データの読み書きはしない |
| デプロイ | Vercel（Web）＋ Firebase（Rules/Functions/Storage）。Firebase Hosting は不使用 | | |

ポイント：**LINE スタッフも管理Webと同じ Rules で業務データを直接読み書きしている**。Phase 2 で LINE から出欠を記録する場合も、新しい Functions は不要で、Rules に usageRecords を足せばそのまま使える。

### 2.2 ロジックの置き方（Phase 1 の流儀）

- Firebase 非依存の純粋ロジック：`src/lib/beneficiaryChart/*.ts`（`model.ts`、`actionItems.ts`、`chartHistory.ts`、`dates.ts` …）＋ `*.test.ts`（`node --test`）
- Firestore アクセス：`chartStore.ts`、`documentsStore.ts`（`runTransaction` / `writeBatch`）
- 派生データは保存しない（例：「要対応」は毎回計算。`actionItems.ts` 冒頭コメント）
- 日付は **"YYYY-MM-DD" 文字列**、「今日」は `toJapanIsoDate()`（Asia/Tokyo 固定）
- 1事業所 数十〜百人前提で、一覧は全件読み込み＋画面内絞り込み

Phase 2 も同じ流儀（`src/lib/usage/` に純粋ロジック＋store）で作るのが最も自然。

---

## 3. 現在の Firestore データモデル

```
users/{uid}                                    tenantId, role?, authProvider?("line"), displayName …   … Rules の判定元（client 書込不可）
tenants/{tenantId}                             name, staffAuthKeyHash, staffAuthKeyEnabled …          … client アクセス不可（Admin SDK のみ）
  beneficiaries/{beneficiaryId}                … 利用者（カルテ本体）
    profile{name,furigana,birthday}            … 旧来の写し（一覧・LINE が読む）
    summary{...}                               … 受給者証から作る要約
    personal{name,furigana,birthDate,postalCode,address,phone,usageStatus}   … カルテの正本（usageStatus: active/suspended/ended）
    guardian{...} contract{contractDate,startDate,endDate,contractedAmount,providerEntryNumber,contractStatus}
    school{...} consultationSupport{...}
    currentCertificateId, certificateCount, certType, status("active"|"inactive"), pages(旧データ)
    lastChartHistoryId, createdBy/At, updatedBy/At
    certificates/{certificateId}               … 受給者証（1:N）certType, pages, summary, validFrom, validTo, status, supersededBy, chartReview …
    documents/{documentId}                     … 書類（type 4種、storagePath、status submitted/notSubmitted、submittedAt、memo）
    chartHistory/{historyId}                   … カルテ変更履歴（追記のみ、getAfter で利用者doc と同時書込を強制）
staffAuthKeys/{keyHash}  lineUsers/{lineUserId}  lineAuthAttempts/{lineUserId}   … Admin SDK のみ
```

- **document ID**：利用者・受給者証・書類・履歴はすべて自動ID（`doc(collection).id`）。決定的IDの前例は `certificates/legacy`（`LEGACY_CERTIFICATE_ID`）と `users/line_{sub}`。
- **tenant 分離**：パス `tenants/{tenantId}/...` ＋ Rules で `get(users/{uid}).data.tenantId == tenantId`。tenant doc 自体は client 不可。
- **ロール**：管理者とスタッフの区別は `authProvider == "line"` の有無のみ。**Rules 上は管理者もLINEスタッフも同権限**（Functions 側の `requireTenantAdmin` だけが管理者を区別）。
- **Index**：`firestore.indexes.json` は空（`indexes: []`）。すべて単一フィールドの自動インデックスで動いている。
- **Rules の末尾**：`match /{document=**} { allow read, write: if false; }`（全拒否）。**新しいコレクションは match を書かない限り一切読めない**。

### 支給量・期間に関係する既存データ（Phase 2 で参照価値あり）

| データ | 場所 | Phase 2 での使い道 |
|---|---|---|
| 支給量（日/月） | 通所受給者証 pages → `extractTsushoServices()` の `daysPerMonth`（`src/lib/tsusho/services.ts`、保存しない派生値） | 月の予定日数が支給量を超えたら警告 |
| 受給者証の有効期間 | `certificates/{id}.validFrom / validTo` | 期間外の日に予定を入れたら警告 |
| 契約期間・契約支給量 | `contract.startDate / endDate / contractedAmount`（自由記述） | 契約期間外の警告、表示 |
| 利用状況 | `personal.usageStatus`（active/suspended/ended）、旧 `status`（active/inactive） | 休止・終了の子を予定の一括作成から除外 |

---

## 4. 既存画面構成

### 4.1 管理Web

| 画面 | パス | 内容 |
|---|---|---|
| TOP（ログイン後の着地点） | `/t/{tenantId}` | **受給者証取込（`CertImportFlow`）**。`LoginClient` が `/t/{tenantId}` へ遷移 |
| 利用者管理 | `/t/{tenantId}/beneficiaries` | 一覧（氏名・年齢・学年・受給者証状態・期限・要対応）、検索、要対応フィルタ、受給者証なし登録 |
| 利用者カルテ | `/t/{tenantId}/beneficiaries/{id}?tab=` | タブ：基本情報 / 受給者証 / 契約・関係先 / 書類 / 変更履歴。**開発中タブ：利用予定・支援記録・支援計画・モニタリング・実績** |
| 撮影 | `/t/{tenantId}/capture` | 取込用 |
| システム設定 | `/t/{tenantId}/settings` | LINEスタッフ認証キー |
| サイドメニュー開発中項目 | — | **スケジュール・支援記録・支援計画・実績管理・帳票・スタッフ管理** |

- 日付・カレンダー・日次業務・利用状況に関する画面は**存在しない**。
- UI 部品：`beneficiaries/components/chartUi.tsx`（`primaryButtonClass`、`secondaryButtonClass`、`inputClass`、`SectionCard`、`FormField`、`InfoGrid`、`ResultNotice`、`PlannedBadge`、`ActionCountBadge` 等）。カードは `rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5` が基本トーン。
- `AppShell` はスマホ幅でハンバーガー＋ドロワーになるレスポンシブ構成。

### 4.2 LINEスタッフ版

| 画面 | パス | 内容 |
|---|---|---|
| TOP | `/line/home` | 「こんにちは、◯◯さん／今日は何をしますか？」＋ `LineChoiceTile` 2枚（受給者証を登録する／利用者を確認する） |
| 利用者一覧・検索 | `/line/beneficiaries`（`BeneficiaryPicker`、`listBeneficiaries` を全件取得し inactive を除外） | |
| 利用者詳細 | `/line/beneficiaries/{id}` | 氏名・現在の受給者証・更新ボタン・基本情報・以前の証 |
| 受給者証取込 | `/line/import/*`、`/line/register` | |
| UI 部品 | `src/app/line/ui.tsx` | `LineChoiceTile`、`LineButton`、`LineCard`、`LineField`、`LineNotice`、`LinePageHeader`、`LineBackLink`、`LineSpinner`、各アイコン。背景 `#f6faf8`、強調色 emerald |

### 4.3 Phase 2 の組み込み先（分析）

- 管理Web：サイドメニューの開発中項目「スケジュール」「実績管理」が**そのまま Phase 2 の受け皿**。カルテの開発中タブ「利用予定」「実績」も同様。既存の「開発中」表示を「リンク」に置き換えるだけで導線ができる。
- LINE：TOP が「今日は何をしますか？」という構成なので、**「今日の利用」タイルを追加**するのが最も自然。現場で一番使うのは出欠記録になるので、最上段（emphasis）に置くかは仕様判断（§16）。

---

## 5. 予定／実績関連の既存コード調査結果

検索語：schedule / reservation / attendance / usage / service / record / actual / plan / calendar / 利用予定 / 予定 / 実績 / 出欠 / 利用日 / 提供実績 / 欠席 / 曜日 / weekday（`src/`、`functions/src/`、`tests/`、旧スナップショット `src_20260514_1` `src_20260519_1`、`docs/`、README を対象）

| ヒット | 種別 | 内容 |
|---|---|---|
| `SideNav.tsx` `{ kind: "planned", label: "スケジュール" }` `"実績管理"` | 画面（開発中表示のみ） | リンクなし |
| `ChartTabs.tsx` `PLANNED_TABS = ["利用予定", "支援記録", "支援計画", "モニタリング", "実績"]` | 画面（開発中表示のみ） | 押せないタブ |
| `personal.usageStatus`（利用中/休止/利用終了） | データ | 「利用」という語だが、利用者の在籍状態であり日々の利用ではない |
| `contract.contractedAmount`、`daysPerMonth`（通所受給者証の支給量） | データ（派生） | 予定・実績そのものではないが、上限チェックに使える |
| `certPages.ts` 「今後実装予定」、`DocumentsTab` の「持参予定」 | 無関係 | 文言のみ |

**結論：予定・利用・実績のデータモデル、画面、モック、Functions、Rules、Index はいずれも存在しない。** Phase 2 は新規設計でよく、既存データの移行は発生しない。

---

## 6. 置き場所の比較（Firestore 構成案）

前提となる主要な読み取りパターン：

- (Q1) **ある日の全員分**（今日の利用・日次一覧）← 最頻、LINE からも
- (Q2) **ある月の全員分**（月間予定表・月次実績）
- (Q3) **ある利用者のある月**（カルテ・支給量チェック・将来の請求）
- (Q4) 将来：月単位の締め・請求・国保連 CSV（全員×月）

| 案 | パス | Q1 日次 | Q2 月全員 | Q3 利用者×月 | 書込競合 | Rules | 評価 |
|---|---|---|---|---|---|---|---|
| A. 利用者配下 | `tenants/{t}/beneficiaries/{b}/usageRecords/{id}` | ✕ collectionGroup 必須。CG クエリは tenant をパスで絞れず `tenantId` フィールド＋CG 用インデックス＋`match /{path=**}/usageRecords/{id}` の Rules が必要 | ✕ 同左 | ◎ | なし | 複雑（CG は tenant 判定をフィールドに頼る） | 不採用 |
| **B. テナント直下（推奨）** | **`tenants/{t}/usageRecords/{date}_{b}`** | **◎ `where date ==`（自動単一インデックス）** | **◎ `where yearMonth ==`** | **◎ `where yearMonth == && beneficiaryId ==`（等価条件のみ → インデックスマージで複合インデックス不要）** | なし（1人1日1doc） | 既存と同じパス型の tenant 判定 | **採用** |
| C. 日付doc配下 | `tenants/{t}/days/{date}/records/{b}` | ◎ | △ 月31回読み or CG | ✕ CG 必須 | なし | 中 | 不採用 |
| D. 日付docに全員分のマップ | `tenants/{t}/days/{date}` に `{b1:{...}, b2:{...}}` | ◎ 1read | △ | ✕ | **✕ 朝夕に複数スタッフが同じdocを同時更新→競合・1doc/秒の推奨上限** | 個別検証が困難 | 不採用 |
| E. 独立トップレベル | `usageRecords/{id}` + `tenantId` フィールド | ○ | ○ | ○（複合インデックス要） | なし | 既存のパス型分離と不一致、漏れたら他事業所に見える | 不採用 |

**B を推奨する理由（検索性・運用性・拡張性）**

- 検索性：主要クエリがすべて**等価条件のみ**で書け、`firestore.indexes.json` を空のまま運用できる（Phase 1 と同じ）。並び替えは1日最大でも利用者数、1人1か月最大31件なので画面側で行う。
- 運用性：決定的ID `{YYYY-MM-DD}_{beneficiaryId}` により**同じ子の同じ日が二重登録されない**。月の一括作成を途中で失敗して再実行しても重複しない（冪等）。Firestore コンソールでも日付順に並んで追いやすい。
- 拡張性：月次集計・請求・国保連 CSV はいずれも「ある月の全員分（Q2）」から作れる。利用者を削除・統合する将来の運用でも、記録は利用者docの寿命から独立している（請求の証跡として残る）。
- Phase 1 の tenant 分離（パス＋`users/{uid}.tenantId`）をそのまま使える。

**1人1日1件という前提について**：放課後等デイサービスの報酬算定は1日単位で、同日に2回の利用を別々に算定することは通常ない。複数枠（午前・午後など）が必要になった場合は ID に枠を足す（`{date}_{b}_{slot}`）拡張で対応できる。→ §16 で確認事項にしている。

---

## 7. 推奨データモデル

### 7.1 利用記録 `tenants/{tenantId}/usageRecords/{recordId}`

`recordId = "{YYYY-MM-DD}_{beneficiaryId}"`（例：`2026-10-05_Abc123xyz`）

```jsonc
{
  "schemaVersion": 1,
  "beneficiaryId": "Abc123xyz",
  "date": "2026-10-05",          // 日本の暦日（toJapanIsoDate）
  "yearMonth": "2026-10",        // date の先頭7文字（月の検索用。Rules で整合を検証）

  // ── ライフサイクル ──
  "status": "attended",          // scheduled | attended | absent | cancelled
  "origin": "pattern",           // pattern（基本曜日から一括作成）| manual（個別に予定追加）| walkIn（予定外の来所を当日記録）

  // ── 当日の記録（すべて任意。Phase 2 では UI を最小限にする） ──
  "actual": {
    "startTime": "14:30",        // "HH:MM" または ""（来所）
    "endTime": "17:30",          // "HH:MM" または ""（退所）
    "pickup": true,              // 送迎（迎え）null=未入力
    "dropoff": true              // 送迎（送り）
  },
  "absence": {                   // status = absent のときのみ意味を持つ
    "reason": "体調不良",          // 自由記述（200字以内）
    "contactedAt": "2026-10-05"  // 欠席連絡を受けた日（将来の欠席時対応加算の判定材料）
  },
  "note": "",                    // メモ（500字以内）

  // ── 実績確定 ──
  "confirmed": false,            // true = 実績として確定（以後の変更は「確定の取消」が先に必要）
  "confirmedBy": null,           // { uid, email, name }
  "confirmedAt": null,           // serverTimestamp

  // ── 変更の記録（簡易・最大30件）──
  "statusLog": [
    { "from": null, "to": "scheduled", "by": { "uid": "...", "name": "管理者" }, "at": "<Timestamp>" },
    { "from": "scheduled", "to": "attended", "by": { "uid": "line_U...", "name": "山田" }, "at": "<Timestamp>" }
  ],

  "createdBy": { "uid": "...", "email": "...", "name": "..." },
  "createdAt": "<Timestamp>",
  "updatedBy": { "uid": "...", "email": null, "name": "山田" },
  "updatedAt": "<Timestamp>"
}
```

設計上の判断：

- **利用者名は保存しない**（非正規化しない）。表示時に利用者一覧（すでに全件読み込む設計）と `beneficiaryId` で結合し、`resolveChartIdentity()` で氏名を出す。氏名変更時の同期漏れを避ける Phase 1 の「派生データは保存しない」方針と同じ。
  - 例外的に将来「確定後の請求データ」には当時の氏名・受給者番号のスナップショットが必要になるが、それは請求 Phase で月次確定時に作る。
- **`actor` に `name` を追加**：LINE スタッフは email を持たないため（`users/line_*.displayName` = スタッフ氏名）、「誰が来所を記録したか」を画面に出すには氏名が要る。`auth.currentUser.displayName`（Custom Token 発行時に staffName を設定済み）を使う。
- **`statusLog` を doc 内配列にする**：chartHistory のような別コレクション＋`getAfter` 方式は Rules と書込が重くなる。出欠は頻繁に押し直されるので、1回の書込で済む doc 内配列（上限30件、超えたら古いものから落とす）とする。請求時の厳密な監査ログが必要になったら、その Phase で追記専用サブコレクションに切り替える。
- **欠席と取消を分ける**：`cancelled` = 前日までの予定取消（実績に数えない）、`absent` = 当日の欠席（将来の欠席時対応加算の対象になりうる）。現場でも区別して話すため。
- **予定外の来所** = `origin: "walkIn"` で最初から `attended` として作る（予定のない実績を許可）。

### 7.2 基本の利用曜日（曜日固定）`beneficiaries/{b}.usagePlan`

利用者doc にマップを1つ追加（既存フィールドは変更しない。Phase 1-A と同じ「追加のみ」方針）：

```jsonc
"usagePlan": {
  "weekdays": [1, 3, 5],         // 0=日 … 6=土。利用する曜日
  "effectiveFrom": "2026-10-01", // 任意。この日以降に適用（"" = 制限なし）
  "note": "長期休暇中は毎日",       // 任意
  "updatedBy": { ... }, "updatedAt": "<Timestamp>"
}
```

- テンプレートであり、これ自体は実績にならない。**「10月の予定を作成」操作で usageRecords（`status: scheduled, origin: pattern`）を実体化**する。
- 実体化の対象外：`personal.usageStatus` が `suspended`/`ended` の子、旧 `status: inactive` の子、既に doc がある日（**既存の予定・実績は上書きしない**）。
- 曜日の変更は「これから作る月」にだけ効く。作成済みの月を作り直す操作は、`scheduled` かつ `origin: pattern` かつ未確定のものだけを対象にする（手で変えた予定・記録済みの実績は消さない）。
- カルテの変更履歴（chartHistory）への記録は、Phase 2 では行わない案を推奨（`source` の追加で Rules 変更が増えるため）。必要なら §16 で判断。

### 7.3 （Phase 2 では作らない・将来）事業所カレンダー

`tenants/{t}/calendarMonths/{YYYY-MM}`：`closedDates`（事業所休業日）、`schoolHolidayDates`（学校休業日）など。一括作成時に休業日を除外し、学校休業日は別の曜日パターン（長期休暇用）を使う。
（`tenants/{t}` 本体は client 不可なので、サブコレクションとして Rules を追加する形になる）

---

## 8. 状態遷移

```
                     ┌──────────── 予定を戻す ─────────────┐
                     ▼                                       │
  (なし) ──予定追加──▶ scheduled ──来所──▶ attended ─────────┤
     │                 │  │                                  │
     │                 │  └──欠席──▶ absent ─────────────────┤
     │                 └────取消──▶ cancelled ──再予定──▶ scheduled
     │
     └──予定外の来所──▶ attended（origin: walkIn）

  attended / absent ──実績確定──▶ confirmed=true ──確定取消──▶ confirmed=false
```

| from \ to | scheduled | attended | absent | cancelled | 削除 |
|---|---|---|---|---|---|
| （なし） | 予定追加・一括作成 | 予定外の来所 | ✕（予定のない欠席は記録しない） | ✕ | — |
| scheduled | — | 来所 | 欠席 | 取消 | ○（誤登録の修正。未確定のみ） |
| attended | 戻す（押し間違い） | — | 変更 | ✕（来所済みは取消でなく「戻す」） | ✕ |
| absent | 戻す | 変更（遅れて来所） | — | ✕ | ✕ |
| cancelled | 再予定 | ✕ | ✕ | — | ○（未確定のみ） |

- **実績確定（confirmed）は status とは別の軸**。確定できるのは `attended` / `absent` のみ（`scheduled` が残っている日は「未記録」として警告）。`cancelled` は確定対象外（実績に数えない）。
- `confirmed == true` の間は status・actual・absence・note を変更できない（Rules で強制）。変更したいときは「確定を取り消す」→ 修正 → 再確定。
- 遷移ルールは純粋関数 `src/lib/usage/transitions.ts`（`canTransition(from, to)`、`applyTransition(record, to, actor)`）に集約し、画面は判定を持たない（Phase 1-C の actionItems と同じ考え方）。Rules でも status の値域と「確定中は不変」を検証する（遷移表全体を Rules に書くと複雑になるため、遷移表はクライアントの純粋関数＋テストで担保）。

### 予定と実績を「分けない」理由

- 現場の業務は「予定の子が来たか」を確認する作業であり、予定と実績は**同じ子・同じ日**について 1対1 で対応する。分けると「予定はあるのに実績が無い」「実績はあるのに予定が無い」の突き合わせ処理と同期漏れが必ず発生する。
- 決定的ID（`{date}_{b}`）で1件に集約されるため、予定外の来所（walkIn）も同じ形で扱える。
- 「当初の予定が何だったか」は `origin` と `statusLog` で追える。
- 将来、請求のために「確定済み実績のスナップショット」が必要になった場合は、**月次締め時に別データ（例：`billingMonths/{YYYY-MM}`）として派生させる**。日々の運用データ（usageRecords）は1本のままにする。

---

## 9. 管理画面 UI 案

既存の `chartUi.tsx` の部品・カードトーンをそのまま使う。新規のデザイン言語は持ち込まない。

### 9.1 サイドメニュー

```
メニュー
  今日の利用            ← 新設（/t/{t}/today）
  利用者管理
    受給者証を取り込む
  利用予定              ← 「スケジュール（開発中）」を置換（/t/{t}/schedule）
  実績                  ← 「実績管理（開発中）」を置換（/t/{t}/usage）
  支援記録（開発中） 支援計画（開発中） 帳票（開発中）
```

### 9.2 今日の利用 `/t/{t}/today?date=YYYY-MM-DD`

```
今日の利用   ◀ 10月5日（日） ▶   [今日]
┌ 予定 8人 ─ 来所 5 ─ 欠席 1 ─ 未記録 2 ┐（数字タップで絞り込み）
├──────────────────────────────────────┤
│ 北 太郎   小3   予定 → [来所] [欠席] [⋯]│
│ 山田 花子 小5   来所 14:30  ✓ 山田     │
│ 佐藤 次郎 中1   欠席（体調不良）        │
│ ...                                    │
└──────────────────────────────────────┘
[＋ 予定外の来所を追加]       [この日の実績を確定]
```

- 1行 = 1人。ボタン2つ（来所／欠席）で完結。時刻・送迎・欠席理由は「⋯」から開く詳細で任意入力。
- 「この日の実績を確定」は未記録（scheduled）が0人のときに有効。
- 受給者証の期限切れ・カルテの要対応がある子には既存の `ActionCountBadge` を表示（受給者証期限切れの子の利用に気付ける）。

### 9.3 利用予定（月間表） `/t/{t}/schedule?month=YYYY-MM`

```
利用予定  ◀ 2026年10月 ▶      [基本の曜日から10月の予定を作成]
          1水 2木 3金 4土 5日 6月 ...  予定日数 / 支給量
北 太郎    ●     ●        ●   ...    12 / 23
山田 花子     ●     ●         ...    10 / 15
佐藤 次郎  ●  ●  ●            ...    24 / 23 ⚠
```

- 行 = 利用者、列 = 日付。セルタップで 予定あり⇄なし を切替（scheduled の作成／削除、cancelled への変更）。
- 状態をセルの記号で表示（予定 ● / 来所 ✓ / 欠席 × / 取消 —）。過去日は実績、未来日は予定として自然に読める。
- 右端に「予定日数 / 支給量（通所受給者証の daysPerMonth）」。超過は警告表示のみ（保存は止めない）。
- スマホ幅では表が横スクロール。スマホでの主操作は LINE 版の「今日」なので、月間表は PC 前提でよい。

### 9.4 実績（月次） `/t/{t}/usage?month=YYYY-MM`

- 利用者ごとの 来所日数 / 欠席日数 / 未記録 / 確定済み を一覧。未記録・未確定がある日へのリンク。
- 「月の実績を確定」は Phase 2 では作らず、日次確定の集計表示に留める（月次締め・ロックは請求 Phase）。

### 9.5 利用者カルテ「利用予定」タブ

- 開発中タブ「利用予定」を有効化（`CHART_TABS` に `{ id: "usage", label: "利用予定" }` を追加）。開発中タブ「実績」は同じタブに統合し、開発中リストから外す。
- 内容：基本の利用曜日（usagePlan）の表示・編集、今月／前月の利用記録の一覧（日付・状態・時刻）、月の来所日数と支給量。

### 9.6 TOP（着地点）

現在の着地点 `/t/{t}` は受給者証取込。Phase 2 後の日常業務は「今日の利用」が中心になるため、**着地点を `/t/{t}/today` に変える案**がある（受給者証取込の URL `/t/{t}` 自体は変えず、`LoginClient` の遷移先だけ変更）。→ §16 で判断。

---

## 10. LINEスタッフ版 UI 案

### 10.1 TOP

```
◯◯事業所
こんにちは、山田さん
今日は何をしますか？

[🟩 今日の利用        ]  今日 8人の予定（未記録 3人）   ← 新設
[   受給者証を登録する ]
[   利用者を確認する   ]
```

既存 `LineChoiceTile` をそのまま使う。emphasis をどれにするかは §16。

### 10.2 今日の利用 `/line/today`

```
‹ もどる          10月5日（日）
予定 8人 ・ 来所 5 ・ 欠席 1 ・ 未記録 2

┌──────────────────────────┐
│ 北 太郎（小3）              │
│ [   来所   ] [   欠席   ]   │   ← 指で押しやすい大ボタン（LineButton）
└──────────────────────────┘
┌──────────────────────────┐
│ 山田 花子（小5）   ✓ 来所   │
│ 14:30 山田さんが記録  [取り消す]│
└──────────────────────────┘
[＋ 予定にない子が来た]（BeneficiaryPicker を流用）
```

- 押した瞬間に保存（確認ダイアログなし）。押し間違いは「取り消す」で `scheduled` に戻す。
- 欠席を押したら理由の簡易入力（任意・スキップ可）。
- 来所時刻は押した時刻を自動で `actual.startTime` に入れる案（入力操作を増やさない）。→ §16。
- 日付の前後移動は Phase 2 では「今日」と「明日」程度に留める（翌日の予定確認用）。
- **LINE 版では実績確定・月間予定の編集・曜日設定は行わない**（管理Webの役割）。LINE は「当日運用」に専念させる。

---

## 11. Firestore Rules への影響

**必須の変更**：`tenants/{tenantId}` 配下に usageRecords の match を追加（全拒否ルールより前、既存の beneficiaries match の外側・兄弟として）。既存の match は一切変更しない。

骨子（実装時に emulator テストで詰める）：

```
match /tenants/{tenantId}/usageRecords/{recordId} {
  function member() {
    return request.auth != null &&
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.tenantId == tenantId;
  }
  function validShape(d) {
    return d.keys().hasOnly([...許可キー...]) &&
      d.status in ['scheduled', 'attended', 'absent', 'cancelled'] &&
      d.origin in ['pattern', 'manual', 'walkIn'] &&
      d.date is string && d.date.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}') &&
      d.yearMonth is string && d.date.matches(d.yearMonth + '-[0-9]{2}') &&   // yearMonth = date の年月
      recordId == d.date + '_' + d.beneficiaryId &&                // 決定的IDの強制（二重登録防止）
      d.note is string && d.note.size() <= 500 &&
      d.statusLog is list && d.statusLog.size() <= 30 &&
      d.updatedBy.uid == request.auth.uid &&
      d.updatedAt == request.time;
  }
  allow read: if member();
  allow create: if member() && validShape(request.resource.data) &&
    request.resource.data.confirmed == false &&
    exists(/databases/$(database)/documents/tenants/$(tenantId)/beneficiaries/$(request.resource.data.beneficiaryId));
  allow update: if member() && validShape(request.resource.data) &&
    request.resource.data.beneficiaryId == resource.data.beneficiaryId &&
    request.resource.data.date == resource.data.date &&
    (
      resource.data.confirmed == false ||                           // 未確定なら更新可
      // 確定中は「確定の取消」だけ（confirmed 系以外のフィールドは不変）
      (request.resource.data.confirmed == false &&
        request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['confirmed', 'confirmedBy', 'confirmedAt', 'statusLog', 'updatedBy', 'updatedAt']))
    ) &&
    // 確定できるのは来所・欠席のみ
    (request.resource.data.confirmed == false || request.resource.data.status in ['attended', 'absent']);
  allow delete: if member() && resource.data.confirmed == false &&
    resource.data.status in ['scheduled', 'cancelled'];
}
```

- `usagePlan`（利用者doc のマップ）は既存の `beneficiaries/{b}` の read/write 許可で書ける（**Rules 変更不要**）。値の検証を足す場合は利用者doc の write 条件に手を入れることになるため、Phase 2 ではアプリ側の検証に留める案を推奨。
- `get(users)` を1リクエストで複数回呼んでも同一docは1回分の課金・上限計上。`exists(beneficiary)` で +1 読み取り。
- **LINE スタッフも同権限**になる（現行の利用者データと同じ扱い）。「LINE スタッフは確定・確定取消できない」を Rules で強制したい場合は `get(users).data.authProvider != 'line'` 条件を足せる（§16）。
- テスト：`tests/rules/phase2.rules.test.mjs` を新設（既存 26 件は変更なしで PASS を維持）。

---

## 12. Firestore Index への影響

**追加不要**（`firestore.indexes.json` は空のまま）。

| クエリ | 条件 | インデックス |
|---|---|---|
| 日次 | `where("date", "==", d)` | 自動単一フィールド |
| 月全員 | `where("yearMonth", "==", m)` | 自動単一フィールド |
| 利用者×月 | `where("yearMonth", "==", m).where("beneficiaryId", "==", b)` | **等価条件のみ → インデックスマージで自動対応** |
| 並び順 | なし（画面側で date / 氏名順に並べる） | — |

`orderBy` や範囲条件（`date >= … <=`）を組み合わせると複合インデックスが必要になるため、**実装では使わない**ことを設計ルールにする（`yearMonth` フィールドを持たせる理由）。将来、年度集計などで範囲検索が必要になったら、その時点で複合インデックスを1本追加する（`firebase deploy --only firestore:indexes`、Rules と同様に push 前に deploy）。

---

## 13. Cloud Functions への影響

**変更不要**。

- 出欠記録・予定作成・確定はすべてクライアントSDK＋Rules で完結（Phase 1 のカルテ保存と同じ）。
- 月の一括作成は `writeBatch`（1バッチ500件まで）を分割実行。100人×13日 = 1,300件でも3バッチ。途中失敗しても決定的IDなので**再実行で重複しない**。既存doc の上書きを避けるため、事前に `where yearMonth ==` で既存IDを読み、存在しない日だけ `set` する（Rules で `create` と `update` を分けているので、既存docへの意図しない上書きは validShape＋確定チェックで守られる）。
- スケジュール実行（毎日自動で予定生成など）は導入しない。人が「作成」を押す運用の方が、休業日・臨時の変更に強く、誤生成も起きない。
- 将来 Functions が必要になる候補：月次締め（請求データのスナップショット作成）、国保連 CSV 生成、LINE での保護者向け通知。

---

## 14. 既存 Phase 1 への影響

| 対象 | 影響 | 内容 |
|---|---|---|
| 既存 Firestore データ | なし | 新コレクション追加と、利用者doc への `usagePlan` マップ追加のみ。既存フィールドの変更・削除なし |
| 既存 Rules | なし（追加のみ） | 既存 match・全拒否ルールは不変 |
| `normalizeBeneficiaryData` / `readChartSections` | なし | `usagePlan` は別の読み取り関数で扱う（未知フィールドは既存関数が無視する） |
| カルテ保存（chartHistory の getAfter 条件） | **注意** | `usagePlan` の保存は `updatedAt` を更新するが `lastChartHistoryId` は触らない。chartHistory の作成は伴わないので Rules 上の衝突はない。ただし利用者一覧は `orderBy("updatedAt", "desc")` なので、**曜日を保存すると一覧の並び順が上に来る**（許容するか、`usagePlan.updatedAt` だけ更新して利用者doc の `updatedAt` は触らないか → §16） |
| 利用者一覧・LINE 一覧 | なし | 読み取り対象・クエリは変わらない |
| SideNav / ChartTabs | 小 | 開発中項目をリンク／タブに置換 |
| LINE TOP | 小 | タイル1枚追加 |
| `LoginClient` 遷移先 | 判断次第 | 着地点を「今日の利用」に変える場合のみ |
| Functions / Storage Rules / Index | なし | |

---

## 15. 将来拡張への対応

| 将来機能 | 今回のモデルでの受け止め方 |
|---|---|
| 月間利用予定 | `yearMonth` クエリ＋月間表（Phase 2 で実装） |
| 繰り返し予定・曜日固定 | `usagePlan` → 月単位の実体化（Phase 2 で実装） |
| 学校休業日・事業所休業日 | `calendarMonths/{YYYY-MM}` を追加し、実体化時に参照。`usagePlan` に `holidayWeekdays` 等を追加 |
| 振替 | `cancelled` の記録に `transferTo: recordId`、振替先に `transferFrom` を追加（フィールド追加のみ） |
| 送迎・提供時間 | `actual.startTime/endTime/pickup/dropoff` を既に用意。UI を後で拡充 |
| サービス提供記録（支援記録） | `usageRecords/{id}` に紐づくサブコレクション `serviceNotes` または別コレクション（同じ `{date}_{b}` をキーに結合） |
| 欠席時対応加算 | `absence.contactedAt`・`reason` を既に用意。対応内容のフィールドを追加 |
| 加算全般 | `additions: { [code]: true }` マップを追加 |
| 上限管理・支給量 | `daysPerMonth`（通所受給者証）との突き合わせを月間表で表示（Phase 2）→ 上限額管理は請求 Phase |
| 請求・国保連 | 確定済み（`confirmed == true`）の月次データから派生。月次締め時に `billingMonths/{YYYY-MM}` へスナップショット（氏名・受給者番号・単位数）を作り、以後の月は編集ロック |
| 利用者別実績・月次集計 | `yearMonth` ＋ `beneficiaryId` の等価クエリで取得 |
| 複数枠／複数サービス種別 | ID を `{date}_{b}_{slot}` に拡張、`serviceKind`（`houkagoDay` 等、tsusho の区分を流用）を追加 |
| 厳密な監査ログ | `statusLog` から追記専用サブコレクションへ移行 |

`schemaVersion: 1` を最初から入れておき、将来の構造変更時の読み替えを可能にする。

---

## 16. 不明点／仕様決定が必要な項目

優先度の高い順。

1. **1人1日1件で良いか**（同日に2回利用・午前午後の別枠はないか）。→ ID 設計に直結。推奨：1件。
2. **「欠席」と「キャンセル（取消）」の区別**を現場で使い分けるか。推奨：分ける（前日までの連絡＝取消、当日＝欠席）。境界（前日夕方の連絡はどちらか）を決める必要あり。
3. **実績確定の単位と権限**：日次確定（推奨）／利用者ごと確定／月次のみ。LINE スタッフに確定・確定取消を許すか（推奨：管理Webのみ。Rules で `authProvider != 'line'` を強制するか、UI で出さないだけにするか）。
4. **曜日固定（usagePlan）と月一括作成を Phase 2 初期に含めるか**。推奨：含める（含めないと20人×月12日を手入力することになり、実運用に乗らない）。
5. **来所時刻・送迎を Phase 2 で入力させるか**。推奨：データ項目は用意、UI は「来所ボタン押下時刻を自動記録」＋詳細で任意入力。提供実績記録票で必要になる項目なので早めに方針を決めたい。
6. **管理Web の着地点**を受給者証取込から「今日の利用」に変えるか。
7. **LINE TOP の emphasis**（一番目立つタイル）を「今日の利用」に変えるか。
8. **事業所休業日・学校休業日**を Phase 2 で扱うか。推奨：Phase 2 は扱わない（一括作成後に月間表で手で外す）。
9. `usagePlan` 保存時に **利用者doc の `updatedAt` を更新するか**（一覧の並び順に影響）。
10. **支給量超過**は警告のみで良いか（保存を止めない）。推奨：警告のみ。
11. 受給者証の**期限切れ・未登録の子に予定を入れる**ことを許すか。推奨：許す＋警告表示。
12. **予定の過去日編集**をどこまで許すか（例：先月分の未確定記録の修正）。推奨：未確定なら日付を問わず可。

---

## 17. Phase 2 で今回実装すべき範囲（推奨）

**Phase 2 初期スコープ**

1. データ層：`src/lib/usage/`（純粋ロジック＋store）
   - `model.ts`（型・読み取り正規化・ID生成・`yearMonth`）
   - `transitions.ts`（遷移表・確定可否）
   - `pattern.ts`（usagePlan → 対象日の算出、除外条件）
   - `summary.ts`（日次・月次の件数集計、支給量比較）
   - `usageStore.ts`（日次取得・月取得・利用者×月取得・状態変更トランザクション・一括作成・確定）
2. Rules：usageRecords match 追加＋ `tests/rules/phase2.rules.test.mjs`
3. 管理Web：今日の利用 / 利用予定（月間表＋一括作成）/ 実績（月次集計の閲覧）/ カルテ「利用予定」タブ（曜日設定＋月の記録一覧）/ SideNav 更新
4. LINE：TOP タイル追加 / 今日の利用（来所・欠席・取消・予定外の来所）

## 18. 今回あえて実装しないもの

- 事業所カレンダー（休業日・学校休業日）、長期休暇用パターン
- 振替の紐付け
- 月次締め・編集ロック、請求データ、国保連 CSV、上限額管理、加算
- サービス提供記録（支援記録）本文、支援計画、モニタリング
- 帳票（サービス提供実績記録票の出力）
- 保護者向け LINE 通知・保護者による予定申請
- 監査用の追記専用ログ（statusLog で代替）
- スタッフ管理・ロール（管理者／スタッフ）の本格導入
- Cloud Functions・Firestore Index の追加

---

## 19. 実装手順（推奨順序）

各ステップで `npm test`・`npm run lint`・`npm run build` を通し、Rules を含むステップは `npm run test:rules` も通す。

| # | 内容 | 成果物 |
|---|---|---|
| 0 | `main` を `d8af33aa` へ fast-forward、`feat/phase2-schedule-to-actual` を作成 | |
| 1 | 純粋ロジック（model / transitions / pattern / summary）＋ unit test | `src/lib/usage/*.ts`, `*.test.ts` |
| 2 | Rules 追加＋ Rules テスト（tenant 分離・LINE スタッフ・ID 強制・値域・確定中の不変・削除条件・既存26件の回帰） | `firestore.rules`, `tests/rules/phase2.rules.test.mjs` |
| 3 | store（Firestore アクセス）＋ emulator seed 拡張 | `src/lib/usage/usageStore.ts`, `tests/e2e/seed-emulator.mjs` |
| 4 | LINE「今日の利用」＋ TOP タイル（最も業務価値が高く、画面が単純） | `src/app/line/today/page.tsx`, `home/page.tsx` |
| 5 | 管理Web「今日の利用」＋ SideNav | `src/app/t/[tenantId]/today/page.tsx` |
| 6 | カルテ「利用予定」タブ（usagePlan 編集・月の記録） | `chart/UsageTab.tsx`, `ChartTabs.tsx` |
| 7 | 管理Web「利用予定」月間表＋一括作成＋支給量表示 | `src/app/t/[tenantId]/schedule/page.tsx` |
| 8 | 管理Web「実績」月次集計＋日次確定 | `src/app/t/[tenantId]/usage/page.tsx` |
| 9 | Emulator での通し確認（管理Web＋LINE を2端末想定で同時操作）、実装レポート | `PHASE2_IMPLEMENTATION_REPORT.md` |
| 10 | リリース：**Rules を先に deploy → main へ push（Vercel 自動 deploy）**（Phase 1-C で順序が逆転した反省を踏まえる） | `PHASE2_PRODUCTION_RELEASE_REPORT.md` |

ステップ 4〜8 は画面単位で独立しているため、合意次第で順序を入れ替えられる。

---

## 20. テスト方針

- **unit（node --test）**：遷移表の全組合せ、確定可否、ID 生成・`yearMonth`、曜日パターンの日付展開（月末・うるう年・`effectiveFrom`・休止/終了の除外・既存日の非上書き）、日次/月次集計、支給量比較、`toJapanIsoDate` 基準の「今日」（UTC 15:00 前後の境界）。
- **Rules（emulator）**：他テナント不可、LINE スタッフ可（または確定のみ不可）、ID と `date`/`beneficiaryId` の不一致拒否、存在しない利用者への作成拒否、status/origin の値域、確定中の変更拒否と確定取消の許可、`scheduled`/`cancelled` 以外の削除拒否、`updatedBy.uid` 偽装拒否。既存 `phase1a`/`phase1c` テストの回帰。
- **E2E（emulator 手動）**：一括作成の冪等性（2回押しても件数不変）、LINE と管理Webの同時操作、押し間違いの取消、予定外の来所、確定→取消→修正→再確定、スマホ幅（375px）表示。
- **Production 確認**：テスト用利用者で 予定作成→来所→確定→取消 を行い、テストデータを削除（確定取消→ status を scheduled に戻す→削除）。

---

## 21. リスク

| リスク | 影響 | 対策 |
|---|---|---|
| Rules 未 deploy のまま新クライアントが公開される | Phase 2 画面が全て permission エラー（既存機能は影響なし） | **Rules を先に deploy してから push**。Rules は追加のみなので先行 deploy しても旧クライアントに影響しない |
| 一括作成で既存の予定・実績を上書き | 記録の消失 | 既存IDは書かない実装＋ unit test。Rules の確定チェック |
| 複数スタッフが同じ子を同時に操作 | 最後の操作が勝つ | 状態変更は `runTransaction`（読んで遷移可否を判定してから書く）。確定済みは Rules で拒否 |
| 日付のタイムゾーンずれ（端末設定・深夜） | 「今日」が前日/翌日になる | すべて `toJapanIsoDate()` を使用。端末ローカル日付（`toLocalIsoDate`）を使わない |
| 利用者数増加で日次画面が全利用者を読む | 読み取り回数増 | 現状の一覧と同じ規模前提（〜100人）。増えたら日次は usageRecords の beneficiaryId 分だけ `getDoc` する方式に切替可能 |
| `usagePlan` 保存で利用者一覧の並びが変わる | 小さな違和感 | §16-9 で決定 |
| LINE スタッフが確定・取消まで行える | 実績の意図しない変更 | §16-3 で決定。必要なら Rules で `authProvider` を判定 |
| local main が origin/main より遅れている | 古いコードから分岐する事故 | 実装開始時に fast-forward（§1） |
| 請求 Phase でモデル変更が必要になる | 移行コスト | `schemaVersion`、決定的ID、確定済みデータからの派生という方針で、日々のデータ構造を変えずに済むようにしている |

---

## 22. 協議したい事項（実装前）

1. §16-1〜5（1人1日1件／欠席と取消／確定の単位と権限／曜日一括作成の採否／時刻・送迎）
2. 着地点・LINE TOP の主役を「今日の利用」にするか（§16-6, 7）
3. 実装順序（LINE「今日の利用」を最初に出すか、管理Webの月間予定から作るか）
4. Phase 2 を一括リリースにするか、「今日の利用（LINE＋管理Web）」→「月間予定・実績」の2段階リリースにするか
