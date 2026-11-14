'use strict';

// Personal reading data stays on this device. Shared links contain no notes.
(() => {
  const key = 'escrituras-reading-v1';
  let stored;
  try { stored = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { stored = {}; }
  let data = { bookmarks: Array.isArray(stored.bookmarks) ? stored.bookmarks : [], notes: Array.isArray(stored.notes) ? stored.notes : [], last: stored.last || null };
  let selectedVerse = null, selectedActive = false, lastChapter = '', pendingRestore = null, scrollAtTop = false;
  let noteTarget = null, playing = false, speechRun = 0, speechItems = [], speechIndex = 0, spiritChapterIndex;

  function persist() {
    try { localStorage.setItem(key, JSON.stringify(data)); return true; }
    catch { notice('Não foi possível salvar neste navegador. Verifique o armazenamento.'); return false; }
  }
  function val(name, fallback) { return pref(name) || fallback; }
  function saveSetting(name, value) { pref(name, value); }
  function safeHash(value) { return typeof value === 'string' && /^#(?:etiope\/|tora\/|espiritismo\/)?[\w-]+(?:\/[\w-]+){0,3}$/.test(value); }
  function isSpirit() { return !$('spirit-view').hidden; }
  function isReader() { return $('hub').hidden && (isSpirit() || !document.querySelector('.workspace').hidden); }
  function currentEdition() {
    return activeBible === 'ethiopic' && current?.source === 'ethiopic' ? (enochInPortuguese() ? 'pt' : 'gez') : 'pt';
  }
  function bibleRef() {
    if (!current || !chapterData.verses?.length || !selectedVerse) return null;
    const edition = currentEdition();
    const suffix = activeBible === 'ethiopic' && current.source === 'ethiopic' ? (edition === 'gez' ? ' · ge’ez' : ' · português') : '';
    const hash = linkFor(activeBible, current.id, chapterData.c, selectedVerse.n);
    return { key: [activeBible,current.id,chapterData.c,selectedVerse.n,edition].join('|'), hash, edition, area:activeBible,
      label:refLabel(current.id, chapterData.c, selectedVerse.n) + suffix };
  }
  function spiritRef() {
    if (!spiritKey || !spiritPage || !spiritBooks[spiritKey]) return null;
    const hash = '#espiritismo/' + spiritKey + '/' + spiritPage;
    return { key:['spirit',spiritKey,spiritPage].join('|'), hash, area:'spirit', edition:'pt', label:spiritBooks[spiritKey].title + ' · página ' + spiritPage };
  }
  function currentRef() { return isSpirit() ? spiritRef() : bibleRef(); }
  function showContinue() {
    const last = data.last;
    $('continue-reading').hidden = !(last && safeHash(last.hash) && typeof last.label === 'string');
    if (!$('continue-reading').hidden) { $('continue-reading').href = last.hash; $('continue-label').textContent = last.label; }
  }
  function remember(ref) {
    if (!ref || !safeHash(ref.hash)) return;
    const y = data.last?.hash === ref.hash ? data.last.y || 0 : 0;
    data.last = { ...ref, y };
    persist();
  }
  function restorePosition(ref) {
    if (pendingRestore && pendingRestore.hash === ref?.hash) {
      const top = Number(pendingRestore.y) || 0;
      pendingRestore = null;
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top, behavior:'auto' })));
    } else if (scrollAtTop) {
      scrollAtTop = false;
      requestAnimationFrame(() => window.scrollTo({ top:0, behavior:'auto' }));
    }
  }
  function closeStudy() {
    $('study').hidden = true;
    document.body.classList.remove('study-open');
    $('open-study').setAttribute('aria-expanded','false');
  }
  function openStudy() {
    if (!chapterData.verses?.length) return notice('Escolha um capítulo com texto disponível.');
    $('study').hidden = false;
    document.body.classList.add('study-open');
    $('open-study').setAttribute('aria-expanded','true');
    if (window.matchMedia('(max-width:1150px)').matches) $('close-study').focus();
  }
  function updateActionBar() {
    const ref = bibleRef();
    $('verse-actions').hidden = !(ref && selectedActive && !isSpirit());
    document.body.classList.toggle('verse-active', Boolean(ref && selectedActive && !isSpirit()));
    if (!ref) return;
    $('action-reference').textContent = ref.label;
    $('action-bookmark').textContent = data.bookmarks.some(item => item.key === ref.key) ? 'Desmarcar' : 'Marcar';
  }
  function selectRef(ref) {
    if (!ref || !safeHash(ref.hash)) return;
    if (ref.area === 'ethiopic' && ['pt','gez'].includes(ref.edition)) {
      $('enoch-language').value = ref.edition;
      saveSetting('bible-enoch-language', ref.edition);
    }
    if (location.hash === ref.hash) route(true); else location.hash = ref.hash;
  }
  function updateSpiritButtons() {
    const ref = spiritRef();
    $('spirit-mark').querySelector('span').textContent = ref && data.bookmarks.some(item => item.key === ref.key) ? 'Desmarcar' : 'Marcar';
  }
  function toggleBookmark(ref) {
    if (!ref) return notice('Escolha uma passagem para marcar.');
    const index = data.bookmarks.findIndex(item => item.key === ref.key);
    if (index >= 0) data.bookmarks.splice(index, 1); else data.bookmarks.unshift(ref);
    if (persist()) notice(index >= 0 ? 'Marcador removido.' : 'Passagem marcada neste navegador.');
    updateActionBar(); updateSpiritButtons();
  }
  function openNote(ref) {
    if (!ref) return notice('Escolha uma passagem para anotar.');
    noteTarget = ref;
    $('note-reference').textContent = ref.label;
    $('note-text').value = data.notes.find(item => item.key === ref.key)?.text || '';
    $('note-dialog').showModal(); $('note-text').focus();
  }
  $('save-note').onclick = () => {
    if (!noteTarget) return;
    const text = $('note-text').value.trim();
    const index = data.notes.findIndex(item => item.key === noteTarget.key);
    if (index >= 0) data.notes.splice(index, 1);
    if (text) data.notes.unshift({ ...noteTarget, text });
    if (persist()) { $('note-dialog').close(); notice(text ? 'Anotação salva neste navegador.' : 'Anotação removida.'); }
  };
  function renderRecords() {
    const section = (title, items, kind) => `<h3>${title}</h3>` + (items.length ? items.map((item,index) => `<div class="record-item"><a href="${esc(item.hash)}" data-record-kind="${kind}" data-record-index="${index}">${esc(item.label)}</a>${kind === 'notes' ? `<p>${esc(item.text)}</p>` : ''}<button type="button" data-remove-kind="${kind}" data-remove-index="${index}" aria-label="Remover ${kind === 'notes' ? 'anotação' : 'marcador'} de ${esc(item.label)}">Remover</button></div>`).join('') : '<p class="dialog-intro">Nenhum registro ainda.</p>');
    $('records-list').innerHTML = section('Marcadores',data.bookmarks,'bookmarks') + section('Anotações',data.notes,'notes');
  }
  function openRecords() { renderRecords(); $('records-dialog').showModal(); }
  $('records-list').onclick = event => {
    const remove = event.target.closest('[data-remove-kind]');
    if (remove) {
      const kind = remove.dataset.removeKind, index = Number(remove.dataset.removeIndex);
      if (['bookmarks','notes'].includes(kind) && data[kind][index] && confirm('Remover este registro?')) {
        data[kind].splice(index,1); if (persist()) renderRecords(); updateActionBar(); updateSpiritButtons();
      }
      return;
    }
    const link = event.target.closest('[data-record-kind]');
    if (!link) return;
    event.preventDefault();
    const item = data[link.dataset.recordKind]?.[Number(link.dataset.recordIndex)];
    $('records-dialog').close(); selectedActive = true; selectRef(item);
  };
  $('export-records').onclick = () => {
    const blob = new Blob([JSON.stringify({ format:'escrituras-registros', version:1, exportedAt:new Date().toISOString(), bookmarks:data.bookmarks, notes:data.notes, last:data.last },null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'escrituras-meus-registros.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('import-records').onclick = () => $('import-file').click();
  $('import-file').onchange = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 5_000_000) throw Error();
      const parsed = JSON.parse(await file.text());
      if (parsed.format !== 'escrituras-registros' || parsed.version !== 1 || !Array.isArray(parsed.bookmarks) || !Array.isArray(parsed.notes)) throw Error();
      let added = 0;
      for (const kind of ['bookmarks','notes']) for (const item of parsed[kind].slice(0,5000)) {
        if (!item || typeof item.key !== 'string' || item.key.length > 240 || typeof item.label !== 'string' || item.label.length > 250 || !safeHash(item.hash) || (kind === 'notes' && (typeof item.text !== 'string' || item.text.length > 10000))) continue;
        if (!data[kind].some(existing => existing.key === item.key)) { data[kind].push({ key:item.key, label:item.label, hash:item.hash, area:item.area, edition:item.edition, ...(kind === 'notes' ? {text:item.text} : {}) }); added++; }
      }
      if (persist()) { renderRecords(); notice(added + ' registro(s) importado(s). Os existentes foram preservados.'); }
    } catch { notice('Arquivo inválido. Escolha um arquivo de registros deste leitor.'); }
    event.target.value = '';
  };
  $('continue-reading').onclick = event => {
    if (!data.last || !safeHash(data.last.hash)) return;
    event.preventDefault(); pendingRestore = { ...data.last }; selectRef(data.last);
  };
  let scrollTimer;
  window.addEventListener('scroll', () => {
    if (!isReader() || !data.last || pendingRestore) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { if (isReader() && data.last) { data.last.y = window.scrollY; persist(); } }, 300);
  }, {passive:true});

  function applySettings() {
    const face = val('reader-face','serif'), spacing = val('reader-spacing','normal'), layout = val('reader-layout','verses');
    const theme = val('reader-theme', pref('bible-dark') === 'true' ? 'dark' : 'sepia');
    document.body.classList.toggle('reader-sans',face === 'sans');
    document.body.classList.toggle('reader-wide',spacing === 'wide');
    document.body.classList.toggle('theme-light',theme === 'light');
    document.body.classList.toggle('dark',theme === 'dark');
    $('verses').classList.toggle('flow',layout === 'flow');
    $('setting-font').value = face; $('setting-spacing').value = spacing; $('setting-layout').value = layout; $('setting-theme').value = theme;
    $('font-value').textContent = font + ' px';
    themeLabel();
  }
  for (const [id,setting] of [['setting-font','reader-face'],['setting-spacing','reader-spacing'],['setting-layout','reader-layout'],['setting-theme','reader-theme']]) {
    $(id).onchange = () => { saveSetting(setting,$(id).value); if(id === 'setting-theme') pref('bible-dark',String($(id).value === 'dark')); applySettings(); };
  }
  $('setting-smaller').onclick = () => { $('smaller').click(); applySettings(); };
  $('setting-larger').onclick = () => { $('larger').click(); applySettings(); };
  $('theme').addEventListener('click', () => { saveSetting('reader-theme',document.body.classList.contains('dark') ? 'dark' : 'sepia'); applySettings(); });
  $('open-settings').onclick = $('spirit-settings').onclick = () => { applySettings(); $('reading-settings').showModal(); };
  $('open-records').onclick = $('spirit-records').onclick = openRecords;
  for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => $(button.dataset.close).close();
  $('open-library').onclick = () => $('library-dialog').showModal();
  $('close-library').onclick = () => $('library-dialog').close();
  $('books').addEventListener('click',event => { if (event.target.closest('a')) $('library-dialog').close(); });
  $('spirit-books').onclick = () => $('spirit-library-dialog').showModal();
  $('close-spirit-library').onclick = () => $('spirit-library-dialog').close();
  document.querySelector('.spirit-back').addEventListener('click',() => $('spirit-library-dialog').close());
  document.querySelector('.spirit-book-list').addEventListener('click',event => { if (event.target.closest('a')) $('spirit-library-dialog').close(); });
  $('spirit-book-select').addEventListener('change',() => $('spirit-library-dialog').close());
  $('open-study').onclick = () => $('study').hidden ? openStudy() : closeStudy();
  $('close-study').onclick = closeStudy;
  $('spirit-study').onclick = () => { $('spirit-study-source').href = $('spirit-source-link').href; $('spirit-study-dialog').showModal(); };
  $('verses').addEventListener('click', event => {
    if (!event.target.closest('.verse')) return;
    selectedActive = true;
    requestAnimationFrame(updateActionBar);
  }, true);
  $('action-study').onclick = openStudy;
  $('action-bookmark').onclick = () => toggleBookmark(bibleRef());
  $('action-note').onclick = () => openNote(bibleRef());
  $('action-copy').onclick = async () => { const ref = bibleRef(); if (!ref) return; try { await navigator.clipboard.writeText(location.href.split('#')[0] + ref.hash); notice('Link da passagem copiado.'); } catch { notice('Copie o endereço da passagem na barra do navegador.'); } };
  $('action-dismiss').onclick = () => { selectedActive = false; updateActionBar(); };
  $('spirit-mark').onclick = () => toggleBookmark(spiritRef());
  $('spirit-note').onclick = () => openNote(spiritRef());
  for (const id of ['prev','next','spirit-prev','spirit-next']) $(id).addEventListener('click',() => { scrollAtTop = true; });
  async function spiritChapters() {
    const book = spiritKey;
    try {
      spiritChapterIndex ||= json('./data/spirit/chapters.json').catch(error => { spiritChapterIndex = null; throw error; });
      const index = await spiritChapterIndex;
      if (spiritKey !== book || !index[book]?.length) return;
      const entries = index[book], multipleParts = entries.some(entry => entry.part > 1);
      let html = '<option value="">Escolha um capítulo</option>', group = 0;
      for (const entry of entries) {
        if (multipleParts && group !== entry.part) {
          if (group) html += '</optgroup>';
          group = entry.part; html += '<optgroup label="Parte ' + group + '">';
        }
        html += `<option value="${entry.page}">${esc(entry.label)}</option>`;
      }
      if (group) html += '</optgroup>';
      $('spirit-chapter').innerHTML = html;
      const current = [...entries].reverse().find(entry => entry.page <= spiritPage);
      $('spirit-chapter').value = current ? String(current.page) : '';
      $('spirit-chapter-label').hidden = false;
    } catch { $('spirit-chapter-label').hidden = true; }
  }
  $('spirit-chapter').onchange = () => { const page = Number($('spirit-chapter').value); if (page) { scrollAtTop = true; goSpiritPage(page); } };

  function stopAudio() {
    speechRun++; playing = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    $('bible-audio').innerHTML = '▷ <span>Ouvir</span>'; $('spirit-audio').innerHTML = '▷ <span>Ouvir</span>';
  }
  function canSpeakBible() { return !(activeBible === 'ethiopic' && current?.source === 'ethiopic' && !enochInPortuguese()); }
  function startAudio() {
    if (playing) return stopAudio();
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return notice('A leitura em voz alta não está disponível neste navegador.');
    if (!isSpirit() && !canSpeakBible()) return notice('A leitura em voz alta está disponível apenas para o texto em português.');
    const parts = isSpirit() ? (spiritData?.pages[spiritPage - 1]?.blocks || []) : (chapterData.verses || []).map(v => v.t);
    speechItems = parts.flatMap(part => String(part).match(/[^.!?]+[.!?]?/g) || []).map(s => s.trim()).filter(Boolean);
    if (!speechItems.length) return notice('Não há texto disponível para ouvir nesta página.');
    speechIndex = 0; playing = true; const run = ++speechRun;
    $(isSpirit() ? 'spirit-audio' : 'bible-audio').innerHTML = '■ <span>Parar áudio</span>';
    const speakNext = () => {
      if (run !== speechRun) return;
      if (speechIndex >= speechItems.length) return stopAudio();
      const utterance = new SpeechSynthesisUtterance(speechItems[speechIndex++]);
      utterance.lang = 'pt-BR';
      const voices = speechSynthesis.getVoices();
      const voice = voices.find(v => /^pt-BR$/i.test(v.lang)) || voices.find(v => /^pt/i.test(v.lang));
      if (voice) utterance.voice = voice;
      utterance.onend = speakNext;
      utterance.onerror = () => { if (run === speechRun) { stopAudio(); notice('A voz do dispositivo não conseguiu ler este trecho.'); } };
      speechSynthesis.speak(utterance);
    };
    speakNext();
  }
  $('bible-audio').onclick = $('spirit-audio').onclick = startAudio;
  $('open-compare').onclick = async () => {
    if (!(activeBible === 'ethiopic' && ['ENO','JUB','JUD'].includes(current?.id) && chapterData.verses?.length)) return;
    const id = current.id, chapter = chapterData.c;
    $('compare-content').innerHTML = '<p>Carregando os textos…</p>'; $('compare-dialog').showModal();
    try {
      const [pt, geez] = await Promise.all([json(id === 'JUD' ? './data/JUD.json' : './data/ethiopic/' + id + '-pt.json'), json('./data/ethiopic/' + id + '.json')]);
      const column = (title,rows,lang) => `<section class="compare-column"><h3>${title}</h3><div class="compare-text">${rows?.length ? rows.map(v => `<p><sup>${esc(v.n)}</sup> <span${lang ? ' lang="gez"' : ''}>${esc(v.t)}</span></p>`).join('') : '<p>Capítulo indisponível nesta edição.</p>'}</div></section>`;
      const ptLabel = id === 'JUD' ? 'Português · BPM' : 'Português · QVNK Studio';
      $('compare-content').innerHTML = '<div class="compare-columns">' + column(ptLabel,pt[chapter],false) + column('Ge’ez · Beta maṣāḥǝft',geez[chapter],true) + '</div>';
    } catch { $('compare-content').innerHTML = '<p>Não foi possível carregar os textos para comparação. Tente novamente.</p>'; }
  };

  window.ReaderUI = {
    onChapterPending() {
      stopAudio(); closeStudy(); selectedActive = false; selectedVerse = null; updateActionBar();
      $('reader-location').textContent = activeBible === 'ethiopic' ? 'Bíblia Etíope · leitura' : activeBible === 'tora' ? 'Torá · leitura' : 'Bíblia Mundial · leitura';
      $('open-compare').hidden = true;
      $('chapter-progress').textContent = ''; $('chapter-progress-detail').textContent = '';
    },
    onBibleVerse(verse) {
      const chapterKey = [activeBible,current?.id,chapterData.c,currentEdition()].join('|');
      if (lastChapter !== chapterKey) { selectedActive = false; lastChapter = chapterKey; }
      selectedVerse = verse;
      $('reader-location').textContent = activeBible === 'ethiopic' ? 'Bíblia Etíope · leitura' : activeBible === 'tora' ? 'Torá · leitura' : 'Bíblia Mundial · leitura';
      $('open-compare').hidden = !(activeBible === 'ethiopic' && ['ENO','JUB','JUD'].includes(current.id));
      const position = current.chapters?.indexOf(chapterData.c) ?? -1;
      $('chapter-progress').textContent = chapterData.c === 0 ? 'Prólogo' : 'Capítulo ' + chapterData.c;
      $('chapter-progress-detail').textContent = position >= 0 ? (position + 1) + ' de ' + current.chapters.length : '';
      updateActionBar(); const ref = bibleRef(); remember(ref); restorePosition(ref);
    },
    onSpiritPage() { stopAudio(); closeStudy(); selectedActive = false; updateActionBar(); updateSpiritButtons(); spiritChapters(); const ref = spiritRef(); remember(ref); restorePosition(ref); },
    onHub() { stopAudio(); closeStudy(); selectedActive = false; updateActionBar(); showContinue(); },
  };
  applySettings(); showContinue();
  if (chapterData.verses?.length && $('hub').hidden && !isSpirit()) window.ReaderUI.onBibleVerse(chapterData.verses[0]);
})();
