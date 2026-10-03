# PaperlessCare Phase 1-C 実装報告書 ― カルテ運用強化（要対応・書類提出管理・変更履歴）

- 作成日：2026-10-03
- branch：`feat/phase1c-chart-operations`（worktree：`.claude/worktrees/phase1c-chart-operations`）
- 基準 commit：`b46e3443`（Phase 1-B7）
- 状態：**未 commit・未 push・未 deploy（レビュー待ちで停止）**

---

## 1. Executive Summary

Phase 1-C として、利用者カルテに次の4つを一括で実装した。

1. **要対応**：受給者証の期限切れ／30日以内／期限未入力／未登録、必要書類の未提出、B7 のカルテ反映候補の未確認を、共通の「要対応」としてまとめた。利用者一覧に「要対応 N」、カルテ上部に内容の一覧を出し、各項目から該当するタブ・該当箇所へ移動できる。
2. **書類の提出管理**：既存の書類機能を拡張し、書類ごとに「提出済み／未提出・提出日・メモ・添付ファイル（任意）」を記録できるようにした。必要書類（利用契約書・重要事項説明書・個人情報同意書）の提出状況を書類タブ上部にまとめた。
3. **カルテ変更履歴**：本人情報・保護者・契約・学校・相談支援の保存と、B7 の「受給者証から反映」を、誰が・いつ・何を・変更前→変更後で記録し、「変更履歴」タブで確認できる。
4. **Firestore Rules**：変更履歴を追記のみ・本人のみ・サーバー時刻・カルテ更新と同時書き込みに限定。書類はファイルなしの記録と新項目を許可（既存の制約は維持）。

結果として「カルテを開けば、この利用者について今何を対応すべきか分かる」状態を、コード・Emulator 上で達成した。

## 2. Git Base

| 項目 | 値 |
|---|---|
| 作業開始時の共有 checkout | `main` @ `639bf513`（= origin/main・B6）。未追跡のレポート類あり（触れていない） |
| B7 commit | `b46e3443c919b4d0f56af43421576e377a2514ee`（`feat/phase1b7-chart-review`、origin/main より 1 commit 先行・未 push）。B7 worktree は clean |
| 作業 branch | `feat/phase1c-chart-operations`（`b46e3443` から新規作成。新しい worktree で作業し、main・B7 branch・他の worktree は変更していない） |
| 作業終了時 HEAD | `b46e3443`（**commit していない**。変更はすべて working tree 上） |
| origin との関係 | origin/main は `639bf513` のまま。push していない |

B7 から現在までの差分 = 本報告書の Phase 1-C 変更のみ（下の「12. Git Diff Audit」）。

## 3. Investigation

実装前に次を確認した（読んだファイルは本文で言及したもの）。

- 過去の報告書：`PHASE1A_IMPLEMENTATION_REPORT.md`、`PHASE1B_B7_IMPLEMENTATION_REPORT.md`
- データモデル：`src/lib/beneficiaryChart/model.ts`（personal 正本・profile は写し・各セクションのマップ）、`beneficiaries.ts`（`normalizeBeneficiaryData`・受給者証の保存・`updateCertificatePages`・`currentCertificateId`・`supersededBy`）
- 書き込み経路：利用者doc のカルテ項目を更新するのは `chartStore.ts`（`saveChartPersonal`／`saveChartSection`／B7 `applyCertificateReview`）だけで、受給者証の保存（`beneficiaries.ts`）は personal 等に触れない（B5 の新規作成時の初期カルテのみ）。Cloud Functions は OCR と LINE 認証だけで、利用者docを書かない
- 受給者証の期限：`certificateStatus.ts`（`validTo` と今日の差。旧データは `extractValidity`）。tsusho は B5 の代表有効期間が `validTo` に入る
- B7：`certificateReview.ts`（候補は保存せず毎回生成、`chartReview.decisions` で再表示制御）、`CertificateReviewCard.tsx`、isolation テスト
- 書類：`documents.ts`／`documentsStore.ts`／`DocumentsTab.tsx`、`firestore.rules`・`storage.rules`（同じパスへの上書き禁止）
- 認証・テナント：`users/{uid}.tenantId` によるテナント判定。LINE スタッフは Firebase Auth の `displayName` にスタッフ名、メールは無い
- UI：タブは `?tab=`、編集は `SectionCard`＋`useSectionEditor`、部品は `chartUi.tsx`
- テスト基盤：`npm test`（node:test・純粋関数）、`npm run test:rules`（Emulator・REST）、`tests/e2e/seed-emulator.mjs`
- 開始時のベースライン：unit 302 件 pass

