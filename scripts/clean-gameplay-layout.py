"""Remove superseded first-pass layouts instead of stacking more overrides."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'src/gameplay.css'
text=p.read_text(encoding='utf-8-sig')
lines=[]
for line in text.splitlines():
    if line.startswith('.game-dock{display:grid;grid-template-rows:32%'):
        lines.append(line[line.index('.save-warning'):])
    elif line.startswith('.game-player{display:grid;'):
        lines.append(line[:line.index('.player-paper')])
    elif line.startswith('.player-rating{'):
        continue
    elif line.startswith('.player-six-stats{'):
        lines.append(line[line.index('.player-shortcuts'):])
    elif line.startswith('.game-dock{display:grid;place-items:center;'):
        lines.append('.game-dock{display:flex;align-items:center;justify-content:center;padding:0;min-height:0;position:relative;overflow:hidden;isolation:isolate;grid-row:6}')
    else:lines.append(line)
p.write_text('\n'.join(lines)+'\n',encoding='utf-8')
