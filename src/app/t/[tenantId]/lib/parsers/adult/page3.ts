import type { FormDataType } from "../../../types/cert";

const getLines = (text: string) =>
  text.split("\n").map((v) => v.trim()).filter(Boolean);

const pickSections = (text: string) => {
  const lines = getLines(text);
  const sections: { type: string; period: string; amount: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("サービス種別")) continue;

    sections.push({
      type: lines[i + 1] || "",
      period: lines[i + 3] || "",
      amount: lines[i + 5] || "",
    });
  }

  return sections;
};

export function parseAdultPage3(text: string): FormDataType {
  const sections = pickSections(text);

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

    serviceType4: sections[0]?.type || "",
    servicePeriod4: sections[0]?.period || "",
    serviceAmount4: sections[0]?.amount || "",

    serviceType5: sections[1]?.type || "",
    servicePeriod5: sections[1]?.period || "",
    serviceAmount5: sections[1]?.amount || "",

    memo: "",
  };
}