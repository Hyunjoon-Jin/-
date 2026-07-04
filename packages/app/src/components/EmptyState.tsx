import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  hint?: string;
}

/** 화면에 아직 데이터가 없을 때(시즌 시작 전 등) 쓰는 공용 빈 상태 — 화면 좌상단에
 *  덩그러니 문장 하나만 있던 것을 아이콘과 함께 중앙에 배치한다. */
export function EmptyState({ icon: Icon, title, hint }: Props) {
  return (
    <div className="empty-state">
      <Icon className="empty-state-icon" size={40} strokeWidth={1.5} />
      <p className="empty-state-title">{title}</p>
      {hint && <p className="empty-state-hint muted small">{hint}</p>}
    </div>
  );
}
