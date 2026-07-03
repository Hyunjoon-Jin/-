/** 평점(0~10) → 등급 CSS 클래스. 경기 상세·시즌 통계 화면에서 공유해
 *  같은 점수가 화면마다 다른 등급으로 보이지 않도록 한다. */
export function ratingClass(r: number): 'cond-good' | 'cond-mid' | '' {
  if (r >= 7.2) return 'cond-good';
  if (r >= 6.5) return 'cond-mid';
  return '';
}
