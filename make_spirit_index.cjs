// Index chapter starts from the supplied editions' tables of contents/headings.
const fs = require('node:fs');
const root = 'docs/data/spirit/';
const pages = id => JSON.parse(fs.readFileSync(root + id + '.json', 'utf8')).pages;
function table(id, first, last, offset, expected) {
  const text = pages(id).slice(first - 1, last).flatMap(page => page.blocks).join(' ');
  const matches = [...text.matchAll(/CAP[IÍ]TULO\s+([IVXLCDM]+)\s*[—–-]\s*(.*?)\s*\.{2,}\s*(\d+)/gi)];
  if (matches.length !== expected) throw Error(`${id}: ${matches.length} headings, expected ${expected}`);
  let part = 0;
  return matches.map(m => {
    if (m[1] === 'I') part++;
    const title = m[2].replace(/\s+/g,' ').replace(/\bT EMOR\b/g,'TEMOR').replace(/\bE SPÍRITOS\b/g,'ESPÍRITOS').replace(/\bS UICIDAS\b/g,'SUICIDAS').trim();
    return { part, label: 'Capítulo ' + m[1] + ' · ' + title, page: Number(m[3]) + offset };
  });
}
function mediuns() {
  const out = []; let part = 0;
  for (const page of pages('mediuns')) for (let i=0; i<page.blocks.length; i++) {
    const b = page.blocks[i], title = page.blocks[i+1] || '';
    const match = b.match(/^CAPÍTULO\s+([IVXLCDM]+)$/);
    if (!match || title.length < 6 || title.length > 90 || title !== title.toLocaleUpperCase('pt-BR')) continue;
    if (match[1] === 'I') part++;
    out.push({part, label:'Capítulo ' + match[1] + ' · ' + title, page:page.n});
  }
  if (out.length !== 36) throw Error('Médiuns: unexpected heading count ' + out.length);
  return out;
}
const result = {
  espiritos:table('espiritos',7,12,0,29), mediuns:mediuns(),
  evangelho:table('evangelho',5,12,0,28), ceu:table('ceu',5,8,0,19),
  genese:table('genese',6,9,1,18),
};
for (const [id, items] of Object.entries(result)) {
  const count = pages(id).length;
  if (items.some((item,i) => item.page < 1 || item.page > count || (i && item.page <= items[i-1].page))) throw Error('Invalid page map for '+id);
}
fs.writeFileSync(root + 'chapters.json', JSON.stringify(result));
console.log(Object.fromEntries(Object.entries(result).map(([id,items])=>[id,items.length])));
