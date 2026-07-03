import type { ReactNode } from 'react';

export type BannerTone = 'success' | 'danger' | 'warning' | 'gold' | 'info' | 'special';

interface Props {
  tone: BannerTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** 공용 알림 카드 — 은퇴/마일스톤/유스/기대주소식/이변/페이스체크/라이벌/감독이미지/
 *  계약제안이 각자 거의 동일한 그라디언트 카드를 복붙해 쓰던 것을 하나로 통합. */
export function Banner({ tone, title, children, className }: Props) {
  return (
    <div className={`banner banner-${tone}${className ? ` ${className}` : ''}`}>
      {title && <div className="banner-title">{title}</div>}
      <div className="banner-body">{children}</div>
    </div>
  );
}
