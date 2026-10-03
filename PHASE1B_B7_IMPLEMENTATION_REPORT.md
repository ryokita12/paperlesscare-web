# PaperlessCare Phase 1-B7 実装報告書 ― 通所受給者証 OCR → 利用者カルテ反映候補（確認フロー）

- 作成日：2026-10-03
- branch：`feat/phase1b7-chart-review`（worktree：`.claude/worktrees/phase1b7-chart-review`）
- 開始 commit：`639bf513`（origin/main と同一）
- 状態：**未 commit・未 push・未 deploy（レビュー待ちで停止）**
- 最終判定：**C**（コードは完成・検証済み。実物の通所受給者証 OCR が未検証のため追加確認が必要）

---

## 1. 概要

通所受給者証（tsusho）を保存したあと、**OCR の値でカルテを上書きせず**、

受給者証 → カルテとの比較 → 変更候補を表示 → スタッフが確認 → 選んだ項目だけ反映

という確認フローを管理Webに追加した。

- 原則：OCR = 事実の候補、personal / guardian / consultationSupport = スタッフが確定したカルテ
- 証の保存処理（B5/B6）は一切変更していない。保存成功後に遷移する「受給者証」タブの上部に確認カードを出す
- 判断（反映 / 反映しない）は証doc の `chartReview` に項目ごとに記録する

## 2. branch / start commit

| 項目 | 値 |
|---|---|
| branch | `feat/phase1b7-chart-review` |
| 起点 | `639bf513 feat: enable tsusho certificates in admin web (Phase 1-B6)`（= origin/main） |
| 共有 checkout の local main | すでに `639bf513`（origin/main と一致）。pull 不要 |
| B6 Production Release Report | `PHASE1B_B6_PRODUCTION_RELEASE_REPORT.md` は `.claude/worktrees/phase1b3-tsusho-hidden` に未追跡のまま残っている。**移動・削除・commit していない**。B7 worktree は origin/main から新規作成したため B7 には混入しない |

## 3. B1 candidate の再利用

- 比較・状態判定・初期チェック・18歳以上の同一人物判定は **Phase 1-B1 の `buildTsushoChartCandidates`（`src/lib/tsusho/candidates.ts`）をそのまま呼ぶ**。candidates.ts / normalize.ts は未変更
- B7 で追加したのは、その結果を「表示する候補」に絞り込む処理、`chartReview` による再表示制御、反映内容（フィールドパス）の組み立てのみ（`src/lib/beneficiaryChart/certificateReview.ts`、純粋関数）
- 「同じ値か」の判定に使う正規化関数も B1 の normalize.ts をそのまま使う（chartReview の `certValueNormalized` 用）
- 設計書 11.2 では置き場所を `beneficiaryChart/tsushoCandidates.ts` としていたが、B1 で候補抽出が `src/lib/tsusho/candidates.ts` に実装済みのため、B7 は確認・反映のロジックだけを `certificateReview.ts` に置いた

## 4. candidate mapping（B1 のまま）

| 証（formData） | カルテ | 備考 |
|---|---|---|
| 一面 `name` / `furigana` / `birthday`（児童） | `personal.name` / `personal.furigana` / `personal.birthDate` | 生年月日は ISO に変換して反映 |
| 一面 `guardianName` / `guardianFurigana` | `guardian.name` / `guardian.furigana` | |
| 一面 `guardianAddress`（居住地＝保護者の欄） | `guardian.address` | |
| 四面 `planOfficeName` | `consultationSupport.officeName` | |

作らない候補：`personal.address`（B1 の補助候補オプションは使わない）・郵便番号・`guardianBirthday`・電話番号・続柄・メール等。AI 補完なし。

## 5. candidate state（B1 のまま）

| 状態 | 意味 | 表示 |
|---|---|---|
| same | 正規化して同じ | 出さない |
| chartEmpty | カルテが空・証に値あり | 出す |
| different | 値が違う | 出す |
| certEmpty | 証が空（または生年月日を日付として読めない） | 出さない（カルテを消さない） |

