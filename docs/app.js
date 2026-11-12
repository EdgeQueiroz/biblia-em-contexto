'use strict';

const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const norm = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const bpmSource = 'https://ebible.org/details.php?id=porbrbsl';
const catalogs = { bpm: [], ethiopic: [] };
const defaults = { bpm: ['JHN', 1, '1'], ethiopic: ['ENO', 1, '1'] };
const lastReference = {};
const cache = {};
let studies = [], introductions = {}, searchData, ethiopicSearchData;
let current, chapterData = {}, activeBible = 'bpm', loadId = 0, searchId = 0;

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
  return '#' + (bible === 'ethiopic' ? 'etiope/' : '') + [id, chapter, verse].join('/');
}

function findBook(id, bible = activeBible) {
  return catalogs[bible].find(book => book.id === id);
}

function allowed(book) {
  return book && (activeBible === 'ethiopic' || $('canon').value !== 'protestant' || book.group !== 'aa');
}

function bookNames(book) {
  return [book.name, ...(book.aliases || [])].map(norm);
}

function listBooks() {
  const query = norm($('book-filter').value);
  const labels = {
    oo: 'Antigo Testamento', aa: 'Deuterocanônicos e textos gregos', nn: 'Novo Testamento',
    broader: 'Novo Testamento · cânon mais amplo',
  };
  $('books').innerHTML = Object.entries(labels).map(([group, label]) => {
    const matching = catalogs[activeBible].filter(book =>
      book.group === group && allowed(book) && bookNames(book).some(name => name.includes(query))
    );
    if (!matching.length) return '';
    return '<h3>' + label + '</h3>' + matching.map(book => {
      const active = book.id === current?.id;
      const chapter = book.chapters?.includes(1) ? 1 : book.chapters?.[0];
      const badge = book.source === 'ethiopic' ? 'ge’ez' : book.chapters?.length || 'Ficha';
      return `<a href="${linkFor(activeBible, book.id, chapter)}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>${esc(book.name)}<span>${badge}</span></a>`;
    }).join('');
  }).join('') || '<p class="small">Nenhum livro encontrado.</p>';
}
$('book-filter').oninput = listBooks;
$('canon').onchange = () => {
  if (current && !allowed(current)) location.hash = linkFor('bpm', 'GEN');
  listBooks();
};
for (const bible of ['bpm', 'ethiopic']) {
  $('bible-' + bible).onclick = () => {
    if (activeBible !== bible) location.hash = linkFor(bible, ...(lastReference[bible] || defaults[bible]));
  };
}

function showBibleControls() {
  const ethiopic = activeBible === 'ethiopic';
  $('bible-bpm').setAttribute('aria-pressed', String(!ethiopic));
  $('bible-ethiopic').setAttribute('aria-pressed', String(ethiopic));
  $('canon-label').hidden = ethiopic;
  $('canon').hidden = ethiopic;
  $('canon-note').hidden = ethiopic;
  $('ethiopic-library-note').hidden = !ethiopic;
  $('reading-edition').textContent = ethiopic ? 'BÍBLIA ETÍOPE' : 'BÍBLIA PORTUGUESA MUNDIAL';
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
  const number = parseInt(verse.n, 10);
  const collection = current.source === 'ethiopic' ? ethiopicStudies : studies;
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
  if (activeBible === 'bpm' && current.id === 'JUD' && number >= 14 && number <= 15) {
    content += '<h4>Na Bíblia Etíope</h4>'
      + `<a class="reference" href="${linkFor('ethiopic', 'ENO', 1, 9)}">1 Enoque 1:9</a>`;
  }
  if (verse.notes.length) {
    content += (current.source === 'ethiopic' ? '<h4>Nota da transcrição</h4>' : '<h4>Notas da tradução · BPM</h4>')
      + verse.notes.map(note => '<p>' + esc(note) + '</p>').join('');
  }
  const chapterNumber = String(chapterData.c).padStart(current.id === 'PSA' ? 3 : 2, '0');
  const url = current.url || `https://ebible.org/porbrbsl/${current.id}${chapterNumber}.htm#V${encodeURIComponent(verse.n)}`;
  $('comment').innerHTML = content + '<p class="small">' + externalLink(url, 'Conferir o texto na fonte ↗') + '</p>';
}

