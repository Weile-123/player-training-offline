// Game-specific DOM factory. The HTML parser creates the fixed SVG prototypes
// in index.html. Rendering clones those elements, never parses user markup.
export function gameNamespace(parent) {
 if (!parent) return 0;
 if (!parent.localName && parent.parentNode) return gameNamespace(parent.parentNode);
 if (parent.localName === 'foreignObject') return 0;
 return parent.ownerSVGElement || parent.localName === 'svg' ? 1 : 0;
}
const prototypes = new WeakMap();
export function createGameElement(kind, tag, options) {
 if (kind === 0) return document.createElement(tag, options);
 if (kind !== 1) throw Error('This game renderer supports HTML and SVG only.');
 const seed = document.getElementById('game-svg-prototypes');
 let bank = seed && prototypes.get(seed);
 if (seed && !bank) {
  bank = new Map([...seed.content.querySelectorAll('*')].map(node=>[node.localName,node]));
  prototypes.set(seed,bank);
 }
 const prototype = bank && bank.get(tag);
 if (!prototype) throw Error('Missing SVG prototype: '+tag);
 return prototype.cloneNode(false);
}
