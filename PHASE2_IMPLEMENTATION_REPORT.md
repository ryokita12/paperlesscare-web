# PaperlessCare Phase 2「予定 → 実績」実装レポート

- 作成日：2026-10-04
- ブランチ：`feat/phase2-schedule-to-actual`（`main` = `origin/main` = `d8af33aa` から作成）
- 設計：`PHASE2_SCHEDULE_TO_ACTUAL_DESIGN.md`（今回の指示で変更した点は §1・§15 に明記）
- **Production deploy・main への merge・push はしていない**

---

## 1. 実装概要

「利用予定を作る → 今日の利用を確認する → 来所・欠席・退所を記録する → 実績として見る」を PaperlessCare 上で完結させた。

| 区分 | 内容 |
|---|---|
| データ | `tenants/{t}/usageRecords/{YYYY-MM-DD}_{beneficiaryId}`（1件 = 1人 × 1日。予定と実績を分けず、同じ1件の状態が変わる）。利用者doc に `usagePlan`（基本の利用曜日＋標準時刻）を追加 |
| 管理Web | **今日の利用**（ログイン後のメイン画面）／**利用予定**（月間予定＋日カレンダー：30分目盛り・15分スナップの D&D とリサイズ・1分単位の編集）／**実績**（月次）／カルテの**利用予定**タブを有効化 |
| LINE | TOP の最上段に**今日の利用**。来所・欠席（理由は任意）・退所・キャンセル・取り消し・**予定にない子が来た** |
| Rules | usageRecords の match を追加（既存の match は変更なし） |
| Index / Functions | **変更なし** |

設計レポートからの変更（今回の指示による）：

- **予定時刻 `planned.startTime / endTime` を追加**（1分単位）。実績時刻 `actual` とは別に持つ
- **実績確定（confirmed）は持たない**：UI に出さないだけでなく、データモデル・Rules からも外した（Rules は `confirmed` フィールドを拒否する）。将来の月次締めは、月単位の締めdoc（例：`usageMonths/{YYYY-MM}`）を追加し、締めた月の記録を Rules で変更不可にする想定（§26）
- 日カレンダー（時間軸・D&D・リサイズ）を追加

## 2. Git 開始状態

| 項目 | 値 |
|---|---|
| 開始時のメインチェックアウト | `main` = `639bf513`（`origin/main` より 2 commit 遅れ）。追跡ファイルの変更なし |
| 未追跡ファイル（触っていない） | `.claude/`、`PHASE1A_PHASE1B_INTEGRATION_REPORT.md`、`PHASE1A_PRODUCTION_RELEASE_REPORT.md`、`PHASE2_SCHEDULE_TO_ACTUAL_DESIGN.md`、`docs/paperlesscare-staff-certificate-guide-2026-10-02.{png,pptx}` |
| stash | `stash@{0}: local cors change before pulling phase2`（触っていない） |
| 実施 | `git fetch origin` → `origin/main` が取り込む予定のファイルと未追跡ファイルが重ならないことを確認 → `git pull --ff-only`（`639bf513 → d8af33aa`）→ `HEAD == origin/main == d8af33aa` を確認 → `git switch -c feat/phase2-schedule-to-actual` |
| 他の worktree | 変更なし（`phase1c-chart-operations` は lint の比較元として読んだだけ） |

## 3. ブランチ

`feat/phase2-schedule-to-actual`（commit 1件：`feat: implement schedule to actual workflow (Phase 2)`。push していない）

## 4. 変更ファイル一覧

32 files, +5457 / −16

**新規**

| ファイル | 内容 |
|---|---|
| `src/lib/usage/time.ts` | 時刻：parse / format・1分単位・15分スナップ・ドラッグ移動・上端/下端リサイズ・px→分・日本時間の現在時刻・表示用 |
| `src/lib/usage/model.ts` | 型・recordId・yearMonth・暦（月の日数・曜日・うるう年）・表示用の状態名・Firestore docの読み取り正規化 |
| `src/lib/usage/transitions.ts` | 状態遷移表・操作の適用（保存内容の算出）・削除/日付移動の可否 |
| `src/lib/usage/plan.ts` | usagePlan の読み取り・検証・月予定の生成（除外・既存記録の非上書き・冪等） |
| `src/lib/usage/summary.ts` | 日次・月次集計、支給量（日/月）の読み取りと比較 |
| `src/lib/usage/calendarLayout.ts` | 日カレンダーの重なり配置（列の割り当て）・位置計算・目盛り |
| `src/lib/usage/usageStore.ts` | Firestore アクセス（購読・取得・トランザクションでの操作・一括作成・usagePlan 保存・利用者一覧） |
| `src/lib/usage/*.test.ts`（4ファイル） | unit test 51件 |
| `src/app/t/[tenantId]/today/page.tsx` | 管理Web「今日の利用」 |
| `src/app/t/[tenantId]/schedule/page.tsx` | 管理Web「利用予定」（月間予定・日カレンダー・一括作成ダイアログ） |
| `src/app/t/[tenantId]/usage/page.tsx` | 管理Web「実績」 |
| `src/app/t/[tenantId]/components/usage/usageUi.tsx` | 状態バッジ・凡例・ダイアログ・1分単位の時刻欄・日付移動・件数タイル・記録の詳細/編集ダイアログ |
| `src/app/t/[tenantId]/components/usage/DayCalendar.tsx` | 日カレンダー（Pointer Events による D&D・リサイズ） |
| `src/app/t/[tenantId]/components/usage/BeneficiarySelectDialog.tsx` | 利用者を選ぶダイアログ（管理Web） |
| `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/UsageTab.tsx` | カルテ「利用予定」タブ |
| `src/app/line/today/page.tsx` | LINE「今日の利用」 |
| `tests/rules/phase2.rules.test.mjs` | Rules test 13件 |
| `public/icons/icon-{calendar,schedule,report}.svg` | サイドメニューのアイコン（自作の線画。既存アイコンと同じ 24px・#1f1f1f） |

