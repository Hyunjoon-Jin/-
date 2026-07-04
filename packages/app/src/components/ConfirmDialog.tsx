import { useModalA11y } from './useModalA11y.js';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 되돌릴 수 없는 파괴적 동작이면 확인 버튼을 danger 스타일로. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 되돌릴 수 없는 동작(삭제·방출·판매 확정 등) 전에 공통으로 쓰는 확인 모달. */
export function ConfirmDialog({
  title, message, confirmLabel = '확인', cancelLabel = '취소', danger, onConfirm, onCancel,
}: Props) {
  const ref = useModalA11y<HTMLDivElement>(onCancel);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
        </div>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className={danger ? 'btn-small danger' : 'btn-advance'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
