/** One silhouette and one viewport for both full and empty credit hearts. */
export function CreditHearts({credit,total=3}:{credit:number;total?:number}) {
 const value=Math.max(0,Math.min(total,credit));
 return <span className="credit-hearts" role="img" aria-label={`信用 ${value} 点`}>{Array.from({length:total},(_,i)=><svg key={i} viewBox="0 0 36 36" className={i<value?'heart filled':'heart'} aria-hidden="true"><path className="heart-shadow" d="M18 33 4 19 2 12 5 5 13 3 18 8 23 3 31 5 34 12 32 19Z"/><path className="heart-body" d="M17 30 4 17 3 10 6 4 12 3 17 8 22 3 29 4 32 10 31 17Z"/>{i<value&&<><path className="heart-shade" d="m17 30 14-13 1-7-6 9Z"/><path className="heart-shine" d="m7 12 1-4 4-1"/></>}</svg>)}</span>;
}