**変更**

| ファイル | 変更内容 |
|---|---|
| `firestore.rules` | usageRecords の match を**追加**（既存の match・全拒否ルールは不変） |
| `src/app/components/SideNav.tsx` | 「今日の利用」を最上段に追加。「スケジュール（開発中）」→「利用予定」、「実績管理（開発中）」→「実績」のリンクへ |
| `src/app/login/LoginClient.tsx` | ログイン後の遷移先を `/t/{t}` → `/t/{t}/today`（受給者証取込の URL `/t/{t}` 自体は変えていない） |
| `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/ChartTabs.tsx` | 「利用予定」タブを有効化。開発中タブから「利用予定」「実績」を外した（実績は利用予定タブ内で見る） |
| `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/page.tsx` | `?tab=usage` で UsageTab を表示 |
| `src/app/line/home/page.tsx` | 「今日の利用」タイルを最上段・強調表示に。受給者証の登録は通常表示へ |
| `src/app/line/ui.tsx` | `IconCalendar` を追加 |
| `src/app/line/beneficiaries/BeneficiaryPicker.tsx` | `onSelect`（遷移せずに選ぶ）・`excludeIds`・`disabled` を**任意の props として追加**。既存の `hrefFor` の使い方・表示は変えていない |
| `src/lib/tsusho/isolation.test.ts` | 通所受給者証との接続範囲の境界テストを**意図的に更新**：`lib/usage/summary.ts` が支給量の読み取り（`services.ts`）だけを使うことを許可し、それ以外を使っていないことを新しいテストで固定 |

`functions/`・`firestore.indexes.json`・`storage.rules`・既存の受給者証/カルテのロジックは変更していない。

## 5. データモデル

```
tenants/{tenantId}
  beneficiaries/{beneficiaryId}
    usagePlan { weekdays, defaultStartTime, defaultEndTime, updatedBy, updatedAt }   ← 追加（マップ）
  usageRecords/{YYYY-MM-DD}_{beneficiaryId}                                          ← 新規
```

- tenant 直下に置いた理由：「ある日の全員」（今日の利用）と「ある利用者の1か月」（カルテ・支給量）の両方を**等価条件だけで**取得でき、collectionGroup も複合インデックスも要らないため（設計レポート §6）
- 利用者名は usageRecords に保存しない（表示時に利用者一覧と結合。氏名変更の同期漏れを防ぐ Phase 1 と同じ方針）

## 6. usageRecords

```jsonc
// tenants/t-test/usageRecords/2026-10-05_b-tsusho
{
  "schemaVersion": 1,
  "beneficiaryId": "b-tsusho",
  "date": "2026-10-05",
  "yearMonth": "2026-10",
  "status": "attended",              // scheduled | attended | absent | cancelled
  "origin": "pattern",               // pattern（基本曜日から作成）| manual（個別に追加）| walkIn（予定外の来所）
  "planned": { "startTime": "14:07", "endTime": "17:43" },   // 予定（1分単位。walkIn は "" 可）
  "actual":  { "startTime": "14:08", "endTime": "17:12", "pickup": true, "dropoff": null },  // 実績
  "absence": { "reason": "", "contactedAt": "" },            // 欠席理由（任意）・欠席連絡日
  "note": "",
  "statusLog": [ { "from": null, "to": "scheduled", "at": "…ISO…", "by": { "uid": "…", "name": "…" } } ],  // 最大30件
  "createdBy": { "uid": "…", "email": "admin@example.test", "name": "admin@example.test" },
  "createdAt": "<serverTimestamp>",
  "updatedBy": { "uid": "line_U…", "email": null, "name": "山田 スタッフ" },
  "updatedAt": "<serverTimestamp>"
}
```

