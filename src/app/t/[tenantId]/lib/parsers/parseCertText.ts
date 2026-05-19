import type { FormDataType } from "../../types/cert";
import { normalizeText } from "./normalizeText";
import { parseAdultPage1 } from "./adult/page1";
import { parseAdultPage2 } from "./adult/page2";

function parseFallback(text: string): FormDataType {
  return {
    number:
      text.match(/(?:\d\s*){10}/)?.[0]?.replace(/\s/g, "") || "",

    address:
      text.match(/居住地\s*([\s\S]*?)\s*フリガナ/)?.[1]?.trim() ||
      text.match(/住所\s*([\s\S]*?)\s*フリガナ/)?.[1]?.trim() ||
      "",

    furigana: "",

    name:
      text.match(/氏名\s*([^\n]+?)\s*生年月日/)?.[1]?.trim() || "",

    birthday:
      text.match(/(昭和|平成|令和)[^\n]*?日/)?.[0] || "",

    childFurigana: "",

    childName: "",
    childBirthday: "",

    disabilityType: text.match(/障害種別\s*([^\n]+)/)?.[1]?.trim() || "",

    issueDate: text.match(/交付年月日\s*([^\n]+)/)?.[1]?.trim() || "",

    cityName:
      text.match(/支給市町村名\s*([^\n]+)/)?.[1]?.trim() ||
      text.match(/支給市区町村名\s*([^\n]+)/)?.[1]?.trim() ||
      "",

    issuerAddress: "",
  };
}

export function parseCertText(
  text: string,
  pageIndex?: number,
  selectedCertType?: string
): FormDataType {
  const normalized = normalizeText(text);

  console.log("PARSE CERT", {
    pageIndex,
    selectedCertType,
    normalized,
  });

  if (selectedCertType === "adult" && pageIndex === 0) {
    return parseAdultPage1(normalized);
  }

  if (selectedCertType === "adult" && pageIndex === 1) {
    return parseAdultPage2(normalized);
  }

  return parseFallback(normalized);
}