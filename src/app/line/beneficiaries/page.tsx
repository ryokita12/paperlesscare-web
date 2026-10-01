"use client";

// 「利用者を確認する」：検索 → 一覧 → 詳細
import BeneficiaryPicker from "./BeneficiaryPicker";
import { LinePageHeader } from "../ui";

export default function LineBeneficiariesPage() {
  return (
    <div className="space-y-5">
      <LinePageHeader back={{ href: "/line/home", label: "ホーム" }} title="利用者を確認" />
      <BeneficiaryPicker hrefFor={(b) => `/line/beneficiaries/${b.id}`} />
    </div>
  );
}