## 4. Data Model

すべて「追加」のみ。既存フィールドの削除・型変更・移行はない。

### 4.1 documents（既存の書類doc に項目を追加）

`tenants/{t}/beneficiaries/{b}/documents/{d}`

| 項目 | 型 | 説明 |
|---|---|---|
| `status` | `"submitted"` \| `"notSubmitted"` | 提出状態（新規） |
| `submittedAt` | `"YYYY-MM-DD"` \| `""` | 提出日（新規・不明なら空） |
| `memo` | string（500文字以内） | メモ（新規） |
| `storagePath` / `fileSize` 等 | 既存 | ファイルなしの記録は `storagePath: ""`・`fileSize: 0`・`fileName: ""`・`contentType: ""` |

既存の書類doc（`status` なし）は**読み取り時に**「ファイルあり＝提出済み」とみなす（`resolveDocumentStatus`）。書き換えはしない。

### 4.2 chartHistory（新規サブコレクション）

`tenants/{t}/beneficiaries/{b}/chartHistory/{historyId}`（1件 = カルテの保存1回）

```
{
  schemaVersion: 1,
  beneficiaryId: string,
  source: "chartEdit" | "certificateReview",
  sections: ["guardian", ...],              // 変更のあったセクション
  changes: [{ path: "guardian.name", section: "guardian", label: "保護者氏名",
              before: "山田 花子", after: "山田 華子" }, ...],   // 1〜50件。値は string | boolean
  certificateId: string | null,             // 受給者証から反映した場合の証ID
  actor: { uid, email: string | null, displayName: string },   // 保存時点の表示名を写す
  createdAt: Timestamp                      // サーバー時刻
}
```

あわせて利用者doc に `lastChartHistoryId`（直近の履歴ID）を書く。Rules が「同じ書き込みで利用者docも更新した履歴」だけを作成可能にするための目印で、画面からは使わない。

### 4.3 要対応

**保存しない**（派生データ）。データ構造は追加していない。

## 5. 要対応設計

`src/lib/beneficiaryChart/actionItems.ts`（純粋関数 `computeActionItems`）。画面は返り値の `type / severity / message / detail / actionLabel / target / id` だけを使う。

| type | 条件 | severity（表示） | 移動先 |
|---|---|---|---|
| certificateExpired | 現在の証の `validTo` < 今日 | urgent（🔴 至急） | 受給者証タブ |
| certificateExpiringSoon | 0 ≦ 残り日数 ≦ 30 | warning（🟠 要対応） | 受給者証タブ |
| certificateExpiryUnknown | 証はあるが有効期限が読めない | warning | 受給者証タブ |
| certificateMissing | 受給者証が未登録 | warning | 受給者証タブ |
| documentMissing | 必要書類3種のうち未提出の種別ごと | warning | 書類タブの該当行 |
| chartReviewPending | B7 の未確認候補が1件以上 | review（🔵 要確認） | 受給者証タブの確認カード |

- **期限**：既存の `getCertificateStatus`（Phase 1-A）をそのまま使うため、期限切れと30日以内は排他（二重に数えない）。有効期限の当日は「本日まで」で期限切れではない。adult / child / tsusho とも現在の証の `validTo`、旧データは `extractValidity` の値（既存の一覧・カルテ上部の状態表示と同じ判定）
- **今日の日付**：日本時間（Asia/Tokyo）で求める `toJapanIsoDate` を追加し、要対応と既存の受給者証の状態表示の両方で使う（端末のタイムゾーンに左右されない。日本の端末では従来と同じ結果）
- **未登録・期限未入力**：指定の最低限に加え、「期限切れを検知できない状態」も対応が必要なため要対応に含めた（期限未入力は受給者証タブの修正で `validTo` が再計算され解消できる）
- **B7 pending**：B7 の `buildCertificateReview` をそのまま呼んで件数を数える（重複状態を作らない）。反映済み・反映しないと判断済みの候補は B7 の `chartReview` により出ないため、要対応にも戻らない
- **利用終了**（`personal.usageStatus === "ended"`）の利用者は要対応 0 件（対応不要のため）。休止中は対象
- **件数**：返り値の件数。並びは 至急 → 要対応 → 要確認（同じ重要度内は 受給者証 → 書類 → 反映候補）
- **navigation**：`?tab=…&focus=…`（`focus=chartReview` または書類の種別）。URL を直接開いても同じ場所へ移動する

