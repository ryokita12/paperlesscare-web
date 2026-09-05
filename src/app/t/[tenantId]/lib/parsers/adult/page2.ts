import type { FormDataType } from "../../../types/cert";

const getLines = (text: string) =>
  text.split("\n").map((v) => v.trim()).filter(Boolean);

// 「令和7年4月1日から令和8年3月31日まで」形式の支給決定期間
const PERIOD_RE = /令和\d+年\d+月\d+日から令和\d+年\d+月\d+日まで/;

export function parseAdultPage2(text: string): FormDataType {
  const lines = getLines(text);

  // 「支給決定期間」ラベル以降に現れる最初の和暦期間を1組目の支給決定期間とみなす。
  // ページ2にはその手前に「認定有効期間」があり、テキスト全体の先頭から探すと
  // そちらを拾ってしまうため、ラベルを起点にする。
  // ラベルがOCRで欠けた場合のみ、従来どおりページ全体の最初の期間へフォールバックする。
  const periodSection = text.split(/支給決定期間/)[1] ?? text;
  const period = periodSection.match(PERIOD_RE)?.[0] ||
    text.match(PERIOD_RE)?.[0] ||
    "";

  const serviceName =
    lines.find((line) => line.includes("短期入所")) || "";

  const amount =
    lines.find((line) => line.includes("日\/月")) || "";

  return {
    number: "",
    address: "",

    furigana: "",

    name: "",

    birthday: "",

    childFurigana: "",

    childName: "",

    childBirthday: "",

    disabilityType: "",

    issueDate: "",

    cityName: "",

    issuerAddress: "",

    // 1組目。page3 / page4 と同じ serviceType / servicePeriod / serviceAmount + 連番に揃える。
    // 以前はそれぞれ name / birthday / childName に格納していた。
    serviceType1: serviceName,
    servicePeriod1: period,
    serviceAmount1: amount,
  };
}
