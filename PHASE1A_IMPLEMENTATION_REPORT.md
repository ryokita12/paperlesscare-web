# PaperlessCare Phase 1-A 実装報告書

- 作成日：2026-10-03
- ブランチ：`feat/phase1a-beneficiary-chart`（`main` = `7c6ee87c` から作成）
- 状態：**ローカル実装・ローカル検証まで完了／未コミット・未push・未デプロイ**
- 表記：「確認済み」＝実際に動かして確認／「自動テストのみ」＝自動テストで確認し画面操作はしていない／「未確認」＝確認していない

---

## 1. 実装概要

既存の受給者証機能（取込・更新・履歴・LINE版）には手を入れず、その横に「利用者カルテ」を追加しました。

| 項目 | 内容 |
|---|---|
| 左サイドメニュー | 利用者管理（子項目に既存の「受給者証を取り込む」＝`/t/{tenantId}`）、スケジュール／支援記録／支援計画／実績管理／帳票／スタッフ管理（いずれも「開発中」・押せない・リンクなし）、システム設定、ログアウト。現在の画面をハイライト表示 |
| 利用者一覧 | 氏名・フリガナ・年齢・学年・受給者証の状態（有効／期限間近／期限切れ／期限未入力／未登録）・有効期限。検索（氏名・フリガナ・受給者証番号、ひらがな入力可）と状態での絞り込みが実際に動作。「新しい利用者を登録」「受給者証を取り込む」ボタン。期限切れ・期限間近がいれば注意表示。狭い画面ではカード表示 |
| 利用者カルテ | 既存URL `/t/{tenantId}/beneficiaries/{beneficiaryId}` を拡張。上部に氏名・フリガナ・年齢・学年・受給者証状態・有効期間を常時表示。タブ：基本情報／受給者証／契約・関係先／書類 ＋ 開発中（利用予定・支援記録・支援計画・モニタリング・実績、押せない） |
| 基本情報タブ | 本人情報（氏名・フリガナ・生年月日・年齢自動計算・学年〔自動計算＋手動上書き〕・郵便番号・住所・電話番号・利用状態）、保護者情報（氏名・フリガナ・続柄・電話・緊急連絡先・メール・郵便番号・住所・「住所は利用者と同じ」） |
| 受給者証タブ | 既存の利用者詳細画面の処理をそのまま移設（現在／過去の切替、画像、OCR結果の修正保存、過去証は閲覧のみ、「受給者証を更新」）。上部に選択中の証の要点（受給者証番号・支給市区町村・交付日・有効期間・サービス種別・支給量・利用者負担上限月額・上限額管理）を追加。値は既存データから読むだけで生成しない |
| 契約・関係先タブ | 契約情報（契約日・利用開始日・契約支給量・事業者記入欄番号・契約終了日・契約状態）、学校・所属（学校名・学年・クラス・担任名）、相談支援（事業所・専門員・電話・メール） |
| 書類タブ | 受給者証は既存 certificates を案内（重複保存しない）。利用契約書・重要事項説明書・個人情報同意書・その他を PDF/JPEG/PNG（10MBまで）でアップロード・一覧・開く・ダウンロード・削除（画面内の確認表示つき） |
| Rules | Firestore `documents` サブコレクションと Storage `recipients/{id}/documents/...` の権限を**追加のみ** |
| 型・データアクセス | `src/lib/beneficiaryChart/` に純粋ロジック（型・正規化・日付・状態判定・検索・書類）と Firestore/Storage アクセスを分離 |

---

## 2. 変更ファイル一覧

### 変更（既存ファイル）

| ファイル | 目的 |
|---|---|
| `firestore.rules` | `tenants/{t}/beneficiaries/{b}/documents/{d}` のルールを追加（既存ブロックは無変更） |
| `storage.rules` | `tenants/{t}/recipients/{r}/documents/{d}/{file}` のルールを追加（既存ブロックは無変更） |
| `package.json` | `test:rules` スクリプトを追加（依存関係の追加なし） |
| `src/app/components/SideNav.tsx` | メニュー構成の変更、開発中項目、現在画面のハイライト（`usePathname`） |
| `src/app/t/[tenantId]/beneficiaries/page.tsx` | 利用者一覧を作り直し（検索・状態表示） |
| `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/page.tsx` | 利用者カルテ（ヘッダー・タブ）に置き換え。従来の内容は `chart/CertificatesPanel.tsx` へ移設 |
| `src/app/t/[tenantId]/lib/firestore/beneficiaries.ts` | `normalizeBeneficiaryData` に `export` を付与（**処理内容の変更なし**。1行＋コメント1行） |
| `src/app/t/[tenantId]/CertImportFlow.tsx` | 【追加修正】管理Web用の保存後遷移先（`importRoutes` の admin 分岐の `afterSave`）だけを `?tab=certificates` 付きに変更（1行＋コメント1行）。保存処理・LINE版の分岐は無変更（14章） |
| `src/app/t/[tenantId]/beneficiaries/page.module.css` | 削除（唯一の利用元だった一覧画面を作り直したため未使用になった） |

### 追加

