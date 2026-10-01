# PaperlessCare 現状調査・明日レビュー対応レポート（2026-10-01）

調査対象：`paperlesscare-web/`（HEAD `e3bd01f4` = origin/main、2026-09-05 コミット）
検証：`tsc --noEmit` エラー0 / 単体テスト 66件 全PASS / `https://paperlesscare-web.vercel.app/login` が HTTP 200
**コード変更は一切行っていません**（本レポートの追加のみ）。

> パス表記の `[t]` は `src/app/t/[tenantId]/` の略。

---

## 1. 現在のPaperlessCareの全体構成

| 項目 | 内容 | 根拠 |
|---|---|---|
| フロント | Next.js 16.1 / React 19 / Tailwind 4。全画面 `"use client"` のCSR | `package.json` |
| 配信 | Vercel（Firebase Hosting は未使用） | `firebase.json` に hosting なし |
| バックエンド | Cloud Functions Gen2 1本のみ：`ocrFromImageData`（asia-northeast1、Vision API `documentTextDetection`） | `functions/src/index.ts:54` |
| DB | Firestore（location `nam5`）。コレクションは `users/{uid}` と `tenants/{tenantId}/beneficiaries/{id}` の2つだけ | `firestore.rules`、`[t]/lib/firestore/beneficiaries.ts` |
| 画像 | Firebase Storage `tenants/{t}/recipients/{beneficiaryId}/page{N}.jpg` | `[t]/page.tsx:527` |
| 認証 | Firebase Auth メール＋パスワードのみ。`users/{uid}.tenantId` で所属テナントを決定 | `login/LoginClient.tsx:31-59` |
| 権限 | 「同じtenantIdなら全員読み書き可」の1段階。ロールなし | `firestore.rules:13-16`、`storage.rules:12-14` |
| LINE連携 | **一切なし**（`liff`/`line` の参照ゼロ、LIFF SDK未導入） | grep結果 |

### 画面構成（ルート）

| ルート | 役割 |
|---|---|
| `/` | `/login` へリダイレクト |
| `/login` | メール/パスワードログイン → `/t/{tenantId}` |
| `/signup` | Authユーザー作成のみ（`users` doc を作らないため、作成してもテナントに入れない） |
| `/t/{tenantId}` | 受給者証取込＆送信（モード選択 → 8ページ取込 → OCR → 確認 → 保存） |
| `/t/{tenantId}/capture` | スマホ用カメラ撮影（ガイド枠トリミング） |
| `/t/{tenantId}/beneficiaries` | 受給者一覧 |
| `/t/{tenantId}/beneficiaries/{id}` | 受給者詳細＝編集画面 |
| `/t/{tenantId}/settings` | 「作成中」のプレースホルダ |

スマホ専用画面は存在せず、**同一画面のレスポンシブ対応**（900px未満でサイドナビ→ドロワー）。

---

## 2. 現在できていること

| 機能 | 判定 | 根拠 |
|---|---|---|
| ログイン（メール/PW）→ テナント画面遷移 | 実装済み | `LoginClient.tsx` |
| 受給者一覧（Firestore取得・更新日降順・行クリックで詳細） | 実装済み | `[t]/beneficiaries/page.tsx:41,146-160` |
| 受給者詳細の閲覧・編集・保存（8ページ、画像と項目を並べて表示） | 実装済み | `[t]/beneficiaries/[beneficiaryId]/page.tsx` |
| 保存済み画像の表示（getBytes＋blob URL、Rules評価あり） | 実装済み | `[t]/lib/storage/useCertPageImage.ts` |
| スマホカメラ撮影（getUserMedia、ガイド枠でトリミング、撮り直し） | 実装済み（**LINE内ブラウザでは未確認**） | `[t]/capture/page.tsx:38` |
| PCのファイル選択・クリップボード貼り付け・圧縮 | 実装済み | `[t]/page.tsx:369-430` |
| 撮影往復で画像・入力を失わない（IndexedDB＋sessionStorage） | 実装済み | `[t]/lib/storage/importImageStore.ts` |
| OCR（Vision API、認証必須、PIIログなし） | 実装済み | `functions/src/index.ts` |
| OCR→項目抽出：**18歳以上（紫）のページ1〜4** | 実装済み | `[t]/lib/parsers/parseCertText.ts:59-69` |
| OCR結果の確認・修正（帳票レイアウト風フォーム） | 実装済み | `[t]/components/certLayouts.tsx` |
| 新規受給者として保存（画像Storage＋Firestore、事前採番IDで冪等） | 実装済み | `[t]/page.tsx:497-570`、`beneficiaries.ts:126` |
| 登録者・更新者・日時の記録（createdBy/At, updatedBy/At） | 実装済み | `beneficiaries.ts:140-151` |
| テナント分離（Firestore/Storage Rules） | 実装済み | `firestore.rules`、`storage.rules` |
| 旧データ互換（certType欠落・page2旧構造） | 実装済み | `beneficiaries.ts:63-77`、`lib/compat/legacyPage2.ts` |