### derived / persisted の判断

保存せず、表示のたびに既存データから求める。理由：

1. 期限は「日付が進むだけ」で変わる。保存すると毎日の再計算（スケジューラ等）が必要になり、無ければ古い値が残る
2. 書類・受給者証・カルテは管理Web・LINE の取込・B7 の確認など複数の経路で変わる。保存した要対応はそのすべてで同期が必要になり、漏れると誤表示になる（二重状態）
3. 一覧の性能：一覧は既に利用者ごとに現在の証を1件読んでいる（Phase 1-A の前提：1事業所 数十〜百件）。追加は書類の一覧1クエリ／利用者のみで、反映候補は既に読んでいる証doc から計算する
4. 書類を読み込めなかった場合は書類の要対応だけを出さず、カルテ上部にその旨を表示（画面は止めない）

## 6. Documents

- 既存の書類doc はそのまま表示・開く・ダウンロード・削除できる（Scenario M）。`status` が無い既存doc はファイルありのため「提出済み・提出日 未入力」と表示
- 書類タブ上部に「必要書類」：3種それぞれ ✓提出済み／未提出、提出日、ファイルの有無。未提出なら「提出済みにする」（提出日＝今日が初期値・メモ・ファイルは任意）
  - 同じ種別で「未提出」の記録があればそれを更新し、無ければ新しく記録する（重複を増やさない）
- **提出済みの判定**：同じ種別で1件でも「提出済み」があれば提出済み（再契約・差し替えで複数あっても自然に扱える）。「その他」は必要書類に含めない
- 「書類を登録する」：種類・ファイル（任意）・提出状態・提出日・書類名・メモ
- 登録済みの書類：書類ごとに状態バッジ・提出日・メモ。「編集」で書類名・提出状態・提出日・メモを変更、ファイルの無い記録にはファイルを添付できる（既存の Storage Rules どおり上書きは不可。差し替えは削除→再登録）
- 未提出にすると提出日は空にする（未提出なのに提出日が残らない）。提出日の未来日は不可
- 一律の有効期限管理は入れていない。個別支援計画・モニタリングは含めていない（Phase 4）

## 7. Audit History

- **書き込み**：`chartStore.ts` の `writeChartUpdate` が、利用者doc の更新と変更履歴の作成を**同じトランザクション**で行う。保存直前に利用者doc を読み直し、その値を「変更前」とする（画面の古い値ではない）
- **対象**：`saveChartPersonal`（personal＋同じフォームの手動学年 `school.grade`）、`saveChartSection`（guardian / contract / school / consultationSupport）、B7 `applyCertificateReview`（`source: "certificateReview"`・証ID つき）
- **変更が無い項目は残さない**。1項目も変わらない保存では履歴を作らない（利用者doc の更新＝profile の写しの同期・updatedAt は従来どおり行う）
- **比較**：保存時と同じ整形（`sanitizeSection`・前後の空白除去）後の値で比べる
- **actor**：`uid`・`email`・`displayName`（保存時点の値）。表示は「表示名＋さん」→ メールアドレス →「不明なスタッフ」。他人の `users/{uid}` は Rules 上読めないため、表示名は保存時に写す
- **timestamp**：`serverTimestamp()`。Rules で `request.time` と一致を確認。表示は日本時間「2026/10/4 10:32」
- **target**：`path`（例 `guardian.name`）＋画面と同じ項目名（`label`）。値の表示は日付＝和文日付、選択肢＝ラベル、「住所は利用者と同じ」＝「利用者と同じ／別の住所」、空＝「未入力」
- **B7 integration**：反映した項目だけが履歴に入る（profile の写しは入れない）。「今回は反映しない」はカルテを変えないため履歴を作らない（判断は B7 どおり証doc の `chartReview` に記録）
- **certificate history との分離**：受給者証の保存・訂正（`beneficiaries.ts`）は変更履歴を作らない（受給者証の履歴＝certificates の current / superseded で追える）。境界テストで `beneficiaries.ts` が `chartHistory` を参照しないことを確認
- **拡張性**：`source` と `schemaVersion` を持つため、将来の Phase で別の経路（例：一括更新）を追加しても同じ形で記録できる。既存データの移行は不要（履歴は Phase 1-C 以降の変更から）

