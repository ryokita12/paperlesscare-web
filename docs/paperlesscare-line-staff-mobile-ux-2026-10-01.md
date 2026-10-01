# PaperlessCare LINEスタッフ版 スマホUI/UX改善レポート（2026-10-01）

| 項目 | 内容 |
|---|---|
| 対象 | LINEスタッフ版（`/line` 配下）のみ |
| ブランチ | `feat/line-mobile-ux` |
| main 反映 | `331ec3c1` → `1d7cbef2`（fast-forward、マージコミットなし）※本レポートはその後のdocsコミット |
| Production | https://paperlesscare-web.vercel.app/line （LIFF：https://liff.line.me/2011820567-88l5QrPj） |
| 変更しなかったもの | Functions、Firestore Rules、Storage Rules、LIFF ID、LINE Developers 設定、リッチメニュー、tenant `XcM8g7REI7Cks4kVQBHD`、スタッフ認証キー |

---

## 1. 今回の目的

明日（2026-10-02）の顧客レビューで現場スタッフに実機で触ってもらうため、LINEスタッフ版を「スマホで迷わず操作できるUI」にする。あわせて、受給者証の登録時に **新しい利用者／登録済みの利用者** をスタッフが必ず明示的に選ぶ導線にする。

バックエンド（認証・OCR・保存・受給者証履歴）は変更せず、既存処理をそのまま再利用する。

## 2. 変更前の課題

| 課題 | 内容 |
|---|---|
| 取込画面がPC管理画面のまま | `/line/import` は管理Webと同じ `CertImportFlow` の画面（種別カード3列、ページタブ、小さい「取込開始」「クリア」ボタン、帳票表、「Firestoreに保存します」等）をスマホ幅で表示していた |
| 新規／既存の区別がない | TOPの「受給者証を登録」は常に新規利用者扱い。既存利用者への更新は「利用者を見る → 詳細 → 更新」を知っている人しか辿れない |
| 誤登録の防止策がない | 既存利用者に別人の受給者証を登録しても気づけない（更新時は氏名もOCR結果で上書きされる） |
| エラーが技術用語 | `❌ Error: functions/internal ...` などをそのまま表示 |
| 保存後の完了表示がない | 保存すると黙って利用者詳細へ遷移 |
| ボタン文字色の不具合 | `globals.css` の `a { color: inherit }` がレイヤー外のため Tailwind の `text-white` 等より優先され、`Link` で描いたボタンの文字色が効いていなかった（緑ボタンに黒文字） |
| safe-area 未対応 | ノッチ・ホームバー付き端末で端に寄る |

## 3. 新しい画面遷移

```
/line（LIFF起動・自動ログイン）
  ├─ 未登録 → /line/register（スタッフ認証）→ /line/home
  └─ 登録済 → /line/home（TOP）
        ├─ 受給者証を登録する → /line/import/start（新規／既存の選択）★新規
        │     ├─ 新しい利用者     → /line/import?new=1
        │     │                       色選択 → 撮影(ページごと) → 内容確認 → 登録
        │     │                       → /line/import/done?mode=new ★新規
        │     └─ 登録済みの利用者 → /line/beneficiaries/select ★新規（検索・選択）
        │                           → /line/beneficiaries/select?id=… （この利用者でよろしいですか？）
        │                           → /line/import?beneficiaryId=…&new=1
        │                              色選択 → 撮影 → 内容確認（氏名不一致チェック）→ 登録
        │                           → /line/import/done?mode=update
        └─ 利用者を確認する → /line/beneficiaries（検索・一覧）
                               → /line/beneficiaries/[id]（詳細）→ 受給者証を更新する → /line/import?beneficiaryId=…&new=1
```

完了画面からは「○○さんを確認する」（詳細）と「ホームに戻る」。完了画面へは `router.replace` で遷移するため、端末の戻る操作で取込画面に戻らない。

## 4. 新規利用者登録フロー

