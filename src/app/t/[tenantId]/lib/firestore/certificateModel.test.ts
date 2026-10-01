import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyFormData } from "../../constants/certPages.ts";
import {
  buildCertificateContent,
  extractValidity,
  hasLegacyCertificate,
  mergeProfile,
  mergeSummary,
  parseWarekiDate,
  parseWarekiPeriod,
  type SavedCertPage,
} from "./certificateModel.ts";

function page(pageNo: number, fields: Record<string, string> = {}): SavedCertPage {
  return {
    pageNo,
    title: `page${pageNo}`,
    formData: { ...emptyFormData(), ...fields },
    ocrText: "",
    storagePath: "",
  };
}

test("hasLegacyCertificate: currentCertificateId が欠落し pages がある旧データのみ true", () => {
  assert.equal(hasLegacyCertificate({ pages: [page(1)] }), true);
  // 証なし利用者（null）は legacy ではない
  assert.equal(hasLegacyCertificate({ currentCertificateId: null, pages: [] }), false);
  assert.equal(hasLegacyCertificate({ currentCertificateId: null }), false);
  // 新構造の利用者（移送後に直下の pages が残っていても）は legacy ではない
  assert.equal(hasLegacyCertificate({ currentCertificateId: "abc", pages: [page(1)] }), false);
  // pages が空・欠落している不正データは legacy として扱わない
  assert.equal(hasLegacyCertificate({ pages: [] }), false);
  assert.equal(hasLegacyCertificate({}), false);
});

test("mergeSummary: 新しい証の値を優先し、空欄だけ従来値で補う", () => {
  const merged = mergeSummary(
    { name: "", furigana: "ヤマダ", number: "1234567890", birthday: "", cityName: "" },
    { name: "山田 太郎", furigana: "旧", number: "0000000000", birthday: "平成20年1月1日", cityName: "名古屋市" }
  );
  assert.deepEqual(merged, {
    name: "山田 太郎",
    furigana: "ヤマダ",
    number: "1234567890",
    birthday: "平成20年1月1日",
    cityName: "名古屋市",
  });
});

test("mergeSummary: 従来値が無くても落ちない", () => {
  const merged = mergeSummary(
    { name: "A", furigana: "", number: "", birthday: "", cityName: "" },
    undefined
  );
  assert.equal(merged.name, "A");
  assert.equal(merged.cityName, "");
});

test("mergeProfile: 手入力プロフィールを、証の空欄で消さない", () => {
  const profile = mergeProfile(
    { name: "", furigana: "", number: "1", birthday: "平成20年1月1日", cityName: "" },
    { name: "山田 太郎", furigana: "ヤマダ タロウ", birthday: "" }
  );
  assert.deepEqual(profile, {
    name: "山田 太郎",
    furigana: "ヤマダ タロウ",
    birthday: "平成20年1月1日",
  });
});

test("parseWarekiDate: 和暦をISO日付に変換する", () => {
  assert.equal(parseWarekiDate("令和8年4月1日"), "2026-04-01");
  assert.equal(parseWarekiDate("令和元年5月1日"), "2019-05-01");
  assert.equal(parseWarekiDate("平成31年3月31日"), "2019-03-31");
  assert.equal(parseWarekiDate("昭和64年1月7日"), "1989-01-07");
  assert.equal(parseWarekiDate("令和 ８ 年 ４ 月 １ 日"), "2026-04-01");
  assert.equal(parseWarekiDate(""), null);
  assert.equal(parseWarekiDate("2026年4月1日"), null);
  assert.equal(parseWarekiDate("令和8年13月1日"), null);
});

test("parseWarekiPeriod: 「から」「まで」の期間を分割する", () => {
  assert.deepEqual(parseWarekiPeriod("令和7年4月1日から令和8年3月31日まで"), {
    validFrom: "2025-04-01",
    validTo: "2026-03-31",
  });
  assert.deepEqual(parseWarekiPeriod("令和7年4月1日～"), {
    validFrom: "2025-04-01",
    validTo: null,
  });
  assert.deepEqual(parseWarekiPeriod("不明"), { validFrom: null, validTo: null });
});

test("extractValidity: ページ2の支給決定期間①を優先し、無ければページ7の利用者負担期間", () => {
  assert.deepEqual(
    extractValidity([
      page(1),
      page(2, { servicePeriod1: "令和7年4月1日から令和8年3月31日まで" }),
      page(7, { burdenPeriod: "令和7年7月1日から令和8年6月30日まで" }),
    ]),
    { validFrom: "2025-04-01", validTo: "2026-03-31" }
  );

  assert.deepEqual(
    extractValidity([page(1), page(2), page(7, { burdenPeriod: "令和7年7月1日から令和8年6月30日まで" })]),
    { validFrom: "2025-07-01", validTo: "2026-06-30" }
  );

  assert.deepEqual(extractValidity([page(1)]), { validFrom: null, validTo: null });
});

test("buildCertificateContent: ページ1から summary と交付年月日を取り出す", () => {
  const content = buildCertificateContent({
    certType: "adult",
    pages: [page(1, { name: "山田 太郎", number: "1234567890", issueDate: "令和8年4月1日" })],
  });
  assert.equal(content.certType, "adult");
  assert.equal(content.summary.name, "山田 太郎");
  assert.equal(content.summary.number, "1234567890");
  assert.equal(content.issueDate, "令和8年4月1日");
  assert.equal(content.validFrom, null);
});
