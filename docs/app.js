'use strict';

const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const norm = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const bpmSource = 'https://ebible.org/details.php?id=porbrbsl';
const ethiopicDataRevision = '?v=2';
const catalogs = { bpm: [], ethiopic: [], tora: [] };
const torahBooks = { GEN: ['Bereshit', 'בראשית', 'Genesis'], EXO: ['Shemot', 'שמות', 'Exodus'], LEV: ['Vayikrá', 'ויקרא', 'Leviticus'], NUM: ['Bamidbar', 'במדבר', 'Numbers'], DEU: ['Devarim', 'דברים', 'Deuteronomy'] };
const defaults = { bpm: ['JHN', 1, '1'], ethiopic: ['ENO', 1, '1'], tora: ['GEN', 1, '1'] };
const spiritBooks = {
  espiritos: { title: 'O Livro dos Espíritos', file: 'O-livro-dos-espiritos.pdf' },
  mediuns: { title: 'O Livro dos Médiuns', file: 'O-livro-dos-mediuns.pdf' },
  evangelho: { title: 'O Evangelho segundo o Espiritismo', file: 'O-Evangelho-segundo-o-Espiritismo.pdf' },
  ceu: { title: 'O Céu e o Inferno', file: 'O-ceu-e-inferno.pdf' },
  genese: { title: 'A Gênese', file: 'A-Genese-Allan-Kardec.pdf' },
};
const lastReference = {};
const cache = {};
let studies = [], introductions = {}, searchData, ethiopicSearchData, enochSearchData, jubileeSearchData;
let spiritData, spiritKey, spiritPage;
let current, chapterData = {}, activeBible = 'bpm', loadId = 0, searchId = 0;
let ethiopicFilter = 'texts';

function pref(key, value) {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    else return localStorage.getItem(key);
  } catch {}
}

let font = Number(pref('bible-font')) || 21;
document.documentElement.style.setProperty('--reading', font + 'px');
document.body.classList.toggle('dark', pref('bible-dark') === 'true');

function themeLabel() {
  const dark = document.body.classList.contains('dark');
  $('theme').textContent = dark ? 'Modo claro' : 'Modo escuro';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#211d19' : '#e5ddd0';
}
themeLabel();

$('theme').onclick = () => {
  document.body.classList.toggle('dark');
  pref('bible-dark', String(document.body.classList.contains('dark')));
  themeLabel();
};
for (const [id, delta] of [['smaller', -2], ['larger', 2]]) {
  $(id).onclick = () => {
    font = Math.max(17, Math.min(33, font + delta));
    document.documentElement.style.setProperty('--reading', font + 'px');
    pref('bible-font', font);
  };
}
$('about-open').onclick = () => $('about').showModal();
$('about-close').onclick = () => $('about').close();

let noticeTimer;
function notice(message) {
  $('notice').textContent = message;
  $('notice').style.display = 'block';
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => $('notice').style.display = 'none', 4500);
}
$('share').onclick = async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    notice('Link copiado. O acesso segue as permissões do site.');
  } catch {
    notice('Copie o endereço desta página na barra do navegador.');
  }
};

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error('Não foi possível carregar os dados.');
  return response.json();
}

function linkFor(bible, id, chapter = 1, verse = 1) {
  return '#' + (bible === 'ethiopic' ? 'etiope/' : bible === 'tora' ? 'tora/' : '') + [id, chapter, verse].join('/');
}

function findBook(id, bible = activeBible) {
  return catalogs[bible].find(book => book.id === id);
}

function allowed(book) {
  if (!book) return false;
  if (activeBible === 'ethiopic') return ethiopicFilter === 'all' || book.source === 'ethiopic';
  if (activeBible === 'tora') return true;
  return $('canon').value !== 'protestant' || book.group !== 'aa';
}

function enochInPortuguese() {
  return $('enoch-language').value !== 'gez';
}

function bookNames(book) {
  return [book.name, ...(book.aliases || [])].map(norm);
}