**現在のカルテの値**（`chartSnapshotForReview`）：本人の氏名・フリガナ・生年月日は、personal が空なら既存の profile（一覧・LINE の表示名）を使う。personal の無い旧データで、表示中の氏名を「未入力 → 初期 ON」で OCR の値に置き換えないため。summary は使わない（いま保存した証そのもの）。

## 6. default selection

- chartEmpty → 初期 ON
- different → 初期 OFF
- 「選択した内容を反映（n件）」は 0 件のとき押せない

## 7. chartReview schema

設計書 11.3 の推奨（証doc に `chartReview.decisions.{fieldKey}`）を基本に、追跡に必要な項目を足した。

```
tenants/{t}/beneficiaries/{b}/certificates/{certificateId}.chartReview = {
  sourceCertificateId: string,          // = この証doc の ID（明示）
  createdAt: Timestamp,                 // 最初に判断を記録した時刻
  reviewedAt: Timestamp,                // 最後に判断を記録した時刻
  reviewedBy: { uid, email },
  decisions: {
    [reviewKey]: {                      // personal_name / personal_furigana / personal_birthDate /
                                        // guardian_name / guardian_furigana / guardian_address /
                                        // consultationSupport_officeName（"." を使わない）
      action: "applied" | "dismissed",
      target: "personal.name" 等,        // カルテのフィールドパス
      label: "氏名" 等,
      status: "chartEmpty" | "different",
      initiallySelected: boolean,
      selected: boolean,                // スタッフが実際にチェックしたか
      certValue: string,                // 証の値（原文）
      proposedValue: string,            // 反映する（した）値。生年月日は ISO
      certValueNormalized: string,      // 再表示判定用
      chartValueBefore: string,         // 確認画面に出した時点のカルテの値
      source: { pageNo, formKey },
      at: Timestamp, by: { uid, email }
    }
  }
}
```

- 候補そのもの（pending）は保存しない。候補は「現在の証＋現在のカルテ＋chartReview」から毎回生成する（派生データを保存しない B5 の方針と同じ）。このため `createdAt` は「最初に判断した時刻」で、「候補を生成した時刻」ではない
- 再表示制御：同じ項目で `certValueNormalized` が今の証の値と同じなら、判断済みとして出さない。証を訂正して値が変わった項目だけ再び出る。新しい証は新しい doc なので最初からやり直し
- 既存のどの関数も `chartReview` を書かない。`updateCertificatePages` はフィールド単位の update のため消さない

## 8. save 後の生成

- 保存処理（`createBeneficiaryWithCertificate` / `addCertificateToBeneficiary`）と遷移（`?tab=certificates`）は**未変更**（CertImportFlow.tsx・beneficiaries.ts の差分なし）
- 保存に失敗した場合は遷移しないため、確認カードも出ない
- 受給者証タブ（CertificatesPanel）が、現在の証が tsusho（旧データの仮想証でない・`currentCertificateId` と一致）のときだけ `CertificateReviewCard` を表示。カードは `getCertificateReview` で利用者doc と証doc を読み直して候補を作る

## 9. Review UI

`src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificateReviewCard.tsx`（既存の chartUi 部品・Tailwind のみ。ライブラリ追加なし）

- タイトル「受給者証の内容をカルテに反映しますか？」
- 説明「受給者証から読み取った内容と、現在の利用者カルテを比較しました。反映する項目を確認してください。」＋「読み取りの誤りがあるかもしれないため、受給者証の写真と見比べてからチェックしてください。」
- 1項目ずつ：項目名・状態バッジ（カルテと異なる／カルテが未入力）・現在のカルテ（空は「未入力」）・受給者証・☐「この内容をカルテへ反映」
- 生年月日は「カルテには 2016年5月10日 として保存します」を併記
- guardian.address で「保護者の住所は利用者と同じ」が指定されている場合は注記
- ボタン：「あとで確認する」（記録せず閉じる。次に開くと再表示）／「今回は反映しない」／「選択した内容を反映（n件）」
- 結果表示：成功は緑、同時編集は赤の通知。全件判断済みになると結果だけ残し「閉じる」

