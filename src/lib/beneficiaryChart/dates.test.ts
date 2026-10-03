import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcAge,
  calcSchoolGrade,
  daysBetween,
  formatJapaneseDate,
  isIsoDate,
  normalizeDateText,
  toLocalIsoDate,
} from "./dates.ts";

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

test("normalizeDateText: ISO・西暦の各表記を YYYY-MM-DD にする", () => {
  assert.equal(normalizeDateText("2015-05-10"), "2015-05-10");
  assert.equal(normalizeDateText("2015/5/10"), "2015-05-10");
  assert.equal(normalizeDateText("2015.5.10"), "2015-05-10");
  assert.equal(normalizeDateText("2015年5月10日"), "2015-05-10");
  assert.equal(normalizeDateText("２０１５年５月１０日"), "2015-05-10");
  assert.equal(normalizeDateText(" 2015 年 5 月 10 日 "), "2015-05-10");
});

test("normalizeDateText: 旧データの和暦（元年・全角数字を含む）を読める", () => {
  assert.equal(normalizeDateText("平成20年4月1日"), "2008-04-01");
  assert.equal(normalizeDateText("令和元年5月1日"), "2019-05-01");
  assert.equal(normalizeDateText("平成２７年１２月３日"), "2015-12-03");
});

test("normalizeDateText: 読めない値・存在しない日付は null（例外にしない）", () => {
  assert.equal(normalizeDateText(""), null);
  assert.equal(normalizeDateText("不明"), null);
  assert.equal(normalizeDateText(undefined), null);
  assert.equal(normalizeDateText(12345), null);
  assert.equal(normalizeDateText("2015-02-30"), null);
  assert.equal(normalizeDateText("平成20年13月1日"), null);
});

test("isIsoDate", () => {
  assert.equal(isIsoDate("2024-02-29"), true);
  assert.equal(isIsoDate("2023-02-29"), false);
  assert.equal(isIsoDate("2015-5-10"), false);
  assert.equal(isIsoDate(null), false);
});

test("calcAge: 誕生日の前日・当日で年齢が切り替わる", () => {
  assert.equal(calcAge("2015-05-10", day("2025-05-09")), 9);
  assert.equal(calcAge("2015-05-10", day("2025-05-10")), 10);
  assert.equal(calcAge("2015-05-10", day("2014-01-01")), null);
  assert.equal(calcAge("", day("2025-05-10")), null);
});

test("calcSchoolGrade: 4月2日〜翌4月1日生まれが同学年", () => {
  const today = day("2025-10-01"); // 2025年度
  assert.equal(calcSchoolGrade("2018-04-02", today)?.label, "小学1年");
  assert.equal(calcSchoolGrade("2019-04-01", today)?.label, "小学1年");
  assert.equal(calcSchoolGrade("2019-04-02", today)?.label, "未就学");
  assert.equal(calcSchoolGrade("2013-04-02", today)?.label, "小学6年");
  assert.equal(calcSchoolGrade("2012-05-01", today)?.label, "中学1年");
  assert.equal(calcSchoolGrade("2009-06-01", today)?.label, "高校1年");
  assert.equal(calcSchoolGrade("2007-06-01", today)?.label, "高校3年");
  assert.equal(calcSchoolGrade("2006-06-01", today)?.label, "高校卒業後");
});

test("calcSchoolGrade: 年度の切り替わり（3月31日と4月1日）", () => {
  assert.equal(calcSchoolGrade("2018-04-02", day("2025-03-31"))?.label, "未就学");
  assert.equal(calcSchoolGrade("2018-04-02", day("2025-04-01"))?.label, "小学1年");
  assert.equal(calcSchoolGrade("invalid", day("2025-04-01")), null);
});

test("formatJapaneseDate / toLocalIsoDate / daysBetween", () => {
  assert.equal(formatJapaneseDate("2015-05-10"), "2015年5月10日");
  assert.equal(formatJapaneseDate(""), "");
  assert.equal(formatJapaneseDate("平成20年4月1日"), "平成20年4月1日");
  assert.equal(toLocalIsoDate(day("2025-01-02")), "2025-01-02");
  assert.equal(daysBetween("2025-01-01", "2025-01-31"), 30);
  assert.equal(daysBetween("2025-03-01", "2025-02-28"), -1);
  assert.equal(daysBetween("x", "2025-02-28"), null);
});
