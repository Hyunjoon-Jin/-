import type { ReactNode } from 'react';

/**
 * 시즌·라운드 진행처럼 화면이 잠깐(수백 ms~1초) 멈추는 무거운 액션 전용 버튼(UX 고도화).
 * 이 버튼이 처리 중이면 스피너+레이블로 바뀌고, 다른 무거운 액션이 처리 중이면
 * 중복 클릭을 막기 위해 비활성화만 된다(스피너는 실제로 눌린 버튼에만 표시).
 */
export function BusyButton({
  className, actionKey, busyAction, onClick, busyLabel, children,
}: {
  className: string;
  actionKey: string;
  busyAction: string | null;
  onClick: () => void;
  busyLabel: string;
  children: ReactNode;
}) {
  const isBusy = busyAction === actionKey;
  return (
    <button className={className} onClick={onClick} disabled={busyAction !== null}>
      {isBusy ? (
        <>
          <span className="spinner" aria-hidden="true" /> {busyLabel}
        </>
      ) : children}
    </button>
  );
}