| ファイル | 目的 |
|---|---|
| `src/lib/beneficiaryChart/model.ts` | カルテの型・既定値・安全な読み取り・互換レイヤー（personal → profile → summary）・保存データ組み立て・入力チェック・検索 |
| `src/lib/beneficiaryChart/dates.ts` | 日付の正規化（ISO・西暦・和暦）、年齢、学年（4月2日〜翌4月1日）、日数差 |
| `src/lib/beneficiaryChart/certificateStatus.ts` | 受給者証状態の判定（期限間近は `DEFAULT_EXPIRING_SOON_DAYS = 30`、引数で変更可能） |
| `src/lib/beneficiaryChart/certificateHighlights.ts` | 受給者証 formData からの要点抽出（読み取りのみ） |
| `src/lib/beneficiaryChart/documents.ts` | 書類の種別・形式・サイズ上限・保存先パス |
| `src/lib/beneficiaryChart/errors.ts` | Firebaseエラー → スタッフ向けの案内文 |
| `src/lib/beneficiaryChart/chartStore.ts` | カルテの読み込み・一覧・保存（Firestore） |
| `src/lib/beneficiaryChart/documentsStore.ts` | 書類の一覧・アップロード・削除・取得（Firestore＋Storage） |
| `src/lib/beneficiaryChart/*.test.ts`（5ファイル） | 上記純粋ロジックの単体テスト（33件） |
| `src/app/t/[tenantId]/beneficiaries/components/chartUi.tsx` | 一覧・カルテ共通のUI部品（カード、表示値、入力欄、状態バッジ等） |
| `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/*.tsx`, `useSectionEditor.ts` | カルテのヘッダー・タブ・各タブ・受給者証パネル（移設）・要点カード・学年入力・編集フック |
| `tests/rules/phase1a.rules.test.mjs` | Firestore / Storage Rules のエミュレーター結合テスト（10件、既存権限の回帰を含む） |
| `PHASE1A_IMPLEMENTATION_REPORT.md` | 本報告書 |

---

## 3. 画面変更

| 画面 | 変更内容 |
|---|---|
| 左サイドメニュー（全管理画面） | 上記の構成に変更。「受給者証取込＆送信」は「受給者証を取り込む」の名称で利用者管理の下に残し、URL（`/t/{tenantId}`）・機能は不変 |
| `/t/{tenantId}`（受給者証取込＆送信） | 取込・OCR・保存の処理は**変更なし**。【追加修正】保存成功後の遷移先のみ `/t/{tenantId}/beneficiaries/{id}?tab=certificates`（カルテの「受給者証」タブ）に変更 |
| `/t/{tenantId}/beneficiaries` | 作り直し。旧画面にあった「動作しない検索フォーム」（自治体・利用状況のダミー選択肢）は撤去し、動作する検索に置換。受給者証なしの新規作成フォームは既存関数 `createBeneficiaryWithoutCertificate` をそのまま使用（生年月日は日付入力にし、`profile.birthday` に「2016年8月15日」形式で保存） |
| `/t/{tenantId}/beneficiaries/{id}` | 利用者カルテ。`?tab=basic|certificates|contract|documents` でタブ指定可（省略時は基本情報） |
| `/t/{tenantId}/capture`、`/t/{tenantId}/settings`、`/login`、`/logout`、`/signup`、`/line/**` | **変更なし** |

画面の考え方：閲覧と編集はカード単位で切り替え（「編集」→ 入力 →「保存する」/「キャンセル」）。同時に編集できるカードは1つ。必須項目は「必須」表示、誤りは項目の下に赤字、保存結果はカード内に緑/赤で表示。未入力は「未入力」「—」で表示し、`undefined` 等は出さない。未保存の入力がある状態でタブ移動・画面移動すると確認を出す（既存画面と同じ `window.confirm`）。

---

## 4. Firestoreデータ構造

### 4.1 利用者doc（`tenants/{tenantId}/beneficiaries/{beneficiaryId}`）に追加したマップ

```
personal:            { name, furigana, birthDate("YYYY-MM-DD"|""), postalCode, address, phone,
                       usageStatus: "active"|"suspended"|"ended"|"" }      … 本人情報の正本
guardian:            { name, furigana, relationship, phone, emergencyContact, email,
                       sameAddressAsBeneficiary: boolean, postalCode, address }
contract:            { contractDate, startDate, endDate ("YYYY-MM-DD"|""), contractedAmount,
                       providerEntryNumber, contractStatus: "none"|"active"|"ended"|"" }
school:              { schoolName, grade(手動設定の学年。空なら自動計算), className, teacherName }
consultationSupport: { officeName, specialistName, phone, email }
```

既存フィールド `summary` / `currentCertificateId` / `certificateCount` / `certType` / `status` / `pages` / `createdAt` / `createdBy` は**書き込みも削除もしない**。`updatedAt` / `updatedBy` はカルテ保存時に既存と同じ形式で更新する（一覧の並び順が変わる点に注意）。

### 4.2 profile と personal の関係（互換レイヤー）

