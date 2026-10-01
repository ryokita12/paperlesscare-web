# PaperlessCare LINEスタッフ版 本番反映レポート（2026-10-01）

本レポートは実際に確認した事実のみを記載する。状態は次の区分で表記する。

| 区分 | 意味 |
|---|---|
| 実装済み | コードが main に存在する |
| ローカル確認済み | Firebase Emulator / ローカル Next.js で動作を確認した |
| 本番デプロイ済み | 本番（Firebase `paperlesscare` / Vercel Production）へ反映した |
| 本番疎通確認済み | 本番環境に対して実際にリクエストを送り、期待どおりの応答を確認した |
| 実機確認済み | LINEアプリ（実機）から操作して確認した ※今回は **該当なし** |

---

## 1. 実施概要

| 項目 | 内容 |
|---|---|
| 目的 | LINE公式アカウント（リッチメニュー → LIFF）から、店舗スタッフが初回のみ認証キーで登録し、以後は自動でスタッフ用PaperlessCareに入れる仕組みを本番へ反映する |
| 実施日時 | 2026-10-01 21:50頃 〜 22:37（JST） |
| 対象環境 | Firebase / Google Cloud プロジェクト `paperlesscare`（プロジェクト番号 207345078447）、Vercel プロジェクト `paperlesscare-web`（Production：https://paperlesscare-web.vercel.app） |
| 対象ブランチ | `feat/line-staff-phase2` |
| main への反映 | 済み。`origin/main` を `2bdbfb72` → `d4162b3c` へ fast-forward（マージコミットなし）。※本レポートのコミットは `feat/line-staff-phase2` のみに追加（main 未反映。docs のみのため Production 再デプロイを避けた） |

gcloud のデフォルトプロジェクトは `linkbook-forappointment` のままであり、今回のすべての gcloud コマンドは `--project paperlesscare` を明示して実行した。変更前に `gcloud projects describe paperlesscare` で projectId `paperlesscare` / 番号 207345078447 / ACTIVE を確認した。

## 2. LINE / LIFF 設定

| 項目 | 値・状態 |
|---|---|
| LINE Login Channel ID | 2011820567 |
| LIFF ID | 2011820567-88I5QrPj |
| LIFF Endpoint URL | https://paperlesscare-web.vercel.app/line |
| Scope | openid, profile |
| LINE Login チャネル公開状態 | **未変更**（今回の作業では公開操作を行っていない。現在の状態は LINE Developers Console で要確認） |
| リッチメニューURL | **未変更**（最終的な設定値：`https://liff.line.me/2011820567-88I5QrPj`） |

Channel Secret 等の秘密情報は本実装では使用していない（ID token 検証は Channel ID のみで行う）。

## 3. Firebase / IAM 設定

| 項目 | 内容 |
|---|---|
| IAM Service Account Credentials API（`iamcredentials.googleapis.com`） | 確認時点で **既に有効**。変更なし |
| 対象サービスアカウント | `207345078447-compute@developer.gserviceaccount.com`（Compute Engine default SA）。`gcloud run services list` で、今回の4 Functions および既存の `ocrFromImageData` がこのSAで実行されていることを確認 |

### 追加した IAM 権限

| ロール | 付与先（スコープ） | 理由 |
|---|---|---|
| `roles/datastore.user` | プロジェクト `paperlesscare` | Functions（Admin SDK）から Firestore（tenants / staffAuthKeys / lineUsers / lineAuthAttempts / users）を読み書きするため |
| `roles/firebaseauth.admin` | プロジェクト `paperlesscare` | LINEスタッフ用の Firebase Auth ユーザー（uid = `line_{LINE userId}`）を作成・更新するため |
| `roles/iam.serviceAccountTokenCreator` | **当該SA自身のみ**（SAリソースのIAMポリシー。プロジェクト全体には付与していない） | Firebase Custom Token を署名（`signBlob`）するため |

付与前のSAのプロジェクトロールは `artifactregistry.reader/writer`、`cloudbuild.builds.builder`、`iam.serviceAccountUser`、`run.admin` のみで、Firestore 権限が無かった（→ 11章 問題1）。

## 4. Cloud Functions