- `recordId = "{date}_{beneficiaryId}"`：同じ子の同じ日を二重に作れない。一括作成のやり直しでも重複しない
- `actor.name`：LINE スタッフはメールアドレスを持たないため、画面に出す名前（LINE は Custom Token 発行時のスタッフ氏名、管理Webはメールアドレス）
- `statusLog`：状態が変わったときだけ追記（最大30件、古いものから落とす）。配列の中ではサーバー時刻を使えないため `at` は端末時刻（ISO）
- `confirmed`：**持たない**（§1）

## 7. usagePlan

```jsonc
"usagePlan": { "weekdays": [1, 3, 5], "defaultStartTime": "14:07", "defaultEndTime": "17:43",
               "updatedBy": { … }, "updatedAt": "<serverTimestamp>" }
```

- 編集：カルテ「利用予定」タブ（曜日ボタン＋1分単位の時刻欄）。曜日を選んだら標準時刻（開始 < 終了）が必須
- 保存は `usagePlan` だけの部分更新で、**利用者doc 自体の `updatedAt` は更新しない**（利用者一覧の「最近更新した順」を曜日の変更で動かさないため。E2E で確認）
- 月予定の一括生成（`buildMonthPlan`）：
  - 対象：曜日が一致する日。標準時刻を `planned` にコピー
  - **今日以降のみ**作成（過去の日に「予定」を作ると未処理が増えるだけのため）。過去の月は作成不可（個別追加は可）
  - 除外：`personal.usageStatus` が休止・利用終了、旧 `status: inactive`、曜日未設定、標準時刻未設定（作成前のダイアログで理由つきで表示）
  - 既に記録がある日（予定・来所・欠席・キャンセル）は作らない・上書きしない。さらに Rules が「作成日時が変わる書き込み」を拒否するため、同時操作でも既存の記録は潰れない
  - 決定的IDなので何度実行しても重複しない（失敗しても再実行で残りだけ作られる）

## 8. planned / actual 時刻設計

| 項目 | 予定 `planned` | 実績 `actual` |
|---|---|---|
| 意味 | 何時から何時まで利用する予定か | 実際に来所・退所した時刻 |
| 入る値 | 基本曜日の標準時刻のコピー／個別入力（1分単位）／日カレンダーのドラッグ（15分スナップ） | LINE・管理Webの「来所」「退所」を押した**実際の時刻（日本時間・1分単位・丸めない）**／管理Webの詳細で手入力（1分単位） |
| 検証 | 開始 < 終了（同じ日の中・日付またぎ不可）。予定外の来所以外は必須 | どちらも空か HH:mm、両方あるときは 来所 ≦ 退所 |
| 例 | 14:00〜17:00 | 14:08〜17:12 |

当日以外の日をあとから記録する場合（管理Webの詳細）、「来所にする」は時刻を自動で入れない（`""`＝時刻不明）。実績欄で時刻を入力してもらう（現在時刻を当日以外の記録に入れないため）。

## 9. 1分入力仕様

- 時刻欄はすべて `<input type="time" step={60}>`（`TimeField`）。1分単位で入力・保存できる
- 値は `normalizeTimeInput` で "HH:mm" に正規化（"9:05"→"09:05"、秒付き・全角も可）
- 保存精度は1分（"14:07" はそのまま保存。unit test で 0:00〜23:59 の全1440分の往復を確認）
- 境界：00:00・23:59 は有効、24:00・23:60・"9:00"（1桁時）・"14:00:00" は Rules で拒否

## 10. 30分カレンダーグリッド

- 目盛り：`CALENDAR_GRID_MINUTES = 30`（正時は実線＋時刻ラベル、30分は破線）
- 表示範囲：`CALENDAR_START_MINUTES = 8:00`〜`CALENDAR_END_MINUTES = 21:00`（放デイの通常運用と学校休業日の朝〜夜。定数で変更可）
- 1分あたりの高さ：30分 = 48px（1.6px/分）
- **ブロックは予定時刻に比例した位置・高さで描く（30分に丸めない）**。例：14:07 は top = (847−480)×1.6 = 587.2px（E2E で DOM を確認）
- 重なり：`layoutCalendarItems` が重なりのまとまりごとに列を割り当て、まとまりの列数で幅を等分（Google カレンダーと同じ考え方）。列が増えて1列96px未満になる場合は横スクロール
- 今日は現在時刻の赤線を表示（1分ごとに更新）
- 空いている時間帯をクリック → 15分にスナップした開始時刻で「予定を追加」（利用者を選ぶ → 時刻を確認して追加）
- キャンセル・時刻のない記録（予定外の来所など）はグリッドの外（右側の一覧）に表示

## 11. 15分 D&D