- **正本は `personal`**。受給者証の取込・更新（既存の `addCertificateToBeneficiary`）は `personal` に触れないため、カルテで登録した本人情報は受給者証の更新で上書きされない（エミュレーターで確認済み、8章）。
- 既存の `profile`（name / furigana / birthday）は残し、カルテで本人情報を保存したときに同じ値を写す（一覧・LINE版など `profile` を読む既存画面へ反映するため）。生年月日が未入力なら既存の `profile.birthday` をそのまま残す。
- 表示時の優先順位：氏名・フリガナ＝`personal` → `profile` → `summary`、生年月日＝`personal.birthDate` → `profile.birthday` を正規化 → `summary.birthday` を正規化、学年＝`school.grade`（手動）→ 生年月日から自動計算。
- `summary` は削除・移行していない（既存の一覧・LINE版・受給者証更新ロジックが引き続き使う）。

### 4.3 生年月日

- 新しいカルテでは `personal.birthDate`（"YYYY-MM-DD"）を正とする。
- 既存の和暦・自由文字列（例「平成27年5月10日」「令和元年5月1日」「２０１５年５月１０日」）は**読み取り時にだけ**正規化する。一括変換はしていない。
- 正規化できない値（例「不明」）は元の文字列をそのまま表示し、年齢・学年は表示しない（「編集から生年月日を入力してください」と案内）。

### 4.4 書類（新規サブコレクション）

`tenants/{tenantId}/beneficiaries/{beneficiaryId}/documents/{documentId}`

```
beneficiaryId, type("contract"|"importantMatters"|"privacyConsent"|"other"), name, fileName,
storagePath, contentType, fileSize(number), createdBy{uid,email}, createdAt, updatedBy{uid,email}, updatedAt
```

命名は既存の certificates と同じ `createdBy` / `createdAt` / `updatedBy` / `updatedAt` に揃えた。受給者証は documents に保存しない。

### 4.5 既存データとの互換性

| 既存データ | 動作（確認方法） |
|---|---|
| Phase 1-A 以前の利用者（カルテのマップなし） | 既定値で補って表示（エミュレーターで確認済み） |
| 旧形式（`currentCertificateId` が無く直下に `pages`）の利用者 | カルテ表示・本人情報保存後も `currentCertificateId` は未設定のまま＝旧データ判定が維持される。その後の受給者証更新で `certificates/legacy` への移送も従来どおり動作（確認済み） |
| 和暦・自由文字列の生年月日 | 上記4.3のとおり（確認済み） |
| マップに想定外の型が入っている（文字列・数値等） | 既定値に置き換えて表示し、画面は落ちない（確認済み・自動テスト） |

---

## 5. Storage構造

```
tenants/{tenantId}/recipients/{beneficiaryId}/documents/{documentId}/file.{pdf|jpg|png}
```

- 既存の受給者証画像（`tenants/{t}/recipients/{b}/certificates/{c}/pageN.jpg`）と同じ `recipients/{beneficiaryId}` 配下。
- 元のファイル名は Firestore の `fileName` に保存し、Storageのオブジェクト名には使わない（日本語・記号を含むファイル名による問題を避けるため）。
- 1書類＝1フォルダ（documentId）。差し替えは「削除して再登録」。
- 上限 10MB（既存のOCR Functionの上限と同じ値）。アプリ・Firestore Rules・Storage Rules の3か所で同じ値。
- 表示・ダウンロードは既存の受給者証画像と同じく `getBytes()`（都度Rulesが評価される）を使い、`getDownloadURL()`（Rulesを通らない恒久URL）は使っていない。

---

## 6. Firestore Rules / Storage Rules

### Firestore（追加のみ）

```
match /tenants/{tenantId}/beneficiaries/{beneficiaryId}/documents/{documentId}
  read, delete     : 既存と同じ「users/{uid}.tenantId == tenantId」
  create, update   : 同上 ＋ type が4種類のいずれか
                         ＋ storagePath がこの書類自身のパス（tenants/{t}/recipients/{b}/documents/{d}/...）
                         ＋ fileSize が数値で 10MB 以下
```

### Storage（追加のみ）

```
match /tenants/{tenantId}/recipients/{recipientId}/documents/{documentId}/{fileName}
  read, delete : 既存と同じ callerTenantId() == tenantId
  create       : 同上 ＋ resource == null（上書き不可）＋ 10MB 以下 ＋ contentType が PDF/JPEG/PNG
```

`resource == null` について：エミュレーターでは既存ファイルへの再アップロードも `create` と判定され上書きできてしまったため、明示的に「まだ存在しないこと」を条件にした。

### 既存権限への影響

- 既存の `users` / `beneficiaries` / `certificates` / 受給者証画像パス / 旧 `uploads/{uid}` のルールは**1文字も変更していない**（`git diff` で確認）。
- カルテのマップ（personal 等）は既存の `beneficiaries` ルール（同テナントなら読み書き可）の範囲で保存される。Rules の追加は不要だった。
- 権限モデル（管理者／スタッフの区別なし）は既存のまま。**LINEスタッフも同じテナントの書類・カルテ情報を読み書き・削除できる**（既存の beneficiaries と同じ扱い）。
- 回帰テスト：新規 Rules テスト10件（既存権限の回帰を含む）と、既存の Functions エミュレーターテスト14件（「LINEスタッフは自事業所のみ読める」等）がいずれも成功（8章）。