共通：asia-northeast1、Node.js 24（2nd Gen）、Callable（onCall）。`firebase deploy --only functions:lineSignIn,functions:lineRegisterStaff,functions:getStaffAuthKeyStatus,functions:updateStaffAuthKey --project paperlesscare` で4件とも `Successful create operation`。既存の `ocrFromImageData` は再デプロイしていない。

| Function | 目的 | 認証方式 | デプロイ | 本番疎通確認 |
|---|---|---|---|---|
| `lineSignIn` | LIFF起動時。LINE ID token を検証し、登録済みスタッフなら Custom Token を返す。未登録なら `unregistered` | Firebase認証不要。**LINE ID token をサーバー側で LINE verify API（`https://api.line.me/oauth2/v2.1/verify`、client_id=2011820567）により検証** | 済み | 偽tokenで `UNAUTHENTICATED`、ログに `LINE verify rejected (400)`（＝LINE本番APIで拒否されたことを確認）。userIdのみ送信で `UNAUTHENTICATED`（ログ `idToken is required`）。**正当なLINE ID tokenでの成功応答・Custom Token発行は未確認（実機が必要）** |
| `lineRegisterStaff` | 初回登録。ID token＋認証キー＋氏名で事業所スタッフとして登録し Custom Token を返す | 同上（LINE ID token のサーバー検証） | 済み | 偽tokenで `UNAUTHENTICATED`、氏名欠落で `INVALID_ARGUMENT`。**正当なtokenでの登録は未確認（実機が必要）** |
| `getStaffAuthKeyStatus` | 管理Web「LINEスタッフ設定」の状態表示（キー・ハッシュは返さない） | Firebase Auth（メール/パスワード）必須。Custom Token（LINEスタッフ）は拒否。テナントはサーバー側で `users/{uid}.tenantId` から決定 | 済み | 未認証で `UNAUTHENTICATED`。本番管理Web（ログイン済み）から呼び出し、IAM付与後に「未設定／0名」→ キー設定後「設定済み」を表示（成功） |
| `updateStaffAuthKey` | 管理Webから自事業所のスタッフ認証キーを設定・変更（SHA-256ハッシュのみ保存） | 同上 | 済み | 未認証で `UNAUTHENTICATED`。本番管理Webから `hinayuri` を設定し成功（6章） |

## 5. Vercel / Web

| 項目 | 結果 |
|---|---|
| main への反映 | 済み（`d4162b3c`） |
| `NEXT_PUBLIC_LIFF_ID` | Vercel Production に `2011820567-88I5QrPj` を追加（Type：Config、Environment：Production）。NEXT_PUBLIC はビルド時に埋め込まれるため、main への push より **前** に設定した |
| Production デプロイ | main push により自動デプロイ。Vercel Deployments で `d4162b3` の Production ビルドを確認後、本番URLで新ルートが応答することを確認 |
| LIFF ID の埋め込み | 本番 `/line` が読み込む JS チャンクに LIFF ID が含まれていることを確認 |
| `/line` 系ルート | `/line`、`/line/register`、`/line/home`、`/line/beneficiaries`、`/line/import` がいずれも HTTP 200。**LINEアプリ内（LIFF）での表示・動作は未確認**（通常ブラウザで開くとLINEログインへ遷移する仕様のため、ブラウザからの画面操作は行っていない） |
| 既存管理Web回帰 | 本番で確認：`/login` 200、受給者証取込＆送信（取込モード選択の表示）、受給者管理一覧（4件表示）、受給者詳細（現在の受給者証・過去の受給者証・Storage画像・項目表示）、システム設定 すべて正常表示 |

## 6. tenant 設定

対象：`tenants/XcM8g7REI7Cks4kVQBHD`（新しい tenant は作成していない）

