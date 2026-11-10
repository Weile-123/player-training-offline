type IconName = 'ball' | 'folder' | 'collection' | 'trophy' | 'feedback' | 'arrow';

/** Independent vector icons; labels and button surfaces are separate DOM elements. */
export function HomeIcon({ name }: { name: IconName }) {
 const paths: Record<IconName, React.ReactNode> = {
  ball: <><circle cx="24" cy="24" r="20"/><path d="M4 24h40M24 4v40M10 10c18 7 22 21 28 28M38 10C20 17 16 31 10 38"/></>,
  folder: <path d="M4 38V12h15l5 6h19l-5 22H4l5-19h32"/>,
  collection: <><path d="M9 10 4 12l6 32 26-5M15 5l-6 2 5 33 27-4"/><rect x="17" y="4" width="26" height="32" rx="2"/><circle cx="30" cy="15" r="5"/><path d="M22 30v-3a8 8 0 0 1 16 0v3Z"/></>,
  trophy: <><path d="M14 5h20v12c0 10-5 14-10 14s-10-4-10-14ZM14 10H5v5c0 8 6 11 13 11M34 10h9v5c0 8-6 11-13 11M24 31v10M15 43h18"/></>,
  feedback: <><path d="M7 5h34a3 3 0 0 1 3 3v24a3 3 0 0 1-3 3H22L10 44V35H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"/><circle cx="14" cy="20" r="1.5"/><circle cx="24" cy="20" r="1.5"/><circle cx="34" cy="20" r="1.5"/></>,
  arrow: <path d="m18 9 15 15-15 15M6 24h27"/>,
 };
 return <svg className={`home-icon icon-${name}`} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
