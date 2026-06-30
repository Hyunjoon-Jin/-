/**
 * 화폐 단위 & 표시 (economy.md 1장).
 * 내부 저장 단위는 '만원' (1 = ₩10,000), 정수.
 */

export const EOK = 10_000; // 1억 = 10,000만원

/** 만원 단위 금액을 한국식 '억/만원' 문자열로. */
export function formatMoney(manwon: number): string {
  const sign = manwon < 0 ? '-' : '';
  const abs = Math.abs(Math.round(manwon));
  const eok = Math.floor(abs / EOK);
  const man = abs % EOK;
  if (eok > 0 && man > 0) return `${sign}${eok}억 ${man.toLocaleString()}만원`;
  if (eok > 0) return `${sign}${eok}억원`;
  return `${sign}${man.toLocaleString()}만원`;
}
