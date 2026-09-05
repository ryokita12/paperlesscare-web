import type { FormDataType } from "../../types/cert";

// ページ2（介護給付費の支給決定内容）の1組目は、以前は人物情報用のフィールドを
// 流用して保存されていた。
//
//   サービス種別①  → name
//   支給決定期間①  → birthday
//   支給量等①      → childName
//
// 現在は2〜8組目と同じ serviceType1 / servicePeriod1 / serviceAmount1 を使う。
// 既にFirestoreへ保存済みの旧構造データが編集画面で空欄にならないよう、
// 読み取り時にここで新フィールドへ移送する（アプリ側での互換対応であり、
// Firestoreの一括migrationは行っていない）。
//
// 移送は「新フィールドが空で、かつ旧フィールドに値がある」場合のみ行い、
// 移送した旧フィールドは空にする（値の移動であってコピーではない）。
// これにより、ユーザーが次に保存した時点でそのドキュメントだけ新構造へ揃う。

// ページ2の1組目における「旧フィールド → 新フィールド」の対応。
const LEGACY_PAGE2_FIELD_MAP = [
  { legacy: "name", current: "serviceType1" },
  { legacy: "birthday", current: "servicePeriod1" },
  { legacy: "childName", current: "serviceAmount1" },
] as const;

// 受給者証の2ページ目かどうか。pageNo が欠けている旧データでは配列添字で判定する。
export function isPage2(pageNo: number | undefined, index: number): boolean {
  return typeof pageNo === "number" ? pageNo === 2 : index === 1;
}

/**
 * ページ2のformDataについて、旧フィールドに残っている1組目の値を
 * serviceType1 / servicePeriod1 / serviceAmount1 へ移送する。
 *
 * 移送が不要な場合は元のオブジェクトをそのまま返す（不要な再レンダリングを避ける）。
 */
export function migrateLegacyPage2FormData(
  formData: FormDataType
): FormDataType {
  const moves = LEGACY_PAGE2_FIELD_MAP.filter(
    ({ legacy, current }) => !formData[current] && !!formData[legacy]
  );

  if (moves.length === 0) return formData;

  const migrated: FormDataType = { ...formData };

  for (const { legacy, current } of moves) {
    migrated[current] = formData[legacy];
    migrated[legacy] = "";
  }

  return migrated;
}
