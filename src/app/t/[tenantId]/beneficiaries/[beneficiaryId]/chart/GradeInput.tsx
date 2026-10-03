"use client";

// 学年の入力欄（基本情報・学校情報で共通）。
// 空欄なら生年月日から自動計算した学年を表示する。留年・就学猶予・特別支援学校の学部などで
// 自動計算と合わない場合だけ入力してもらう。
import { FormField, inputClass } from "../../components/chartUi";

const GRADE_SUGGESTIONS = [
  "未就学",
  ...[1, 2, 3, 4, 5, 6].map((n) => `小学${n}年`),
  ...[1, 2, 3].map((n) => `中学${n}年`),
  ...[1, 2, 3].map((n) => `高校${n}年`),
];

export function GradeInput({
  id,
  value,
  autoGrade,
  onChange,
}: {
  id: string;
  value: string;
  autoGrade: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField
      label="学年"
      htmlFor={id}
      hint={
        autoGrade
          ? `空欄の場合は生年月日から自動計算した「${autoGrade}」を表示します。実際と違う場合だけ入力してください。`
          : "生年月日を入力すると自動計算します。実際と違う場合だけ入力してください。"
      }
    >
      <input
        id={id}
        className={inputClass}
        list={`${id}-options`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={autoGrade ? `自動：${autoGrade}` : "例：小学3年"}
      />
      <datalist id={`${id}-options`}>
        {GRADE_SUGGESTIONS.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
    </FormField>
  );
}