## 8. UI

既存の部品（白カード・`SectionCard`・`ResultNotice`・バッジ）と Tailwind だけを使った。ライブラリ追加なし。

- **利用者一覧**：「要対応」列（PC：氏名の右）に「要対応 N」バッジ（至急を含むと赤、それ以外はオレンジ）、0件は薄い「なし」。マウスを乗せると内容を表示。スマホのカードは要対応がある場合だけ「要対応 N＋先頭の内容」を1行で表示。上部の案内を「要対応のある利用者が N名います（受給者証の期限切れ X名・期限間近 Y名を含む）」に統一し、「要対応ありのみ」の絞り込みを追加
- **カルテ上部**：「要対応 N件」と項目一覧（アイコン＋「至急／要対応／要確認」の文字＋内容＋補足＋移動ボタン）。0件は「✓ 現在、要対応はありません」の1行だけ
- **書類**：上記 6 のとおり
- **変更履歴**：新しいタブ「変更履歴」。日時・変更者・操作（カルテを編集／受給者証から反映）・セクション、各項目の「変更前 → 変更後」。30件ずつ「さらに表示」
- **navigation**：要対応のボタン → タブ切り替え＋該当箇所へスクロール（書類は該当行を強調、B7 は確認カード。「あとで確認する」で閉じていても再表示）。未保存の編集がある場合は既存の確認ダイアログを通る
- 色だけに頼らず、絵文字アイコン・文字ラベル・文言で意味が分かるようにした

## 9. Security / Rules

`firestore.rules` の変更：

- **chartHistory**
  - read：同じテナントの所属者のみ
  - create：同じテナント、かつ
    - 項目は決められたキーのみ（`hasOnly`）、`beneficiaryId` がパスと一致、`source` は2種類のみ、`changes` は 1〜50 件のリスト
    - `actor.uid == request.auth.uid`、`actor.email == request.auth.token.email`（無い場合は null）
    - `createdAt == request.time`
    - `getAfter(利用者doc).lastChartHistoryId == historyId` かつ `getAfter(利用者doc).updatedAt == request.time`（＝同じ書き込みで利用者docを更新している。履歴だけを単独で作れない）
  - update / delete：誰も不可（追記のみ）
- **documents**：ファイルなし（`storagePath == ''` かつ `fileSize == 0`）を許可、`status` / `submittedAt` / `memo` を検証。既存の制約（種別4種・自分のパスのみ・10MB 以下・テナント）は維持
- **変更なし**：利用者doc・certificates・users・storage.rules・Functions

限界（意図的）：変更内容（before / after）の正しさはクライアントが計算する。改造したクライアントが「履歴を残さずにカルテを更新する」ことは Rules では防いでいない（利用者doc の更新条件を変えると、受給者証の保存など既存の書き込みに影響するため）。完全な保証にはサーバー側（Functions）での書き込みが必要で、Phase 1-C の範囲外とした。

**deploy 順序の注意**：新しいクライアントは新しい Rules（chartHistory・documents）が前提。Rules を先に deploy すること（Rules だけ先に入っても、既存クライアントの動作は変わらない）。

## 10. Backward Compatibility

- 移行なし。既存データに新項目が無くても表示・判定できる（書類：`resolveDocumentStatus`、変更履歴：0件表示、要対応：旧データの証・personal なし・壊れたカルテ値でも落ちない — E2E の b-legacy / b-weird で確認）
- personal 正本・profile の写し：本人情報の保存は従来と同じ `buildPersonalUpdate`。profile.birthday の引き継ぎは保存直前に読み直した値を使う
- summary semantics：変更なし（カルテ保存・反映は summary に触れない。E2E で確認）
- B7：候補の生成・stale 保護・`chartReview` の記録・profile 同期は変更なし。利用者doc の書き込みを `writeChartUpdate` 経由にしただけ（`isolation.test.ts` を意図的に更新：利用者doc の更新は `writeChartUpdate` の1か所、`writeChartUpdate` 自体は利用者doc と履歴doc だけを書き、summary / currentCertificateId / status / supersededBy / certificateCount / pages を書かない）
- currentCertificateId / certificate history / status / 7・8ページ：変更なし（`beneficiaries.ts`・`certPages` 等は未変更。E2E で child 8ページ・旧 adult 8ページ・tsusho 7ページを確認）
- LINE：変更なし。tsusho の `lineEnabled = false` のまま。要対応・変更履歴・書類の提出管理は LINE から使わない（境界テスト）
- カルテ保存は `updateDoc` から `runTransaction` に変わった（変更前の値を正確に読むため）。オフライン時は保存が失敗し、既存のエラー表示で再試行を促す（管理Web の利用前提では影響なし）