- ライブラリは追加していない（既存 dependencies にカレンダー/D&D ライブラリは無い）。**Pointer Events + `setPointerCapture`** で実装（マウス・タッチ・ペン共通、SSR の影響なし、追加 bundle なし）
- 4px 未満の移動はクリック扱い（詳細ダイアログを開く）
- 移動量（px）→ 分 → `moveTimeRange`：開始を15分にスナップし、長さは15分単位に丸めた長さを維持
  - 14:07〜17:43 を約20分後ろへ → **14:30〜18:00**（E2E で Firestore の保存値を確認）
  - 15分単位の予定（例：14:00〜17:00）は長さがそのまま保たれる
- 表示範囲（8:00〜21:00）からははみ出さない（長さを保って押し戻す）
- 保存は楽観的に先に表示を変え、失敗時は元の位置に戻してエラーを表示
- ドラッグできるのは「予定」の記録だけ（来所・欠席などの記録の予定時刻は詳細ダイアログで直す）
- タッチ：ブロック上は `touch-action: none`（ドラッグ優先）。空いている部分ではスクロールできる

## 12. 15分リサイズ

- ブロックの上端・下端 8px がリサイズ用（カーソル `ns-resize`）
- `resizeTimeRangeStart` / `resizeTimeRangeEnd`：動かした端だけを15分にスナップ。反対側は元の値（直接入力の値）のまま
  - 例：14:07〜17:43 の上端を20分下げる → 14:30〜17:43
  - 開始 < 終了を常に保つ（最短は次の15分境界まで）、23:59 を超えない
- E2E：下端 +30px → 18:00 が **18:15**、上端 −24px → 14:30 が **14:15**

精度の整理：**直接入力・保存＝1分／目盛り＝30分／ドラッグ移動・リサイズ＝15分／来所・退所＝実時刻（1分）**。

## 13. 管理Web 実装

| 画面 | パス | 内容 |
|---|---|---|
| 今日の利用 | `/t/{t}/today[?date=]` | ログイン後のメイン画面。日付（前日／翌日／今日へ戻る）、件数タイル（予定・来所・欠席・キャンセル・未処理・退所済み/予定外。押すと絞り込み）、利用者ごとの予定・実績・状態。操作は 来所／退所（当日のみ）・欠席・詳細 の最小限。詳細ダイアログで実績時刻・送迎・欠席理由・メモ・状態の変更／取り消し。当日は「＋予定外の来所」、他の日は「＋予定を追加」。その日の記録を購読しているので LINE の記録がすぐ反映される |
| 利用予定（月間） | `/t/{t}/schedule?view=month&month=` | 利用者 × 日の表（予定●・来所✓・欠席「欠」・キャンセル—）、前月／次月、「基本の曜日からこの月の予定を作成」（作成前に件数・対象外・未設定の利用者を表示）、セルから追加・編集・削除（日付・開始・終了を1分単位で）、右端に「利用日数 / 支給量」（超過は ⚠・警告のみ）、休止・利用終了は既定で非表示（切替可） |
| 利用予定（日） | `/t/{t}/schedule?view=day&date=` | §10〜12 の日カレンダー |
| 実績 | `/t/{t}/usage?month=` | 月の合計と、利用者ごとの 予定日数・来所（予定外の数）・欠席・キャンセル・未処理・予定時間・実績時間・利用日数/支給量。締め・確定はしない |
| カルテ「利用予定」タブ | `/t/{t}/beneficiaries/{b}?tab=usage` | 基本の利用曜日・標準時刻（既存の SectionCard と同じ閲覧 → 編集 → 保存）、月の予定と実績の一覧（月移動）、件数・支給量・受給者証期限切れの警告、「この利用者の○月の予定を作成」「＋予定を追加」、前月の実績の要約 |

- 状態は日本語で表示（予定・来所・退所・欠席・キャンセル）。内部値（scheduled 等）は画面に出さない
- 支給量：現在の受給者証が通所受給者証で、放課後等デイサービスの「◯日／月」が読めた場合に表示。読めない・受給者証未登録でも予定の登録は止めない（「支給量不明」と表示）

## 14. LINE スタッフ版 実装

- **TOP**：「今日の利用」を最上段・強調表示（受給者証の登録・利用者の確認はその下）
- **`/line/today`**：
  - 上部に 予定・来所・欠席・まだ の件数
  - 「これから来る子」「来所中」「退所・欠席・キャンセル」に分けて、予定時刻順のカード
  - カード：氏名・学年・予定時間・状態（まだ来ていません／来所中／退所しました／欠席／キャンセル）・来所/退所の時刻
  - 予定 → 大きな **[来所] [欠席]**。欠席は理由欄（「書かなくてもOK」）＋[欠席にする]／[やめる]
  - 来所中 → 大きな **[退所]**
  - 小さな文字ボタン：予定をキャンセルにする／来所を取り消す／退所を取り消す／欠席を取り消す／遅れて来所した／予定に戻す（押し間違いを直せるように）
  - **予定にない子が来た**：既存の `BeneficiaryPicker` を `onSelect` で再利用（今日すでに記録がある子は除外）。選ぶと今の時刻で来所を記録（`origin: walkIn`）。取り消すと記録ごと削除
  - 来所・退所は押した**日本時間の実時刻（1分単位）**
  - 今日の記録を購読（管理Web・他のスタッフの記録もすぐ反映）