---

## 3. 現在できていないこと

| 機能 | 判定 | 根拠・状態 |
|---|---|---|
| **既存受給者への受給者証更新** | 未実装 | モード選択で「既存受給者を更新」を押すと `alert("既存受給者検索は次のステップで追加します")` のみ（`[t]/page.tsx:618`） |
| **受給者証の履歴管理** | 未実装 | 1受給者ドキュメント＝1受給者証。`pages` 配列を `updateDoc` で丸ごと上書き（`beneficiaries.ts:118`） |
| 画像の履歴保持 | 未実装 | Storageパスが `recipients/{id}/page{N}.jpg` 固定 → 同じIDに再取込すると旧画像が上書きされる構造 |
| **受給者証なしで利用者の「枠」だけ作成** | 未実装 | 一覧の「＋受給者を新規登録」ボタンに onClick なし（`beneficiaries/page.tsx:75`）。データモデル上も「人」と「証」が分離していない |
| 既存利用者を選んで取込画面へ | 未実装 | 取込画面は常に新規IDを採番（`[t]/page.tsx:161,613`） |
| 一覧の検索・絞り込み | 一部実装（見た目のみ） | 入力欄・自治体/利用状況セレクト・検索ボタンはすべて未接続（`beneficiaries/page.tsx:80-121`）。自治体はハードコード |
| 保存後に詳細画面へ遷移 | 未実装 | メッセージ表示のみで取込画面がリセットされる（`[t]/page.tsx:553-560`） |
| OCR項目抽出：18歳以上のページ5〜8 | 未実装 | パーサ未登録 → 空フォーム（手入力） |
| OCR項目抽出：**18歳未満（黄緑）全ページ** | 未実装 | `child: {}`（`parseCertText.ts:67`）。選択は可能だが**OCRしても項目は1つも埋まらない** |
| 有効期間の構造化（開始日/終了日） | 未実装 | 期間は「令和7年4月1日から令和8年3月31日まで」等の自由文字列のまま |
| LINE Login / LIFF / LINEユーザー識別 | 未実装 | コード・依存パッケージともゼロ |
| スタッフのロール・権限 | 未実装 | テナント所属のみ。`users` docはクライアントから作成不可（`write: if false`）で、手動投入前提 |
| 事業所（tenant）マスタ | 未実装 | `tenants/{tenantId}` 自体のドキュメントは使われていない（パスの名前空間のみ） |
| カメラ不可時のフォールバック（スマホ） | 不具合あり | スマホ判定時は必ず `/capture` へ遷移（`[t]/page.tsx:352-364`）。カメラ起動失敗時の「ファイル選択に戻る」は取込画面に戻るだけで、再度押すとまた `/capture` へ飛ぶ → **スマホではファイル選択に到達できない** |
| システム設定 | 未実装 | プレースホルダ |

### LINE関連の詳細

| 項目 | 状態 |
|---|---|
| LINE Login | 未実装 |
| LIFF | 未実装（LIFF ID・SDK・初期化コードなし） |
| LINE公式アカウント連携（Messaging API等） | 未実装 |
| リッチメニュー起動URL | コード側の対応は不要（通常URLで開ける）。**リッチメニュー自体の設定はLINE Official Account Manager側のため、コードからは確認できない** |
| LINEユーザー識別 | 未実装 |
| 店舗スタッフとしての認証 | 既存のFirebaseメールログインで代替可能（LINE内ブラウザで初回ログインが必要） |

→ 明日の「スタッフがリッチメニューから起動」は、**リッチメニューのリンク先に `https://paperlesscare-web.vercel.app/login` を設定するだけ**で成立する（LIFF不要）。ただし LINE内ブラウザでの `getUserMedia`・ログイン状態保持は**実機未検証**。リンクURLに `?openExternalBrowser=1` を付けると外部ブラウザ（Safari/Chrome）で開かせる方式もあり、デモの保険として有効（要実機確認）。