---

## 7. Production Coreへの影響

| Production Core | 影響 |
|---|---|
| `CertImportFlow.tsx` | 取込・OCR呼び出し・保存処理は**変更なし**。【追加修正】管理Web用の保存後遷移先（`afterSave` の admin 分岐）の1行のみ変更（14章） |
| OCR処理・パーサ・`ocrFromImageData` | **変更なし** |
| certificates のデータ構造・`currentCertificateId`・`certificateCount`・Storageパス | **変更なし** |
| Callable Functions（名前・payload）・`functions/` 一式 | **変更なし** |
| LINEスタッフ版（`src/app/line/**`） | **コード変更なし**。ただしカルテで本人情報を保存すると `profile` が更新されるため、LINE版の一覧・詳細に表示される氏名・フリガナ・生年月日にも反映される（意図した動作） |
| `lib/firestore/beneficiaries.ts` | `normalizeBeneficiaryData` に `export` を付けただけ（処理内容・呼び出し側は不変） |
| 既存の undefined/null 互換処理 | 変更なし。カルテ保存は `currentCertificateId` に書き込まないため旧データ判定に影響しない（確認済み） |
| 受給者証の閲覧・修正・履歴（旧・利用者詳細画面） | 処理を `chart/CertificatesPanel.tsx` へそのまま移設。差分は「利用者IDをpropsで受け取る」「氏名見出しと一覧へ戻るボタンをカルテ上部へ移動」「要点カードの追加」「未保存状態と保存完了を親へ通知」のみ（元ファイルとの差分 約30行） |
| 受給者証の取込・更新の保存後の遷移先（管理Web） | 【追加修正後】`/t/{t}/beneficiaries/{id}?tab=certificates` へ遷移し、カルテの**「受給者証」タブが最初から選択された状態**で開く（新規登録・既存利用者の更新とも）。LINE版の保存後遷移（`/line/import/done?...`）は変更なし（14章） |
| 利用者一覧の検索フォーム | 旧画面のダミー（動作しない）検索フォームを撤去し、動作する検索に置換 |

---

## 8. テスト結果

### 8.1 自動テスト

| 種類 | コマンド | 結果 |
|---|---|---|
| 単体テスト（既存＋新規） | `npm test` | **112件すべて成功**（既存79件＋新規33件） |
| Rules結合テスト（新規） | `npm run test:rules`（Auth/Firestore/Storage エミュレーター、リポジトリの rules をそのまま使用） | **10件すべて成功** |
| Functions＋Rules 結合テスト（既存） | `npm --prefix functions run test:emulator` | **14件すべて成功**（新しい firestore.rules で実行） |

### 8.2 ブラウザでの動作確認（ローカル）

環境：Firebase Emulator（project `demo-paperlesscare`）＋ `next dev`（エミュレーター接続の環境変数をコマンドで指定。`.env.local` は変更せず、本番へは接続しない）＋ Chrome。LINEは既存のモック（`NEXT_PUBLIC_USE_EMULATORS=1` の偽ID token と偽LINE verifyサーバー）。テストデータ：旧形式・現在＋過去の証・期限間近・期限切れ・有効・期限未入力・証なし・不正データの利用者。

**Phase 1-A**

| 項目 | 結果 |
|---|---|
| 既存利用者のカルテ表示（旧形式・証あり・証なし） | 確認済み |
| 本人情報の保存（郵便番号の誤り → エラー表示 → 修正して保存） | 確認済み（Firestoreで既存フィールドが残っていることも確認） |
| 保護者情報の保存（「住所は利用者と同じ」） | 確認済み |
| 契約情報の保存（終了日が開始日より前 → エラー → 修正して保存） | 確認済み |
| 学校情報の保存（手動学年を空に戻すと自動計算へ戻る） | 確認済み |
| 相談支援情報の保存 | 確認済み |
| 検索（ひらがな「げんざい」・受給者証番号の一部「3333」）・状態での絞り込み | 確認済み |
| 受給者証状態の表示（有効／期限間近〔あと17日〕／期限切れ／期限未入力／未登録） | 確認済み（境界値は自動テスト） |
| 書類アップロード（PDF・PNG 1.1MB）・形式誤り（.txt）と種類未選択のエラー | 確認済み |
| 書類一覧・開く（新しいタブで表示） | 確認済み |
| ダウンロード | **未確認**（ボタンは実装済み。ファイル保存ダイアログを伴うため操作していない） |
| 書類削除（確認表示 → 削除、Storageからも消えたことを確認） | 確認済み |
| 空データ・不正データの利用者 | 確認済み（「未入力」「—」表示、undefined 表示なし） |
| 旧形式 birthday（和暦）を持つ既存データ | 確認済み |
| 権限エラー時の表示（他事業所のURL） | 確認済み（一覧・カルテとも案内文を表示）。存在しない利用者IDの表示も確認済み |
| 画面幅を狭くした表示（375px） | 確認済み（同一オリジンの幅375pxのiframeで確認。ページ全体の横はみ出しなし、タブは横スクロール）。実機スマートフォン・ウィンドウリサイズでは**未確認** |
| 書類のサイズ上限（10MB超） | 自動テストのみ（アプリ側の判定・Storage/Firestore Rules） |
| 書類の上書き禁止・他事業所からのアクセス拒否 | 自動テストのみ（Rulesテスト） |