- LINE では予定の作成・時刻変更・曜日設定はしない（管理Webの役割）。新しい Functions は不要（既存と同じクライアントSDK＋Rules）

## 15. 状態遷移

```
(なし) ─予定追加─▶ 予定 ─来所─▶ 来所 ─退所─▶ 来所＋退所時刻（画面上「退所」）
  │                 ├─欠席─▶ 欠席 ─遅れて来所─▶ 来所
  │                 └─キャンセル─▶ キャンセル ─予定に戻す／予定を入れ直す─▶ 予定
  └─予定外の来所─▶ 来所（origin: walkIn）
取り消し：来所→予定（予定外の来所は記録ごと削除）、欠席→予定、退所→来所
修正：来所→欠席（変更）、予定時刻・実績時刻・欠席理由・メモの編集
削除：予定・キャンセルのみ（来所・欠席の記録は消せない）
```

- キャンセル（予定そのものの取消）と欠席（予定はあったが休んだ）は、時刻などで自動判定せずスタッフが選ぶ
- 遷移の可否・保存内容は `transitions.ts` の純粋関数だけで決め、画面は判定を持たない
- 書き込みは `runTransaction`（最新のdocを読んで遷移可否を判定してから書く。複数端末の同時操作でも矛盾しない）

## 16. Firestore Rules

`match /tenants/{tenantId}/usageRecords/{recordId}` を追加（既存 match の外側・兄弟、全拒否ルールより前）。

| 検証 | 内容 |
|---|---|
| 認証・tenant 分離 | `users/{uid}.tenantId == tenantId`（既存と同じ判定。管理Web・LINE スタッフとも） |
| 項目 | 必須15項目ちょうど（想定外の項目＝例：`confirmed` は拒否）、`schemaVersion == 1` |
| ID 整合 | `recordId == date + '_' + beneficiaryId`、date は YYYY-MM-DD、`yearMonth` は date の年月 |
| 実在 | 作成時、同じ tenant に利用者docが存在すること |
| 値域 | status 4種・origin 3種 |
| 時刻 | planned / actual の startTime・endTime は "HH:mm"（00:00〜23:59）または ""。予定外の来所以外は予定時刻必須。開始 < 終了 の大小はアプリ側（純粋関数＋unit test） |
| actual / absence / note / statusLog | 項目の過不足、pickup/dropoff は bool か null、欠席理由 200字・メモ 500字以内、欠席連絡日は日付か ""、statusLog 30件以内 |
| actor・日時 | `updatedBy.uid` は本人・`updatedBy.email` はトークンの email（無ければ null）、`updatedAt == request.time`。作成時は `createdBy.uid` 本人・`createdAt == request.time`、更新時は `createdBy`・`createdAt` 変更不可（＝既存記録の「作成」での上書き不可） |
| 削除 | 予定・キャンセル、または予定外の来所（取り消し用）のみ |

`usagePlan` は既存の利用者doc の権限（同じ tenant の所属者）で書ける。Rules の変更なし（Rules test で確認）。

## 17. Index 変更有無

**変更なし**（`firestore.indexes.json` は `indexes: []` のまま）。実際のクエリ：

| クエリ | 条件 | インデックス |
|---|---|---|
| 今日の利用・日カレンダー | `where("date", "==", d)` | 自動の単一フィールド |
| 月間予定・実績・一括作成 | `where("yearMonth", "==", m)` | 自動の単一フィールド |
| カルテの利用者×月 | `where("yearMonth", "==", m).where("beneficiaryId", "==", b)` | 等価条件のみ → 単一フィールドのインデックスの組み合わせで動く（複合不要） |
| 予定画面の利用者一覧 | `collection(beneficiaries)` 全件（並び替えは画面側） | 不要 |

`orderBy`・範囲条件は使っていない（並び替えは画面側。1日・1か月の件数は小さい）。

## 18. Functions 変更有無

**変更なし**。管理Web・LINE とも既存と同じクライアントSDK＋Rules で完結。一括作成は `writeBatch`（400件ごと）をクライアントから実行。

## 19. unit test 結果

`npm test`：**392 / 392 PASS**（既存 340＋Phase 2 の51件＋境界テスト1件。既存の境界テスト1件は意図的に更新）

Phase 2 の主なテスト：