## 10. field labels

| field | 表示 |
|---|---|
| personal.name | 氏名 |
| personal.furigana | フリガナ |
| personal.birthDate | 生年月日 |
| guardian.name | 保護者氏名 |
| guardian.furigana | 保護者フリガナ |
| guardian.address | 保護者住所 |
| consultationSupport.officeName | 相談支援事業所 |

基本情報タブ・契約・関係先タブの既存項目名（「氏名」「相談支援事業所」等）に合わせた。内部パスは表示しない（テストで固定）。

## 11. apply

`chartStore.applyCertificateReview`（mode `"apply"`）を1つの Firestore transaction で実行：

1. 利用者doc と証doc を読み直す
2. 証が現在の証でない／tsusho でない → `CertificateReviewOutdatedError`（何も書かない）
3. `planCertificateReview`：表示した候補ごとに最新の値と比べ、applied / dismissed / stale に分ける
4. チェックした項目 → applied（カルテを更新）、チェックしなかった項目 → dismissed（記録のみ）
5. 利用者doc：applied の項目だけフィールドパスで update ＋ updatedAt / updatedBy
6. 証doc：`chartReview.*` だけを update

## 12. dismiss

「今回は反映しない」（mode `"dismiss"`）：表示中の全項目を `dismissed`（selected: false）として証doc に記録。**利用者doc は update しない**（updatedAt も変えない）。証の保存は取り消さない（status current のまま）。

## 13. personal partial update

`"personal.name": 値` のようにフィールドパスで更新。`personal` マップの置き換えはしない（テスト＋E2E A/E で他の項目が残ることを確認）。

## 14. guardian partial update

同上。E2E H：guardian.name だけ更新、続柄・電話・メール・住所・フリガナは不変。guardian マップが無い利用者でも `guardian.name` だけが作られる（読み取り側は既定値で補う）。

## 15. consultationSupport partial update

`consultationSupport.officeName` のみ。E2E I：専門員名・電話・メールは不変。

## 16. profile sync

- personal の氏名・フリガナ・生年月日を **apply したときだけ** `profile.name` / `profile.furigana` / `profile.birthday` の同じ項目へ写す（生年月日は `formatJapaneseDate`＝`buildPersonalUpdate` と同じ表記）
- profile もフィールドパス単位で、丸ごと置き換えない
- 証の保存時に profile を OCR で上書きしない B5 の挙動は未変更
- E2E G：personal.name・profile.name が更新され、カルテ上部の氏名も再読み込みで更新

## 17. summary unchanged

反映内容に summary は含まれない（テスト：更新キーは `personal.|guardian.|consultationSupport.|profile.` のみ。isolation test：反映処理に summary の書き込みが無い）。E2E G：summary.name は証由来のまま。

## 18. currentCertificateId / history unchanged

反映処理の書き込みは2つの `tx.update` だけ（利用者doc のカルテ項目＋updatedAt/By、証doc の chartReview）。currentCertificateId / certificateCount / certType / status / supersededBy / pages / 証の updatedAt は書かない（isolation test で固定、E2E で b-valid の superseded チェーン・count・証の updatedAt が反映前後で不変を確認）。

## 19. stale protection

- transaction 内で最新の証とカルテから B1 の候補を作り直し、表示時の `chartValue` と `proposedValue` の両方が一致する項目だけを反映・記録する
- カルテが別の操作で変わった項目、または証の値が訂正された項目は **stale**：反映も記録もしない
- 画面に「カルテが別の操作で更新されています。最新情報を確認してください。（氏名は反映していません）」と表示し、最新値で候補を作り直す
- 他の項目（変わっていないもの）は通常どおり反映される
- 証が現在の証でなくなった場合は全体を中止
- Firestore transaction は既存の `addCertificateToBeneficiary` / `updateCertificatePages` と同じ使い方で、構造は作り変えていない

## 20. candidate 0

