import type { FormDataType } from "../../../types/cert";

const getLines = (text: string) =>
  text.split("\n").map((v) => v.trim()).filter(Boolean);

export function parseAdultPage2(text: string): FormDataType {
  const lines = getLines(text);
  const period = text.match(/令和\d+年\d+月\d+日から令和\d+年\d+月\d+日まで/)?.[0] || "";
  const serviceName = lines.find((line) => line.includes("短期入所")) || "";
  const amount = lines.find((line) => line.includes("日/月")) || "";

  return {
    number: "",
    address: "",
    name: serviceName,
    birthday: period,
    childName: amount,
    childBirthday: "",
    disabilityType: "",
    issueDate: "",
    cityName: "",
    issuerAddress: "",
  };
}