## 11. Tests

| チェック | command | 結果 |
|---|---|---|
| TypeScript | `npx tsc --noEmit -p .` | **PASS**（エラー 0） |
| ESLint（変更ファイル） | `npx eslint src/lib/beneficiaryChart 'src/app/t/[tenantId]/beneficiaries' src/lib/tsusho/isolation.test.ts tests/rules` | **PASS**（0件） |
| ESLint（全体） | `npm run lint` | 14件（6 errors / 8 warnings）。**すべて Phase 1-C で変更していない既存ファイル**（AppShell・Login/Logout/Signup・CertImportFlow・capture・PageTabs・certLayouts 等） |
| Unit | `npm test` | **PASS 340 / 340**（ベースライン 302 ＋ 新規 38） |
| Rules | `npm run test:rules`（openjdk@17 を PATH に追加） | **PASS 26 / 26**（既存 12 ＋ 新規 14） |
| Build | `npx next build`（demo 用の環境変数。`.env*` はこの worktree に存在しない） | **PASS** |

### Unit（新規 38）

- `actionItems.test.ts`（15）：期限切れ・30日以内・31日（対象外）・当日／翌日・月末／年またぎ・日本時間の今日・期限未入力・未登録・必要書類の未提出・提出済みで減る・同種別複数・書類読み込み失敗・B7 pending・反映済み/判断済み（0件）・複数件数と並び・0件・利用終了・旧データ
- `documentSubmission.test.ts`（6）：必要書類の定義（その他を含めない）・旧データの状態・必要書類の集計・提出日/メモ/書類名の検証・未提出時の提出日クリア・種別判定
- `chartHistory.test.ts`（11）：基本情報・手動学年・no-op・保護者（boolean 含む）・契約（日付・選択肢の表示）・学校・相談支援・B7 反映（profile を記録しない）・B7 の変更前は保存値・保存内容（actor・証ID・createdAt を付けない）・読み取りと時刻表示・actor のフォールバック
- `phase1cBoundaries.test.ts`（6）：履歴を扱うのは chartHistory.ts / chartStore.ts だけ・受給者証の保存は履歴を作らない・カルテ保存はすべて writeChartUpdate（no-op では作らない・サーバー時刻）・LINE から使わない・要対応を保存しない・Rules が追記のみ
- `isolation.test.ts`（B7 の境界テストを意図的に更新。件数は変わらず）

### Rules（新規 14、`tests/rules/phase1c.rules.test.mjs`）

変更履歴：同テナントで作成・閲覧（管理Web・LINE 相当）／受給者証から反映の形／メールなしスタッフ（なりすまし不可）／履歴だけの単独作成不可／lastChartHistoryId 不一致・updatedAt がサーバー時刻でない場合は不可／actor のなりすまし・クライアント指定の作成時刻は不可／形の不正（空・余計な項目・別利用者・不明な操作）／作成後の変更・削除不可／他テナント・未所属・未ログイン不可。
回帰：利用者doc・証の chartReview の従来の更新（履歴なし）は可、他テナントは不可。
書類：ファイルなしの記録・提出状態の更新・後からのファイル添付／既存形式の書類docの作成・更新／不正な状態・提出日・メモ・ファイル情報は不可／他テナント等は不可。

### Emulator E2E

環境：Firebase Emulator（`demo-paperlesscare`：auth / firestore / storage）＋ Next dev（localhost:3100、`NEXT_PUBLIC_USE_EMULATORS=1`、demo 用の値）。データは既存の `tests/e2e/seed-emulator.mjs` ＋ ジョブ一時領域の Phase 1-C 用シード（架空データ：tsusho の反映候補あり×2、既存形式の書類doc、利用終了、別テナントのスタッフ）。ブラウザで実画面を操作し、結果は Emulator REST で確認。