1. TOP「受給者証を登録する」→「新しい利用者」
2. 受給者証の色を選ぶ（紫色＝18歳以上／黄緑色＝18歳未満。タップで次へ）
3. ページごとに「撮影する」（端末標準カメラ）または「写真から選ぶ」。撮影すると自動で読み取り（OCR）
4. 1ページ目は主な項目（氏名・フリガナ・受給者番号・生年月日・交付年月日・支給市町村）を大きな入力欄で確認・修正。その他の項目は「そのほかの項目を確認・修正」で管理Webと同じ帳票表示を開いて修正
5. 「次のページへ」「このページはとばす」「撮影を終えて確認へ」
6. 「内容を確認して登録」画面で内容を確認 →「この内容で登録する」
7. 完了画面

保存処理は既存の `createBeneficiaryWithCertificate`（利用者doc＋受給者証docを1バッチで作成し `currentCertificateId` を設定）をそのまま使う。

**LINE版のみの入力チェック**：新しい利用者で氏名が空のときは「氏名が入っていません」と表示し登録ボタンを押せない（後から検索できない利用者が作られるのを防ぐ）。

## 5. 既存利用者更新フロー

1. TOP「受給者証を登録する」→「登録済みの利用者」
2. 「利用者を選択」画面で検索して利用者をタップ
3. 「この利用者でよろしいですか？」— 氏名（大きく）・フリガナ、「この利用者の受給者証を更新します／登録します」、受給者証がある場合は「今の受給者証は履歴として残ります」
4. 「受給者証を撮影する」→ 色選択（現在の証の種別を初期選択）→ 撮影 → 内容確認
5. 確認画面で **選んだ利用者名とOCRの氏名が明らかに違う場合**、警告「氏名が違うようです（選んだ利用者：○○さん／受給者証の氏名：△△）」を表示し、「この利用者で間違いありません」にチェックするまで登録できない
6. 登録 → 完了画面「○○さんの受給者証を更新しました。以前の受給者証は履歴に残っています」

保存処理は既存の `addCertificateToBeneficiary`（1トランザクションで新証作成・旧証を `superseded`＋`supersededBy`・利用者docの `currentCertificateId` 更新）をそのまま使う。**対象利用者はスタッフが選んだIDのみ**で、OCR結果から利用者を自動決定する処理は追加していない。

各手順の上部には常に「○○さん」／「新しい利用者」のバッジを表示し、誰の受給者証を登録しているかが分かるようにした。途中でやめる場合は「登録をやめる」→ 確認（続ける／やめる）で、取込中の一時データ（sessionStorage・IndexedDB）を破棄する。

## 6. 利用者検索仕様

共通ロジック `src/app/line/lib/beneficiarySearch.ts`、共通部品 `src/app/line/beneficiaries/BeneficiaryPicker.tsx` を「利用者を確認する」「利用者を選択」の両方で使う。

| 項目 | 内容 |
|---|---|
| 検索対象フィールド | `profile.name`・`summary.name`（氏名）、`profile.furigana`・`summary.furigana`（フリガナ）、`summary.number`（受給者番号）。すべて既存の利用者docに存在するフィールド（`certificateModel.ts` で確認）。旧データ（profile 無し）は summary で検索できる |
| 正規化 | NFKC（全角英数→半角、半角カナ→全角）、空白（全角含む）除去、**ひらがな→カタカナ**、小文字化。「やまだ」「ﾔﾏﾀﾞ」「山田太郎」で「山田 太郎／ヤマダ タロウ」に一致 |
| 一致方法 | 部分一致 |
| 対象 | ログイン中スタッフの tenantId の `tenants/{tenantId}/beneficiaries` のみ（`listBeneficiaries` を再利用）。`status: inactive` は除外（従来どおり）。Firestore Rules でも他事業所は読めない |
| 未入力時 | 全件を更新日の新しい順に表示（件数表示つき）。検索欄はスクロールしても上部に固定 |
| 該当なし | 「『○○』に当てはまる利用者がいません／ひらがな・漢字の一部でも検索できます」 |
| 氏名不一致判定 `isNameMismatch` | 同じ正規化をした上で完全一致しなければ不一致。どちらかが空（OCRで氏名が取れない等）の場合は判定しない |

## 7. UI/UX改善内容

