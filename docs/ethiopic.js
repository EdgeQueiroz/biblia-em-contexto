'use strict';

const ethiopicCanonUrl = 'https://www.ethiopianorthodox.org/english/canonical/books.html?lang=en';
const ethiopicCanonStudy = 'https://www.islamic-awareness.org/bible/text/canon/ethiopican';
const ethiopicLicense = 'https://creativecommons.org/licenses/by-sa/4.0/';

// The index separates entries that some lists group into a single book.
const ethiopicOldTestament = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH',
  'JUB', 'ENO', 'EZR', 'NEH', '1ES', 'EZS', 'TOB', 'JDT', 'ESG', '1MQ', '2MQ', '3MQ', 'JOB', 'PSA',
  'PRO', 'TGS', 'WIS', 'ECC', 'SNG', 'ISA', 'JER', 'BAR', 'LAM', '4BA', 'EZK', 'DAG', 'HOS', 'AMO',
  'MIC', 'JOL', 'OBA', 'JON', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'SIR', 'JOSF',
];

const ethiopicIndexEntries = [
  { id: '1ES', name: 'Esdras grego (Ezra Kali)', group: 'oo' },
  { id: 'EZS', name: 'Apocalipse de Esdras (Ezra Sutu’el)', group: 'oo' },
  { id: 'TGS', name: 'Tegsats', group: 'oo', reference: ['PRO', 25, 1], description: 'Tegsats corresponde a Provérbios 25–31 na organização descrita por Roger W. Cowley.' },
  { id: '4BA', name: '4 Baruc (Paralipômenos de Jeremias)', group: 'oo', description: 'Na tradição etíope, o texto aparece associado a Lamentações, no conjunto de escritos de Jeremias.' },
  { id: 'JOSF', name: 'Josipon (Zena Ayhud)', group: 'oo', description: 'História judaica atribuída a José, filho de Gorion, incluída nas listas do cânon mais amplo.' },
  { id: 'SYN1', name: 'Sinodos · Ser’ata Seyon', group: 'broader' },
  { id: 'SYN2', name: 'Sinodos · Te’ezaz', group: 'broader' },
  { id: 'SYN3', name: 'Sinodos · Gessew', group: 'broader' },
  { id: 'SYN4', name: 'Sinodos · Abtelis', group: 'broader' },
  { id: 'KID1', name: '1 Kidan (Livro da Aliança)', group: 'broader' },
  { id: 'KID2', name: '2 Kidan (Livro da Aliança)', group: 'broader' },
  { id: 'CLE', name: 'Clemente etíope (Qälëmentos)', group: 'broader' },
  { id: 'DID', name: 'Didascália etíope', group: 'broader' },
];

function buildEthiopicCatalog(bpm, texts) {
  const shared = bpm.map(book => ({
    ...book,
    group: book.group === 'nn' ? 'nn' : 'oo',
    source: 'bpm',
  }));
  const index = new Map([...shared, ...texts, ...ethiopicIndexEntries].map(book => [book.id, book]));
  return [
    ...ethiopicOldTestament.map(id => index.get(id)),
    ...shared.filter(book => book.group === 'nn'),
    ...ethiopicIndexEntries.filter(book => book.group === 'broader'),
  ];
}

const ethiopicStudies = [
  {
    book: 'ENO', chapter: 1, start: 9, end: 9, title: 'Enoque e a carta de Judas',
    context: 'A abertura de 1 Enoque anuncia a vinda de Deus para o juízo.',
    meaning: 'Judas 1:14–15 cita uma profecia atribuída a Enoque. Leia as duas passagens para acompanhar como a carta retoma essa imagem de juízo.',
    refs: [['JUD', 1, 14]],
  },
  {
    book: 'JUB', chapter: 1, start: 1, end: 1, title: 'Moisés no Sinai',
    context: 'Jubileus começa com Moisés convocado a subir ao Sinai. A narrativa usa esse encontro como moldura para recontar episódios de Gênesis e Êxodo.',
    meaning: 'Compare o início de Jubileus com Êxodo 24, onde Moisés sobe ao monte para receber as tábuas.',
    refs: [['EXO', 24, 12]],
  },
];
