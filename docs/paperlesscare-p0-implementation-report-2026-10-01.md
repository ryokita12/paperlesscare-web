# PaperlessCare 明日レビュー向け P0実装 報告（2026-10-01）

前提：`docs/paperlesscare-review-readiness-2026-10-01.md`
状態：**実装・ローカル検証完了／未コミット・未デプロイ**

> パス表記の `[t]` は `src/app/t/[tenantId]/` の略。

---

## 1. 実装した内容

| Phase | 内容 | 状態 |
|---|---|---|
| 1 データ層 | 利用者と受給者証の分離（`certificates` サブコレクション）、`currentCertificateId`、legacy互換、Storageパスを証単位に変更 | 完了 |
| 2 Rules | Firestore：`certificates` サブコレクション許可／Storage：`recipients/{id}/certificates/{certId}/{file}` 許可 | 完了・エミュレータで10件検証 |
| 3 新規登録 | 新規取込の保存を「利用者doc＋証doc」のバッチ作成に変更。保存後は利用者詳細へ自動遷移 | 完了 |
| 4 既存更新 | 詳細「受給者証を更新」→ 取込 → 保存で新証を追加し current を切替（トランザクション） | 完了 |
| 5 履歴表示 | 詳細を「現在の受給者証／過去の受給者証」に。過去証は既存UIで閲覧のみ | 完了 |
| 6 証なし利用者 | 一覧の「＋受給者を新規登録」で氏名・フリガナ・生年月日のみ作成 → 詳細「受給者証を登録」 | 完了 |
| 7 スマホ | スマホのファイル選択フォールバック修正、一覧のスマホ幅調整、モード選択のalert撤去 | 完了 |

## 2. 変更したファイル

| ファイル | 変更 |
|---|---|
| `[t]/lib/firestore/certificateModel.ts` | **新規**。Firebase非依存の純粋ロジック（summary組立・統合、legacy判定、和暦→ISO、期間抽出） |
| `[t]/lib/firestore/certificateModel.test.ts` | **新規**。上記のテスト8件 |
| `[t]/lib/firestore/beneficiaries.ts` | 書き換え。`createBeneficiaryWithCertificate` / `createBeneficiaryWithoutCertificate` / `addCertificateToBeneficiary` / `updateCertificatePages` / `listCertificates` / `reserveCertificateId` / `certificatePageStoragePath` を追加。`saveBeneficiary` は削除（呼び出し元は取込画面のみ）。`updateBeneficiary`（旧データ編集用）は維持 |
| `[t]/page.tsx`（取込画面） | `?beneficiaryId=` で既存利用者を対象化、`&new=1` で新規開始、対象利用者バナー、保存先の切替、保存後の詳細遷移、撮影往復で対象IDを保持、スマホに「カメラで撮影」「写真を選択」の2ボタン、「既存受給者を更新」は一覧へ遷移 |
| `[t]/beneficiaries/[beneficiaryId]/page.tsx` | 詳細画面を再構成（ヘッダ＋更新/登録ボタン、現在/過去の証一覧、選択した証を既存の画像ビューア・帳票レイアウトで表示、過去証は `fieldset disabled`） |
| `[t]/beneficiaries/page.tsx` | 新規登録フォーム（証なし）、証未登録バッジ、プロフィール氏名の表示 |
| `[t]/beneficiaries/page.module.css` | 600px以下で検索カード（未実装）と「最終更新日」列を非表示 |
| `firestore.rules` / `storage.rules` | 上記 Phase 2 |
| `src/lib/firebase.ts` | `NEXT_PUBLIC_USE_EMULATORS=1` のときだけエミュレータへ接続（検証用。未設定の本番では無効） |

`cors.json` の差分は作業前からある既存の未コミット変更で、今回は触っていません。

## 3. 新しいデータ構造

```
tenants/{tenantId}/beneficiaries/{beneficiaryId}            … 利用者
  tenantId, profile{name,furigana,birthday}, summary{name,furigana,number,birthday,cityName}
  currentCertificateId: string | null     … null = 証なし利用者
  certificateCount, status: "active", certType: 現在の証の種別 | null（一覧表示用）
  createdBy/createdAt/updatedBy/updatedAt

tenants/{tenantId}/beneficiaries/{beneficiaryId}/certificates/{certificateId}   … 受給者証
  beneficiaryId, certType, pages: SavedCertPage[]（従来と同じ構造）, summary, issueDate
  validFrom/validTo: "YYYY-MM-DD" | null  … ページ2支給決定期間①→ページ7利用者負担期間の順に和暦から変換
  status: "current" | "superseded", supersededBy: 次の証ID | null
  source: "mobile" | "web" | "legacy"
  createdBy/createdAt/updatedBy/updatedAt

Storage: tenants/{t}/recipients/{beneficiaryId}/certificates/{certificateId}/page{N}.jpg
```