same / certEmpty のみ・判断済みのみ・tsusho 以外の場合、カードは何も描画しない（従来どおりの受給者証タブ）。E2E K（新規 tsusho：B5 の初期カルテが証と一致するため 0 件）・C・D で確認。

## 21. adult / child exclusion

- `buildCertificateReview` は certType が tsusho 以外なら常に 0 件
- CertificatesPanel は現在の証が tsusho のときだけカードを置く
- E2E L：child（既存利用者へ追加）・adult（新規）を実際に保存 → カードなし、従来どおり

## 22. LINE untouched

`src/app/line/` 配下・LINE の保存処理・`lineEnabled` は未変更。カード・反映処理を LINE から使っていないことを isolation test で固定。

## 23. Rules / security

- **firestore.rules は変更なし**。既存の「users/{uid}.tenantId が一致する者だけ beneficiaries / certificates を読み書き可」で足りる
- すべての読み書きは `tenants/{tenantId}/beneficiaries/{beneficiaryId}`（＋certificates）に対して、ログイン中ユーザーの権限で行う
- Rules test に2件追加：同じ事業所は `personal.*` / `profile.*` / `chartReview.decisions.*` をフィールドパスで更新できる、他事業所・未所属・未ログインは更新も読み取りもできない

## 24. changed files

| 区分 | ファイル | 内容 |
|---|---|---|
| 新規 | `src/lib/beneficiaryChart/certificateReview.ts` | 候補の絞り込み・項目名・chartReview・反映計画・フィールド更新（純粋関数） |
| 新規 | `src/lib/beneficiaryChart/certificateReview.test.ts` | 26件 |
| 新規 | `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificateReviewCard.tsx` | 確認カード |
| 変更 | `src/lib/beneficiaryChart/chartStore.ts` | `getCertificateReview` / `applyCertificateReview`（transaction） |
| 変更 | `src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificatesPanel.tsx` | 現在の証が tsusho のときだけカードを表示（+18行） |
| 変更 | `src/lib/tsusho/isolation.test.ts` | B7 の接続境界へ意図的に更新（相対 import も検出するよう強化）・2件追加 |
| 変更 | `tests/rules/phase1a.rules.test.mjs` | B7 の Rules test 2件追加 |
| 新規 | `PHASE1B_B7_IMPLEMENTATION_REPORT.md` | 本報告書 |

変更していない：`functions/`・`package.json`・`package-lock.json`・`firestore.rules`・`storage.rules`・LINE UI・`CertImportFlow.tsx`・`beneficiaries.ts`・`certificateModel.ts`・tsusho parser・`certPages.ts`（ページ数・CERT_TYPES の公開設定）・`src/lib/tsusho/*`（isolation test 以外）。`git diff origin/main --name-only` で確認。

## 25. tests（追加・更新）

`certificateReview.test.ts`（26件）：mapping・項目名（"." を含まない）・禁止候補（personal.address／郵便番号／guardianBirthday／電話）・chartEmpty ON・different OFF・same 非表示・certEmpty 非表示（生年月日が読めない場合を含む）・同一人物で guardian 候補なし・adult/child/mobility は 0 件・旧データの profile フォールバック・personal 優先・chartReview による非表示・証訂正時の再表示・壊れた chartReview を無視・選択のみ apply／未選択は dismissed 記録・dismiss で更新 0 件・stale（カルテ変更／証変更／証種別変更）・personal / guardian / consultationSupport の部分更新・profile 同期（和暦表記・丸ごと置換しない）・5件中2件選択・summary 等を更新に含めない

`isolation.test.ts`（B7 で意図的に更新）：candidates を使うのは certificateReview.ts だけ、カード・反映処理は管理Webの受給者証タブだけ（LINE 不使用）、反映処理の書き込みは2か所だけで summary / currentCertificateId / status / supersededBy / certificateCount を書かない。

既存テストの削除・弱体化なし（isolation の import 検出は `lib/tsusho/` に加え `../tsusho/` も検出するよう強化）。

## 26. Emulator E2E

