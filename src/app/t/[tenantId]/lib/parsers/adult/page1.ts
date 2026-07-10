import type { FormDataType } from "../../../types/cert";

const getLines = (text: string) =>
  text.split("\n").map((v) => v.trim()).filter(Boolean);

const pickLineAfter = (text: string, label: string) => {
  const lines = getLines(text);
  const index = lines.findIndex((line) => line.includes(label));
  return index >= 0 ? lines[index + 1] || "" : "";
};

const pickLineBefore = (text: string, label: string) => {
  const lines = getLines(text);
  const index = lines.findIndex((line) => line.includes(label));
  return index > 0 ? lines[index - 1] || "" : "";
};

// 「氏名」ラベルはOCRで表記が揺れる（氏名 / 氏 名 / 氏\n名 / 等氏名 等）。
// "氏" と "名" の間に空白・改行が0文字以上入る形として一括で扱う。
const NAME_BLOCK_RE = /氏\s*名\s*([^\n]*)/g;

// 和暦日付。桁の前後に空白が入るOCR揺れ（「令和 5 年 6 月 30 日」等）も許容する
const ERA_DATE_RE = /(昭和|平成|令和)\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日/;

function cleanNameValue(raw: string): string {
  return raw
    .replace(/^(等)?\s*(フリガナ|氏\s*名)\s*/, "")
    .trim();
}

// 「令和 5 年 6 月 30 日」のような桁間の空白を除去し「令和5年6月30日」に揃える
function normalizeEraDate(raw: string): string {
  return raw.replace(/\s+/g, "");
}

type NameBlock = {
  name: string;
  birthday: string;
};

// 文中の「氏名」ラベルを出現順にすべて拾い、各ブロックの直後（次のブロックの
// 手前まで）に現れる最初の和暦日付を、そのブロックの生年月日として対応づける。
// 1番目＝本人、2番目＝児童、という前提はこの並び順に依存する。
function extractNameBlocks(text: string): NameBlock[] {
  const matches = Array.from(text.matchAll(NAME_BLOCK_RE));

  return matches
    .map((match, i) => {
      const name = cleanNameValue(match[1] || "");

      const segmentStart = (match.index ?? 0) + match[0].length;
      const segmentEnd =
        i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
      const segment = text.slice(segmentStart, segmentEnd);

      const birthdayMatch = segment.match(ERA_DATE_RE)?.[0];
      const birthday = birthdayMatch ? normalizeEraDate(birthdayMatch) : "";

      return { name, birthday };
    })
    .filter((block) => !!block.name);
}

export function parseAdultPage1(text: string): FormDataType {
  const nameBlocks = extractNameBlocks(text);

  // 本人：出現順1番目のブロックを優先し、取れない場合のみ旧ロジックにフォールバック
  const name =
    nameBlocks[0]?.name ||
    pickLineAfter(text, "等氏名") ||
    pickLineAfter(text, "氏名") ||
    "";
  const birthday = nameBlocks[0]?.birthday || "";

  // 児童：「児童」見出しからの抽出に成功した場合はそれを優先し、
  // 失敗した場合のみ出現順2番目のブロックにフォールバックする
  const childNameByHeading = text
    .match(/児童[\s\S]*?氏\s*名\s*([^\n]+?)\s*生年月日/)?.[1]
    ?.trim();

  let childName = childNameByHeading ? cleanNameValue(childNameByHeading) : "";
  let childBirthday = "";

  if (childName) {
    const byHeadingMatch = text
      .match(/児童[\s\S]*?生年月日\s*([\s\S]*)/)?.[1]
      ?.match(ERA_DATE_RE)?.[0];
    childBirthday = byHeadingMatch ? normalizeEraDate(byHeadingMatch) : "";
  }

  if (!childName && nameBlocks.length >= 2) {
    childName = nameBlocks[1].name;
    childBirthday = nameBlocks[1].birthday;
  }

  // 交付年月日：「交付年月日」〜「支給市町村名/支給市区町村名」の範囲に限定し、
  // 和暦日付の形式に一致する値だけを採用する（数字だけの値=障害種別等は不採用）
  const issueDateSection =
    text.split(/交付年月日/)[1]?.split(/支給市区?町村名/)[0] || "";
  const issueDateMatch = issueDateSection.match(ERA_DATE_RE)?.[0];
  const issueDate = issueDateMatch ? normalizeEraDate(issueDateMatch) : "";

  return {
    number:
      text.match(/(?:\d\s*){10}/)?.[0]?.replace(/\s/g, "") || "",

    address:
      pickLineBefore(text, "居住地") ||
      pickLineAfter(text, "居住地") ||
      "",

    furigana: "",

    name,

    birthday,

    childFurigana: "",

    childName,

    childBirthday,

    disabilityType:
      pickLineAfter(text, "障害種別") || "",

    issueDate,

    cityName:
      pickLineAfter(text, "支給市町村名") ||
      pickLineAfter(text, "支給市区町村名") ||
      "",

    issuerAddress:
      pickLineBefore(text, "支給市町村名") ||
      pickLineBefore(text, "支給市区町村名") ||
      "",
  };
}