function listBooks() {
  const query = norm($('book-filter').value);
  const labels = {
    torah: 'Os cinco livros',
    featured: 'Enoque, Jubileus e Meqabyan',
    oo: 'Antigo Testamento', aa: 'Deuterocanônicos e textos gregos', nn: 'Novo Testamento',
    broader: 'Novo Testamento · cânon mais amplo',
  };
  $('books').innerHTML = Object.entries(labels).map(([group, label]) => {
    const matching = catalogs[activeBible].filter(book =>
      (ethiopicCollection.has(book.id) ? 'featured' : book.group) === group
      && allowed(book) && bookNames(book).some(name => name.includes(query))
    );
    if (!matching.length) return '';
    return '<h3>' + label + '</h3>' + matching.map(book => {
      const active = book.id === current?.id;
      const chapter = book.chapters?.includes(1) ? 1 : book.chapters?.[0];
      const badge = ['bpm', 'tora'].includes(activeBible) ? book.chapters.length
        : ['ENO', 'JUB', 'JUD'].includes(book.id) ? 'PT / ge’ez'
        : book.source === 'ethiopic' ? 'ge’ez' : book.chapters?.length ? 'BPM' : 'Ficha';
      return `<a href="${linkFor(activeBible, book.id, chapter)}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>${esc(book.name)}<span>${badge}</span></a>`;
    }).join('');
  }).join('') || '<p class="small">Nenhum livro encontrado.</p>';
}
$('book-filter').oninput = listBooks;
$('canon').onchange = () => {
  if (current && !allowed(current)) location.hash = linkFor('bpm', 'GEN');
  listBooks();
};
$('ethiopic-filter').onchange = () => {
  ethiopicFilter = $('ethiopic-filter').value;
  ++searchId;
  $('results').hidden = true;
  if (!allowed(current)) location.hash = linkFor('ethiopic', ...defaults.ethiopic);
  else listBooks();
};
$('enoch-language').value = pref('bible-enoch-language') === 'gez' ? 'gez' : 'pt';
$('enoch-language').onchange = () => {
  pref('bible-enoch-language', $('enoch-language').value);
  ++searchId;
  $('results').hidden = true;
  route(true);
};
for (const bible of ['bpm', 'ethiopic']) {
  $('bible-' + bible).onclick = () => {
    if (activeBible !== bible) location.hash = linkFor(bible, ...(lastReference[bible] || defaults[bible]));
  };
}

function showBibleControls() {
  const ethiopic = activeBible === 'ethiopic';
  const torah = activeBible === 'tora';
  $('bible-bpm').setAttribute('aria-pressed', String(!ethiopic));
  $('bible-ethiopic').setAttribute('aria-pressed', String(ethiopic));
  $('canon-label').hidden = ethiopic || torah;
  $('canon').hidden = ethiopic || torah;
  $('canon-note').hidden = ethiopic || torah;
  $('ethiopic-library-note').hidden = !ethiopic;
  $('ethiopic-filter-picker').hidden = !ethiopic;
  $('reading-edition').textContent = torah ? 'TORÁ · TRADIÇÃO JUDAICA' : ethiopic ? 'BÍBLIA ETÍOPE' : 'BÍBLIA PORTUGUESA MUNDIAL';
  $('themes').parentElement.hidden = torah;
  $('search').placeholder = torah ? 'Buscar palavra ou referência: Bereshit 1:1' : 'Buscar palavra, tema ou referência: João 3:16';
  document.querySelector('label[for="search"]').textContent = torah ? 'Buscar na Torá' : 'Buscar na Bíblia';
}

function refLabel(id, chapter, verse) {
  const name = (findBook(id) || findBook(id, 'bpm') || findBook(id, 'ethiopic'))?.name || id;
  return name + (chapter === 0 ? ' · Prólogo ' : ' ' + chapter + ':') + verse;
}

function refLink(reference) {
  const bible = findBook(reference[0]) ? activeBible : 'bpm';
  return `<a class="reference" href="${linkFor(bible, ...reference)}">${esc(refLabel(...reference))}</a>`;
}

