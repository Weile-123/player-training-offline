import {useId,useRef,type ReactNode} from 'react';

type SlidingTabsProps = {
  labels: readonly [string, string] | readonly [string, string, string];
  label: string;
  index: number;
  onChange: (index: number) => void;
  children: ReactNode;
  disabledReasons?: Readonly<Record<number, string>>;
};

export function SlidingTabs({labels, label, index, onChange, children, disabledReasons}: SlidingTabsProps) {
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const enabledIndices = labels.map((_, i) => i).filter(i => !disabledReasons?.[i]);

  return <div className="collection-sections">
    <div className="leaderboard-tabs" data-index={index} data-tab-count={labels.length} role="tablist" aria-label={label}>
      {labels.map((name, i) => {
        const reason = disabledReasons?.[i];
        const descriptionId = reason ? `${id}-reason-${i}` : undefined;
        return <button key={name} ref={element => {buttons.current[i] = element;}} id={`${id}-tab-${i}`}
          data-tab-index={i} role="tab" aria-label={name} aria-describedby={descriptionId}
          aria-selected={index === i} aria-controls={`${id}-panel`} tabIndex={index === i ? 0 : -1}
          disabled={!!reason} onClick={() => onChange(i)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const position = enabledIndices.indexOf(i);
            const direction = event.key === 'ArrowLeft' ? -1 : 1;
            const next = event.key === 'Home' ? enabledIndices[0]
              : event.key === 'End' ? enabledIndices.at(-1)
              : enabledIndices[(position + direction + enabledIndices.length) % enabledIndices.length];
            if (next === undefined) return;
            onChange(next);
            buttons.current[next]?.focus();
          }}>
          {name}{reason && <small id={descriptionId}>{reason}</small>}
        </button>;
      })}
    </div>
    <section className="collection-tab-panel" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`}>{children}</section>
  </div>;
}