---

## 4. 明日の3つのデモシナリオに対するGap分析

### シナリオ1：スマホ・新規利用者

| ステップ | 判定 | 補足 |
|---|---|---|
| LINE公式アカウント → リッチメニュー | △ | OA Manager でリンク設定するだけ（コード不要）。設定済みかは不明 |
| PaperlessCare起動 | △ | LINE内ブラウザでログイン画面が開く想定。ログイン保持は要実機確認 |
| 受給者証撮影 | △ | 実装済みだがLINE内ブラウザでのカメラ起動は未確認。失敗時の逃げ道なし |
| OCR | ○／× | **紫（18歳以上）p1〜4は○。黄緑（18歳未満）は項目が全く埋まらない** |
| 読み取り結果確認・修正 | ○ | スマホ幅では帳票レイアウトが横スクロール（操作性は要確認） |
| 新規利用者登録 | ○ | 1ページ以上で保存可 |
| 利用者詳細をスマホで閲覧 | △ | 一覧→詳細で閲覧可。保存後の自動遷移なし。一覧はテーブルなのでスマホでは窮屈 |

### シナリオ2：スマホ・既存利用者更新

| ステップ | 判定 | 補足 |
|---|---|---|
| 既存利用者を選択 | △ | 一覧から詳細へは行ける。取込画面の「既存を更新」はalertのみ |
| 「受給者証を更新」 | × | ボタン・導線なし |
| 新しい受給者証撮影 → OCR → 確認 | △ | 取込部品は再利用可能。既存IDを対象にする仕組みがない |
| 保存 | × | 新規ドキュメントが作られるだけ（＝利用者が2人に重複する） |
| 新しい証が現在データになる | × | 「現在」の概念なし |
| 古い証が履歴として残る | × | 履歴構造なし |

### シナリオ3：管理Web

| ステップ | 判定 | 補足 |
|---|---|---|
| Webアプリへアクセス → ログイン | ○ | |
| 利用者一覧 | ○ | 検索は見た目のみ（△） |
| 利用者詳細 | ○ | 現状は「受給者証そのもの」の編集画面 |
| 新規利用者作成（証あり） | ○ | 取込画面から |
| 新規利用者作成（**証なし・枠だけ**） | × | ボタン未接続、データモデル未対応 |
| 受給者証登録（既存利用者へ後から紐付け） | × | |
| 受給者証更新 | × | |
| 過去の受給者証履歴確認 | × | |

**結論：シナリオ1は「紫の証で、LINE内ブラウザでカメラが動けば」ほぼ通る。シナリオ2・3の核心（更新・履歴・枠作成）は全て未実装で、その原因は「利用者＝受給者証」の1ドキュメント構造にある。**

---

## 5. 受給者証更新・履歴管理の推奨設計

### 5.1 方針

- 既存コレクション `tenants/{t}/beneficiaries/{id}` を**「利用者（人）」として据え置く**（ID・URL・Rulesを壊さない）
- 受給者証を**サブコレクション** `beneficiaries/{id}/certificates/{certId}` として分離
- 「現在の証」は親の **`currentCertificateId` ポインタ**で決める（日付判定は補助）
- 既存の `SavedCertPage[]`（pages構造）と帳票レイアウト・パーサは**そのまま再利用**

### 5.2 データモデル

```
tenants/{tenantId}/beneficiaries/{beneficiaryId}        ← 利用者（既存コレクションを流用）
  tenantId: string
  profile: {                      ← 手入力 or 最新の証から反映
    name, furigana, birthday: string
  }
  summary: BeneficiarySummary     ← 既存フィールド維持（一覧表示用・現在の証の写し）
  currentCertificateId: string | null   ← null = 証未登録の「枠」
  currentCertType: CertTypeId | null
  certificateCount: number
  status: "active" | "inactive"
  createdBy/createdAt/updatedBy/updatedAt   ← 既存と同じ
  // 旧データ: certType / pages がトップレベルに残っている（後述の互換対応）

tenants/{tenantId}/beneficiaries/{beneficiaryId}/certificates/{certificateId}   ← 受給者証（新設）
  certType: CertTypeId
  pages: SavedCertPage[]          ← 既存型をそのまま使用（formData / ocrText / storagePath）
  summary: BeneficiarySummary     ← 証1枚ごとの代表値（number, cityName 等）
  issueDate: string               ← 交付年月日（原文）
  validFrom: string | null        ← "2026-04-01"（ISO、和暦から変換。変換不能ならnull）
  validTo:   string | null
  status: "current" | "superseded"
  supersededBy: string | null     ← 次の証のID
  source: "mobile" | "web"
  createdBy/createdAt             ← 誰がいつ登録したか
  updatedBy/updatedAt             ← 訂正した場合
```

