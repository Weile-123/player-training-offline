import {createPortal} from 'react-dom';
import {useId, useLayoutEffect, useRef, useState, type CSSProperties} from 'react';
import type {GymTutorialGuide} from '../presentation/gymTutorial';
import './Onboarding.css';
import './GymTutorial.css';

type Frame = {left: number; top: number; width: number; height: number; screenWidth: number; screenHeight: number};

/** The original tutorial's spotlight treatment, with actual gym controls as targets. */
export function GymTutorialSpotlight({guide, step, onNext, onSkip, skippable = true}: {guide: GymTutorialGuide; step: string; onNext: () => void; onSkip?: () => void; skippable?: boolean}) {
 const id = useId(), instructionId = `${id}-instruction`, tip = useRef<HTMLElement>(null);
 const [frame, setFrame] = useState<Frame | null>(null), [actionFrame, setActionFrame] = useState<Frame | null>(null), [tipHeight, setTipHeight] = useState(170), [confirmSkip, setConfirmSkip] = useState(false);
 useLayoutEffect(() => {
  let target: HTMLElement | null = null, actionTarget: HTMLElement | null = null, raf = 0, focused = false;
  setFrame(null); setActionFrame(null);
  const targetControls = () => actionTarget ? actionTarget.matches('button,a,input,select,[tabindex="0"]') ? [actionTarget] : Array.from(actionTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')) : [];
  const first = () => confirmSkip ? tip.current?.querySelector<HTMLElement>('.tutorial-cancel-skip') : guide.action && actionTarget ? targetControls()[0] ?? actionTarget : tip.current?.querySelector<HTMLElement>('button') ?? tip.current;
  const measure = (element: HTMLElement): Frame => {
   const bounds = element.getBoundingClientRect(), pad = 6;
   const left = Math.max(0, bounds.left - pad), top = Math.max(0, bounds.top - pad), right = Math.min(innerWidth, bounds.right + pad), bottom = Math.min(innerHeight, bounds.bottom + pad);
   return {left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top), screenWidth: innerWidth, screenHeight: innerHeight};
  };
  const sameFrame = (previous: Frame | null, next: Frame) => previous && Object.keys(next).every(key => Math.abs(previous[key as keyof Frame] - next[key as keyof Frame]) < .5) ? previous : next;
  const update = () => {
   const found = document.querySelector<HTMLElement>(guide.selector);
   if (found !== target) {target?.removeAttribute('aria-describedby'); target = found; focused = false; target?.setAttribute('aria-describedby', instructionId);}
   const actionable = guide.actionSelector ? document.querySelector<HTMLElement>(guide.actionSelector) : target;
   if (actionable !== actionTarget) {if (actionTarget !== target) actionTarget?.removeAttribute('aria-describedby'); actionTarget = actionable; focused = false; actionTarget?.setAttribute('aria-describedby', instructionId);}
   if (target) {
    const original = target.getBoundingClientRect();
    if (original.height < innerHeight && (original.top < 0 || original.bottom > innerHeight)) target.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
    setFrame(previous => sameFrame(previous, measure(target!)));
    if (guide.actionSelector && actionTarget) setActionFrame(previous => sameFrame(previous, measure(actionTarget!)));
    if (!focused) {focused = true; first()?.focus({preventScroll: true});}
   }
   if (tip.current) setTipHeight(height => height === tip.current!.offsetHeight ? height : tip.current!.offsetHeight);
   raf = requestAnimationFrame(update);
  };
  const allowed = (node: EventTarget | null) => node instanceof Node && (tip.current?.contains(node) || !confirmSkip && guide.action && actionTarget?.contains(node));
  const guard = (event: Event) => {if (!allowed(event.target)) {event.preventDefault(); event.stopImmediatePropagation();}};
  const guardPointer = (event: Event) => {if (!confirmSkip && event.target instanceof Node && target?.contains(event.target)) return; guard(event);};
  const keyboard = (event: KeyboardEvent) => {
   if (event.key === 'Tab') {
    const controls = [...(!confirmSkip && guide.action ? targetControls() : []), ...Array.from(tip.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
    if (!controls.length) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const index = controls.indexOf(document.activeElement as HTMLElement);
    controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus({preventScroll: true});
   } else if (event.key === 'Escape') {event.preventDefault(); event.stopImmediatePropagation(); if (confirmSkip) setConfirmSkip(false); else first()?.focus({preventScroll: true});}
   else if ((event.key === 'Enter' || event.key === ' ') && !allowed(event.target)) guard(event);
  };
  const focus = (event: FocusEvent) => {if (target && !allowed(event.target)) first()?.focus({preventScroll: true});};
  document.addEventListener('click', guard, true); document.addEventListener('pointerdown', guardPointer, true);
  document.addEventListener('keydown', keyboard, true); document.addEventListener('focusin', focus, true);
  update();
  return () => {cancelAnimationFrame(raf); target?.removeAttribute('aria-describedby'); actionTarget?.removeAttribute('aria-describedby'); document.removeEventListener('click', guard, true); document.removeEventListener('pointerdown', guardPointer, true); document.removeEventListener('keydown', keyboard, true); document.removeEventListener('focusin', focus, true);};
 }, [guide.selector, guide.actionSelector, guide.action, step, confirmSkip, instructionId]);

 const screenWidth = frame?.screenWidth ?? innerWidth, screenHeight = frame?.screenHeight ?? innerHeight;
 const width = Math.min(350, screenWidth - 24), clampX = (left: number) => Math.max(12, Math.min(screenWidth - width - 12, left));
 const clampY = (top: number) => Math.max(12, Math.min(screenHeight - tipHeight - 12, top));
 let left = clampX((screenWidth - width) / 2), top = clampY((screenHeight - tipHeight) / 2), side = 'floating', maxHeight = screenHeight - 24;
 if (frame && !confirmSkip) {
  const x = clampX(frame.left + frame.width / 2 - width / 2), below = screenHeight - frame.top - frame.height - 30, above = frame.top - 30;
  if (below >= tipHeight) {left = x; top = frame.top + frame.height + 18; side = 'below'; maxHeight = below;}
  else if (above >= tipHeight) {left = x; top = frame.top - tipHeight - 18; side = 'above'; maxHeight = above;}
  else if (Math.max(below, above) >= 150) {
   left = x; side = below >= above ? 'below' : 'above'; maxHeight = Math.max(below, above); top = side === 'below' ? frame.top + frame.height + 18 : frame.top - Math.min(tipHeight, maxHeight) - 18;
  }
 }
 if (confirmSkip) {left = clampX((screenWidth - width) / 2); top = clampY((screenHeight - tipHeight) / 2);}
 return createPortal(<div className="tutorial-spotlight gym-tutorial-spotlight" data-step={step}>
  {frame && !confirmSkip ? <><svg className="tutorial-mask" width="100%" height="100%" aria-hidden="true"><defs><mask id={id}><rect width="100%" height="100%" fill="white"/><rect x={frame.left} y={frame.top} width={frame.width} height={frame.height} rx={10} fill="black"/>{actionFrame && <rect x={actionFrame.left} y={actionFrame.top} width={actionFrame.width} height={actionFrame.height} rx={10} fill="black"/>}</mask></defs><rect className="tutorial-mask-shade" width="100%" height="100%" mask={`url(#${id})`}/></svg><div className="tutorial-spotlight-ring" style={{left: frame.left, top: frame.top, width: frame.width, height: frame.height, borderRadius: 10}}/>{actionFrame && <div className="tutorial-spotlight-ring tutorial-action-ring" style={{left: actionFrame.left, top: actionFrame.top, width: actionFrame.width, height: actionFrame.height, borderRadius: 10}}/>}</> : <div className="tutorial-mask-pending"/>}
  <aside ref={tip} className={`tutorial-instruction is-${confirmSkip ? 'floating' : side}`} id={instructionId} role={confirmSkip ? 'alertdialog' : 'status'} aria-modal={confirmSkip || undefined} aria-labelledby={confirmSkip ? `${id}-skip-title` : undefined} tabIndex={-1} style={{left, top, width, maxHeight, '--tutorial-arrow-x': `${Math.max(22, Math.min(width - 22, (frame?.left ?? 0) + (frame?.width ?? 0) / 2 - left))}px`} as CSSProperties}>
   {confirmSkip ? <><div className="tutorial-instruction-content"><small>开馆练习</small><strong id={`${id}-skip-title`}>跳过这次练习？</strong><p>跳过练习后，可以在<strong>设置</strong>中重新进行引导练习</p></div><div className="tutorial-confirm-actions"><button type="button" className="tutorial-cancel-skip" onClick={() => setConfirmSkip(false)}>继续练习</button><button type="button" className="tutorial-confirm-skip" onClick={onSkip}>确认跳过</button></div></> : <>
    <div className="tutorial-instruction-content"><small>{guide.label ?? '开馆练习'} <b>{guide.chapter}</b></small><strong>{guide.title}</strong><p>{guide.description}</p></div>
    {guide.next && <button type="button" className="tutorial-next" onClick={onNext}>{guide.next}<span aria-hidden="true">›</span></button>}
    {skippable && onSkip && <button type="button" className="tutorial-skip" onClick={() => setConfirmSkip(true)}>跳过引导</button>}
   </>}
  </aside>
 </div>, document.body);
}