| 画面 | 改善 |
|---|---|
| 共通（`ui.tsx`） | 画面ヘッダー（戻る＋大きなタイトル＋短い補足）、大きな選択タイル（アイコン＋見出し＋1行説明）、ボタン高さ56px以上・全幅、線画アイコン（SVG）、注意／エラー表示、読み込み表示、技術的エラーを日本語に置き換える `friendlyErrorMessage` |
| レイアウト | `viewport-fit=cover`＋`env(safe-area-inset-*)`、ヘッダーを細く、背景を淡いグリーングレー、`-webkit-tap-highlight-color: transparent` |
| TOP | 「こんにちは、○○さん／今日は何をしますか？」＋2択のみ（「受給者証を登録する／写真を撮ってかんたん登録」「利用者を確認する／登録済みの利用者を検索・確認」） |
| 新規／既存の選択 | 「受給者証を登録／どなたの受給者証ですか？」＋「新しい利用者／はじめて登録する方」「登録済みの利用者／受給者証の更新・追加」 |
| 利用者一覧・選択 | 検索欄を主導線に、氏名を大きく・フリガナを小さく、受給者証未登録のみ注記。番号などの詳細は一覧から外した |
| 利用者詳細 | 氏名 → 受給者証（有効期間・番号・種類・交付日、期限切れ/現在のバッジ、写真はボタンで表示）→「受給者証を更新する」→ 基本情報 → 以前の受給者証 |
| 取込（LINE専用表示） | 手順を「色を選ぶ → ページごとに撮影 → 確認して登録」に分割。未撮影ページは見本画像で「どのページを撮るか」を表示、撮影後は写真。1〜8の丸ボタンで撮影済みが一目で分かる。読み取り中は写真上に「文字を読み取っています」。手順切替時に画面先頭へスクロール |
| 完了 | 大きなチェック＋「登録しました」＋「○○さんの受給者証を登録／更新しました」＋2ボタン |
| スタッフ登録 | ヘッダー統一、文字サイズ拡大、通信・内部エラーを日本語に（認証キー誤り等の Functions の日本語メッセージはそのまま表示） |
| 起動エラー | 技術的メッセージを出さず「通信状況を確認して、もう一度お試しください。」（詳細は console に出力） |

## 8. 再利用した既存ロジック

| 既存処理 | 再利用方法 |
|---|---|
| `CertImportFlow`（撮影・圧縮・IndexedDB退避・sessionStorage復元・OCR呼び出し・パース・アップロード・保存・失敗時の画像削除） | **処理は一切複製せず**、`variant="line"` のときだけ表示を `LineCertImportView` に切り替え、state と操作関数を props で渡す |
| `createBeneficiaryWithCertificate` / `addCertificateToBeneficiary` | 変更なし（CertImportFlow 経由） |
| `listBeneficiaries` / `getBeneficiary` / `listCertificates` | 変更なし |
| `CertLayoutRenderer`（帳票レイアウト・項目編集） | LINE取込画面の「そのほかの項目を確認・修正」で使用 |
| `CertImageViewer` | 詳細画面の受給者証写真 |
| `CERT_TYPES` / `getPageDefinitions` / `/cert-samples/{type}/page-N.png` | 色選択・ページ名・見本画像 |
| `LineSessionProvider`（LIFF・lineSignIn・Custom Token） | ロジック変更なし（起動エラーの表示文言のみ） |

### CertImportFlow への変更（管理Webへの影響がない範囲）

- `ImportRoutes.afterSave` を追加：管理Webは従来どおり `/t/{tenantId}/beneficiaries/{id}` へ `push`、LINE版は完了画面へ `replace`
- LINE表示用の state（`ocrError` / `saveError` / `saved`）を追加。管理Webの表示は従来の `status` / `saveMessage` のまま
- `if (isLine) return <LineCertImportView … />` を管理Web用の描画より前に追加。**管理Webの JSX は無変更**

## 9. 新規作成／変更したファイル