Storage：`tenants/{t}/recipients/{beneficiaryId}/certificates/{certificateId}/page{N}.jpg`
→ 証ごとに別パスなので**旧画像は上書きされない**（OCR元画像も履歴ごとに保持）。

### 5.3 ご質問への回答

| 論点 | 推奨 | 理由 |
|---|---|---|
| 別エンティティにすべきか | **する（サブコレクション）** | 現状の上書き問題・枠作成不可の根本原因が「人＝証」構造。トップレベルcollectionより、既存のテナント配下Rulesと親子関係をそのまま使えるサブコレクションが最小変更 |
| userId等で紐付け | サブコレクションのパス自体が紐付け。加えて証docに `beneficiaryId` も持たせる（将来の collectionGroup 検索用） | |
| currentフラグ | 親の `currentCertificateId` を正とし、証側の `status` は表示用 | 複数docのフラグは不整合（current が2枚）が起きうる。親1フィールドなら `writeBatch` で原子的に切替可能 |
| 有効期間で現在判定 | **補助に留める** | 期間はOCR由来の自由文字列で誤読・空欄がある。証の切替は「スタッフが更新した」という業務イベントで決め、期間は「期限切れ間近」表示や警告に使う |
| 旧データをimmutableに | 「superseded になった証は編集不可」を推奨 | 現在の証のOCR誤りは訂正できる必要がある。旧証の改変防止は Rules で `resource.data.status == 'superseded'` の update を拒否（P2でも可） |
| OCR元画像も履歴ごと | **保持する** | 監査・読み取り誤りの確認に必須。パスを証単位にするだけで実現 |
| 誰がいつ | 既存の `createdBy/updatedBy` 形式を証docにも適用 | 既に実装パターンあり |

### 5.4 保存処理（writeBatch 1回で原子的に）

- **新規（証あり）**：利用者doc作成 ＋ 証doc作成 ＋ `currentCertificateId` 設定
- **新規（枠のみ・Web）**：利用者docのみ作成（`currentCertificateId: null`）
- **更新／後から紐付け**：新しい証doc作成 ＋ 旧証 `status: superseded, supersededBy` ＋ 親 `currentCertificateId`・`summary` 差し替え

### 5.5 既存データの互換

既存の受給者docは `pages` をトップレベルに持つ。読み取り時に「`currentCertificateId` が無く `pages` がある → 仮想の証1枚（legacy）として扱う」互換処理を `normalizeBeneficiaryData` と同じ場所に追加し、**初回更新時にその内容を証docへ移送**する。一括マイグレーションは不要（`legacyPage2.ts` と同じ方針）。

### 5.6 Rules変更（デプロイ必要）

- `firestore.rules`：`beneficiaries/{id}/certificates/{certId}` のマッチを追加（現行ルールはサブコレクションに効かない）
- `storage.rules`：`recipients/{recipientId}/{fileName}` は1階層のみ → `recipients/{recipientId}/{allPaths=**}` へ拡張
- → `firebase deploy --only firestore:rules,storage --project paperlesscare`

### 5.7 将来拡張（今回は不要）

- `users/{uid}`：`role`（admin/staff）、`displayName`、`lineUserId`
- `tenants/{t}`：事業所マスタ（名称・自治体リスト）
- LIFF導入時は LINE IDトークン → Functions で検証 → Firebase カスタムトークン発行の方式

---

## 6. 明日までに必要な実装

### P0：明日のレビューに絶対必要

