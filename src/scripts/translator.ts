import axios from 'axios';

// Dicionário de termos fitness EN -> PT-BR (cache local para economizar API calls)
const FITNESS_DICTIONARY: Record<string, string> = {
  // Body Parts
  'back': 'costas',
  'cardio': 'cardio',
  'chest': 'peito',
  'lower arms': 'antebraços',
  'lower legs': 'panturrilhas',
  'neck': 'pescoço',
  'shoulders': 'ombros',
  'upper arms': 'braços',
  'upper legs': 'coxas',
  'waist': 'abdômen',
  
  // Target Muscles
  'abductors': 'abdutores',
  'abs': 'abdominais',
  'adductors': 'adutores',
  'biceps': 'bíceps',
  'calves': 'panturrilhas',
  'cardiovascular system': 'sistema cardiovascular',
  'delts': 'deltoides',
  'forearms': 'antebraços',
  'glutes': 'glúteos',
  'hamstrings': 'posteriores da coxa',
  'lats': 'dorsais',
  'levator scapulae': 'elevador da escápula',
  'pectorals': 'peitorais',
  'quads': 'quadríceps',
  'serratus anterior': 'serrátil anterior',
  'spine': 'coluna',
  'traps': 'trapézio',
  'triceps': 'tríceps',
  'upper back': 'parte superior das costas',
  
  // Equipment
  'assisted': 'assistido',
  'band': 'elástico',
  'barbell': 'barra',
  'body weight': 'peso corporal',
  'bosu ball': 'bosu',
  'cable': 'cabo/polia',
  'dumbbell': 'halter',
  'elliptical machine': 'elíptico',
  'ez barbell': 'barra W',
  'hammer': 'martelo',
  'kettlebell': 'kettlebell',
  'leverage machine': 'máquina de alavanca',
  'medicine ball': 'medicine ball',
  'olympic barbell': 'barra olímpica',
  'resistance band': 'faixa elástica',
  'roller': 'rolo',
  'rope': 'corda',
  'skierg machine': 'skierg',
  'sled machine': 'sled',
  'smith machine': 'smith machine',
  'stability ball': 'bola de estabilidade',
  'stationary bike': 'bicicleta ergométrica',
  'stepmill machine': 'escada ergométrica',
  'tire': 'pneu',
  'trap bar': 'trap bar',
  'upper body ergometer': 'ergômetro de braço',
  'weighted': 'com peso',
  'wheel roller': 'roda abdominal',
  
  // Difficulty
  'beginner': 'iniciante',
  'intermediate': 'intermediário',
  'advanced': 'avançado',
  
  // Categories
  'strength': 'força',
  'stretching': 'alongamento',
  'plyometrics': 'pliometria',
  'powerlifting': 'levantamento de peso',
  'strongman': 'strongman',
  'mobility': 'mobilidade',
  'balance': 'equilíbrio',
  'rehabilitation': 'reabilitação',
};

// Cache para traduções já feitas
const translationCache = new Map<string, string>();

export async function translateText(text: string, useApi = true): Promise<string> {
  if (!text || text.trim() === '') return text;
  
  // Verifica cache primeiro
  const cached = translationCache.get(text.toLowerCase());
  if (cached) return cached;
  
  // Verifica dicionário local
  const dictTranslation = FITNESS_DICTIONARY[text.toLowerCase()];
  if (dictTranslation) {
    translationCache.set(text.toLowerCase(), dictTranslation);
    return dictTranslation;
  }
  
  if (!useApi) return text;
  
  try {
    // Usa MyMemory API (gratuito, 5000 chars/dia)
    const response = await axios.get('https://api.mymemory.translated.net/get', {
      params: {
        q: text,
        langpair: 'en|pt-br',
        de: process.env.MYMEMORY_EMAIL || 'dev@example.com'
      },
      timeout: 5000
    });
    
    if (response.data?.responseData?.translatedText) {
      const translated = response.data.responseData.translatedText;
      translationCache.set(text.toLowerCase(), translated);
      return translated;
    }
  } catch (error) {
    console.warn(`Falha na tradução de "${text}":`, error.message);
  }
  
  return text;
}

export async function translateExerciseName(name: string): Promise<string> {
  // Primeiro tenta traduzir partes conhecidas
  let translated = name.toLowerCase();
  
  for (const [en, pt] of Object.entries(FITNESS_DICTIONARY)) {
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    translated = translated.replace(regex, pt);
  }
  
  // Se mudou algo, capitaliza e retorna
  if (translated !== name.toLowerCase()) {
    return capitalizeWords(translated);
  }
  
  // Senão, usa API
  return translateText(name);
}

export async function translateArray(items: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const item of items) {
    results.push(await translateText(item));
  }
  return results;
}

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, l => l.toUpperCase());
}

export { FITNESS_DICTIONARY };