| 種別 | ファイル |
|---|---|
| 新規 | `src/app/line/import/start/page.tsx`（新規／既存の選択） |
| 新規 | `src/app/line/beneficiaries/select/page.tsx`（利用者を選択＋確認） |
| 新規 | `src/app/line/import/done/page.tsx`（登録完了） |
| 新規 | `src/app/line/import/LineCertImportView.tsx`（LINE用取込画面） |
| 新規 | `src/app/line/beneficiaries/BeneficiaryPicker.tsx`（検索＋一覧の共通部品） |
| 新規 | `src/app/line/lib/beneficiarySearch.ts`・`.test.ts`（検索・氏名不一致の純粋ロジック＋テスト5件） |
| 変更 | `src/app/line/ui.tsx`、`layout.tsx`、`LineSessionProvider.tsx`、`home/page.tsx`、`register/page.tsx`、`import/page.tsx`、`beneficiaries/page.tsx`、`beneficiaries/[beneficiaryId]/page.tsx` |
| 変更 | `src/app/t/[tenantId]/CertImportFlow.tsx`（上記の追加のみ） |
| 変更なし | `functions/`、`firestore.rules`、`storage.rules`、`firestore.indexes.json`、`/login`、`/t/[tenantId]/**`（CertImportFlow 以外） |

## 10. テスト結果

### 自動テスト

| テスト | 結果 |
|---|---|
| `npm test`（node:test） | 79件すべて成功（新規の検索ロジック5件を含む） |
| `npm --prefix functions run test:emulator`（Auth/Firestore/Functions エミュレーター＋本番と同じ Rules） | 14件すべて成功（LINEスタッフは自事業所のみ読める、等） |
| `npx tsc --noEmit` | エラーなし |
| ESLint（変更ファイル） | エラー0（管理Web部分の既存警告 `no-img-element` 1件のみ） |
| `next build` | 成功（`/line/import/start`・`/line/beneficiaries/select`・`/line/import/done` を含む） |

### ブラウザE2E（Firebase エミュレーター＋偽LIFF＝`NEXT_PUBLIC_USE_EMULATORS=1`）

検証データ：事業所 `t-hinayuri`（山田 太郎＝受給者証あり `c-old`、佐藤 花子＝受給者証なし）、別事業所 `t-other`（山田 次郎）。撮影は見本画像をカメラ入力へ投入して代用。

| # | 内容 | 結果 |
|---|---|---|
| A | TOP → 受給者証を登録 → 新しい利用者 → 色選択 → 撮影 → 確認（氏名空では登録不可を確認）→ 氏名入力 → 登録 → 完了画面「鈴木 美咲さんの受給者証を登録しました」 | OK。Firestore に利用者doc＋受給者証doc（current）、`currentCertificateId` 設定、画像は `recipients/{id}/certificates/{certId}/page1.jpg` |
| B | TOP → 受給者証を登録 → 登録済みの利用者 →「やまだ」で検索 → 山田 太郎 → 確認画面 → 撮影 → 別氏名を入力 → **氏名不一致警告**（チェックまで登録不可）→ 登録 → 完了画面（mode=update） | OK |
| C | B の後、以前の証が履歴として残る | OK。`c-old` は `status: superseded`、`supersededBy` = 新証ID。LINE詳細・管理Web詳細とも「以前の受給者証（1件）」に表示 |
| D | `currentCertificateId` が新しい証へ更新 | OK（`certificateCount` 1→2） |
| E | 利用者を確認する →「すずき」で検索 → 詳細表示 | OK |
| F | 別事業所の利用者が出ない | OK。一覧は自事業所の件数のみ、「やまだ」でも他事業所の「山田 次郎」は出ない。Rules の結合テストでも他事業所の読み取り 403 |
| G | 管理Web：利用者一覧／利用者詳細（現在＋過去の証）／受給者証取込（モード選択→新規→画像選択→確定して保存→**管理Webの利用者詳細へ遷移**）／システム設定（LINEスタッフ設定・登録済みスタッフ1名） | OK |
| H | LINE認証：初回スタッフ登録（認証キー）→ 再読み込みでキー入力なしにTOPへ自動入場、管理Webログイン後に `/line` を開き直してもLINEスタッフとして再入場 | OK |
| 追加 | 「登録をやめる」→ 確認 → やめる で一時データが消え利用者詳細へ戻る／証なし利用者は「登録します」表示 | OK |

