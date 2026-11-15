export const advisorSourceTopics = [
  'invoice-obligation', 'invoice-content', 'sale-date', 'issue-date', 'advance-payment', 'tax-point', 'amounts', 'rounding',
  'vat-rates', 'correction', 'fa3', 'split-payment', 'exempt-sales', 'vat-status',
  'ksef-obligation', 'ksef-delivery', 'ksef-dates', 'ksef-offline', 'ksef-failure', 'ksef-limit-10000', 'ksef-penalty', 'transitional',
] as const;

export type AdvisorSourceTopic = typeof advisorSourceTopics[number];

// Keywords are matched as substrings of the lowercase, diacritic-free question, so Polish inflection stems are enough.
const questionKeywordsByTopic: Record<AdvisorSourceTopic, string[]> = {
  'invoice-obligation': ['musze wystawic', 'obowiazek wystawi', 'konsument', 'paragon', 'detaliczn', 'papierow', 'na zadanie', 'zaliczk',
    'must i issue', 'have to issue', 'consumer', 'receipt', 'paper invoice', 'advance'],
  'invoice-content': ['zawierac', 'zawiera', 'tresc faktur', 'elementy faktur', 'adnotacj', 'uproszczon', 'must contain', 'must include', 'invoice content', 'simplified', 'annotation'],
  'sale-date': ['dat sprzedazy', 'date sprzedazy', 'date of sale', 'sale date', 'data dokonania', 'data wykonania'],
  'issue-date': ['do kiedy', 'termin wystawienia', 'dat wystawienia', 'date wystawienia', 'wyprzedzeniem', 'kiedy wystawic', 'zaliczk', 'issue date', 'date of issue', 'by when', 'deadline', 'in advance'],
  'advance-payment': ['zaliczk', 'przedplat', 'advance', 'prepayment'],
  'tax-point': ['obowiazek podatkowy', 'powstaje obowiazek', 'moment powstania', 'tax point', 'chargeable event'],
  'amounts': ['kwota vat', 'kwote vat', 'brutto', 'netto', 'uproszczon', 'vat amount', 'gross', 'net amount', 'simplified'],
  'rounding': ['zaokragl', 'round'],
  'vat-rates': ['stawk', 'vat rate', 'rate of vat', 'tax rate', '23%', '8%', '5%'],
  'correction': ['koryg', 'popraw', 'blednej', 'bledny', 'credit note', 'correct', 'nota '],
  'fa3': ['fa3', 'fa(3)', 'fa 3'],
  'split-payment': ['podzielon', 'split payment', 'mpp'],
  'exempt-sales': ['zwolnion', 'zwolnien', 'exempt'],
  'vat-status': ['zwolnion', 'zwolnien', 'exempt', 'biala lista', 'bialej listy', 'bialej liscie', 'white list', 'whitelist', 'czynny', 'czynnym', 'rejestr', 'zarejestr', 'register', 'vat status', 'podatnik vat'],
  'ksef-obligation': ['ksef', 'krajowy system'],
  'ksef-delivery': ['zagranic', 'foreign', 'dostarcz', 'przekaz', 'odbiorc', 'otrzym', 'recipient', 'delivery', 'deliver'],
  'ksef-dates': ['dat wystawienia', 'date wystawienia', 'date of issue', 'odbiorc', 'otrzym', 'uznany za', 'considered received', 'od kiedy', 'od 1 '],
  'ksef-offline': ['offline'],
  'ksef-failure': ['awari', 'niedostepn', 'failure', 'outage', 'unavailable', 'nie dziala'],
  'ksef-limit-10000': ['10 000', '10000', '10,000', 'limit'],
  'ksef-penalty': ['kar', 'sankcj', 'penalt', 'fine', '2027'],
  'transitional': ['przejsciow', 'transitional', 'limit', 'okres', '2027', 'do 31 grudnia', 'od 1 kwietnia', 'od 1 stycznia', 'przekrocz'],
};

function normalizeAdvisorQuestion(question: string) {
  return question.toLowerCase().replaceAll('ł', 'l').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ');
}

export function classifyAdvisorQuestionTopics(question: string): AdvisorSourceTopic[] {
  const normalized = normalizeAdvisorQuestion(question);
  return advisorSourceTopics.filter((topic) => questionKeywordsByTopic[topic].some((keyword) => normalized.includes(keyword)));
}

// Clearly unsupported subjects (income tax, ZUS, depreciation, tax optimisation, legal opinions, filing or issuing on the user's behalf).
// ponytail: keyword list, not a classifier; a missed phrase still reaches the model, which declines through the prompt. Add phrases when the evaluation shows misses.
const outOfScopePatterns = [
  /\b(pit|cit|zus)\b/, /estonsk/, /amortyzacj/, /optymalizacj/, /podatek liniow/, /skala podatkow/, /ryczalt\w* .*(skal|liniow)/,
  /opini\w* prawn/, /(zloz|wysl|przesl)\w* (\S+ ){0,3}(jpk|deklaracj)/, /\bwystaw i wyslij\b/, /\bwyslij do ksef/,
];

export function isAdvisorQuestionOutOfScope(question: string): boolean {
  const normalized = normalizeAdvisorQuestion(question);
  return outOfScopePatterns.some((pattern) => pattern.test(normalized));
}
