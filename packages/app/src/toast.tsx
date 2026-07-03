import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastItem { id: number; text: string; ok: boolean; }
type ShowToast = (text: string, ok: boolean) => void;

const ToastContext = createContext<ShowToast | null>(null);

const TOAST_DURATION_MS = 4000;

/** 공용 토스트 스택 — Transfers/Staff/PlayerDetail/StartScreen이 각자 지역 msg
 *  state로 만들던 것을 하나로 통합. 화면 우하단에 떠서 일정 시간 후 자동으로
 *  사라진다(예전엔 다음 행동이 있을 때까지 인라인에 남아있었음). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback<ShowToast>((text, ok) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, text, ok }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item ${t.ok ? 'ok' : 'err'}`}>{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** 화면 어디서든 toast(text, ok)를 호출해 우하단에 알림을 띄운다. */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast는 ToastProvider 하위에서만 사용할 수 있습니다.');
  return show;
}

/** ActionOutcome/{text,ok} 형태의 결과를 그대로 토스트로 띄우는 편의 헬퍼. */
export function useResultToast(): (result: { message: string; ok: boolean }) => void {
  const show = useToast();
  return useCallback((result: { message: string; ok: boolean }) => show(result.message, result.ok), [show]);
}