**Production Core 回帰**

| 項目 | 結果 |
|---|---|
| 新規利用者＋受給者証登録（管理Web） | 確認済み（画像アップロード・保存・カルテへの遷移・画像表示） |
| 既存利用者への受給者証更新（管理Web、旧形式の利用者） | 確認済み（旧データの `certificates/legacy` 移送、新しい証が current、`certificateCount` 2、**カルテの全マップが保持**） |
| 現在の受給者証表示 | 確認済み |
| 過去の受給者証履歴表示（閲覧のみ） | 確認済み |
| 受給者証画像表示（Storage） | 確認済み |
| 受給者証のOCR結果修正の保存（既存機能） | 確認済み |
| 管理Webからの取込 | 確認済み（ただし**OCRは未実行**。下記） |
| LINEスタッフ版からの新規取込 | 確認済み（初回登録 → TOP → 新しい利用者 → 撮影（ファイル選択）→ 氏名手入力 → 登録 → 完了画面） |
| LINEスタッフ版からの既存利用者更新 | 確認済み（カルテ情報を持つ利用者で実施。更新後もカルテの全マップが保持され、履歴は3件） |
| LINE版の利用者一覧・詳細 | 確認済み（カルテで編集したフリガナが反映） |
| 既存利用者一覧 | 確認済み（新しい一覧で全件表示） |
| 既存ログイン | 一部確認：エミュレーターでメール/パスワードのサインインは成功。ログイン後のテナント取得は既存仕様（本番Firestore RESTを直接参照）のためエミュレーターでは動かず、URLを直接開いて確認した（今回の変更とは無関係） |
| OCR（Vision API） | **未確認**。エミュレーターには認証情報がなくOCRは失敗する（LINE版では既存の失敗時表示・手入力の導線が出ることを確認）。OCR処理は今回変更していない |

---

## 9. ビルド / Lint / TypeScript結果

| コマンド | 結果 |
|---|---|
| `npx tsc --noEmit -p .` | 成功（エラー0） |
| `npm test` | 成功（112/112） |
| `npm run test:rules` | 成功（10/10） |
| `npm --prefix functions run test:emulator` | 成功（14/14） |
| `npx next build` | 成功（exit 0、全ルートのビルド完了） |
| `npx eslint src tests` | **失敗（6 errors, 8 warnings）。すべて今回変更していないファイルの既存の指摘**：`AppShell.tsx`・`UnhandledRejectionGuard.tsx`・`LoginClient.tsx`・`LogoutClient.tsx`・`SignupClient.tsx`・`capture/page.tsx`（errors）、`CertImportFlow.tsx`・`PageTabs.tsx`・`certLayouts.tsx`（warnings）。変更前は 8 errors（作り直した旧一覧画面の2件が解消）。今回追加・変更したファイルの指摘は0件 |

参考：ローカル実行には JDK（`JAVA_HOME=/opt/homebrew/opt/openjdk@17`）が必要。firebase-tools から「Java 21 未満は将来非対応」の警告が出る。

---

## 10. 未確認事項

- LINEアプリ（実機）・LIFF からの操作（今回はモックのみ）
- 本番環境（Firebase `paperlesscare` / Vercel Production）での動作。**デプロイしていない**
- 本番 Storage での `resource == null`（上書き禁止）・contentType 判定の挙動（エミュレーターでのみ確認）
- 実際の OCR（Vision API）を通した取込
- 書類の「ダウンロード」ボタン操作
- 実機スマートフォン・Safari・タブレットでの表示（375px幅は iframe で確認）
- 大量データ（数百件以上）での一覧の速度
- 調査時点からの未確認事項：**certificates サブコレクション用の Rules（コミット `2bdbfb72`）が本番にデプロイ済みかどうか**はコードから判断できない

---

## 11. Production反映前チェックリスト

1. [ ] 差分を確認し、コミット・レビュー（現在は未コミット）
2. [ ] 本番の Firestore / Storage Rules が、リポジトリの `firestore.rules` / `storage.rules`（certificates 対応を含む）と一致しているか確認
3. [ ] **Rules を先にデプロイ**：`firebase deploy --only firestore:rules,storage --project paperlesscare`（Rules は追加のみのため、先に出しても現行の本番フロントには影響しない。逆にフロントだけ先に出すと書類機能が permission-denied になる）
4. [ ] Functions のデプロイは**不要**（変更なし）
5. [ ] main への push で Vercel Production が自動デプロイされる点に注意し、Rules 反映後に push
6. [ ] 本番で確認：既存利用者のカルテ表示 → 本人情報・保護者・契約・学校・相談支援の保存 → 書類のアップロード・開く・ダウンロード・削除 → 受給者証の取込（新規・更新）→ 更新後もカルテ情報が残っていること → LINE版で一覧・詳細・取込
7. [ ] 本番で他事業所のURLを開いて表示されないこと（権限）
8. [ ] 本番で管理Webから新規登録・既存利用者の更新を行い、保存後に `?tab=certificates`（カルテの「受給者証」タブ）が開くこと、LINE版は従来どおり完了画面へ進むことを確認
9. [ ] スタッフ向け操作説明（`docs/paperlesscare-staff-certificate-guide-2026-10-02.pptx` 等）のメニュー名称の更新要否（「受給者証取込＆送信」→ メニュー上は「受給者証を取り込む」、「受給者管理」→「利用者管理」）

