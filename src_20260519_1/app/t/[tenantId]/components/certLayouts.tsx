"use client";

import { useState } from "react";
import type { CertPage } from "../types/cert";

type Props = {
  pageIndex: number;
  pageTitle: string;
  page: CertPage;
  onChangeField: (field: keyof CertPage["formData"], value: string) => void;
};

type LayoutProps = {
  pageTitle: string;
  page: CertPage;
  onChangeField: Props["onChangeField"];
};

function EditableCertCell({
  value,
  field,
  onChangeField,
  className = "",
  multiline = false,
}: {
  value: string;
  field: keyof CertPage["formData"];
  onChangeField: Props["onChangeField"];
  className?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  if (editing) {
    return (
      <div className={`flex items-start gap-2 ${className}`}>
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm"
            rows={3}
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        )}

        <button
          type="button"
          className="rounded border px-2 py-1 text-xs"
          onClick={() => {
            onChangeField(field, draft);
            setEditing(false);
          }}
        >
          保存
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-start justify-between gap-2 ${className}`}>
      <div className="whitespace-pre-wrap">{value}</div>
      <button
        type="button"
        className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-zinc-50"
        onClick={() => {
          setDraft(value || "");
          setEditing(true);
        }}
      >
        ✎
      </button>
    </div>
  );
}

function LayoutType1({ pageTitle, page, onChangeField }: LayoutProps) {
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">{pageTitle}</div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">受給者番号</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.number} field="number" onChangeField={onChangeField} />
        </div>
      </div>

      <div className="grid grid-cols-[30px_110px_1fr] border-b cert-row-lg">
        <div className="border-r flex items-center justify-center [writing-mode:vertical-rl] text-center px-2">
          支給決定障害者等
        </div>

        <div className="border-r grid grid-rows-[40px_40px_40px_1fr]">
          <div className="border-b flex items-center justify-center">居住地</div>
          <div className="border-b flex items-center justify-center">フリガナ</div>
          <div className="border-b flex items-center justify-center">氏名</div>
          <div className="flex items-center justify-center">生年月日</div>
        </div>

        <div className="grid grid-rows-[40px_40px_40px_1fr]">
          <div className="border-b cert-cell text-sm font-medium">
            <EditableCertCell value={page.formData.address} field="address" onChangeField={onChangeField} multiline />
          </div>

          <div className="border-b cert-cell text-sm font-medium">
            <EditableCertCell
              value={page.formData.furigana}
              field="furigana"
              onChangeField={onChangeField}
            />
          </div>

          <div className="border-b cert-cell text-sm font-medium">
            <EditableCertCell value={page.formData.name} field="name" onChangeField={onChangeField} />
          </div>

          <div className="cert-cell text-sm font-medium">
            <EditableCertCell value={page.formData.birthday} field="birthday" onChangeField={onChangeField} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[30px_110px_1fr] border-b cert-row-md">
        <div className="border-r flex items-center justify-center [writing-mode:vertical-rl] text-center px-2">
          児童
        </div>

        <div className="border-r grid grid-rows-[40px_40px_1fr]">
          <div className="border-b flex items-center justify-center">フリガナ</div>
          <div className="border-b flex items-center justify-center">氏名</div>
          <div className="flex items-center justify-center">生年月日</div>
        </div>

        <div className="grid grid-rows-[40px_40px_1fr]">
          <div className="border-b cert-cell text-sm font-medium">
            <EditableCertCell
              value={page.formData.childFurigana}
              field="childFurigana"
              onChangeField={onChangeField}
            />
          </div>

          <div className="border-b cert-cell text-sm font-medium">
            <EditableCertCell value={page.formData.childName} field="childName" onChangeField={onChangeField} />
          </div>

          <div className="cert-cell text-sm font-medium">
            <EditableCertCell value={page.formData.childBirthday} field="childBirthday" onChangeField={onChangeField} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">障害種別</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.disabilityType} field="disabilityType" onChangeField={onChangeField} />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">交付年月日</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.issueDate} field="issueDate" onChangeField={onChangeField} />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] cert-row-md">
        <div className="border-r cert-cell text-center">
          <div>支給市区町村名</div>
          <div className="mt-3">及び印</div>
        </div>

        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.issuerAddress} field="issuerAddress" onChangeField={onChangeField} multiline />

          <div className="mt-2">
            <EditableCertCell value={page.formData.cityName} field="cityName" onChangeField={onChangeField} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutType2({ pageTitle, page, onChangeField }: LayoutProps) {
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">介護給付費の支給決定内容</div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r flex items-center justify-center cert-cell text-center">障害支援区分</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.disabilityType} field="disabilityType" onChangeField={onChangeField} />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r flex items-center justify-center cert-cell text-center">認定有効期間</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.certPeriod || ""} field="certPeriod" onChangeField={onChangeField} />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r flex items-center justify-center cert-cell text-center">サービス種別</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.name} field="name" onChangeField={onChangeField} />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-sm">
        <div className="border-r flex items-center justify-center cert-cell text-center">支給決定期間</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.birthday} field="birthday" onChangeField={onChangeField} />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-sm">
        <div className="border-r flex items-center justify-center cert-cell text-center">支給量等</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.childName} field="childName" onChangeField={onChangeField} multiline />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r flex items-center justify-center cert-cell text-center">サービス種別</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.serviceType2 || ""} field="serviceType2" onChangeField={onChangeField} />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-sm">
        <div className="border-r flex items-center justify-center cert-cell text-center">支給決定期間</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.servicePeriod2 || ""} field="servicePeriod2" onChangeField={onChangeField} />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-sm">
        <div className="border-r flex items-center justify-center cert-cell text-center">支給量等</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.serviceAmount2 || ""} field="serviceAmount2" onChangeField={onChangeField} multiline />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r flex items-center justify-center cert-cell text-center">サービス種別</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.serviceType3 || ""} field="serviceType3" onChangeField={onChangeField} />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-sm">
        <div className="border-r flex items-center justify-center cert-cell text-center">支給決定期間</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.servicePeriod3 || ""} field="servicePeriod3" onChangeField={onChangeField} />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-sm">
        <div className="border-r flex items-center justify-center cert-cell text-center">支給量等</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.serviceAmount3 || ""} field="serviceAmount3" onChangeField={onChangeField} multiline />
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] cert-row-sm">
        <div className="border-r flex items-start justify-center cert-cell text-center">（予備欄）</div>
        <div className="cert-cell text-sm font-medium">
          <EditableCertCell value={page.formData.memo || ""} field="memo" onChangeField={onChangeField} multiline />
        </div>
      </div>
    </div>
  );
}

function LayoutType3({ pageTitle, page }: { pageTitle: string; page: CertPage }) {
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">
        {pageTitle}
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          サービス種別
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-sm">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          支給決定期間
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-md">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          支給量等
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          サービス種別
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-sm">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          支給決定期間
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-md">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          支給量等
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] cert-row-lg">
        <div className="border-r flex items-start justify-center cert-cell text-center">
          （予備欄）
        </div>
        <div className="cert-cell"></div>
      </div>
    </div>
  );
}

function LayoutType4({ pageTitle, page }: { pageTitle: string; page: CertPage }) {
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">
        {pageTitle}
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          サービス種別
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-sm">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          支給決定期間
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-md">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          支給量等
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          サービス種別
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-sm">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          支給決定期間
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-md">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          支給量等
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          サービス種別
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-sm">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          支給決定期間
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-md">
        <div className="border-r flex items-center justify-center cert-cell text-center">
          支給量等
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r flex items-start justify-center cert-cell text-center">
          （予備欄）
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr]">
        <div className="border-r flex items-start justify-center cert-cell text-center">
          問い合わせ先
        </div>
        <div className="cert-cell whitespace-pre-wrap text-center">
          名古屋市南区西恵支所{"\n"}
          区民福祉課　障害福祉担当{"\n"}
          電　話：（052）878-2508（直通）{"\n"}
          ＦＡＸ：（052）875-2215
        </div>
      </div>
    </div>
  );
}

function LayoutType5({ pageTitle, page }: { pageTitle: string; page: CertPage }) {
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">
        {pageTitle}
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">受給者証番号</div>
        <div className="cert-cell">{page.formData.number}</div>
      </div>

      <div className="grid grid-cols-[30px_110px_1fr] border-b cert-row-lg">
        <div className="border-r flex items-center justify-center [writing-mode:vertical-rl] text-center px-2">
          支給決定障害者等
        </div>
        <div className="border-r grid grid-rows-[40px_40px_40px_1fr]">
          <div className="border-b flex items-center justify-center">居住地</div>
          <div className="border-b flex items-center justify-center">フリガナ</div>
          <div className="border-b flex items-center justify-center">氏名</div>
          <div className="flex items-center justify-center">生年月日</div>
        </div>
        <div className="grid grid-rows-[40px_40px_40px_1fr]">
          <div className="border-b cert-cell whitespace-pre-wrap">{page.formData.address}</div>
          <div className="border-b cert-cell"></div>
          <div className="border-b cert-cell">{page.formData.name}</div>
          <div className="cert-cell">{page.formData.birthday}</div>
        </div>
      </div>

      <div className="grid grid-cols-[30px_110px_1fr] border-b cert-row-md">
        <div className="border-r flex items-center justify-center [writing-mode:vertical-rl] text-center px-2">
          児童
        </div>
        <div className="border-r grid grid-rows-[40px_40px_1fr]">
          <div className="border-b flex items-center justify-center">フリガナ</div>
          <div className="border-b flex items-center justify-center">氏名</div>
          <div className="flex items-center justify-center">生年月日</div>
        </div>
        <div className="grid grid-rows-[40px_40px_1fr]">
          <div className="border-b cert-cell"></div>
          <div className="border-b cert-cell">{page.formData.childName}</div>
          <div className="cert-cell">{page.formData.childBirthday}</div>
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">障害種別</div>
        <div className="cert-cell">{page.formData.disabilityType}</div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">交付年月日</div>
        <div className="cert-cell">{page.formData.issueDate}</div>
      </div>

      <div className="grid grid-cols-[140px_1fr] cert-row-md">
        <div className="border-r cert-cell text-center">
          <div>支給市町村名</div>
          <div className="mt-3">及び印</div>
        </div>
        <div className="cert-cell">{page.formData.cityName}</div>
      </div>
    </div>
  );
}

function LayoutType6({ pageTitle, page }: { pageTitle: string; page: CertPage }) {
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">
        計画相談支援給付費の支給内容
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">支給期間</div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-md">
        <div className="border-r cert-cell text-center">
          指定特定相談支援事業所名
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-md">
        <div className="border-r cert-cell text-center">モニタリング期間</div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">開始年月日</div>
        <div className="cert-cell text-center">年　　月　　日</div>
      </div>

      <div className="border-b cert-title">
        特定障害者特別給付費の支給内容
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">支給額</div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">適用期間</div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">変更前の支給額</div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">変更前の適用期間</div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] cert-row-lg">
        <div className="border-r cert-cell text-center">（予備欄）</div>
        <div className="cert-cell"></div>
      </div>
    </div>
  );
}

function LayoutType7({ pageTitle, page }: { pageTitle: string; page: CertPage }) {
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">
        利用者負担に関する事項
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">負担上限月額</div>
        <div className="cert-cell text-center">4,600 円</div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">適用期間</div>
        <div className="cert-cell text-center">
          令和 7年11月 1日から令和 8年10月31日まで
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">変更前の負担上限月額</div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">変更前の適用期間</div>
        <div className="cert-cell"></div>
      </div>

      <div className="border-b cert-cell text-center">
        （食事提供体制加算　該当）
      </div>

      <div className="grid grid-cols-[1fr_120px] border-b">
        <div className="border-r cert-cell text-center">
          利用者負担上限額管理対象者該当の有無
        </div>
        <div className="cert-cell text-center">該当</div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-md">
        <div className="border-r cert-cell text-center">
          利用者負担上限額管理事業所名
        </div>
        <div className="cert-cell"></div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b">
        <div className="border-r cert-cell text-center">開始年月日</div>
        <div className="cert-cell text-center">年　　月　　日</div>
      </div>

      <div className="grid grid-cols-[140px_1fr] border-b cert-row-md">
        <div className="border-r cert-cell text-center">特記事項欄</div>
        <div className="cert-cell whitespace-pre-wrap text-center">
          計画相談支援（障害児相談支援対象者）
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr]">
        <div className="border-r cert-cell text-center">問い合わせ先</div>
        <div className="cert-cell whitespace-pre-wrap text-center">
          名古屋市南区西恵支所{"\n"}
          区民福祉課　障害福祉担当{"\n"}
          電　話：（052）878-2508（直通）{"\n"}
          ＦＡＸ：（052）875-2215
        </div>
      </div>
    </div>
  );
}

export default function CertLayoutRenderer({
  pageIndex,
  pageTitle,
  page,
  onChangeField,
}: Props) {
  switch (pageIndex) {
    case 0:
      return (
        <LayoutType1
          pageTitle={pageTitle}
          page={page}
          onChangeField={onChangeField}
        />
      );
    case 1:
      return (
        <LayoutType2
          pageTitle={pageTitle}
          page={page}
          onChangeField={onChangeField}
        />
      );
    case 2:
  		return <LayoutType3 pageTitle={pageTitle} page={page} />;
    case 3:
  		return <LayoutType4 pageTitle={pageTitle} page={page} />;
    case 4:
  		return <LayoutType5 pageTitle={pageTitle} page={page} />;
    case 5:
  		return <LayoutType6 pageTitle={pageTitle} page={page} />;
    case 6:
  		return <LayoutType7 pageTitle={pageTitle} page={page} />;
    case 7:
      return <LayoutType7 pageTitle={pageTitle} page={page} />;
    default:
      return <LayoutType7 pageTitle={pageTitle} page={page} />;
  }
}