- 時刻：14:07 をそのまま扱える・1分単位（全1440分の往復）・00:00/23:59 の境界・24:00 等の拒否・開始 ≧ 終了／日付またぎの拒否・15分スナップ・**14:07〜17:43 を20分後ろ → 14:30〜18:00**・15分単位の予定は長さ維持・範囲外に出ない・上端/下端リサイズ（反対側は直接入力の値を保持、開始 < 終了を保つ）・日本時間の現在時刻（端末タイムゾーン非依存）
- 状態遷移：scheduled→attended（来所時刻＝押した時刻）／→absent（理由任意）／→cancelled、attended の取消・修正（→予定、→欠席、実績時刻の修正）、absent→attended（遅れて来所）、cancelled→scheduled（予定に戻す・入れ直す）、walkIn→attended（取消で削除）、退所時刻 < 来所時刻の拒否、できない操作の拒否、statusLog 30件、当日以外の時刻明示
- 予定生成：曜日固定・月境界・うるう年（2028/2/29）・休止/利用終了/inactive/曜日未設定/時刻未設定の除外・既存記録を上書きしない・再実行で重複しない・今日以降のみ
- 集計：予定・来所・退所・欠席・キャンセル・未処理（今日以前の予定のまま）・予定外・利用日数・予定時間・実績時間、利用者ごとの月次、支給量の読み取りと比較
- 日カレンダー：重なりの列割り当て、位置は1分単位（847分 = 14:07）、範囲外の切り詰め、30分目盛り

## 20. Rules test 結果

`npm run test:rules`：**39 / 39 PASS**（既存 phase1a / phase1c の26件はすべて維持、Phase 2 の13件を追加）

Phase 2：正常な読み書き（管理Web・日次/月次/利用者×月のクエリ）／LINE スタッフの来所→退所→欠席→予定、予定外の来所の作成・削除／他 tenant・未認証・未所属の拒否（読み取り・クエリ・作成・更新・削除）／他 tenant の利用者の記録を作れない／不正な recordId・yearMonth・日付・存在しない利用者／不正な status・origin／不正な時刻形式（24:00・9:00・17:60・秒付き・数値・余分な項目・予定時刻なし）と 00:00〜23:59 の境界／absence・note・statusLog・`confirmed`・schemaVersion・必須項目欠落／他人の actor・他人のメールアドレス・name なし／クライアント指定の日時・作成者や作成日時の変更・既存記録の上書き／来所・欠席の記録の削除不可／usagePlan の書き込み権限（従来どおり）

## 21. lint 結果

`npx eslint src`：6 errors / 8 warnings。**すべて Phase 1 から存在する既存の指摘で、Phase 2 による増減なし**（`origin/main` = `d8af33aa` の worktree で同じ設定で実行した結果と、ファイル・ルール単位で完全一致）。既存の指摘：`AppShell.tsx`（set-state-in-effect）、`UnhandledRejectionGuard.tsx`・`LoginClient.tsx`・`LogoutClient.tsx`・`SignupClient.tsx`・`capture/page.tsx`（no-explicit-any）ほか warning。Phase 2 の新規ファイルに指摘なし。

`npx tsc --noEmit`：エラーなし。

## 22. build 結果

`npm run build`：**成功**。新ルート `/line/today`（静的）、`/t/[tenantId]/today`・`/schedule`・`/usage`（動的）を含む。

## 23. emulator 確認結果

環境：Firebase Emulator（`demo-paperlesscare`：auth / firestore / storage / functions）＋偽 LINE verify API（ジョブ一時領域・127.0.0.1:9876）＋ Next dev（localhost:3100、`NEXT_PUBLIC_USE_EMULATORS=1`）。データは既存の `tests/e2e/seed-emulator.mjs` ＋ Phase 2 用の架空データ（通所受給者証・支給量10日/月の「北 太郎」、休止中の「渡辺 ゆう」）。ブラウザで実画面を操作し、結果は Emulator REST で確認。確認日 2026-10-04（日）。

