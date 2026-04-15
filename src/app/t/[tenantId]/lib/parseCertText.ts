import type { FormDataType } from "../types/cert";

export function parseCertText(text: string): FormDataType {
  return {
    number: text.match(/\d{10}/)?.[0] || "",
    address:
      text.match(/居住地\s*([\s\S]*?)\s*フリガナ/)?.[1]?.trim() ||
      text.match(/住所\s*([\s\S]*?)\s*フリガナ/)?.[1]?.trim() ||
      "",
    name:
      text.match(/支給決定障害者等[\s\S]*?氏名\s*([^\n]+?)\s*生年月日/)?.[1]?.trim() ||
      text.match(/氏名\s*([^\n]+?)\s*生年月日/)?.[1]?.trim() ||
      "",
    birthday:
      text.match(/支給決定障害者等[\s\S]*?((昭和|平成|令和)[^\n]*?日)/)?.[1] ||
      text.match(/(昭和|平成|令和)[^\n]*?日/)?.[0] ||
      "",
    childName:
      text.match(/児童[\s\S]*?氏名\s*([^\n]+?)\s*生年月日/)?.[1]?.trim() || "",
    childBirthday:
      text.match(/児童[\s\S]*?((昭和|平成|令和)[^\n]*?日)/)?.[1] || "",
    disabilityType: text.match(/障害種別\s*([^\n]+)/)?.[1]?.trim() || "",
    issueDate: text.match(/交付年月日\s*([^\n]+)/)?.[1]?.trim() || "",
    cityName:
      text.match(/支給市区町村名[\s\S]*?([^\n]+市[^\n]*|[^\n]+区[^\n]*|[^\n]+町[^\n]*|[^\n]+村[^\n]*)/)?.[1]?.trim() ||
      "",
  };
}