| # | シナリオ | 結果 |
|---|---|---|
| A | 旧データの利用者（b-legacy：currentCertificateId なし・personal なし） | カルテ・一覧とも正常表示。要対応 4（期限切れ＋書類3） ✅ |
| B | 必要書類なし | 一覧「要対応 2」、カルテに「重要事項説明書／個人情報同意書が未提出です」（既存の利用契約書docは提出済み扱い） ✅ |
| C | 「書類を確認」→ 該当行へ移動 →「提出済みにする」（ファイルなし・メモ） | 要対応 2 → 1。書類doc：status=submitted・submittedAt=今日・memo・storagePath="" ✅ |
| D | 期限 17 日後（b-current） | 「受給者証の期限が30日以内です（あと17日）」1件のみ ✅ |
| E | 期限切れ（b-expired・b-legacy） | 🔴 至急「期限が切れています（N日経過）」、30日以内は出ない ✅ |
| F | B7 pending（tsusho・未確認3件） | 🔵「受給者証からのカルテ反映候補があります（未確認の項目が3件）」→「反映候補を確認」で受給者証タブの確認カードへ。URL 直接指定でも同様 ✅ |
| G | B7 反映（3件） | personal.furigana・guardian.name・consultationSupport.officeName 更新、profile.furigana 同期、summary・currentCertificateId・certificateCount・証の status / updatedAt 不変。chartHistory 1件（source=certificateReview・証ID・変更前後・actor・createdAt=利用者doc の updatedAt）。要対応 0 件・変更履歴タブに表示 ✅ |
| H | B7「今回は反映しない」 | カルテ・利用者doc の updatedAt 不変、chartHistory なし、chartReview に3件 dismissed。要対応 0 件 ✅ |
| I | 本人情報の編集（電話番号） | 履歴1件（personal.phone：未入力 → 値）。変更なしで再保存 → 履歴は増えない ✅ |
| J | 保護者・契約・学校・相談支援の編集 | セクションごとに履歴1件、変わった項目だけ（例：contract.contractDate・contractStatus） ✅ |
| K | 他テナントのスタッフで b-current・一覧を開く | 「この情報を表示する権限がありません」、一覧 0 件 ✅ |
| L | 既存の受給者証機能 | child（8ページ・過去の証1件）・旧 adult（8ページ）・tsusho（7ページ）表示。受給者証の訂正保存 → summary 更新・current のまま・**変更履歴は作られない** ✅ |
| M | 既存形式の書類doc（status なし・ファイルあり） | 移行なしで「提出済み・提出日 未入力・ファイルあり」、開く／ダウンロード／編集／削除ボタン表示 ✅ |
| 追加 | 利用終了＋期限切れ（b-c-ended） | 一覧「なし」、案内の内訳にも数えない ✅ |
| 追加 | 壊れたカルテ値（b-weird） | 一覧で落ちずに表示 ✅ |

E2E 中に見つけて直したもの：(1) 移動時のスクロールが読み込み中のレイアウト変化で途中停止 → 描画後に瞬時スクロールへ変更、(2) 確認カードの見出しが固定ヘッダーに隠れる → scroll margin を拡大、(3) 一覧の案内の「期限切れ N名」に利用終了の利用者が含まれていた → 要対応のある利用者だけで数えるよう修正。修正後に unit / Rules / tsc / lint / build を再実行し、すべて PASS。

console：アプリ由来のエラーなし。Next の開発用オーバーレイに出る Firestore SDK の `AbortError: signal is aborted without reason` は B6 / B7 報告と同じ既知事象。

## 12. Git Diff Audit

`git diff --stat`（追跡済み 13 ファイル、+1189 / −168）＋新規 9 ファイル＋本報告書。