| # | シナリオ | 結果 |
|---|---|---|
| 1 | 基本曜日設定：カルテ「利用予定」で 月・水・金、14:07〜17:43 を保存 | ✅ usagePlan 保存。**利用者doc の updatedAt は不変**（一覧の並び順が変わらない） |
| 2 | 月予定生成（カルテ）：「10月の予定を作成」 | ✅ 10/5 以降の月水金 12件（標準時刻 14:07〜17:43 をコピー）。もう一度押すと「0件作成・12件そのまま」（冪等） |
| 2' | 月予定生成（月間予定）：他2人に基本曜日を設定して一括作成 | ✅ 作成前ダイアログ「20件（2人）・既存12件そのまま・休止1人は対象外・未設定5人の名前」。作成後、表がリアルタイムに更新 |
| 3 | 日カレンダー表示（10/5、3人が重なる） | ✅ 3列に横並び。14:07 は top 587.2px（1分単位の位置） |
| 4 | 1分単位の予定編集（ブロックをクリック → 14:03〜17:58） | ✅ 保存・表示とも 14:03〜17:58（top 580.8px） |
| 5 | 15分単位 D&D（14:07〜17:43 を約20分後ろへ） | ✅ **14:30〜18:00** で保存 |
| 6 | 15分単位リサイズ（下端 +30px、上端 −24px） | ✅ 18:00 → **18:15**、14:30 → **14:15** |
| 7 | LINE 今日の利用（初回スタッフ登録 → TOP → 今日の利用） | ✅ TOP 最上段に「今日の利用」。予定2人を予定時刻順に表示 |
| 8 | 来所 | ✅ status attended、actual.startTime = 押した時刻（08:50、日本時間・丸めなし）、updatedBy = LINE スタッフ（email null・氏名） |
| 9 | 欠席（理由「発熱のため」） | ✅ status absent、absence.reason 保存 |
| 10 | 退所 | ✅ actual.endTime = 押した時刻、表示「退所しました」 |
| 11 | 予定外来所（予定にない子が来た → 鈴木） | ✅ 一覧から今日記録済みの2人が除外されている。origin walkIn・attended・来所 08:51 |
| 12 | 管理Webへの反映 | ✅ 今日の利用：予定2・来所2・欠席1・未処理0・退所済み1/予定外1、各行の予定・実績・状態。詳細から実績時刻 14:08〜17:12・送迎（迎え）ありに修正 |
| 13 | 月間実績への反映 | ✅ 北 太郎：予定13・来所1・実績時間 3時間4分（14:08〜17:12）・**13 / 10日 ⚠**。予定外の来所は「1（予定外1）」 |

E2E 中に見つけて直したもの：実績画面に、休止中で記録0件の利用者が基本曜日を理由に表示されていた → 記録が無い場合は利用中の利用者だけ表示するよう修正。

E2E 中の注意（アプリの不具合ではない）：私が REST で手作りしたテストデータに `createdAt` / `updatedAt` を入れ忘れたため、(a) その記録への LINE の来所が Rules で拒否された（Rules が作成日時を必須にしているため。アプリが作る記録には必ず入る）、(b) その利用者が既存の利用者一覧（`orderBy("updatedAt")`）に出なかった。テストデータを直して再確認し、いずれも正常。

console：アプリ由来のエラーなし。Firestore SDK の `AbortError: signal is aborted without reason` は Phase 1-B6 / B7 / 1-C の報告と同じ既知事象。

未確認：実機（iPhone / Android の LINE 内ブラウザ）でのタッチ操作。日カレンダーの D&D は PC のマウス操作で確認（Pointer Events のためタッチでも同じ処理だが、実機での操作感は未確認）。

## 24. Phase 1 回帰確認

| 対象 | 確認方法 | 結果 |
|---|---|---|
| ログイン | E2E（管理Web） | ✅ ログイン後に「今日の利用」へ |
| 利用者一覧 | E2E | ✅ 9件・要対応・受給者証状態の表示 |
| 利用者カルテ | E2E（基本情報・受給者証・要対応） | ✅ |
| 受給者証（現在＋以前の証・ページ表示） | E2E（b-current） | ✅ |
| 受給者証 OCR / 更新 | 取込画面（`/t/{t}`）の表示を E2E で確認。OCR・保存のコード（`CertImportFlow`・parser・`beneficiaries.ts`）は未変更、関連 unit test 全 PASS | ✅（Vision API を使う実 OCR はエミュレーターでは未実行） |
| LINE スタッフ登録・ログイン | E2E（偽 LIFF で初回登録 → TOP） | ✅ |
| LINE 利用者一覧 | E2E（`BeneficiaryPicker` の従来の Link 表示・9件） | ✅ |
| LINE 利用者詳細 | E2E（b-current：現在の証・以前の証） | ✅ |
| LINE 受給者証取込 | 取込開始画面を E2E で確認。取込処理は未変更 | ✅ |
| Security Rules | `npm run test:rules` 既存26件 | ✅ |
| build / tsc / lint | §21・§22 | ✅（lint は既存の指摘のみ） |

既存データ構造：既存フィールドの変更・削除なし。利用者doc へのマップ追加（`usagePlan`）と新コレクションのみ。

## 25. 未実装項目

指示どおり実装していない：月次締め、請求、国保連 CSV、上限額管理、加算計算、サービス提供実績記録票の帳票、支援記録本文、支援計画、モニタリング、保護者向け LINE、保護者による予定申請、本格的なスタッフ権限管理、学校休業日・事業所休業日カレンダー、長期休暇専用パターン、振替の自動紐付け、月次ロック、Production deploy。

ユーザー操作としての「実績確定」も導入していない（データにも持たない）。

