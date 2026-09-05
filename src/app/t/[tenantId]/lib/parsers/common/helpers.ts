// 受給者証パーサの共通ヘルパ。
//
// adult / child のどちらの様式にも依存しない、純粋な文字列処理だけを置く。
// 「サービス種別の行を探す」「本人と児童を並び順で判別する」といった
// 帳票固有の抽出条件はここへ移さず、各ページのパーサに残す。
//
// ここにある実装は adult/page1〜4 から切り出したもので、
// 切り出し前後で挙動を変えていない（lib/parsers/adult/outputCompat.test.ts で固定）。

/** OCRテキストを行単位に分割し、各行をtrimして空行を除く。 */
export const getLines = (text: string) =>
  text.split("\n").map((v) => v.trim()).filter(Boolean);

/** ラベルを含む行の「次の行」を返す。見つからなければ空文字。 */
export const pickLineAfter = (text: string, label: string) => {
  const lines = getLines(text);
  const index = lines.findIndex((line) => line.includes(label));
  return index >= 0 ? lines[index + 1] || "" : "";
};

/** ラベルを含む行の「前の行」を返す。見つからない・先頭行の場合は空文字。 */
export const pickLineBefore = (text: string, label: string) => {
  const lines = getLines(text);
  const index = lines.findIndex((line) => line.includes(label));
  return index > 0 ? lines[index - 1] || "" : "";
};

// 和暦日付。桁の前後に空白が入るOCR揺れ（「令和 5 年 6 月 30 日」等）も許容する
export const ERA_DATE_RE = /(昭和|平成|令和)\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日/;

// 「令和 5 年 6 月 30 日」のような桁間の空白を除去し「令和5年6月30日」に揃える
export function normalizeEraDate(raw: string): string {
  return raw.replace(/\s+/g, "");
}