- 「現在の証」の正は利用者docの `currentCertificateId`。証側の `status` は表示用の写し。
- `validFrom/validTo` は表示用のみで、現在判定には使いません。

## 4. legacyデータの扱い

- 判定：`currentCertificateId` フィールドが**無く** `pages` がある利用者 = legacy（`null` は証なし利用者で別扱い）。
- 閲覧：直下の `certType/pages/summary` を `id: "legacy"` の「現在の証」として表示します。編集保存は従来どおり利用者docを更新します。旧 page2 構造の移送（既存の `legacyPage2`）もそのまま効きます。
- 初回更新時：同じトランザクション内で `certificates/legacy` を作成（`status: superseded`、作成者・作成日時は元の値を引き継ぐ）。その後、新証を current にします。
- **利用者doc直下の旧 `pages` は削除しません**（非破壊）。旧画像（`recipients/{id}/page{N}.jpg`）もそのまま参照されます。
- 一括マイグレーションは行っていません。

## 5. 新規利用者登録フロー

取込＆送信 →「新規受給者を登録」→ 撮影／写真選択 → OCR → 確認・修正 →「確定して保存」
→ 画像を証単位パスへアップロード → `writeBatch` で利用者doc＋証docを作成（`currentCertificateId` を設定）→ **利用者詳細へ自動遷移**

利用者IDと証IDは事前採番しているため、保存を再試行しても重複しません。

## 6. 既存利用者更新フロー

利用者詳細「受給者証を更新」→ `/t/{t}?beneficiaryId={id}&new=1`
→ 取込画面に「既存利用者の受給者証を更新します（以前の受給者証は履歴として残ります）○○様」バナー（中止ボタン付き）
→ 撮影 → OCR → 確認 → 保存 → `runTransaction` で以下を一括実行
1. 新しい証docを作成（current）
2. 旧current証を `superseded` にして `supersededBy` を設定（legacy の場合は `certificates/legacy` として保存）
3. 利用者docの `currentCertificateId / certType / summary / profile / certificateCount` を更新

→ 利用者詳細へ自動遷移。

補足：
- `writeBatch` ではなく `runTransaction` にしたのは、現在の証を読んでから切り替える必要があるためです（同時更新でも整合が保たれます）。
- 同じ証IDで再試行された場合は二重に切り替えません。
- 新しい証で氏名などが空欄の場合、利用者の summary・profile は従来の値を維持します。
- 撮影画面への往復でも対象の利用者が保持されます（戻り先URLに `beneficiaryId` を含めています）。

## 7. 受給者証履歴の仕様

- 詳細画面の上部に「現在の受給者証」と「過去の受給者証（N件）」を表示します。各行には種別、交付日、期間、登録日を出します。
- 行を選ぶと、既存の画像ビューア（8ページ切替）と帳票レイアウトでその証を表示します。
- 過去の証は「履歴のため閲覧のみ」と表示し、入力欄と編集ボタンを無効化、保存ボタンも非表示にしています（UI上の保護。Rulesによる強制は P2）。
- 現在の証は「修正内容を保存」で訂正できます。訂正すると証doc に加えて、利用者の summary も更新されます。

## 8. 証なし利用者の仕様

- 一覧「＋受給者を新規登録」でフォームを開きます（氏名は必須、フリガナと生年月日は任意）。
- 「作成する」で利用者docだけを作成（`currentCertificateId: null`、`certType: null`）し、詳細画面へ遷移します。
- 一覧では「受給者証未登録」のバッジを表示します。
- 詳細画面では「受給者証がまだ登録されていません」と「受給者証を登録」ボタンを表示します。そこから取込に進み、保存するとこの利用者の最初の証として紐付きます。手入力したプロフィールは、証の空欄で消えません。

## 9. テスト結果

| 項目 | 結果 |
|---|---|
| TypeScript `tsc --noEmit` | エラー0 |
| 単体テスト | **74 / 74 PASS**（既存66＋新規8。既存テストの削除・無効化なし） |
| ESLint（src） | 18件（作業前19件）。変更ファイル内の3件はすべて既存行。**新規の指摘0件** |
| `next build` | 成功 |
| Rules（Firestore/Storage エミュレータ） | **10 / 10 PASS**：同テナントは証の読み書き可、利用者＋証のバッチ作成可、他テナント・未認証は不可、旧画像パスは従来どおり読める、certificates 以外のサブコレクションや想定外の深い階層は拒否 |
| ブラウザ通し確認（ローカル＋エミュレータ） | 下表 |

