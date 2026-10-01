# PaperlessCare Phase 2 LINEスタッフ版 実装レポート（2026-10-01）

ブランチ：`feat/line-staff-phase2`。**本番作業（Functionsデプロイ・Vercel環境変数・本番Firestore・IAM・LINEチャネル公開・リッチメニュー）は未実施。**

## 1. 構成

```
リッチメニュー → https://liff.line.me/2011820567-88I5QrPj
  → /line（LIFF）→ LINE ID token
  → Functions lineSignIn（LINE verify APIで本人確認。userIdは信用しない）
  → 登録済みスタッフ：Custom Token（uid = line_{LINE userId}）→ signInWithCustomToken → /line/home
  → 未登録：/line/register（利用者・保護者＝準備中／スタッフ＝氏名＋認証キー → lineRegisterStaff）
```

- LINEスタッフは `users/line_{sub}.tenantId`（Functionsが書き込み）により、**既存の Firestore / Storage Rules をそのまま**適用される。Rules は無変更。
- 受給者証の撮影・OCR・確認・保存は管理Webと同じ `CertImportFlow`（旧 `/t/[tenantId]/page.tsx` を移設）を使用。LINE版は端末カメラ（`capture="environment"`）→自動OCR。

## 2. 追加データ（すべてAdmin SDKのみ。クライアントからは読み書き不可）

| パス | 内容 |
|---|---|
| `tenants/{tenantId}` | `name`, `staffAuthKeyHash`(SHA-256), `staffAuthKeyEnabled`, `staffAuthKeyUpdatedAt/By` |
| `staffAuthKeys/{hash}` | `tenantId`（キー→事業所の逆引き。キーは全事業所で一意） |
| `lineUsers/{lineUserId}` | `tenantId`, `role`(`staff`/将来`guardian`), `staffName`, `displayName`, `status` |
| `lineAuthAttempts/{lineUserId}` | 認証キー誤入力回数（5回で30分ロック） |
| `users/line_{lineUserId}` | `tenantId`, `role: "staff"`, `authProvider: "line"` |

認証キーは NFKC → trim → 小文字化してから SHA-256。平文は保存しない。

## 3. Functions（asia-northeast1、onCall）

| 名前 | 呼び出し元 | 内容 |
|---|---|---|
| `lineSignIn` | LINE（未ログイン） | ID token検証 → 登録済みならCustom Token |
| `lineRegisterStaff` | LINE（未ログイン） | ID token＋認証キー＋氏名で登録 → Custom Token |
| `getStaffAuthKeyStatus` | 管理Web | 設定済み/未設定・登録スタッフ数（キー・ハッシュは返さない） |
| `updateStaffAuthKey` | 管理Web | 呼び出し元の `users/{uid}.tenantId` の事業所のキーのみ変更。LINEスタッフ(Custom Token)は不可 |

## 4. テスト

- `functions`: `npm test`（単体 8件）、`npm run test:emulator`（Auth/Firestore/Functionsエミュレーター＋本番と同じRules、14件）
- ルート: `npm test`（既存 74件）、`tsc --noEmit`、`npm run build`
- ブラウザ（エミュレーター）：管理Webでキー設定 → LINE初回登録 → 2回目自動入場 → 利用者一覧/詳細 → 既存利用者の証更新（旧証が履歴に残る）→ 新規利用者登録 → 管理Web回帰

ローカル検証：`functions/.env.local` に `LINE_VERIFY_ENDPOINT=http://127.0.0.1:9876/verify`（エミュレーター時のみ有効）、
`.env.development.local` に demo プロジェクト設定と `NEXT_PUBLIC_USE_EMULATORS=1`。`/line?mockLineUser=U{32桁hex}:名前` で偽LINEユーザー。

## 5. 本番作業手順

1. IAM：Functions実行SA `{PROJECT_NUMBER}-compute@developer.gserviceaccount.com` に、自身に対する
   `roles/iam.serviceAccountTokenCreator` を付与（Custom Token署名に必要）。`iamcredentials.googleapis.com` を有効化。
2. Functionsデプロイ：
   `firebase deploy --only functions:lineSignIn,functions:lineRegisterStaff,functions:getStaffAuthKeyStatus,functions:updateStaffAuthKey --project paperlesscare`
   （`functions/.env` の `LINE_LOGIN_CHANNEL_ID=2011820567` が使われる）
3. Vercel：Production に `NEXT_PUBLIC_LIFF_ID=2011820567-88I5QrPj` を追加し、本ブランチをmainへマージしてデプロイ。
4. 事業所名：Firebase Console → Firestore → `tenants/{ひなゆりのtenantId}` に `name`（string）=「みどり児童支援センターひなゆり」。
5. 認証キー：本番管理Webにデモユーザーでログイン → システム設定 → LINEスタッフ設定 → `hinayuri` を入力して「認証キーを更新」。
6. LINE Developers：LINE Loginチャネルを Published に。LIFFのEndpoint URL / Scope（openid, profile）を再確認。
7. リッチメニュー：リンク先を `https://liff.line.me/2011820567-88I5QrPj` に変更。
