"use client";

// 通所受給者証（児童福祉法・こども家庭庁 様式第9号）の帳票レイアウト。
//
// formData のキーは src/lib/tsusho/constants.ts を正とする。tsusho では
//   name / furigana / birthday                       … 児童（利用者本人）
//   guardianName / guardianFurigana / guardianBirthday / guardianAddress … 通所給付決定保護者
// であり、adult / child（支給決定障害者等＝name）とは意味が異なる。
//
// Phase 1-B3 時点では、tsusho は管理Web・LINE のどちらからも選択できないため、
// ここは画面には表示されない（certLayouts.tsx の LAYOUT_COMPONENTS への登録だけ）。
import type { CertLayout } from "./certLayouts";
import { EditableCertCell } from "./certLayouts";

type LayoutProps = Parameters<CertLayout>[0];

function Row({
  label,
  field,
  props,
  multiline = false,
}: {
  label: string;
  field: string;
  props: LayoutProps;
  multiline?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[140px_1fr] border-b ${multiline ? "cert-row-md" : ""}`}>
      <div className="border-r cert-cell text-center">{label}</div>
      <div className="cert-cell text-sm font-medium">
        <EditableCertCell
          value={props.page.formData[field] || ""}
          field={field}
          onChangeField={props.onChangeField}
          multiline={multiline}
        />
      </div>
    </div>
  );
}

/** 一面：通所受給者証（受給者証番号・通所給付決定保護者・児童・交付年月日・支給市町村名） */
function TsushoBasicLayout(props: LayoutProps) {
  const { pageTitle } = props;
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">{pageTitle}</div>
      <Row label="受給者証番号" field="number" props={props} />

      <div className="grid grid-cols-[30px_1fr] border-b">
        <div className="border-r flex items-center justify-center [writing-mode:vertical-rl] text-center px-2">
          通所給付決定保護者
        </div>
        <div>
          <Row label="居住地" field="guardianAddress" props={props} multiline />
          <Row label="フリガナ" field="guardianFurigana" props={props} />
          <Row label="氏名" field="guardianName" props={props} />
          <Row label="生年月日" field="guardianBirthday" props={props} />
        </div>
      </div>

      <div className="grid grid-cols-[30px_1fr] border-b">
        <div className="border-r flex items-center justify-center [writing-mode:vertical-rl] text-center px-2">
          児童
        </div>
        <div>
          <Row label="フリガナ" field="furigana" props={props} />
          <Row label="氏名" field="name" props={props} />
          <Row label="生年月日" field="birthday" props={props} />
        </div>
      </div>

      <Row label="交付年月日" field="issueDate" props={props} />
      <Row label="支給市町村名" field="cityName" props={props} />
    </div>
  );
}

/** 二面・三面：障害児通所給付費の給付決定内容（各面2行＋特記事項欄・予備欄） */
function DecisionFace({ face, props }: { face: 2 | 3; props: LayoutProps }) {
  const firstRow = face === 2 ? 1 : 3;
  const extraRows = props.page.formData[`decision${face}ExtraRows`] || "";
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">{props.pageTitle}</div>
      {[firstRow, firstRow + 1].map((n) => (
        <div key={n}>
          <Row label="支援の種類" field={`serviceType${n}`} props={props} />
          <Row label="支給量等" field={`serviceAmount${n}`} props={props} multiline />
          <Row label="給付決定期間" field={`servicePeriod${n}`} props={props} />
        </div>
      ))}
      {/* 自治体の様式で1面に3行以上あった場合に、3行目以降の原文が入る（通常は空なので表示しない） */}
      {extraRows && (
        <Row label="追加の行（原文）" field={`decision${face}ExtraRows`} props={props} multiline />
      )}
      <Row label="特記事項欄" field={`decision${face}SpecialNotes`} props={props} multiline />
      <Row label="（予備欄）" field={`decision${face}Memo`} props={props} multiline />
    </div>
  );
}

// certLayouts.tsx と相互に import するため、モジュール評価順に依存しないよう
// const ではなく関数宣言（巻き上げされる）で定義する。
function TsushoDecision2Layout(props: LayoutProps) {
  return <DecisionFace face={2} props={props} />;
}

function TsushoDecision3Layout(props: LayoutProps) {
  return <DecisionFace face={3} props={props} />;
}

/** 四面：障害児相談支援給付費の支給内容 */
function TsushoConsultationLayout(props: LayoutProps) {
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">{props.pageTitle}</div>
      <Row label="支給期間" field="supportPeriod" props={props} />
      <Row label="指定相談支援事業所名" field="planOfficeName" props={props} multiline />
      <Row label="モニタリング期間" field="monitoringPeriod" props={props} />
      <Row label="（予備欄）" field="consultationMemo" props={props} multiline />
    </div>
  );
}

/** 五面：利用者負担に関する事項 */
function TsushoBurdenLayout(props: LayoutProps) {
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">{props.pageTitle}</div>
      <Row label="負担上限月額" field="burdenLimitAmount" props={props} />
      <Row label="適用期間" field="burdenPeriod" props={props} />
      <Row label="食事提供加算対象者" field="mealProvisionStatus" props={props} />
      <Row label="適用期間" field="mealProvisionPeriod" props={props} />
      <Row label="利用者負担上限額管理対象者該当の有無" field="managementTargetStatus" props={props} />
      <Row label="利用者負担上限額管理事業所名" field="managementOfficeName" props={props} multiline />
      <Row label="特記事項欄" field="burdenSpecialNotes" props={props} multiline />
      <Row label="（予備欄）" field="burdenMemo" props={props} multiline />
    </div>
  );
}

/**
 * 六面・七面：障害児通所支援事業者記入欄。
 * 項目の読み取り（OCR）は未対応で、項目のキーもまだ定義していないため、入力欄は置かない。
 * 画像の保存だけを想定した案内を表示する。
 */
function TsushoProviderLayout(props: LayoutProps) {
  return (
    <div className="min-w-full border cert-table">
      <div className="border-b cert-title">{props.pageTitle}</div>
      <div className="cert-cell text-sm text-zinc-600">
        この面（事業者記入欄）は画像の保存のみに対応しています。記載内容の読み取りはまだ対応していません。
      </div>
    </div>
  );
}

export {
  TsushoBasicLayout,
  TsushoDecision2Layout,
  TsushoDecision3Layout,
  TsushoConsultationLayout,
  TsushoBurdenLayout,
  TsushoProviderLayout,
};