function externalLink(url, label) {
  return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

function renderStudy(verse) {
  if (activeBible === 'tora') {
    const [hebrewName, hebrewScript, sefariaName] = torahBooks[current.id];
    $('selected-ref').textContent = refLabel(current.id, chapterData.c, verse.n);
    const sefaria = `https://www.sefaria.org/${sefariaName}.${chapterData.c}.${encodeURIComponent(verse.n)}`;
    $('comment').innerHTML = `<h3>${esc(hebrewName)} <span lang="he" dir="rtl">${esc(hebrewScript)}</span></h3><p>Este é um dos cinco livros da Torá, fundamento da tradição judaica. A divisão de capítulos e versículos pode variar entre edições.</p><h4>Para aprofundar</h4><p>${externalLink(sefaria, 'Consultar a passagem na Sefaria ↗')}</p><p class="small">O texto em português exibido aqui é a Bíblia Portuguesa Mundial, usada como referência; não é uma tradução judaica.</p>`;
    if (verse.notes?.length) $('comment').innerHTML += '<h4>Notas da tradução BPM</h4>' + verse.notes.map(note => '<p>' + esc(note) + '</p>').join('');
    return;
  }
  const number = parseInt(verse.n, 10);
  const collection = current.source === 'ethiopic' && current.id !== 'JUD' ? ethiopicStudies : studies;
  const study = collection.find(item =>
    item.book === current.id && item.chapter === chapterData.c && number >= item.start && number <= item.end
  );
  $('selected-ref').textContent = refLabel(current.id, chapterData.c, verse.n);
  let content = study
    ? `<h3>${esc(study.title)}</h3><h4>Contexto literário e histórico</h4><p>${esc(study.context)}</p><h4>Uma leitura da passagem</h4><p>${esc(study.meaning)}</p>`
    : '<h3>Leia no contexto</h3><p>Ainda não há comentário editorial específico para este trecho. Leia o capítulo completo e confira as notas abaixo, quando disponíveis.</p>';
  if (study?.comparison) {
    const comparison = study.comparison;
    content += `<h4>Tradição católica</h4><p>${esc(comparison.cat)}</p><h4>Perspectivas protestantes</h4><p>${esc(comparison.pro)}</p><h4>Fontes da comparação</h4>`
      + comparison.sources.map(([name, url]) => '<p>' + externalLink(url, name) + '</p>').join('');
  }
  if (study) {
    content += '<h4>Conexões bíblicas</h4>' + study.refs.map(refLink).join('')
      + '<p class="small">Síntese editorial com auxílio de IA · sem revisão teológica humana. Leia os critérios em Sobre & fontes.</p>';
  }
  if (current.id === 'JUD' && number >= 14 && number <= 15) {
    content += '<h4>Na Bíblia Etíope</h4>'
      + `<a class="reference" href="${linkFor('ethiopic', 'ENO', 1, 9)}">1 Enoque 1:9</a>`;
  }
  if (current.id === 'JUD') {
    const otherBible = activeBible === 'bpm' ? 'ethiopic' : 'bpm';
    const edition = otherBible === 'ethiopic' ? 'Judas em ge’ez' : 'Judas em português (BPM)';
    content += `<p><a class="reference" href="${linkFor(otherBible, 'JUD', 1, verse.n)}">${edition}</a></p>`;
  }
  if (verse.notes.length) {
    content += (current.source === 'ethiopic' ? '<h4>Nota da transcrição</h4>' : '<h4>Notas da tradução · BPM</h4>')
      + verse.notes.map(note => '<p>' + esc(note) + '</p>').join('');
  }
  const chapterNumber = String(chapterData.c).padStart(current.id === 'PSA' ? 3 : 2, '0');
  const url = ['ENO', 'JUB'].includes(current.id) && enochInPortuguese()
    ? `${current.id === 'ENO' ? enochPortuguese : 'https://bibliaetiope.com.br/pt/jubileus'}/${chapterData.c}#v${encodeURIComponent(verse.n)}`
    : current.id === 'JUD' && enochInPortuguese() ? `https://ebible.org/porbrbsl/JUD01.htm#V${encodeURIComponent(verse.n)}`
    : current.url || `https://ebible.org/porbrbsl/${current.id}${chapterNumber}.htm#V${encodeURIComponent(verse.n)}`;
  $('comment').innerHTML = content + '<p class="small">' + externalLink(url, 'Conferir o texto na fonte ↗') + '</p>';
}

function selectVerse(number, scroll = false) {
  const verses = chapterData.verses || [];
  const exact = verses.find(item => item.n === String(number));
  const verse = exact || verses[0];
  if (!verse) return;
  if (!exact && current.id === 'ENO' && String(number) !== '1') {
    notice('Este número de versículo não está disponível na edição selecionada.');
  }
  lastReference[activeBible] = [current.id, chapterData.c, verse.n];
  document.querySelectorAll('.verse').forEach(element =>
    element.classList.toggle('selected', element.dataset.verse === verse.n)
  );
  renderStudy(verse);
  if (scroll) requestAnimationFrame(() => $('v-' + verse.n)?.scrollIntoView({ block: 'center' }));
}

function setEditionNote(book) {
  const hasText = Boolean(book.chapters?.length);
  $('chapter-picker').hidden = !hasText;
  $('chapter-nav').hidden = !hasText;
  $('enoch-language-picker').hidden = book.source !== 'ethiopic';
  $('parallel-note').hidden = !book.translation || ['ENO', 'JUB'].includes(book.id);
  $('parallel-note').innerHTML = book.translation && !['ENO', 'JUB'].includes(book.id)
    ? externalLink(book.translation, 'Ler em português em outro site · tradução preliminar ↗')
    : '';
  $('chapter-note').innerHTML = '';
  if (activeBible === 'tora') {
    $('edition-note').textContent = 'Texto de referência em português: Bíblia Portuguesa Mundial (BPM), tradução cristã em revisão.';
    $('chapter-note').innerHTML = '<p class="small">Os nomes e a organização seguem a tradição judaica. Esta edição em português não é uma tradução judaica.</p>';
    $('source-note').innerHTML = 'Texto em domínio público: ' + externalLink(bpmSource, 'eBible.org · BPM') + '. Para comparar, consulte a passagem na Sefaria pelo painel de estudo.';
  } else if (book.source === 'ethiopic') {
    $('edition-note').textContent = book.id === 'JUD'
      ? 'Ge’ez · edição etíope da Carta de Judas'
      : 'Ge’ez · edição impressa da Igreja Ortodoxa Tewahedo Etíope';
    $('source-note').innerHTML = 'Transcrição: ' + externalLink(book.url, 'Beta maṣāḥǝft')
      + ' · ' + externalLink(ethiopicLicense, 'CC BY-SA 4.0') + '.';
    if (['ENO', 'JUB'].includes(book.id) && enochInPortuguese()) {
      $('edition-note').textContent = 'Português — tradução preliminar do Bíblia Etíope / QVNK Studio, a partir de R. H. Charles.';
      $('source-note').innerHTML = 'Tradução em português: ' + externalLink(book.id === 'ENO' ? enochPortuguese : 'https://bibliaetiope.com.br/pt/jubileus', 'Bíblia Etíope / QVNK Studio')
        + ' · ' + externalLink(enochPortugueseTerms, 'Condições de republicação') + '.';
    }
    if (['ENO', 'JUB'].includes(book.id)) {
      $('chapter-note').innerHTML = '<p class="small">O português e o ge’ez seguem edições próprias. Os números de alguns versículos podem diferir.</p>';
    }
    if (book.id === 'JUD') {
      if (enochInPortuguese()) {
        $('edition-note').textContent = 'Português — Bíblia Portuguesa Mundial, texto de referência para o livro em comum.';
        $('source-note').innerHTML = 'Texto: ' + externalLink(bpmSource, 'eBible.org — Bíblia Portuguesa Mundial') + '.';
      }
      $('chapter-note').innerHTML = '<p class="alert">A Carta de Judas integra os cânones católico, protestante e etíope. '
        + '<a href="' + linkFor('bpm', 'JUD') + '">Ler Judas em português na BPM</a>.</p>';
    }
    if (book.id.endsWith('MQ')) {
      $('chapter-note').innerHTML = '<p class="alert">Os livros de Meqabyan são obras etíopes distintas dos livros gregos dos Macabeus. A tradução em português ainda não está disponível aqui.</p>';
    }
  } else if (hasText) {
    $('edition-note').textContent = activeBible === 'ethiopic'
      ? 'Livro em comum · texto de referência da Bíblia Portuguesa Mundial (BPM)'
      : 'Tradução em domínio público · texto ainda em revisão pela fonte.';
    $('source-note').innerHTML = 'Texto: ' + externalLink(bpmSource, 'eBible.org · BPM')
      + '. Notas da tradução disponíveis ao selecionar os versículos.';
    if (activeBible === 'bpm' && book.group === 'aa') {
      $('chapter-note').innerHTML = '<p class="alert">' + (
        ['ESG', 'DAG'].includes(book.id)
          ? 'A fonte apresenta o texto grego em separado. Ele integra a contagem de 73 livros do cânon católico. A numeração pode diferir da sua edição.'
          : 'Livro deuterocanônico do cânon católico.'
      ) + '</p>';
    }
  } else {
    $('edition-note').textContent = 'Ficha do cânon · texto indisponível neste leitor';
    $('source-note').innerHTML = 'Fontes do índice: ' + externalLink(ethiopicCanonUrl, 'Igreja Ortodoxa Tewahedo Etíope')
      + ' · ' + externalLink(ethiopicCanonStudy, 'Roger W. Cowley') + '.';
  }
}

async function route(force = false) {
  const raw = location.hash.slice(1);
  if (raw === 'spirit-reading' && !$('spirit-view').hidden) return;
  const showHub = !raw || ['inicio', 'hub', 'colecao-biblica'].includes(raw);
  const showSpirit = raw === 'colecao-espirita' || raw === 'espiritismo' || raw.startsWith('espiritismo/');
  $('hub').hidden = !showHub;
  $('spirit-view').hidden = !showSpirit;
  document.querySelector('.workspace').hidden = showHub || showSpirit;
  $('skip-main').href = showHub ? '#hub' : showSpirit ? '#spirit-reading' : '#reading';
  const activeArea = showHub ? '' : showSpirit ? 'spirit' : raw.startsWith('etiope/') ? 'ethiopic' : raw.startsWith('tora/') ? 'tora' : 'bpm';
  document.querySelectorAll('.site-nav a').forEach(link => {
    if (link.dataset.area === activeArea) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (showHub) {
    ++loadId;
    document.title = 'Escrituras em Contexto';
    if (raw.startsWith('colecao-')) requestAnimationFrame(() => $(raw)?.scrollIntoView({ block: 'start' }));
    else window.scrollTo(0, 0);
    return;
  }
  if (showSpirit) {
    ++loadId;
    ++searchId;
    const requested = raw.split('/')[1] || 'espiritos';
    const key = Object.hasOwn(spiritBooks, requested) ? requested : 'espiritos';
    const book = spiritBooks[key];
    $('spirit-title').textContent = book.title;
    $('spirit-book-select').value = key;
    $('spirit-source-link').href = key === 'genese' ? 'https://www.febnet.org.br/wp-content/uploads/2012/07/WEB-A-Genese-Guillon.pdf' : 'https://celp.org.br/apostilas/';
    $('spirit-source-link').textContent = key === 'genese' ? 'Federação Espírita Brasileira' : 'Casa Espírita Luiz Picelli';
    $('spirit-results').hidden = true;
    $('spirit-text').innerHTML = '<p>Carregando o texto…</p>';
    const request = loadId;
    try {
      const path = './data/spirit/' + key + '.json';
      const data = cache[path] || (cache[path] = await json(path));
      if (request !== loadId) return;
      spiritData = data;
      spiritKey = key;
      const initial = { espiritos: 13, mediuns: 12, evangelho: 17, ceu: 11, genese: 10 }[key];
      const page = Math.max(1, Math.min(data.pages.length, Number(raw.split('/')[2]) || initial));
      showSpiritPage(page);
    } catch {
      if (request === loadId) $('spirit-text').innerHTML = '<p>Não foi possível carregar o livro. Atualize a página para tentar novamente.</p>';
    }
    document.querySelectorAll('.spirit-book-list a').forEach(link => {
      if (link.dataset.spiritBook === key) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = book.title + ' · Escrituras em Contexto';
    return;
  }
  if (!catalogs.bpm.length) return;
  if (raw === 'reading' && current) return;
  const parts = raw.split('/');
  const bible = parts[0] === 'etiope' ? 'ethiopic' : parts[0] === 'tora' ? 'tora' : 'bpm';
  if (bible === 'ethiopic' || bible === 'tora') parts.shift();
  const [id, chapterString, verse] = !parts[0] || raw === 'reading' ? defaults[bible] : parts;
  const book = findBook(id, bible);
  const chapter = Number(chapterString ?? 1);
  if (!book || (book.chapters && !book.chapters.includes(chapter))) {
    notice('Referência não encontrada. Abra um livro pela biblioteca.');
    if (!current) location.replace(linkFor(bible, ...defaults[bible]));
    return;
  }

  const changedBible = activeBible !== bible;
  if (changedBible) {
    activeBible = bible;
    ++searchId;
    $('results').hidden = true;
    $('book-filter').value = '';
  }
  showBibleControls();
  if (!allowed(book)) {
    if (bible === 'ethiopic') {
      ethiopicFilter = 'all';
      $('ethiopic-filter').value = 'all';
    } else $('canon').value = 'all';
  }
  if (!force && !changedBible && current?.id === id && chapterData.c === chapter) {
    document.title = book.name + ' ' + chapter + ' · Bíblia em Contexto';
    selectVerse(verse || '1', true);
    return;
  }
  const request = ++loadId;
  current = book;
  chapterData = {};
  lastReference[bible] = [id, chapter, verse || '1'];
  listBooks();
  const heading = book.chapters ? (chapter === 0 ? ' · Prólogo' : ' ' + chapter) : '';
  $('chapter-title').innerHTML = esc(book.name) + (heading ? '<em>' + heading + '</em>' : '');
  $('testament').textContent = {
    torah: 'OS CINCO LIVROS', oo: 'ANTIGO TESTAMENTO', aa: 'TEXTOS DO CÂNON CATÓLICO',
    nn: 'NOVO TESTAMENTO', broader: 'NOVO TESTAMENTO · CÂNON MAIS AMPLO',
  }[book.group];
  $('comment').innerHTML = '';
  $('selected-ref').textContent = '';
  document.title = book.name + heading + ' · Bíblia em Contexto';
  setEditionNote(book);

  if (book.id.endsWith('MQ') && enochInPortuguese()) {
    $('edition-note').textContent = 'Português — tradução ainda indisponível neste leitor.';
    $('chapter-picker').hidden = true;
    $('chapter-nav').hidden = true;
    $('verses').innerHTML = '<p>A tradução deste livro para o português ainda não está disponível. Se desejar, selecione ge’ez acima para consultar o texto original.</p>';
    return;
  }

  if (!book.chapters) {
    $('verses').innerHTML = '<p>' + esc(book.description || 'Esta obra faz parte do índice da tradição etíope e aguarda uma fonte textual para leitura aqui.') + '</p>'
      + (book.reference ? refLink(book.reference) : '');
    return;
  }

  $('chapter').innerHTML = book.chapters.map(number =>
    `<option value="${number}" ${number === chapter ? 'selected' : ''}>${number === 0 ? 'Prólogo' : number}</option>`
  ).join('');
  $('verses').innerHTML = '<p>Carregando capítulo…</p>';
  $('prev').disabled = true;
  $('next').disabled = true;
  try {
    const inPortuguese = ['ENO', 'JUB', 'JUD'].includes(id) && enochInPortuguese();
    const useBpm = id === 'JUD' && inPortuguese;
    const path = './data/' + (book.source === 'ethiopic' && !useBpm ? 'ethiopic/' : '') + id + (inPortuguese && !useBpm ? '-pt' : '') + '.json';
    const data = cache[path] || (cache[path] = await json(path));
    if (request !== loadId) return;
    const verses = data[chapter];
    if (!verses?.length) throw Error('Capítulo indisponível.');
    chapterData = { c: chapter, verses };
    const introduction = activeBible === 'tora' ? null : introductions[id + '/' + chapter];
    const lang = book.source === 'ethiopic' && !inPortuguese ? ' lang="gez"' : '';
    $('verses').innerHTML = (introduction ? '<p class="psalm-title">' + esc(introduction) + '</p>' : '')
      + verses.map(item => `<p class="verse" id="v-${esc(item.n)}" data-verse="${esc(item.n)}"><a href="${linkFor(bible, id, chapter, item.n)}" aria-label="Estudar ${esc(refLabel(id, chapter, item.n))}">${esc(item.n)}</a><span${lang}>${esc(item.t)}</span>${item.notes.length ? ' <span class="small" title="Há notas sobre este versículo">*</span>' : ''}</p>`).join('');
    selectVerse(verse || verses[0].n, parseInt(verse, 10) > 1);
    const index = book.chapters.indexOf(chapter);
    $('prev').disabled = index === 0;
    $('next').disabled = index === book.chapters.length - 1;
  } catch {
    if (request !== loadId) return;
    $('verses').innerHTML = '<p>Não foi possível carregar o capítulo.</p><button id="retry">Tentar novamente</button>';
    $('retry').onclick = () => { current = null; route(); };
  }
}

$('verses').onclick = event => {
  const paragraph = event.target.closest('.verse');
  if (!paragraph || event.target.closest('a')) return;
  const hash = linkFor(activeBible, current.id, chapterData.c, paragraph.dataset.verse);
  if (location.hash === hash) selectVerse(paragraph.dataset.verse);
  else location.hash = hash;
};
$('chapter').onchange = () => {
  location.hash = linkFor(activeBible, current.id, $('chapter').value);
};
for (const [id, offset] of [['prev', -1], ['next', 1]]) {
  $(id).onclick = () => {
    const index = current.chapters.indexOf(chapterData.c);
    const chapter = current.chapters[index + offset];
    if (chapter !== undefined) location.hash = linkFor(activeBible, current.id, chapter);
  };
}

function resultShell(title, body) {
  $('results').hidden = false;
  $('results').innerHTML = '<button id="close-results">Fechar busca</button><h3>' + esc(title) + '</h3>' + body;
  $('close-results').onclick = () => { ++searchId; $('results').hidden = true; };
}

function topic(theme) {
  ++searchId;
  const hits = studies.filter(item => item.theme === theme && allowed(findBook(item.book)));
  resultShell(theme, hits.map(item =>
    `<a class="result" href="${linkFor(activeBible, item.book, item.chapter, item.start)}"><strong>${esc(refLabel(item.book, item.chapter, item.start))}–${item.end}</strong>${esc(item.title)}</a>`
  ).join('') || '<p>Nenhum comentário neste filtro.</p>');
  $('results').scrollIntoView({ block: 'start' });
}

const aliases = {
  gn: 'GEN', genesis: 'GEN', ex: 'EXO', sl: 'PSA', salmo: 'PSA', salmos: 'PSA', pv: 'PRO',
  mt: 'MAT', mc: 'MRK', lc: 'LUK', jo: 'JHN', joao: 'JHN', rm: 'ROM', ap: 'REV', tg: 'JAS',
  '1co': '1CO', '2co': '2CO', ef: 'EPH', fp: 'PHP', cl: 'COL', hb: 'HEB', tb: 'TOB', eclesiastico: 'SIR',
};
$('search-form').onsubmit = async event => {
  event.preventDefault();
  const query = norm($('search').value);
  if (query.length < 2) return notice('Digite pelo menos duas letras.');
  const request = ++searchId;
  const reference = query.match(/^(.+?)\s*(\d+)(?:\s*[:.,]\s*(\d+[a-z]?))?$/);
  if (reference) {
    const name = reference[1].trim();
    const book = catalogs[activeBible].find(item =>
      bookNames(item).includes(name) || item.id === aliases[name] || norm(item.id) === name
    );
    if (book?.chapters?.includes(+reference[2])) {
      location.hash = linkFor(activeBible, book.id, +reference[2], reference[3] || '1');
      $('results').hidden = true;
      return;
    }
  }
  const theme = activeBible === 'tora' ? null : studies.find(item => norm(item.theme) === query)?.theme;
  if (theme) return topic(theme);
  resultShell('Buscando…', '<p>Consultando o texto disponível.</p>');
  try {
    const [portuguese, ethiopic, enoch, jubilee] = await Promise.all([
      searchData || (searchData = json('./data/search.json').catch(error => { searchData = null; throw error; })),
      activeBible === 'ethiopic'
        ? ethiopicSearchData || (ethiopicSearchData = json('./data/ethiopic/search.json' + ethiopicDataRevision).catch(error => { ethiopicSearchData = null; throw error; }))
        : [],
      activeBible === 'ethiopic' && enochInPortuguese()
        ? enochSearchData || (enochSearchData = json('./data/ethiopic/ENO-pt.json').catch(error => { enochSearchData = null; throw error; }))
        : null,
      activeBible === 'ethiopic' && enochInPortuguese()
        ? jubileeSearchData || (jubileeSearchData = json('./data/ethiopic/JUB-pt.json').catch(error => { jubileeSearchData = null; throw error; }))
        : null,
    ]);
    if (request !== searchId) return;
    const permitted = new Set(catalogs[activeBible].filter(allowed).map(book => book.id));
    const words = query.split(/\s+/);
    const traditional = activeBible === 'ethiopic' ? portuguese.filter(row => findBook(row[0])?.source === 'bpm' || (row[0] === 'JUD' && enochInPortuguese())) : portuguese;
    const original = enoch ? ethiopic.filter(row => !['ENO', 'JUB', 'JUD'].includes(row[0])) : ethiopic;
    const translated = enoch ? Object.entries(enoch).flatMap(([chapter, verses]) =>
      verses.map(verse => ['ENO', +chapter, verse.n, verse.t])) : [];
    if (jubilee) translated.push(...Object.entries(jubilee).flatMap(([chapter, verses]) => verses.map(verse => ['JUB', +chapter, verse.n, verse.t])));
    const hits = [...translated, ...original, ...traditional].filter(row => {
      if (!permitted.has(row[0])) return false;
      const text = norm(row[3]);
      return words.every(word => text.includes(word));
    });
    resultShell(hits.length + ' resultados',
      '<p class="small">' + (hits.length > 100 ? 'Mostrando os primeiros 100.' : 'Resultados nos livros selecionados.') + '</p>'
      + hits.slice(0, 100).map(([id, chapter, verse, text]) => {
        const lang = findBook(id)?.source === 'ethiopic' && !(['ENO', 'JUB', 'JUD'].includes(id) && enoch) ? ' lang="gez"' : '';
        return `<a class="result" href="${linkFor(activeBible, id, chapter, verse)}"><strong>${esc(refLabel(id, chapter, verse))}</strong><span${lang}>${esc(text)}</span></a>`;
      }).join('')
      + (hits.length ? '' : '<p>Tente outra palavra ou uma referência como João 3:16.</p>'));
  } catch {
    if (request === searchId) resultShell('Busca indisponível', '<p>Confira sua conexão e tente novamente.</p>');
  }
};

window.addEventListener('hashchange', () => route());
for (const [id, delta] of [['spirit-smaller', -2], ['spirit-larger', 2]]) {
  $(id).onclick = () => { font = Math.max(17, Math.min(33, font + delta)); document.documentElement.style.setProperty('--reading', font + 'px'); pref('bible-font', font); };
}
function showSpiritPage(number) {
  const page = spiritData.pages[number - 1];
  if (!page) return;
  spiritPage = number;
  $('spirit-page').innerHTML = spiritData.pages.map(p => '<option value="' + p.n + '"' + (p.n === number ? ' selected' : '') + '>Página ' + p.n + '</option>').join('');
  $('spirit-text').innerHTML = page.blocks.map(block => '<p>' + esc(block) + '</p>').join('') || '<p>Esta página não contém texto extraível. Use as setas para continuar.</p>';
  $('spirit-page-label').textContent = 'Página ' + number + ' de ' + spiritData.pages.length;
  $('spirit-prev').disabled = number <= 1;
  $('spirit-next').disabled = number >= spiritData.pages.length;
}
function goSpiritPage(number) { location.hash = '#espiritismo/' + spiritKey + '/' + number; }
$('spirit-page').onchange = () => goSpiritPage(Number($('spirit-page').value));
$('spirit-prev').onclick = () => goSpiritPage(spiritPage - 1);
$('spirit-next').onclick = () => goSpiritPage(spiritPage + 1);
$('spirit-search-form').onsubmit = event => {
  event.preventDefault();
  const query = norm($('spirit-search').value);
  if (query.length < 2 || !spiritData) return notice('Digite pelo menos duas letras.');
  const hits = spiritData.pages.flatMap(page => page.blocks.filter(block => norm(block).includes(query)).map(block => ({ page: page.n, block })));
  $('spirit-results').hidden = false;
  $('spirit-results').innerHTML = '<button type="button" id="spirit-close-results">Fechar busca</button><h3>' + hits.length + ' resultado(s)</h3>' + hits.slice(0, 50).map(hit => '<a class="result" href="#espiritismo/' + spiritKey + '/' + hit.page + '"><strong>Página ' + hit.page + '</strong><span>' + esc(hit.block.slice(0, 240)) + '</span></a>').join('') + (hits.length > 50 ? '<p>Exibindo os primeiros 50 resultados.</p>' : '');
  $('spirit-close-results').onclick = () => $('spirit-results').hidden = true;
};
$('spirit-book-select').onchange = () => { location.hash = '#espiritismo/' + $('spirit-book-select').value; };
if (!location.hash) history.replaceState(null, '', '#inicio');
route();
(async () => {
  try {
    const [books, notes, intros, ethiopicBooks] = await Promise.all([
      json('./data/books.json'), json('./data/studies.json?v=3'),
      json('./data/introductions.json'), json('./data/ethiopic/books.json' + ethiopicDataRevision),
    ]);
    catalogs.bpm = books;
    catalogs.tora = books.filter(book => torahBooks[book.id]).map(book => ({ ...book, name: book.name + ' · ' + torahBooks[book.id][0], aliases: [book.name, torahBooks[book.id][0], torahBooks[book.id][1]], group: 'torah' }));
    catalogs.ethiopic = buildEthiopicCatalog(books, ethiopicBooks);
    studies = notes;
    introductions = intros;
    $('themes').innerHTML = [...new Set(studies.map(item => item.theme))].map(theme =>
      `<button data-topic="${esc(theme)}">${esc(theme)}</button>`
    ).join('');
    $('themes').onclick = event => {
      const button = event.target.closest('button');
      if (button) topic(button.dataset.topic);
    };
    await route();
  } catch {
    $('verses').innerHTML = '<p>Não foi possível abrir a biblioteca. Atualize a página para tentar novamente.</p>';
  }
})();
