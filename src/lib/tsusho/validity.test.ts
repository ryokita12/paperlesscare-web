import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTsushoValidity, selectRepresentativeService } from "./validity.ts";
import type { TsushoServiceDecision, TsushoServiceKind, TsushoServiceRow } from "./types.ts";
import { parseTsushoCertText } from "./parsers/index.ts";
import {
  FACE2_JIDO_AND_HOUKAGO,
  FACE2_OLD_AND_NEW,
  FACE3_OTHER_SERVICES,
} from "./parsers/fixtures.ts";

function svc(
  row: TsushoServiceRow,
  kind: TsushoServiceKind,
  validFrom: string | null,
  validTo: string | null
): TsushoServiceDecision {
  return {
    row,
    kind,
    kindText: kind,
    amountText: "",
    daysPerMonth: null,
    periodText: "",
    validFrom,
    validTo,
  };
}

test("代表期間：放デイがあれば、終了日がより遅い他のサービスより放デイを優先する", () => {
  const result = selectRepresentativeService([
    svc(1, "hoikushoHoumon", "2026-04-01", "2028-03-31"),
    svc(2, "houkagoDay", "2026-04-01", "2027-03-31"),
  ]);
  assert.equal(result?.row, 2);
  assert.equal(result?.serviceKind, "houkagoDay");
  assert.equal(result?.validTo, "2027-03-31");
});

test("代表期間：放デイが複数（旧期間＋新期間）なら validTo が最も遅い行", () => {
  const result = selectRepresentativeService([
    svc(1, "houkagoDay", "2025-04-01", "2026-03-31"),
    svc(2, "houkagoDay", "2026-04-01", "2027-03-31"),
  ]);
  assert.equal(result?.row, 2);
  assert.equal(result?.validFrom, "2026-04-01");
});

test("代表期間：放デイが無ければ、全サービスで validTo が最も遅い行", () => {
  const result = selectRepresentativeService([
    svc(1, "jidoHattatsu", "2026-04-01", "2027-03-31"),
    svc(2, "hoikushoHoumon", "2026-04-01", "2028-03-31"),
    svc(3, "unknown", "2026-04-01", "2027-09-30"),
  ]);
  assert.equal(result?.row, 2);
  assert.equal(result?.serviceKind, "hoikushoHoumon");
});

test("代表期間：期間を読める行が無ければ null", () => {
  assert.equal(selectRepresentativeService([]), null);
  assert.equal(selectRepresentativeService([svc(1, "jidoHattatsu", null, null)]), null);
});

test("代表期間：放デイの期間が読めない場合、他のサービスの期間で代用しない（null）", () => {
  const result = selectRepresentativeService([
    svc(1, "houkagoDay", null, null),
    svc(2, "jidoHattatsu", "2026-04-01", "2027-03-31"),
  ]);
  assert.equal(result, null);
});

test("代表期間：終了日が同じなら開始日が遅い行、それも同じなら行番号が小さい行", () => {
  assert.equal(
    selectRepresentativeService([
      svc(1, "houkagoDay", "2026-01-01", "2027-03-31"),
      svc(2, "houkagoDay", "2026-04-01", "2027-03-31"),
    ])?.row,
    2
  );
  assert.equal(
    selectRepresentativeService([
      svc(3, "houkagoDay", "2026-04-01", "2027-03-31"),
      svc(1, "houkagoDay", "2026-04-01", "2027-03-31"),
    ])?.row,
    1
  );
});

test("extractTsushoValidity：pages から根拠つきの代表期間を求める（ケースB）", () => {
  const result = extractTsushoValidity([
    { pageNo: 2, formData: parseTsushoCertText(FACE2_JIDO_AND_HOUKAGO, 1) },
    { pageNo: 3, formData: parseTsushoCertText(FACE3_OTHER_SERVICES, 2) },
  ]);
  assert.deepEqual(result, {
    validFrom: "2026-04-01",
    validTo: "2027-03-31",
    row: 2,
    serviceKind: "houkagoDay",
    serviceKindText: "放課後等デイサービス",
    periodText: "令和8年4月1日から令和9年3月31日まで",
  });
});

test("extractTsushoValidity：旧期間＋新期間（ケースC）は新しい期間", () => {
  const result = extractTsushoValidity([
    { pageNo: 2, formData: parseTsushoCertText(FACE2_OLD_AND_NEW, 1) },
  ]);
  assert.equal(result?.validTo, "2027-03-31");
  assert.equal(result?.row, 2);
});
