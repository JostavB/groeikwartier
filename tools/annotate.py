# Eenmalig: maakt van de ontwerp-HTML een sjabloon met bewerkbare velden.
import re,sys
p='src/template.html'; s=open(p,encoding='utf-8').read()
def rep(old,new,count=1):
    global s
    n=s.count(old)
    if n<count: sys.exit(f'niet gevonden ({n}x): {old[:80]}')
    s=s.replace(old,new,count)
# fonts als variabelen
s=s.replace("font-family: 'Cormorant Garamond', serif","font-family: var(--font-kop)")
rep("""<div class="m-page" style="font-family: 'Avenir Next', 'Avenir', 'Nunito Sans', sans-serif;""","""<div class="m-page" style="font-family: var(--font-tekst);""")
rep("html,body{margin:0;background:#F2F2EE;color:#2B3638}",":root{--font-kop:'Cormorant Garamond', serif;--font-tekst:'Avenir Next','Avenir','Nunito Sans',sans-serif}\nhtml,body{margin:0;background:#F2F2EE;color:#2B3638}\n[data-k]{--fs:1}")
rep(".b-intro{margin:0;max-width:30em;font-size:1.08rem;",".b-intro{margin:0;max-width:30em;font-size:calc(1.08rem * var(--fs,1));")
rep(".b-intro{font-size:1.15rem}",".b-intro{font-size:calc(1.15rem * var(--fs,1))}")
# afbeeldingen
rep('<img class="b-logo" src="logo-grijs.png"','<img class="b-logo" data-img="logo" src="/logo-grijs.png"')
rep('<img src="wordmark-licht.png" alt="Het Groeikwartier" style="display: block; height: 28px;','<img data-img="woordmerk" src="/wordmark-licht.png" alt="Het Groeikwartier" style="display: block; height: calc(28px * var(--fs,1));')
rep('<div style="aspect-ratio: 4 / 5; background: #4C5F60;','<div data-img="foto-avond" data-ph style="background-size: cover; background-position: center; aspect-ratio: 4 / 5; background: #4C5F60;')
rep('<div class="m-photo">[Foto]</div>','<div class="m-photo" data-img="foto-josta" data-ph style="background-size: cover; background-position: center">[Foto]</div>')
rep('<div class="m-photo">[Foto]</div>','<div class="m-photo" data-img="foto-eva" data-ph style="background-size: cover; background-position: center">[Foto]</div>')
# links
rep('<a href="[WEBSITE CENTRUM]"','<a data-l="link-centrum" href="[WEBSITE CENTRUM]"')
rep('<a href="[WEBSITE STUDIO BINNENWERELD]"','<a data-l="link-studio" href="[WEBSITE STUDIO BINNENWERELD]"')
rep('<a href="mailto:[EMAIL]" style="font-size: 0.95rem; overflow-wrap: anywhere">[EMAIL]</a>','<a data-l="link-mail" data-k="contact-mail" href="mailto:hetgroeikwartier@gmail.com" style="font-size: 0.95rem; overflow-wrap: anywhere">hetgroeikwartier@gmail.com</a>')
rep('<a href="[INSTAGRAM-LINK]" style="font-size: 0.95rem">@[INSTAGRAM]</a>','<a data-l="link-instagram" data-k="contact-instagram" href="[INSTAGRAM-LINK]" style="font-size: 0.95rem">@[INSTAGRAM]</a>')
rep('<a href="#contact" style="display: inline-block; background: #ACB3AC;','<a data-k="avond-knop" href="#contact" style="display: inline-block; background: #ACB3AC;')
# agenda-kaarten -> door de server gevuld
i=s.index('<div class="m-cards">'); j=s.index('</section>',i)
k=s.rindex('</div>',i,j); k=s.rindex('</div>',i,k)  # sluit m-cards
s=s[:i]+'<div class="m-cards" data-agenda></div>\n    '+s[k+len('</div>'):]
# tekstvelden: tags met tekst krijgen data-k op volgorde
keys=iter("""hero-intro
kennis-label kennis-titel kennis-tekst kennis-tijd
avond-titel avond-tekst
agenda-titel agenda-sub
over-titel over-tekst-1 over-tekst-2
wij-titel
josta-naam josta-rol josta-tekst-1 josta-tekst-2 josta-tekst-3 josta-tekst-4 josta-tekst-5
eva-naam eva-rol eva-tekst-1 eva-tekst-2
contact-titel contact-tekst contact-label contact-knop contact-kop-mail contact-kop-insta contact-kop-waar contact-waar
footer-tekst""".split())
def tag(m):
    return m.group(0)
out=[];pos=0
pat=re.compile(r'<(p|h2|h3|label|span|button)(\s[^>]*)?>(?!\s*<)',re.S)
body_start=s.index('<section id="top"')
for m in pat.finditer(s,body_start):
    t=m.group(1); attrs=m.group(2) or ''
    if 'data-k=' in attrs or 'm-toggle' in attrs: continue
    if t=='span' and 'letter-spacing: 0.2em' not in attrs: continue   # alleen footer-tekst
    if t=='button' and 'type="submit"' not in attrs: continue
    key=next(keys)
    if 'font-size:' in attrs:
        attrs=re.sub(r'font-size:\s*([^;"]+)',lambda mm:f'font-size: calc({mm.group(1).strip()} * var(--fs,1))',attrs,count=1)
    elif 'class="b-intro"' not in attrs:
        if 'style="' in attrs: attrs=attrs.replace('style="','style="font-size: calc(1em * var(--fs,1)); ',1)
        else: attrs+=' style="font-size: calc(1em * var(--fs,1))"'
    out.append(s[pos:m.start()]); out.append(f'<{t} data-k="{key}"{attrs}>'); pos=m.end()
out.append(s[pos:]); s=''.join(out)
left=list(keys)
if left: sys.exit(f'sleutels over: {left}')
# overige bewerkbare a-teksten met font-size
s=s.replace('data-k="avond-knop" href="#contact" style="display: inline-block;','data-k="avond-knop" href="#contact" style="display: inline-block;')
s=re.sub(r'(<a data-[lk][^>]*?style="[^"]*?)font-size: ([^;"]+)',lambda m:m.group(1)+f'font-size: calc({m.group(2)} * var(--fs,1))',s)
# meer-tekst in admin altijd zichtbaar via CSS-klasse; Josta/Eva hidden blijft
open(p,'w',encoding='utf-8').write(s)
print('ok')
