/**
 * 구단 킷 색상(고도화 항목 C1-C3) — 실제 구단 데이터에 색상 필드가 없으므로,
 * 구단 id를 해시해 저장 없이도 매 경기 동일한 색상을 안정적으로 재현한다.
 */
function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

export interface KitColors {
  home: string;
  away: string;
  homeGk: string;
  awayGk: string;
}

/**
 * 홈/원정 킷 색상을 계산한다. 두 팀 색상(색조)이 너무 가까우면(킷 충돌, 항목 C3)
 * 원정 팀 색조를 회전시켜 자동으로 구분되게 한다. 골키퍼는 같은 팀이라도
 * 눈에 띄게 다른 색조를 쓴다(항목 C2).
 */
export function resolveKitColors(homeClubId: string, awayClubId: string): KitColors {
  const homeHue = hashHue(homeClubId);
  let awayHue = hashHue(awayClubId);
  if (hueDistance(homeHue, awayHue) < 40) awayHue = (awayHue + 150) % 360;
  return {
    home: `hsl(${homeHue}, 62%, 48%)`,
    away: `hsl(${awayHue}, 62%, 48%)`,
    homeGk: `hsl(${(homeHue + 150) % 360}, 70%, 65%)`,
    awayGk: `hsl(${(awayHue + 150) % 360}, 70%, 65%)`,
  };
}
