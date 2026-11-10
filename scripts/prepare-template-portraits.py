"""Resolve NBA identities by exact normalized name; download local headshots.
The upstream Python data is parsed as literals, never executed.
"""
import ast, json, re, unicodedata, urllib.request, concurrent.futures
from pathlib import Path

root=Path(__file__).resolve().parents[1]
out=root/'public/art/game/portraits'
out.mkdir(parents=True,exist_ok=True)
data_url='https://raw.githubusercontent.com/swar/nba_api/master/src/nba_api/stats/library/data.py'
text=urllib.request.urlopen(data_url,timeout=30).read().decode('utf-8')
tree=ast.parse(text)
rows=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='players' for t in n.targets))
normalize=lambda s: re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
by_name={normalize(row[3]):row for row in rows}
base=(root/'src/game/templates.ts').read_text(encoding='utf-8-sig')
extra=(root/'src/game/extraTemplates.ts').read_text(encoding='utf-8-sig')
entries=re.findall(r"id: '([^']+)'.*?englishName: ([\"'])(.*?)\2",base)
entries=[(id,name) for id,_,name in entries]
entries += [(m[0],m[1] or m[2]) for m in re.findall(r"\['([^']+)','[^']+',(?:'([^']+)'|\"([^\"]+)\")",extra)]
aliases={'Jimmy Butler':'Jimmy Butler III','PJ Tucker':'P.J. Tucker','Ron Artest':'Metta World Peace'}
mapping={};missing=[]
for id,name in entries:
    row=by_name.get(normalize(aliases.get(name,name)))
    if not row:
        missing.append((id,name))
        continue
    mapping[id]={'nbaId':row[0],'name':row[3],'source':f'https://cdn.nba.com/headshots/nba/latest/260x190/{row[0]}.png'}
manifest=out/'manifest.json'
for id,espn_id in [('battier',976),('shawn-marion',510)]:
    mapping[id]['source']=f'https://a.espncdn.com/i/headshots/nba/players/full/{espn_id}.png'
manifest.write_text(json.dumps(mapping,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Resolved:',len(mapping),'Missing:',missing,flush=True)
if missing:raise SystemExit('Resolve ambiguous names before downloading.')

def download(item):
    id,entry=item
    path=out/(id+'.png')
    if path.exists() and path.read_bytes().startswith(b'\x89PNG') and id not in ('battier','shawn-marion'):return None
    try:
        request=urllib.request.Request(entry['source'],headers={'User-Agent':'Mozilla/5.0'})
        content=urllib.request.urlopen(request,timeout=25).read()
        if not content.startswith(b'\x89PNG'):raise ValueError('Not PNG')
        path.write_bytes(content)
    except Exception as error:return (id,str(error))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    failures=[result for result in pool.map(download,mapping.items()) if result]
print('Downloaded:',len(mapping)-len(failures),'Failures:',failures,flush=True)
if failures:raise SystemExit(1)