## 26. 今後の拡張ポイント

| 将来機能 | 拡張方法 |
|---|---|
| 月次締め・編集ロック | `tenants/{t}/usageMonths/{YYYY-MM}`（締め状態）を追加し、Rules で `exists()` / `get()` して締めた月の usageRecords の更新を拒否。記録の構造は変えない |
| 請求・国保連 | 締めた月の記録から派生データ（当時の氏名・受給者番号・単位数のスナップショット）を作る。必要なら Functions で CSV 生成 |
| 休業日・学校休業日 | `calendarMonths/{YYYY-MM}` を追加し、`buildMonthPlan` に除外日・別パターンを渡す（純粋関数の引数追加で済む） |
| 長期休暇パターン | `usagePlan` にパターンを追加（`readUsagePlan` は未知の項目を無視する） |
| 振替 | キャンセルの記録に `transferTo`、振替先に `transferFrom` を追加（Rules の許可キーに追加） |
| 加算・欠席時対応加算 | `absence.contactedAt` は保存済み。対応内容・`additions` マップを追加 |
| 支援記録 | 同じ `{date}_{beneficiaryId}` をキーに別コレクション、または usageRecords のサブコレクション |
| 複数枠 | ID に枠を付ける（`{date}_{b}_{slot}`） |
| 厳密な監査ログ | `statusLog` を追記専用サブコレクションへ（chartHistory と同じ方式） |
| スタッフ権限 | Rules の `isTenantMember()` に role 判定を足す |

`schemaVersion: 1` を全記録に入れてあるので、構造を変えるときは読み取り側（`readUsageRecord`）で読み替えられる。

## 27. Production 反映時に必要な手順

1. 本レポートと差分のレビュー
2. **Firestore Rules を先に deploy**：`firebase deploy --only firestore:rules --project paperlesscare`（追加のみのため、旧クライアントに影響なし。Phase 1-C で Vercel が先に反映された反省を踏まえ、必ず push より前）
3. `main` へ merge → push（Vercel が自動で Production deploy）
4. Index・Functions・Storage Rules の deploy は**不要**
5. Production 確認：管理Webでログイン → 「今日の利用」が開く／テスト用の利用者で 基本曜日設定 → 月予定作成 → 日カレンダーでドラッグ → LINE で来所・退所 → 実績に反映
6. テストデータの片付け：テスト用の記録は「来所を取り消す／欠席を取り消す」で予定に戻してから削除（Rules で来所・欠席の記録は削除できないため）。usagePlan はカルテで曜日を外して保存
7. スタッフへの案内：ログイン後の画面が「今日の利用」に変わる。受給者証の取込はサイドメニュー「受給者証を取り込む」（URL は従来どおり）。LINE の TOP 最上段が「今日の利用」になる

## 28. リスク・注意事項

| 項目 | 内容・対策 |
|---|---|
| deploy 順序 | Rules 未反映のまま新クライアントが公開されると、Phase 2 の画面が permission エラーになる（既存機能は影響なし）。**Rules → push の順を厳守** |
| ログイン後の画面の変更 | 受給者証取込を最初に使っていたスタッフには変化になる。サイドメニュー・LINE TOP から従来どおり使える |
| LINE スタッフの権限 | Rules 上、LINE スタッフも管理者と同じく記録の作成・変更・予定の削除ができる（Phase 1 の利用者データと同じ扱い）。本格的な権限管理は今回対象外 |
| 実時刻の記録 | 来所・退所は端末の時計（日本時間に変換）を使う。端末の時計が大きくずれていると時刻もずれる（管理Webの詳細で修正可） |
| statusLog の時刻 | 配列内のため端末時刻（監査用の厳密な時刻ではない）。正式な監査ログは将来の Phase |
| 利用者数 | 予定・実績画面は利用者を全件読む（1事業所 数十〜百人の前提。Phase 1 の利用者一覧と同じ）。月間予定・実績・カルテは現在の受給者証も1人1件読む |
| 支給量 | 通所受給者証の「◯日／月」が安全に読めた場合のみ（放課後等デイサービスの行を優先）。実物 OCR は未検証のため、読めない場合は「支給量不明」 |
| 一括作成 | 400件ごとのバッチのため途中で失敗すると一部だけ作られるが、再実行で残りだけ作られる（決定的ID・既存は上書きしない） |
| タッチ操作 | 日カレンダーのブロック上ではスクロールより D&D を優先。スマホでの予定調整は主用途ではない（スマホの主役は LINE の今日の利用）が、実機確認は未実施 |
| 既知の lint | Phase 1 からの既存の6 errors（Phase 2 で増減なし） |
| 未追跡ファイル | メインチェックアウトの未追跡ファイル（Phase 1 のレポート・docs の画像等）と stash は今回の commit に含めていない |