| 項目 | 結果 |
|---|---|
| 作業前の状態 | ドキュメントは存在、フィールドなし。`beneficiaries` サブコレクション 4件 |
| `name` | 「みどり児童支援センターひなゆり」を設定（Firestore REST、`updateMask=name` で name のみ更新） |
| 認証キー | 本番管理Web（システム設定 → LINEスタッフ設定）から `hinayuri` を入力し、`updateStaffAuthKey` でサーバー側にてハッシュ化して保存 |
| 追加されたフィールド | `name`、`staffAuthKeyHash`、`staffAuthKeyEnabled`、`staffAuthKeyUpdatedAt`、`staffAuthKeyUpdatedBy`（uid / email）、`staffAuthKeyUpdateWindow`（変更回数制限用） |
| `staffAuthKeyHash` | 64桁16進。`SHA-256(NFKC → trim → 小文字化した "hinayuri")` と一致することを照合（値は本レポートに記載しない） |
| `staffAuthKeyEnabled` | `true` |
| `staffAuthKeys` | 1件のみ。ドキュメントID＝上記ハッシュ、`tenantId` = `XcM8g7REI7Cks4kVQBHD` |
| 平文保存 | `tenants/XcM8g7REI7Cks4kVQBHD` と `staffAuthKeys` の内容に `hinayuri` の平文が含まれないことを確認 |
| 作業後の `beneficiaries` | 4件（変化なし） |
| `lineUsers` | 0件（まだ誰も登録していない） |

## 7. セキュリティ確認

| 項目 | 確認内容 | 区分 |
|---|---|---|
| LINE userId だけでは認証できない | 本番 `lineSignIn` に userId のみ送信 → `UNAUTHENTICATED` | 本番疎通確認済み |
| LINE ID token をサーバー側で検証 | 偽 token が LINE 本番 verify API で拒否されたことをログで確認（`LINE verify rejected (400)`）。iss / aud / exp / sub もサーバーで再確認する実装 | 本番疎通確認済み（拒否側）／正当token受理はエミュレーターのみ |
| Firebase Custom Token を利用 | `signInWithCustomToken` でサインイン、uid=`line_{sub}` | ローカル確認済み（本番での発行は実機待ち） |
| tenant 分離の維持 | LINEスタッフは既存Rules（`users/{uid}.tenantId`）で自事業所のみ読める・他事業所は403、`users` への書き込み不可 | ローカル確認済み（エミュレーター、本番と同一Rules） |
| 認証キーが平文保存されない | 本番Firestoreで確認（6章） | 本番確認済み |
| LINEスタッフは認証キーを変更できない | Custom Token ユーザーの `updateStaffAuthKey` / `getStaffAuthKeyStatus` は `PERMISSION_DENIED` | ローカル確認済み |
| Firestore / Storage Rules を緩和していない | `firestore.rules`・`storage.rules` は今回のブランチで差分なし、ルールの再デプロイも行っていない | 確認済み |
| 認証キーの総当たり対策 | LINEユーザーごとに5回失敗で30分ロック、管理Webからのキー変更は1時間10回まで | ローカル確認済み |

## 8. テスト結果

| テスト | 結果 | 区分 |
|---|---|---|
| TypeScript（`tsc --noEmit`、Web／Functions） | エラー0 | ローカル |
| build（`next build`） | 成功（`/line` 系6ルートを含む） | ローカル＋Vercel本番ビルド成功 |
| unit tests（Web） | 74/74 PASS | ローカル |
| unit tests（Functions） | 8/8 PASS | ローカル |
| emulator tests（Functions＋Firestore Rules） | 14/14 PASS | ローカル |
| ブラウザE2E（エミュレーター） | 管理Webでキー設定 → LINE初回登録（誤キーで残り回数表示）→ スタッフTOP → 2回目自動入場 → 利用者一覧/詳細 → 既存利用者の証更新（旧証 `superseded` で履歴に残る）→ 新規利用者登録 → 管理Web回帰：すべて期待どおり（OCRはエミュレーター環境のため Vision API 未接続） | ローカル |
| Functions 本番疎通 | 不正リクエスト6パターンが期待どおり拒否、管理Webからの2関数は成功 | 本番 |
| Production Web | 9ルート HTTP 200、LIFF ID 埋め込み確認 | 本番 |
| 既存管理Web | 取込・一覧・詳細・設定 正常 | 本番 |
| LINEスタッフ設定 | 本番で「設定済み」表示、Firestoreにハッシュのみ保存 | 本番 |

## 9. 未実施項目（実機確認が必要）

以下は **実装済み・ローカル確認済み** だが、**本番・実機では未確認**。

