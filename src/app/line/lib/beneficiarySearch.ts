// LINEスタッフ版の利用者検索（「利用者を確認する」と「登録済みの利用者を選ぶ」で共通）。
// Firebaseに依存しない純粋ロジック。node:test から直接テストできるよう型以外は import しない。
//
// 検索対象は既存の利用者docにあるフィールドだけ：
//   profile.name / summary.name（氏名）、profile.furigana / summary.furigana（フリガナ）、
//   summary.number（受給者番号）

export type SearchableBeneficiary = {
  profile: { name: string; furigana: string };
  summary: { name: string; furigana: string; number: string };
};

// 空白（全角含む）を除き、ひらがなをカタカナへ、全角英数を半角へ揃える。
// 受給者証のフリガナはカタカナだが、スマホでは「やまだ」とひらがなで入力されることが多いため。
export function normalizeForSearch(value: string): string {
  return (value || "")
    .normalize("NFKC")
    .replace(/\s/g, "")
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .toLowerCase();
}

export function beneficiaryDisplayName(b: SearchableBeneficiary): string {
  return b.profile.name || b.summary.name || "";
}

export function beneficiaryFurigana(b: SearchableBeneficiary): string {
  return b.profile.furigana || b.summary.furigana || "";
}

export function matchesBeneficiary(b: SearchableBeneficiary, keyword: string): boolean {
  const q = normalizeForSearch(keyword);
  if (!q) return true;
  return [b.profile.name, b.summary.name, b.profile.furigana, b.summary.furigana, b.summary.number]
    .map(normalizeForSearch)
    .some((v) => v.includes(q));
}

export function filterBeneficiaries<T extends SearchableBeneficiary>(list: T[], keyword: string): T[] {
  return list.filter((b) => matchesBeneficiary(b, keyword));
}

// 選んだ利用者と、撮影した受給者証の氏名が明らかに違うか（空白・表記ゆれは無視）。
// どちらかが空（OCRで氏名が取れなかった等）の場合は判定しない。
export function isNameMismatch(selectedName: string, ocrName: string): boolean {
  const a = normalizeForSearch(selectedName);
  const b = normalizeForSearch(ocrName);
  return !!a && !!b && a !== b;
}
