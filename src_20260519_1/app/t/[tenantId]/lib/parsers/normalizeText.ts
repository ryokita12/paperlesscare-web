export function normalizeText(text: string): string {
  return text
    // 改行コード統一
    .replace(/\r/g, "")

    // OCRでブレやすい記号
    .replace(/[‐－―ー]/g, "-")
    .replace(/[：:]/g, " ")

    // 連続スペース整理
    .replace(/[ \t]+/g, " ")

    // 改行整理
    .replace(/\n{2,}/g, "\n")

    // OCR誤認識補正
    .replace(/障害福祉廿一/g, "障害福祉サービス")
    .replace(/受 給/g, "受給")
    .replace(/決 定/g, "決定")
    .replace(/居 住 地/g, "居住地")
    .replace(/等氏 名/g, "等氏名")
    .replace(/氏 名/g, "氏名")
    .replace(/生 年 月 日/g, "生年月日")
    .replace(/サ-ビス/g, "サービス")

    // 元号OCR補正
    .replace(/合和/g, "令和")
    .replace(/冷和/g, "令和")
    .replace(/伶和/g, "令和")

    // 数字間スペース除去
    .replace(/(\d)\s+(?=\d)/g, "$1")

    .trim();
}