| 項目 | 状態 |
|---|---|
| LINE Login チャネル公開 | 未実施（今回の停止条件） |
| リッチメニューURL変更 | 未実施（今回の停止条件） |
| LINEアプリ内での LIFF 起動・LIFF初期化 | 未確認 |
| 正当な LINE ID token による `lineSignIn` / `lineRegisterStaff` の成功、Custom Token の本番発行（IAM Token Creator の効果） | 未確認 |
| LINE実機での初回スタッフ登録（認証キー `hinayuri`） | 未確認 |
| 2回目以降の自動ログイン（認証キー入力なし） | 未確認 |
| LINE内ブラウザでのカメラ起動（`capture="environment"`） | 未確認 |
| 本番OCR（LINEスタッフの認証で `ocrFromImageData` を呼ぶ） | 未確認（エミュレーターでは認証通過までを確認） |
| LINEからの新規受給者証登録・既存受給者証更新・旧証の履歴 | 未確認（エミュレーターでは確認済み） |
| LINEスタッフの Storage 画像アップロード・表示（本番 Storage Rules） | 未確認（エミュレーターでは確認済み） |

## 10. 次に行う作業（実行順）

1. LINE Developers Console で LINE Login チャネル（2011820567）を **Published** にする（Developing のままでは管理者・テスター以外ログインできない）。LIFF の Endpoint URL / Scope を再確認。
2. LINE Official Account Manager でリッチメニューのリンク先を `https://liff.line.me/2011820567-88I5QrPj` に変更。
3. スタッフ役のスマホで LINE公式アカウントのリッチメニュー → PaperlessCare を起動。
4. 「はじめてのご利用」→「スタッフ」を選択 → 次へ。
5. 氏名と認証キー `hinayuri` を入力 →「認証して登録」→ スタッフTOP（みどり児童支援センターひなゆり／○○さん）。
6. 「受給者証を登録」→ カメラで撮影 → OCR結果を確認・修正 →「確定して保存」→ 新規利用者の詳細が表示される。
7. TOP →「利用者を見る」→ 今登録した利用者を確認。
8. 既存利用者を選択 →「受給者証を更新」→ 撮影 → OCR → 保存。
9. 利用者詳細の「以前の受給者証」に旧証が残っていることを確認。
10. LINEを閉じ、再度リッチメニューから起動 → 認証キーなしでスタッフTOPへ入ることを確認。
11. 管理Web「システム設定 → LINEスタッフ設定」で「LINE登録済みスタッフ：1名」以上になっていることを確認。

不具合時の確認先：`gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="linesignin"' --project paperlesscare`（`lineregisterstaff` も同様）。

## 11. 問題・注意事項

### 問題1：Functions 実行SAに Firestore 権限が無かった（解決済み）
- 事象：デプロイ直後、本番管理Webの LINEスタッフ設定で「状態を取得できませんでした：INTERNAL」。Function ログは `7 PERMISSION_DENIED: Missing or insufficient permissions`（Admin SDK の Firestore 読み取り）。
- 原因：Compute default SA に Firestore／Auth のロールが付いていなかった（既存の `ocrFromImageData` は Firestore を使わないため顕在化していなかった）。
- 対応：`roles/datastore.user`・`roles/firebaseauth.admin` をプロジェクトに、`roles/iam.serviceAccountTokenCreator` を当該SA自身に付与。約2分の反映待ちの後、正常化を確認。
- 今後：Compute default SA を Cloud Run / Build 等と共用しているため、将来的には Functions 専用SAを作り最小権限で分離することを推奨。

### 問題2：gcloud の再認証が必要だった（解決済み）
- gcloud のトークンが失効しており非対話で更新できなかったため、ユーザーが `gcloud auth login` を実施。

### 注意事項
- Vercel ダッシュボード操作時に「Verify Your Secondary Email」画面が2回表示された。「Skip for Now」のみ押下し、アカウント設定は変更していない。
- `NEXT_PUBLIC_LIFF_ID` は Production のみに設定。Preview デプロイでは LIFF が初期化できない（必要なら Preview にも追加）。
- 本番 `lineAuthAttempts` は未生成（まだ登録試行なし）。
- 認証キー `hinayuri` は推測されやすい語のため、レビュー後は推測されにくいキーへの変更を推奨（管理Webから変更可能、旧キーは即時無効）。
- 既存の管理Web受給者一覧で、ページ読み込み直後の行クリックが反応しない場合がある（ハイドレーション完了前のクリック。今回の変更範囲外、再クリックで遷移）。
- `functions` の ESLint は今回以前からプラグイン読み込みエラーで実行できない（デプロイの predeploy は `tsc` のみのため影響なし）。