環境：Firebase Emulator（demo-paperlesscare：auth / firestore / storage）＋ Next dev（localhost:3100）。
**`.env.local`（Production 設定）は読み込ませず**、`NEXT_PUBLIC_USE_EMULATORS=1` と demo 用の値を環境変数で渡して起動。データはすべて架空（既存の `tests/e2e/seed-emulator.mjs`＋ジョブ一時領域の B7 シナリオ投入スクリプト）。結果は Emulator REST で読み出して確認。

B7 シナリオ（A〜J）は、B5/B6 の保存結果と同じ形（現在の tsusho 証＋summary）を Emulator に投入し、受給者証タブの実画面で操作。K・L と既存利用者への追加は**管理Webの取込画面から実際に保存**（画像1枚をアップロード、一面は手入力。OCR は呼ばない）。

| # | ケース | 結果 |
|---|---|---|
| A | chartEmpty（personal.furigana 空・証 ヤマダ タロウ） | 候補表示・初期 ON → 反映で personal.furigana 更新、他の personal 項目は維持、profile.furigana 同期、summary / currentCertificateId / 証 status・updatedAt 不変、chartReview に applied ✅ |
| B | different（山田 太郎 vs 山田 太朗） | 候補表示・初期 OFF・反映ボタン無効。「あとで確認する」→ 再読み込みで再表示（pending の再表示）。personal.name 維持・利用者doc の updatedAt 不変・chartReview なし ✅ |
| C | same（空白・ひらがな・全角ハイフンの違いのみ） | カードなし・変更なし ✅ |
| D | certEmpty（証が空・カルテに値あり） | カードなし・カルテは空にならない ✅ |
| E | 複数（5件中2件選択） | 初期は different 1件 OFF・chartEmpty 4件 ON。生年月日・保護者フリガナを外して反映 → personal.furigana・guardian.name（＋profile.furigana）だけ更新、残り3件不変・dismissed 記録。再読み込みでカードは出ない ✅ |
| F | 今回は反映しない | 「今回はカルテへ反映しませんでした。受給者証は保存済みです。」。カルテ・利用者doc の updatedAt 不変、証は current のまま、全項目 dismissed（selected: false） ✅ |
| G | profile 同期（氏名を反映） | personal.name・profile.name が 山田 太朗、summary.name は証由来のまま、カルテ上部の氏名も更新 ✅ |
| H | guardian.name のみ | guardian.name だけ更新、フリガナ・続柄・電話・メール・住所は不変 ✅ |
| I | consultationSupport.officeName のみ | officeName だけ更新、専門員名・電話・メールは不変 ✅ |
| J | stale（表示後に Firestore 上の personal.name を別値へ変更 → 古い画面から氏名＋フリガナを反映） | 氏名は上書きされず（別操作の値のまま）・記録もなし。変わっていないフリガナだけ反映。画面に同時編集のメッセージ、最新値で候補を作り直し（OFF） ✅ |
| K | 新規 tsusho を取込画面から保存（候補 0） | 従来どおり受給者証タブへ遷移、カードなし（B5 の初期カルテ＝証の値） ✅ |
| 追加 | 既存利用者（b-valid・child）へ tsusho を取込画面から保存 | 保存直後の受給者証タブにカード（保護者氏名・chartEmpty・ON）。保存結果は B5 どおり（旧証 superseded＋supersededBy、count 2、personal / profile 不変）。反映後も currentCertificateId・count・履歴・証の updatedAt 不変 ✅ |
| L | child（既存利用者へ追加）・adult（新規）を取込画面から保存 | カードなし、従来どおり ✅ |

console：アプリ由来のエラーなし。Firestore SDK の `AbortError: signal is aborted without reason`（listen stream の切断）は B6 報告と同じ既知事象。

## 27. TypeScript

`npx tsc --noEmit -p .`：エラーなし

## 28. npm test

**302 件 pass / 0 fail**（B6 の 274 件＋certificateReview 26件＋isolation 2件）

## 29. Rules test

