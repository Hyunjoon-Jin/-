/** engine의 NATIONS 목록(KOR/JPN/BRA/ITA/GER/ESP/FRA/ENG/NED/ARG)에 대응하는 국기 이모지.
 *  텍스트 코드만으로는 스캔이 느려, 표에서 국적을 한눈에 구분하도록 돕는다. */
const NATION_FLAG: Record<string, string> = {
  KOR: '🇰🇷', JPN: '🇯🇵', BRA: '🇧🇷', ITA: '🇮🇹', GER: '🇩🇪',
  ESP: '🇪🇸', FRA: '🇫🇷', ENG: '🇬🇧', NED: '🇳🇱', ARG: '🇦🇷',
};

export function flagFor(nationality: string): string {
  return NATION_FLAG[nationality] ?? '';
}