| # | 内容 | 主な変更箇所 | 目安 |
|---|---|---|---|
| P0-1 | 証サブコレクションのデータ層（作成・一覧・現在切替・legacy互換） | `lib/firestore/beneficiaries.ts`（＋新規 `certificates.ts`） | 1.5h |
| P0-2 | Firestore / Storage Rules 追加・デプロイ | `firestore.rules`、`storage.rules` | 0.5h |
| P0-3 | 取込画面を「対象利用者あり（更新／紐付け）」に対応：`?beneficiaryId=` で既存IDを使い、保存時は新規証として登録。Storageパスを証単位へ | `[t]/page.tsx` | 2h |
| P0-4 | 詳細画面を「利用者情報＋現在の証＋履歴一覧」に再構成、「受給者証を更新／登録」ボタン、履歴の証を選んで閲覧（既存のビューア/レイアウトを再利用） | `[t]/beneficiaries/[beneficiaryId]/` | 2h |
| P0-5 | Web：証なし新規利用者作成（氏名・フリガナ・生年月日のみ） | 一覧の「＋受給者を新規登録」ボタン＋簡易フォーム | 1h |
| P0-6 | 実機リハーサル：リッチメニューにURL設定 → LINE内でログイン・撮影・OCR・保存。カメラ不可なら `openExternalBrowser=1` に切替 | OA Manager（コード外） | 1h |
| P0-7 | デモで使う受給者証の種類を決める（**黄緑ならOCRが空になる**ので紫で実演、またはその旨を事前に説明） | 運用判断 | — |

### P1：できれば明日まで

| # | 内容 | 目安 |
|---|---|---|
| P1-1 | 取込画面の「既存受給者を更新」→ 利用者選択リスト（alert置換） | 1h |
| P1-2 | 保存完了後に利用者詳細へ自動遷移 | 0.2h |
| P1-3 | スマホでカメラ失敗時にファイル選択（`<input capture>`）へフォールバック | 0.5h |
| P1-4 | 一覧の氏名・受給者番号のクライアント側検索 | 0.5h |
| P1-5 | 一覧のスマホ表示（カード形式） | 0.5h |
| P1-6 | 有効期間の和暦→ISO変換（validFrom/validTo）と詳細画面での表示 | 1h |

### P2：レビュー後でよい

- LIFF / LINE Login、LINEユーザーとスタッフの紐付け、保護者公開
- ロール・権限、スタッフ招待（`/signup` の整理、`users` doc 作成フロー）
- superseded証の編集禁止Rules、監査ログ
- 18歳未満パーサ（実物OCRサンプル待ち）、18歳以上 p5〜8 パーサ
- 自治体リストのマスタ化、利用状況（status）運用、期限切れアラート
- 事業所マスタ、Firestoreロケーション（nam5＝米国）の要否検討

---

## 7. 明日までの最短実装プラン

```
[0] 実機確認（最初に30分）  ← 結果次第で P1-3 / openExternalBrowser の要否が決まる
     リッチメニュー or LINEトークに URL を貼る → LINE内でログイン・カメラ起動を確認
        │
[1] P0-1 データ層 ──┬── [2] P0-2 Rules追加・デプロイ
                    │
                    ├── [3] P0-3 取込画面の対象利用者対応 ── P1-2 保存後遷移
                    │
                    ├── [4] P0-4 詳細画面（現在の証＋履歴＋更新ボタン）
                    │
                    └── [5] P0-5 枠のみ新規作成
        │
[6] P1-1 / P1-3 / P1-4 / P1-5（時間に応じて）
        │
[7] 通しリハーサル（シナリオ1→2→3）・Vercelデプロイ・デモ用データ準備
```

- **依存関係**：[1] が全ての前提。[2] を先にデプロイしないと [3][4] は本番で permission-denied になる。[3][4][5] は [1] 完了後に並行可能。
- **合計目安**：P0 約8h、P1 込みで約11h。
- **デモ用データ**：既存の受給者1名に「旧証」を登録 → シナリオ2で「新証」を撮影、の順で事前に1件仕込んでおくと履歴表示が確実に見せられる。
- **デプロイ順**：Rules（Firebase）→ フロント（git push で Vercel）。Functions は変更不要。

### 事前に確認が必要な事項（コードからは判断不可）

1. LINE Official Account Manager でリッチメニューが作成済みか、リンク先URLの設定権限があるか
2. デモ用スタッフアカウントの `users/{uid}.tenantId` がFirestoreに投入済みか（クライアントから作成不可）
3. デモで撮影する受給者証の種類（紫か黄緑か）と、実物 or ダミーか（実物の場合PIIの扱い）
4. Vercel本番が最新コミット `e3bd01f4` で配信されているか（HTTP 200は確認済み、反映コミットは未確認）