---

## 12. 今後のPhase 1-Bへの引き継ぎ

- **child OCR**：`parseCertText.ts` の `CERT_PAGE_PARSERS.child` は空のまま。追加すれば取込画面・カルテの要点カード（`extractCertificateHighlights`）は自動的に値を表示する（カルテ側の変更は不要）。
- **受給者証 → カルテ自動反映**：反映先は `personal`（正本）。現状、受給者証更新時に既存の `addCertificateToBeneficiary` が `profile` を OCR の値で上書きする（`mergeProfile`）ため、`personal` と `profile` が食い違う可能性がある（カルテは personal、LINE版は profile を表示）。自動反映を作る際は「候補として提示 → スタッフが確認して personal に反映し、profile にも写す」形にし、`mergeProfile` の扱いも合わせて見直すこと。
- **期限管理強化**：状態判定は `getCertificateStatus({ expiringSoonDays })` に集約済み。事業所設定にする場合は設定値を渡すだけ。有効期限は受給者証docの `validTo`（ページ2の支給決定期間①、無ければページ7の負担期間から算出）で、child はOCRが無いため手入力しない限り「期限未入力」になる点に注意。
- **一覧の性能**：一覧は利用者ごとに現在の受給者証docを1件ずつ読む（受給者証docは pages・ocrText を含み大きい）。件数が増えたら、利用者docに `currentCertificateValidTo` 等の写しを持たせる（その場合は CertImportFlow 側の保存処理の変更が必要＝Production Core の変更になる）か、一覧専用の集計を検討。
- **学年**：`school.grade` を基本情報・学校の両カードで編集する（同じ値）。特別支援学校の「小学部」等の表記はそのまま手入力できる。
- **利用状態**：`personal.usageStatus`（利用中/休止/利用終了）は既存の `status`（active/inactive）とは独立。LINE版の一覧は従来どおり `status` で絞り込むため、「利用終了」にしても LINE版には表示される。連動させるかは要判断。
- **新機能の置き場所**：利用予定・記録等は `tenants/{t}/beneficiaries/{b}/...` のサブコレクション、または横断検索が必要ならテナント直下＋`beneficiaryId` で設計し、Rules を追加すること（現在の Rules は許可したパス以外すべて拒否）。

---

## 13. 既知の課題

| 課題 | 補足 |
|---|---|
| 権限モデルが1段階 | 管理者・LINEスタッフとも同テナントの全データを読み書き・削除できる（書類・カルテも同じ）。本格的な再設計は別課題 |
| LINEスタッフも管理Web（`/t/...`）を開ける | 既存仕様。Rules上は同テナントの所属者として扱われる |
| `profile` と `personal` の二重管理 | 互換のため意図的に残している（12章） |
| 一覧の受給者証読み込みが利用者数に比例 | 12章 |
| ページ遷移時の `AbortError` がコンソールに出る | Firestore SDK 由来の既存事象（`UnhandledRejectionGuard` が無効化されている）。今回の変更とは無関係 |
| 既存の lint エラー6件 | 9章。今回は対象外 |
| 受給者証の個別セル編集でクリック後に入力欄へ自動フォーカスしない | 既存の `certLayouts.tsx` の挙動（今回変更していない） |
| 未保存の確認に `window.confirm` を使用 | 既存の利用者詳細画面と同じ方式 |
| `/login` がエミュレーターでテナント取得できない | 既存仕様（本番Firestore RESTを直接参照） |
| 旧一覧画面の `page.module.css` を削除 | 未使用になったため。復元が必要なら git から戻せる |

---

## 14. 追加修正：管理Webの保存後に「受給者証」タブを開く（2026-10-03）

### 14.1 変更内容