E2E中に見つけて修正したもの：`Link` ボタンの文字色（上記）、見本画像の高さ（`globals.css` の `img { height: auto }` が `h-*` に勝つため style 指定）、戻るリンクと利用者バッジの横並び、手順切替時のスクロール位置、検索欄のブラウザ標準×ボタンの重複。

## 11. Production反映結果

| 項目 | 結果 |
|---|---|
| main | `origin/main` を `331ec3c1` → `1d7cbef2` へ fast-forward（push により Vercel Production が自動デプロイ） |
| 新ルート | 本番で `/line`、`/line/home`、`/line/import/start`、`/line/beneficiaries`、`/line/beneficiaries/select`、`/line/import/done`、`/login` がいずれも HTTP 200 |
| 本番JS | 新画面の文言（「どなたの受給者証ですか」「こんにちは、」「受給者証の色は」「氏名が違うようです」「この利用者でよろしいですか」「登録しました」）を本番チャンクで確認。LIFF ID `2011820567-88l5QrPj`（小文字 l）が埋め込まれていることも確認 |
| Functions / Rules | 変更・再デプロイなし |
| LINE Developers / リッチメニュー / Vercel 環境変数 | 変更なし |

## 12. 既存Webへの影響確認

- 管理Webのルート・画面は `CertImportFlow` 以外ファイル差分なし
- `CertImportFlow` は管理Webの描画部分（JSX）を変更しておらず、保存後の遷移先も従来と同じ URL（`afterSave` が `beneficiaryDetail` と同じ値を返す）
- エミュレーター上で管理Webの一覧・詳細・取込→保存→詳細・設定を確認（10章 G）
- 注意：`/login` は Firestore REST の本番URLを直接参照しているため、エミュレーター環境ではログイン後のテナント取得が 403 になる（今回の変更とは無関係の既存仕様。本番では問題なし）。E2E では Auth サインイン後に `/t/t-hinayuri` へ直接遷移して確認した

## 13. 未確認事項

| 項目 | 理由・補足 |
|---|---|
| 実機（LINEアプリ内ブラウザ）での表示・カメラ起動 | 実機はユーザー確認。iPhone のノッチ/ホームバー周り、Android の戻るボタン挙動も実機で確認が必要 |
| 本番OCRでの読み取り結果の表示 | エミュレーターは Vision API の認証情報が無く OCR は失敗する（失敗時の表示・手入力・再読み取り導線は確認済み）。OCR処理自体は今回変更していない |
| 本番データでの保存 | 本番テナントへは書き込んでいない（テストデータ混入を避けるため） |
| 撮影元の記録 `source` | 端末判定（`isMobileDevice`）は既存のまま。PCブラウザでのE2Eでは `web`、スマホでは `mobile` になる想定 |
| 更新時の氏名の上書き | 既存の `mergeProfile` により、新しい証の氏名（OCR/修正後）で利用者の氏名が更新される（既存仕様）。誤登録防止として不一致時の確認を追加した |

## 14. 明日の顧客レビューで確認すべき項目

1. TOPを見て、説明なしで「受給者証を登録する」「利用者を確認する」が分かるか
2. 「新しい利用者／登録済みの利用者」の言葉で迷わないか
3. 受給者証の「色」で種別を選ぶ方式が現場の感覚に合うか
4. 8ページを1枚ずつ撮る流れ・「とばす」「撮影を終えて確認へ」で困らないか（実際に何ページ撮影する運用か）
5. 1ページ目で確認する6項目（氏名・フリガナ・受給者番号・生年月日・交付年月日・支給市町村）で十分か
6. 氏名不一致の警告の文言・チェック方式が適切か
7. 利用者検索：ひらがな入力で探せるか、一覧に表示する情報（氏名・フリガナ・未登録の注記）で足りるか
8. 文字の大きさ・ボタンの大きさ・色合い（明るさ・やさしさ）の印象
9. 完了画面の後、次に何をしたいか（続けて別の人を登録する導線が必要か）