function selectVerse(number, scroll = false) {
  const verses = chapterData.verses || [];
  const verse = verses.find(item => item.n === String(number)) || verses[0];
  if (!verse) return;
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
  $('parallel-note').hidden = !book.translation;
  $('parallel-note').innerHTML = book.translation
    ? externalLink(book.translation, 'Ler em português · tradução preliminar ↗')
    : '';
  $('chapter-note').innerHTML = '';
  if (book.source === 'ethiopic') {
    $('edition-note').textContent = 'Ge’ez · edição impressa da Igreja Ortodoxa Tewahedo Etíope';
    $('source-note').innerHTML = 'Transcrição: ' + externalLink(book.url, 'Beta maṣāḥǝft')
      + ' · ' + externalLink(ethiopicLicense, 'CC BY-SA 4.0') + '.';
    if (book.id.endsWith('MQ')) {
      $('chapter-note').innerHTML = '<p class="alert">Os livros de Meqabyan são obras etíopes distintas dos livros gregos dos Macabeus.</p>';
    }
  } else if (hasText) {
    $('edition-note').textContent = activeBible === 'ethiopic'
      ? 'Texto de referência em português · Bíblia Portuguesa Mundial'
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

async function route() {
  if (!catalogs.bpm.length) return;
  const raw = location.hash.slice(1);
  if (raw === 'reading' && current) return;
  const parts = raw.split('/');
  const bible = parts[0] === 'etiope' ? 'ethiopic' : 'bpm';
  if (bible === 'ethiopic') parts.shift();
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
  if (!allowed(book)) $('canon').value = 'all';
  if (!changedBible && current?.id === id && chapterData.c === chapter) {
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
    oo: 'ANTIGO TESTAMENTO', aa: 'TEXTOS DO CÂNON CATÓLICO',
    nn: 'NOVO TESTAMENTO', broader: 'NOVO TESTAMENTO · CÂNON MAIS AMPLO',
  }[book.group];
  $('comment').innerHTML = '';
  $('selected-ref').textContent = '';
  document.title = book.name + heading + ' · Bíblia em Contexto';
  setEditionNote(book);

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
    const path = './data/' + (book.source === 'ethiopic' ? 'ethiopic/' : '') + id + '.json';
    const data = cache[path] || (cache[path] = await json(path));
    if (request !== loadId) return;
    const verses = data[chapter];
    if (!verses?.length) throw Error('Capítulo indisponível.');
    chapterData = { c: chapter, verses };
    const introduction = introductions[id + '/' + chapter];
    const lang = book.source === 'ethiopic' ? ' lang="gez"' : '';
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
  const theme = studies.find(item => norm(item.theme) === query)?.theme;
  if (theme) return topic(theme);
  resultShell('Buscando…', '<p>Consultando o texto disponível.</p>');
  try {
    const [portuguese, ethiopic] = await Promise.all([
      searchData || (searchData = json('./data/search.json').catch(error => { searchData = null; throw error; })),
      activeBible === 'ethiopic'
        ? ethiopicSearchData || (ethiopicSearchData = json('./data/ethiopic/search.json').catch(error => { ethiopicSearchData = null; throw error; }))
        : [],
    ]);
    if (request !== searchId) return;
    const permitted = new Set(catalogs[activeBible].filter(allowed).map(book => book.id));
    const words = query.split(/\s+/);
    const hits = [...portuguese, ...ethiopic].filter(row => {
      if (!permitted.has(row[0])) return false;
      const text = norm(row[3]);
      return words.every(word => text.includes(word));
    });
    resultShell(hits.length + ' resultados',
      '<p class="small">' + (hits.length > 100 ? 'Mostrando os primeiros 100.' : 'Resultados nos livros selecionados.') + '</p>'
      + hits.slice(0, 100).map(([id, chapter, verse, text]) => {
        const lang = findBook(id)?.source === 'ethiopic' ? ' lang="gez"' : '';
        return `<a class="result" href="${linkFor(activeBible, id, chapter, verse)}"><strong>${esc(refLabel(id, chapter, verse))}</strong><span${lang}>${esc(text)}</span></a>`;
      }).join('')
      + (hits.length ? '' : '<p>Tente outra palavra ou uma referência como João 3:16.</p>'));
  } catch {
    if (request === searchId) resultShell('Busca indisponível', '<p>Confira sua conexão e tente novamente.</p>');
  }
};

window.addEventListener('hashchange', route);
(async () => {
  try {
    const [books, notes, intros, ethiopicBooks] = await Promise.all([
      json('./data/books.json'), json('./data/studies.json'),
      json('./data/introductions.json'), json('./data/ethiopic/books.json'),
    ]);
    catalogs.bpm = books;
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
    if (!location.hash) history.replaceState(null, '', linkFor('bpm', ...defaults.bpm));
    await route();
  } catch {
    $('verses').innerHTML = '<p>Não foi possível abrir a biblioteca. Atualize a página para tentar novamente.</p>';
  }
})();