| 項目 | 内容 |
|---|---|
| 目的 | 管理Webで受給者証の新規登録・更新を保存した後、利用者カルテの「受給者証」タブを最初から表示する |
| 変更前 | 保存後 `/t/{tenantId}/beneficiaries/{id}` へ遷移 → カルテの「基本情報」タブが開く |
| 変更後 | 保存後 `/t/{tenantId}/beneficiaries/{id}?tab=certificates` へ遷移 → 「受給者証」タブが開く |
| 方法 | `CertImportFlow.tsx` の `importRoutes()` は管理Web（admin）とLINE（line）で遷移先を別々に定義している。**admin 分岐の `afterSave` の1行だけ**にクエリを付けた。カルテ側は Phase 1-A で `?tab=` に対応済みのため変更不要 |
| 変更しなかったもの | 保存処理（`handleSaveBeneficiary`、画像アップロード、`createBeneficiaryWithCertificate` / `addCertificateToBeneficiary`）、OCR、certificates 構造、`currentCertificateId` / `certificateCount`、Storageパス、履歴、OCR結果修正、Callable Functions、LINE版（`importRoutes` の line 分岐を含む）、Firestore / Storage Rules、カルテのデータ構造 |
| 変更ファイル | `src/app/t/[tenantId]/CertImportFlow.tsx` のみ（＋本報告書）。差分は 2 行追加・1 行削除 |

```diff
-    afterSave: (id) => `/t/${tenantId}/beneficiaries/${id}`,
+    // 管理Webは保存後、利用者カルテの「受給者証」タブを開く（LINE版の遷移先は上の分岐で別に定義）
+    afterSave: (id) => `/t/${tenantId}/beneficiaries/${id}?tab=certificates`,
```

### 14.2 テスト結果

ローカル環境（Firebase Emulator `demo-paperlesscare`＋`next dev`＋Chrome、テストデータを再投入）で確認。

| 項目 | 結果 |
|---|---|
| 管理Web：新規利用者＋受給者証登録 → 保存後のURLが `/t/t-test/beneficiaries/{新ID}?tab=certificates`、「受給者証」タブが選択済み | 確認済み |
| 管理Web：既存利用者（カルテ「受給者証」タブ →「受給者証を更新」→ 取込 → 保存）→ 同じ利用者の `/t/t-test/beneficiaries/b-current?tab=certificates` に戻り「受給者証」タブが選択済み | 確認済み |
| 現在の受給者証の表示（更新後、新しい証が「現在」） | 確認済み |
| 過去の受給者証履歴の表示（更新後「過去の受給者証（2件）」、過去証は閲覧のみ） | 確認済み |
| 受給者証画像の表示（新規登録した証・更新後の現在の証・過去の証） | 確認済み（画像が読み込まれていることをDOMで確認） |
| カルテの「基本情報」「契約・関係先」「書類」タブを開く | 確認済み（各タブの見出しが表示され、URLの `?tab=` も切り替わる） |
| LINE版：新規取込 → 保存後 `/line/import/done?beneficiaryId=…&mode=new`（完了画面） | 確認済み（変更前と同じ） |
| LINE版：既存利用者の更新 → 保存後 `/line/import/done?beneficiaryId=b-valid&mode=update`（完了画面） | 確認済み（変更前と同じ） |
| 遷移先の自動テスト | **なし**。`importRoutes` は非公開関数で、`CertImportFlow.tsx` は Firebase を読み込むため、単体テスト化には Production Core のリファクタリングが必要になる。今回は最小変更を優先し、上記のブラウザ確認で代替した |
| OCR（Vision API） | 未確認（エミュレーターでは動かないため、OCRを通さずに保存。OCR処理は変更していない） |
| 本番環境・LINEアプリ実機 | 未確認（デプロイしていない） |

### 14.3 ビルド・テスト

| コマンド | 結果 |
|---|---|
| `npx tsc --noEmit -p .` | 成功 |
| `npm test` | 成功（112/112） |
| `npm run test:rules` | 成功（10/10） |
| `npx next build` | 成功（exit 0） |
| `npx eslint src/app/t/[tenantId]/CertImportFlow.tsx` | error 0、warning 1（`<img>` の使用）。**変更前から存在する同じ warning**（変更前の行番号1117 → コメント1行追加により1118）。新しいエラー・warningは追加していない |
| `npx eslint src tests`（全体） | 14 problems（6 errors, 8 warnings）で、9章の結果から**増減なし**（すべて今回変更していないファイルの既存の指摘、および上記の既存warning） |

### 14.4 Git / Production

- ブランチ `feat/phase1a-beneficiary-chart` 上で、既存の未コミットの Phase 1-A 実装に今回の変更を追加した。**コミット・push は行っていない**（main への push もしていない）
- **Production へのデプロイは行っていない**
- 確認用に一時作成した `functions/.env.local`（LINE verify のローカル差し替え。gitignore 対象）は確認後に削除した

---

## 15. ローカル確認用テストデータを18歳未満の児童中心へ変更（2026-10-03）

ローカル確認用テストデータを、**放課後等デイサービスの実利用者像に合わせて18歳未満の児童中心へ変更した**。アプリ本体・年齢／学年計算ロジック・カルテ・データ構造・受給者証機能・LINE版・Rules は**変更していない**。

### 15.1 変更前の状況

- これまでの E2E で使った投入スクリプトはリポジトリ外（作業用の一時フォルダ）にあり、リポジトリには含まれていなかった。
- 生年月日自体は 2026年10月時点で 7〜12歳だったが、氏名が「一郎・次郎・三郎・四郎・五子」のような仮名で、3名の受給者証が `certType: "adult"`（紫色・18歳以上の受給者証）になっていた。LINE版では「障害福祉サービス受給者証（18歳以上）」と表示されていたため、高齢者・成人のような印象のデータになっていた。