`npm run test:rules`：**12 件 pass / 0 fail**（既存 10＋B7 2）。firestore.rules は未変更。
※ この端末は PATH 上に Java が無いため、Homebrew の openjdk@17 を PATH に足して実行した（firebase-tools から「Java 21 以上を推奨」の警告あり。結果には影響なし）。

## 30. ESLint

変更・新規の7ファイル（certificateReview.ts / .test.ts、chartStore.ts、CertificateReviewCard.tsx、CertificatesPanel.tsx、isolation.test.ts、phase1a.rules.test.mjs）：エラー・警告なし

## 31. Build

`npx next build`：成功。Production の `.env.local` は使わず、demo 用の値を環境変数で渡して build した（B5/B6 の .env.local symlink は今回作っていない）。警告は worktree 由来の既存の「workspace root の推定」のみ。

## 32. Production 未接続

- Production には接続・書き込みしていない（Emulator・ローカルのみ。Next も demo 設定で起動）
- deploy なし・push なし・commit なし

## 33. Git status

```
branch: feat/phase1b7-chart-review（HEAD = 639bf513）
 M src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificatesPanel.tsx
 M src/lib/beneficiaryChart/chartStore.ts
 M src/lib/tsusho/isolation.test.ts
 M tests/rules/phase1a.rules.test.mjs
?? src/app/t/[tenantId]/beneficiaries/[beneficiaryId]/chart/CertificateReviewCard.tsx
?? src/lib/beneficiaryChart/certificateReview.test.ts
?? src/lib/beneficiaryChart/certificateReview.ts
?? PHASE1B_B7_IMPLEMENTATION_REPORT.md
```

`git diff --stat`（追跡済み）：4 files, +230 / −5。

差分監査：
- 秘密情報・API キー・Production の設定値なし（diff を走査）
- 実在の個人情報なし（テスト・E2E は架空データ）
- バイナリなし
- E2E の一時ファイルはジョブ一時領域（リポジトリ外）にのみ作成。worktree に残るのは gitignore 対象の `node_modules`（共有 checkout への symlink）・`.next`・`firestore-debug.log` のみ

## 34. 実物 OCR 未検証

**実物の通所受給者証（または自治体の実様式）による OCR 精度は引き続き未検証。** B7 の E2E も OCR を呼ばず、架空データを手入力・投入して確認したもの。
B7 の確認フローは「OCR の値が正しい」と仮定していない：反映には必ずスタッフのチェックが必要、カルテと違う値は初期 OFF、カルテが空でも証の値を自動では書かない。これ自体が OCR 誤認識への安全策になる。

## 35. B7 残課題 / B8 候補

1. 実物の通所受給者証で OCR を確認（一面の児童／保護者の振り分け、四面の相談支援事業所名）
2. pending の可視化：現状は「受給者証タブを開くと未確認の候補が再表示される」まで。利用者一覧・カルテ上部に「未確認の反映候補あり」を出すのは未実装
3. 受給者証タブで OCR 値を訂正 → 変わった項目だけ再表示、はロジック（単体テスト）と再描画（key に証の updatedAt）で対応済みだが、E2E では未確認
4. 確認中に現在の証が切り替わった場合（`CertificateReviewOutdatedError`）は E2E 未確認（ロジックは transaction 内で判定）
5. `personal.address` の補助候補（保護者の居住地を本人住所に使う）は出していない。必要なら別途「常に OFF」で追加を検討
6. B5 報告 25 の summary（検索で証の氏名もヒットする）の扱いは未決定のまま
7. LINE 版への展開（tsusho 自体が LINE 非公開のため対象外）
8. `chartReview.createdAt` は最初に判断した時刻。候補の生成時刻を残す必要があるなら、表示時の書き込み（pending の保存）を別途検討

## 36. 最終判定

**C：コード完成だが追加確認が必要**

- B7 の確認フロー（候補表示・選択反映・反映しない・profile 同期・stale 保護・候補 0・adult/child 除外）は単体テスト・Rules test・Emulator E2E ですべて期待どおり
- ただし実物の通所受給者証 OCR が未検証。また commit / push / deploy はレビュー後
