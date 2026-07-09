import { onKeyActivate } from '../a11y.js';

interface Props<K extends string> {
  label: string;
  k: K;
  sort: K;
  dir: 1 | -1;
  onClick: (k: K) => void;
  title?: string;
}

/** 정렬 가능한 표 헤더 — Squad.tsx의 SortHeader와 Transfers.tsx의 MarketSortHeader가
 *  거의 동일한 코드로 중복 구현돼 있던 것을 제네릭 컴포넌트 하나로 통합. */
export function SortableTh<K extends string>({ label, k, sort, dir, onClick, title }: Props<K>) {
  return (
    <th
      className={sort === k ? 'sortable active' : 'sortable'}
      onClick={() => onClick(k)}
      title={title}
      role="button"
      tabIndex={0}
      onKeyDown={onKeyActivate(() => onClick(k))}
      aria-sort={sort === k ? (dir === 1 ? 'ascending' : 'descending') : 'none'}
    >
      {label} {sort === k ? (dir === 1 ? '▴' : '▾') : ''}
    </th>
  );
}