### 15.2 変更内容

投入スクリプトを `tests/e2e/seed-emulator.mjs` としてリポジトリに追加した（**新規ファイル**。Production・本番 Firestore には接続できない）。

- 接続先は 127.0.0.1 のエミュレーター・`demo-paperlesscare` に固定
- 管理者パスワードは実行ごとに生成し、引数のファイル（省略時は OS の一時フォルダ）にだけ書き出す
- 受給者証はすべて18歳未満用（`child`・黄緑色）
- 氏名・学校名・受給者証番号はすべて架空。学校名は架空の「なないろ市」を使った（なないろ市立なないろ小学校、なないろ市立なないろ中学校、なないろ県立あおぞら特別支援学校）
- 生年月日は 2026年10月時点で自然な年齢・学年になる値に固定した。受給者証の有効期限は実行日からの相対日付にし、いつ実行しても状態（有効／期限間近／期限切れ）が変わらないようにした

実行方法：

```
firebase emulators:start --project demo-paperlesscare --only auth,firestore,storage,functions
node tests/e2e/seed-emulator.mjs [ログイン情報の出力先.json]
```

### 15.3 テスト利用者と維持したテストパターン

| 利用者（架空） | 生年月日 | 表示（2026-10-03 確認） | 維持したテストパターン |
|---|---|---|---|
| 佐藤 ひなた | 2018-06-12（和暦「平成30年6月12日」で保存） | 8歳・小学2年 | 現在＋過去の受給者証、**期限間近**（あと17日）、受給者証画像、**和暦birthday**、学校・保護者情報あり |
| 伊藤 そら | 2017-05-30 | 9歳・小学3年 | 受給者証**未登録**（枠だけ作成した利用者） |
| 田中 太郎 | 2015-08-03（summary に和暦のみ） | 11歳・小学5年 | **旧形式データ**（`currentCertificateId` なし・直下に pages、ページ2の1組目が旧フィールド）、**期限切れ**、フリガナなし |
| 山田 花子 | 2013-07-22 | 13歳・中学1年 | **期限切れ**、学校情報あり |
| 鈴木 大翔 | 2012-02-10（早生まれ） | 14歳・中学3年 | **有効**、カルテの本人情報（ISOの `personal.birthDate`）・利用状態「利用中」・住所あり |
| 高橋 結衣 | 2010-09-05 | 16歳・高等部1年（手動） | **期限未入力**、**手動学年**（特別支援学校 高等部。自動計算は高校1年） |
| （氏名なし） | 「不明」 | 年齢・学年「—」 | **不正／空データ**（読めない生年月日、壊れたカルテ値） |

年齢・学年の組み合わせはすべて自然で、アプリ側の年齢・学年表示に不自然な結果は見つからなかった（アプリの修正は不要）。

### 15.4 確認結果

| 項目 | 結果 |
|---|---|
| 利用者一覧に18歳未満の児童が表示され、年齢・学年が自然 | 確認済み（ローカル画面。上表の値を一覧から読み取り） |
| 受給者証状態（有効／期限間近／期限切れ／期限未入力／未登録） | 確認済み |
| 利用者カルテ（旧形式・カルテ情報あり・未登録・不正データ・手動学年・受給者証タブ） | 確認済み（`undefined` 表示なし、受給者証画像の読み込み、過去の受給者証1件の表示を含む） |
| 検索：「田中」「やまだ」「ﾀｶﾊｼ」「すずき」「3302」 | 確認済み（いずれも該当者1名）。ブラウザのキー入力がページに届かなかったため、入力欄へ値を設定して入力イベントを発生させる方法で確認した |
| 検索：「たなか」（ひらがな） | 該当なし。田中 太郎（旧形式）はフリガナが未登録で、検索はひらがな→漢字の変換をしないため（既存の仕様どおり。テストデータ・アプリとも変更していない） |
| `npm test` | 成功（112/112） |
| `npm run test:rules` | 成功（10/10） |
| `npx tsc --noEmit -p .` | 成功 |
| `npx eslint tests/e2e/seed-emulator.mjs` | 指摘なし |

### 15.5 変更しなかったテストデータ

- 単体テスト（`src/lib/beneficiaryChart/*.test.ts`）と Rules テスト（`tests/rules/phase1a.rules.test.mjs`）の日付・氏名は変更していない。これらは利用者データではなく計算・判定ロジックの境界値テスト（例：「平成20年4月1日」の和暦変換、18歳を超えた場合の「高校卒業後」表示、存在しない日付）で、削除すると網羅性が下がるため。Rules テストの利用者（山田 太郎、平成27年5月10日生）は既に児童である。

### 15.6 変更ファイル

| ファイル | 内容 |
|---|---|
| `tests/e2e/seed-emulator.mjs` | 新規：ローカル確認用テストデータ（児童中心） |
| `PHASE1A_IMPLEMENTATION_REPORT.md` | 本章を追記 |

**Production へのデプロイ・main への push・コミットは行っていない。**

---

**Production へのデプロイ・main への push・コミットは行っていません。**
