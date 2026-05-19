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

export function parseAdultPage1(text: string): FormDataType {
  const birthdays = text.match(/(昭和|平成|令和)\d+年\s*\d+月\s*\d+日/g) || [];

  return {
    number:
      text.match(/(?:\d\s*){10}/)?.[0]?.replace(/\s/g, "") || "",

    address:
      pickLineBefore(text, "居住地") ||
      pickLineAfter(text, "居住地") ||
      "",

    name:
      pickLineAfter(text, "等氏名") ||
      pickLineAfter(text, "氏名") ||
      "",

    birthday: birthdays[0] || "",

    childName:
      text.match(/児童[\s\S]*?氏名\s*([^\n]+?)\s*生年月日/)?.[1]?.trim() || "",

    childBirthday: birthdays[1] || "",

    disabilityType:
      pickLineAfter(text, "障害種別") || "",

    issueDate:
      pickLineBefore(text, "交付年月日") ||
      pickLineAfter(text, "交付年月日") ||
      "",

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