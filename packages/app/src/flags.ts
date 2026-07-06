/** engine의 국적 코드에 대응하는 국기 이모지(초기 10개국 + 아카데미 유스풀 확장 10개국).
 *  텍스트 코드만으로는 스캔이 느려, 표에서 국적을 한눈에 구분하도록 돕는다. */
const NATION_FLAG: Record<string, string> = {
  KOR: '🇰🇷', JPN: '🇯🇵', BRA: '🇧🇷', ITA: '🇮🇹', GER: '🇩🇪',
  ESP: '🇪🇸', FRA: '🇫🇷', ENG: '🇬🇧', NED: '🇳🇱', ARG: '🇦🇷',
  POR: '🇵🇹', URU: '🇺🇾', COL: '🇨🇴', BEL: '🇧🇪', DEN: '🇩🇰',
  CRO: '🇭🇷', USA: '🇺🇸', MEX: '🇲🇽', NGA: '🇳🇬', SEN: '🇸🇳',
};

export function flagFor(nationality: string): string {
  return NATION_FLAG[nationality] ?? '';
}