変更：
```
firestore.rules
src/app/t/[tenantId]/beneficiaries/page.tsx
src/app/t/[tenantId]/beneficiaries/components/chartUi.tsx
src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/page.tsx
src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificateReviewCard.tsx
src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificatesPanel.tsx
src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/ChartTabs.tsx
src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/DocumentsTab.tsx
src/lib/beneficiaryChart/chartStore.ts
src/lib/beneficiaryChart/dates.ts
src/lib/beneficiaryChart/documents.ts
src/lib/beneficiaryChart/documentsStore.ts
src/lib/tsusho/isolation.test.ts
```
新規：
```
src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/ActionItemsPanel.tsx
src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/ChartHistoryTab.tsx
src/lib/beneficiaryChart/actionItems.ts / actionItems.test.ts
src/lib/beneficiaryChart/chartHistory.ts / chartHistory.test.ts
src/lib/beneficiaryChart/documentSubmission.test.ts
src/lib/beneficiaryChart/phase1cBoundaries.test.ts
tests/rules/phase1c.rules.test.mjs
PHASE1C_IMPLEMENTATION_REPORT.md
```

監査結果：
- 未変更を確認：`functions/`・`storage.rules`・`firebase.json`・`.firebaserc`・`package.json` / lock・`src/app/line/`・`beneficiaries.ts`・`CertImportFlow.tsx`
- 秘密情報・API キー・Production の URL / 設定なし（diff と新規ファイルを走査。該当は Emulator のローカル URL と、Rules テスト内の Emulator 専用の固定パスワード＝既存の phase1a テストと同じ方式のみ）
- console.log / debugger / TODO なし。migration script なし。バイナリなし
- 生成物・一時ファイル：worktree に残るのは gitignore 対象（`node_modules`＝共有 checkout への symlink、`.next`、`next-env.d.ts`、`tsconfig.tsbuildinfo`）のみ。Emulator の `firestore-debug.log` は削除済み。E2E 用のシード・起動スクリプト・ログはジョブ一時領域（リポジトリ外）
- 実在の個人情報なし（テスト・E2E はすべて架空データ）

## 13. Known Limitations

意図的に実装していないもの：
- Phase 2 以降：利用予定・利用実績・支援記録・個別支援計画・モニタリング・請求・加算・送迎・AI（タブは従来どおり「開発中」表示のまま）
- 書類の一律の有効期限管理（指示どおり対象外）
- 書類の変更履歴（変更履歴の対象はカルテの5セクションと B7 反映。書類は各doc の updatedBy / updatedAt のみ）
- 変更履歴の完全な改ざん防止（9 の限界を参照。サーバー側書き込みは範囲外）
- 期限間近の日数（30日）の事業所ごとの設定（Phase 1-A の固定値のまま）
- LINE 版への要対応・変更履歴の表示（LINE に新機能を追加しない方針）
- 一覧の読み込みは利用者ごとに証1件＋書類1クエリ。数百件規模になる場合は集計の見直しが必要
- 変更履歴は Phase 1-C 以降の保存から。それ以前の変更は残っていない（移行しない方針）
- 実機のスマホでの表示確認は未実施（Tailwind のレスポンシブ指定は既存画面に合わせて実装・PC ブラウザで確認）

## 14. Production Impact

```
Production接続なし
Production書き込みなし
deployなし
pushなし
commitなし
```

（Emulator は `demo-paperlesscare` のみ。Next は demo 用の値で起動・build。`.env.local` 等の Production 設定はこの worktree に存在せず、読み込んでいない）

deploy する場合の順序：**firestore.rules を先に** → 管理Web（Vercel）。

## 15. Phase 1 Completion Assessment

| 範囲 | 評価 |
|---|---|
| 1-A：利用者カルテ | 本番反映済みの基盤を維持。Phase 1-C で変更履歴・要対応が加わり、カルテが「情報の置き場」から「対応の起点」になった |
| 1-B：受給者証 → カルテ | B1〜B6 は無変更。B7（未 push）の確認フローは維持したうえで、未確認の候補が要対応として見えるようになり、反映は変更履歴に残る |
| 1-C：期限・不足・未確認・変更履歴 | 指示された4領域をすべて実装し、unit 340・Rules 26・E2E A〜M で確認 |

技術的評価：**コード／Emulator 上では Phase 1 の完成条件を満たしている**。「カルテを開けば、受給者証の期限・書類の不足・受給者証からの未確認の反映候補が一目で分かり、そこから対応でき、カルテの変更は誰がいつ何をしたか追える」状態になった。

ただし次は別途残っている：
- **実物の通所受給者証（tsusho）での OCR 確認は未実施**（B7 から継続。tsusho は LINE 非公開のまま）
- B7・Phase 1-C とも未 commit / 未 push / 未 deploy。レビュー後、Rules → 管理Web の順での本番反映が必要