| 確認シナリオ | 結果 |
|---|---|
| 旧構造の利用者を一覧・詳細で閲覧（画像あり、旧page2の期間も表示） | ○ |
| 旧データ利用者 →「受給者証を更新」→ 保存 → legacy が過去へ、新証が現在 | ○（Firestore・Storageで実データ確認） |
| 2回目の更新（新構造の証 → 過去）、履歴が3件連鎖、画像3枚とも保持 | ○ |
| 過去の証を選択 → 閲覧のみ（入力無効・保存非表示・画像表示） | ○ |
| 証なし利用者作成 → 詳細 →「受給者証を登録」→ 紐付け | ○ |
| 新規受給者登録 → 利用者＋証作成 → 詳細へ自動遷移（390px幅） | ○ |
| 現在の証の修正保存 | ○ |
| 390px幅で一覧・詳細に横スクロールなし | ○ |

**ローカル検証で確認できていないこと：**
- **OCR**：エミュレータには Vision API が無いため、項目は手入力で代替しました。OCR処理のコードは今回変更していません。
- **実機カメラ／LINE内ブラウザ**：デスクトップChromeでは確認できません。
- **タッチ端末でのボタン表示**：「カメラで撮影」ボタンはタッチ端末の判定で出し分けているため、デスクトップでは出ません。

## 10. デプロイ状況

**未デプロイ・未コミット**です。本番に出すには、次の順番で実行します。

```bash
# 1) Rules を先に（新しいフロントは新Rulesが無いと certificates の読み書きで permission-denied になる）
firebase deploy --only firestore:rules,storage --project paperlesscare
# 2) フロント（Vercel は git push で反映）
git add -A && git commit && git push origin main
```

- Rules は追加のみで、既存の許可範囲は変えていません。そのため、Rules を先に出しても現行の本番フロントには影響しません。
- Cloud Functions の変更・デプロイは不要です。
- `cors.json` は既存の未コミット変更です。コミットに含めるかどうかはご判断ください。

## 11. 明日のレビュー前に人間が確認すべきこと

1. **実機（iPhone／Android）の LINE 内ブラウザ**で、ログイン →「カメラで撮影」→ OCR → 保存が通るか。
   - カメラが起動しない場合は「写真を選択」（端末標準のカメラ・写真選択）で代替できます。
   - それでも不安定なら、リッチメニューのURLに `?openExternalBrowser=1` を付けて外部ブラウザで開かせます。
2. **リッチメニュー**の設定（LINE Official Account Manager）。リンク先は `https://paperlesscare-web.vercel.app/login`。
3. デモ用スタッフアカウントの `users/{uid}.tenantId` が投入済みか。
4. **デモで使う受給者証は紫（18歳以上）のページ1〜4**にする。黄緑はOCRで項目が埋まりません。
5. デモデータの事前準備：シナリオ2用に「旧証が登録済みの利用者」を1件作っておく（本番の既存データを使う場合は、それが legacy として表示されることを事前に確認）。
6. デプロイ後に本番で一通り：新規登録 → 更新 → 履歴閲覧 → 証なし作成 → 紐付け。
7. OCR結果が実画像で従来どおり入るか（取込画面の OCR まわりは無変更ですが、念のため）。

## 12. 残課題

### P1
- 一覧の検索（現在は未接続。スマホ幅では非表示にしています）
- 取込画面「既存受給者を更新」から直接利用者を選ぶUI（現在は一覧へ遷移）
- スマホでの帳票レイアウトの操作性（横スクロールは可能だが窮屈）
- 実画像でOCRを掛けたときの validFrom／validTo 抽出精度の確認

### P2
- superseded 証の改変を Firestore Rules で禁止
- LIFF／LINE Login、LINEユーザーとスタッフの紐付け、保護者向け公開
- ロール・スタッフ招待（`/signup` の整理）
- 18歳未満パーサ、18歳以上 p5〜8 パーサ
- 期限切れ通知（validTo と collectionGroup クエリ）、監査ログ
- 移送済み利用者の、利用者doc直下に残る旧 `pages` の整理（現在は非破壊のため残しています）
- Next.js 開発時の遷移に伴う `AbortError` 表示（既存事象。本番では表示されません）
