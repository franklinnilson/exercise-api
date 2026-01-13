/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPERAÇÃO FORTALEZA - FASE 3: INTELIGÊNCIA
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Tradução contextual com IA:
 * - Processamento em lotes (batching) para economia
 * - Prompt de Personal Trainer Brasileiro
 * - Validação rigorosa de entrada/saída
 * - Termos técnicos de academia (não tradução literal)
 * 
 * Uso: npm run etl:translate
 */

import axios from 'axios';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  dirs: {
    rawJson: 'data/raw/json',
    translatedJson: 'data/translated/json',
    logs: 'data/logs'
  },
  
  // Configurações de tradução
  batchSize: 30,              // Exercícios por lote para IA
  delayBetweenBatches: 2000,  // ms entre lotes
  
  // Performance - processamento paralelo para tradução local
  performance: {
    localBatchSize: 100,      // Processa 100 traduções locais por vez
    saveBatchSize: 50,        // Salva 50 arquivos por vez
  },
  
  // OpenAI (ou compatível)
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// DICIONÁRIO FITNESS (tradução instantânea sem API)
// ═══════════════════════════════════════════════════════════════════════════

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
  'core': 'core',
  
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
  'lower back': 'lombar',
  'obliques': 'oblíquos',
  'hip flexors': 'flexores do quadril',
  'rotator cuff': 'manguito rotador',
  
  // Equipment
  'assisted': 'assistido',
  'band': 'elástico',
  'barbell': 'barra',
  'body weight': 'peso corporal',
  'bodyweight': 'peso corporal',
  'bosu ball': 'bosu',
  'cable': 'polia',
  'dumbbell': 'halter',
  'dumbbells': 'halteres',
  'elliptical machine': 'elíptico',
  'ez barbell': 'barra W',
  'ez bar': 'barra W',
  'hammer': 'martelo',
  'kettlebell': 'kettlebell',
  'leverage machine': 'máquina',
  'machine': 'máquina',
  'medicine ball': 'medicine ball',
  'olympic barbell': 'barra olímpica',
  'resistance band': 'faixa elástica',
  'roller': 'rolo',
  'rope': 'corda',
  'skierg machine': 'skierg',
  'sled machine': 'sled',
  'smith machine': 'smith',
  'stability ball': 'bola suíça',
  'swiss ball': 'bola suíça',
  'stationary bike': 'bicicleta ergométrica',
  'stepmill machine': 'escada ergométrica',
  'tire': 'pneu',
  'trap bar': 'trap bar',
  'upper body ergometer': 'ergômetro de braço',
  'weighted': 'com peso',
  'wheel roller': 'roda abdominal',
  'pull-up bar': 'barra fixa',
  'bench': 'banco',
  'incline bench': 'banco inclinado',
  'decline bench': 'banco declinado',
  'flat bench': 'banco reto',
  
  // Difficulty
  'beginner': 'iniciante',
  'intermediate': 'intermediário',
  'advanced': 'avançado',
  'expert': 'expert',
  
  // Exercise Types
  'strength': 'força',
  'stretching': 'alongamento',
  'plyometrics': 'pliometria',
  'powerlifting': 'levantamento de peso',
  'strongman': 'strongman',
  'mobility': 'mobilidade',
  'balance': 'equilíbrio',
  'rehabilitation': 'reabilitação',
  'hiit': 'HIIT',
  'flexibility': 'flexibilidade',
  
  // Common Exercise Terms
  'curl': 'rosca',
  'press': 'supino',
  'bench press': 'supino',
  'squat': 'agachamento',
  'deadlift': 'levantamento terra',
  'row': 'remada',
  'pull-up': 'barra fixa',
  'pullup': 'barra fixa',
  'chin-up': 'barra fixa supinada',
  'chinup': 'barra fixa supinada',
  'push-up': 'flexão',
  'pushup': 'flexão',
  'lunge': 'avanço',
  'plank': 'prancha',
  'crunch': 'abdominal',
  'fly': 'crucifixo',
  'flye': 'crucifixo',
  'extension': 'extensão',
  'flexion': 'flexão',
  'raise': 'elevação',
  'lateral raise': 'elevação lateral',
  'front raise': 'elevação frontal',
  'shrug': 'encolhimento',
  'dip': 'mergulho',
  'kickback': 'coice',
  'pulldown': 'puxada',
  'lat pulldown': 'puxada alta',
  'pullover': 'pullover',
  'hip thrust': 'elevação de quadril',
  'glute bridge': 'ponte de glúteos',
  'calf raise': 'elevação de panturrilha',
  'leg press': 'leg press',
  'leg curl': 'mesa flexora',
  'leg extension': 'cadeira extensora',
  'hack squat': 'hack squat',
  'seated': 'sentado',
  'standing': 'em pé',
  'lying': 'deitado',
  'incline': 'inclinado',
  'decline': 'declinado',
  'reverse': 'reverso',
  'close grip': 'pegada fechada',
  'wide grip': 'pegada aberta',
  'neutral grip': 'pegada neutra',
  'overhand': 'pegada pronada',
  'underhand': 'pegada supinada',
  'alternating': 'alternado',
  'single arm': 'unilateral',
  'single leg': 'unilateral',
  'isometric': 'isométrico',
  'eccentric': 'excêntrico',
  'concentric': 'concêntrico'
};

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface RawExercise {
  exerciseId: string;
  name: string;
  bodyParts: string[];
  targetMuscles: string[];
  equipments: string[];
  secondaryMuscles: string[];
  instructions: string[];
  exerciseTips?: string[];
  variations?: string[];
  keywords?: string[];
  overview?: string;
  difficulty?: string;
  exerciseType?: string;
  gifUrl?: string;
  videoUrl?: string;
  imageUrl?: string;
}

interface TranslatedExercise extends RawExercise {
  namePt: string;
  bodyPartsPt: string[];
  targetMusclesPt: string[];
  equipmentsPt: string[];
  secondaryMusclesPt: string[];
  instructionsPt: string[];
  exerciseTipsPt?: string[];
  variationsPt?: string[];
  keywordsPt?: string[];
  overviewPt?: string;
  difficultyPt?: string;
}

interface TranslateStats {
  totalFiles: number;
  translated: number;
  skipped: number;
  failed: number;
  batchesSent: number;
  errors: Array<{ id: string; error: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════════════

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const log = {
  info: (msg: string) => console.log(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  warn: (msg: string) => console.log(`⚠️  ${msg}`),
  error: (msg: string) => console.log(`❌ ${msg}`),
  progress: (current: number, total: number, msg: string) => 
    console.log(`[${current}/${total}] ${msg}`),
  section: (title: string) => {
    console.log('\n' + '═'.repeat(60));
    console.log(`  ${title}`);
    console.log('═'.repeat(60) + '\n');
  }
};

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log.info(`Diretório criado: ${dir}`);
  }
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}


// ═══════════════════════════════════════════════════════════════════════════
// TRADUÇÃO LOCAL (Dicionário)
// ═══════════════════════════════════════════════════════════════════════════

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function translateWithDictionary(text: string): string {
  if (!text) return text;
  
  const lower = text.toLowerCase().trim();
  
  // Busca exata no dicionário
  if (FITNESS_DICTIONARY[lower]) {
    return FITNESS_DICTIONARY[lower];
  }
  
  // Tenta traduzir partes do texto
  let translated = lower;
  for (const [en, pt] of Object.entries(FITNESS_DICTIONARY)) {
    const escaped = escapeRegex(en);
    const regex = new RegExp('\\b' + escaped + '\\b', 'gi');
    translated = translated.replace(regex, pt);
  }
  
  // Capitaliza primeira letra de cada palavra
  return translated.replace(/\b\w/g, l => l.toUpperCase());
}

function translateArrayWithDictionary(items: string[]): string[] {
  return items.map(item => translateWithDictionary(item));
}

// ═══════════════════════════════════════════════════════════════════════════
// TRADUÇÃO COM IA (OpenAI)
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Você é um Personal Trainer Brasileiro experiente, especialista em traduzir conteúdo fitness do inglês para o português brasileiro usado em academias.

REGRAS OBRIGATÓRIAS:
1. Use termos de academia brasileira, NÃO traduções literais:
   - "Dumbbell" → "Halter" (não "sino mudo")
   - "Barbell" → "Barra" (não "barra de sino")
   - "Bench Press" → "Supino" (não "pressão de banco")
   - "Squat" → "Agachamento"
   - "Deadlift" → "Levantamento Terra"
   - "Pull-up" → "Barra Fixa"
   - "Push-up" → "Flexão"
   - "Curl" → "Rosca"
   - "Row" → "Remada"
   - "Fly/Flye" → "Crucifixo"
   - "Lunge" → "Avanço"
   - "Crunch" → "Abdominal"
   - "Plank" → "Prancha"
   - "Lat Pulldown" → "Puxada Alta"
   - "Cable" → "Polia"
   - "Leg Press" → "Leg Press" (mantém)
   - "Hack Squat" → "Hack Squat" (mantém)

2. Mantenha tom instrucional e profissional
3. Instruções devem ser claras e diretas
4. Preserve números e medidas
5. NÃO adicione informações que não existam no original

FORMATO DE RESPOSTA:
Retorne APENAS um JSON válido, sem markdown, sem explicações.`;

interface BatchTranslateRequest {
  exercises: Array<{
    id: string;
    name: string;
    instructions: string[];
    tips?: string[];
    overview?: string;
  }>;
}

interface BatchTranslateResponse {
  exercises: Array<{
    id: string;
    namePt: string;
    instructionsPt: string[];
    tipsPt?: string[];
    overviewPt?: string;
  }>;
}

async function translateBatchWithAI(
  batch: BatchTranslateRequest
): Promise<BatchTranslateResponse | null> {
  if (!CONFIG.openai.apiKey) {
    return null;
  }
  
  const userPrompt = `Traduza os seguintes exercícios para português brasileiro de academia:

${JSON.stringify(batch, null, 2)}

Retorne um JSON com a mesma estrutura, adicionando os campos traduzidos (namePt, instructionsPt, tipsPt, overviewPt).`;

  try {
    const response = await axios.post(
      `${CONFIG.openai.baseUrl}/chat/completions`,
      {
        model: CONFIG.openai.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.openai.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    
    const content = response.data.choices[0]?.message?.content;
    if (!content) return null;
    
    // Remove possíveis marcadores de código
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr) as BatchTranslateResponse;
    
    // VALIDAÇÃO DE SEGURANÇA: Verifica se todos os IDs batem
    const inputIds = new Set(batch.exercises.map(e => e.id));
    const outputIds = new Set(parsed.exercises.map(e => e.id));
    
    if (inputIds.size !== outputIds.size) {
      log.error(`Discrepância de IDs! Entrada: ${inputIds.size}, Saída: ${outputIds.size}`);
      return null;
    }
    
    for (const id of inputIds) {
      if (!outputIds.has(id)) {
        log.error(`ID ausente na resposta: ${id}`);
        return null;
      }
    }
    
    return parsed;
    
  } catch (error: any) {
    log.error(`Erro na API de tradução: ${error.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROCESSAMENTO
// ═══════════════════════════════════════════════════════════════════════════

function translateExerciseLocally(exercise: RawExercise): TranslatedExercise {
  return {
    ...exercise,
    namePt: translateWithDictionary(exercise.name),
    bodyPartsPt: translateArrayWithDictionary(exercise.bodyParts || []),
    targetMusclesPt: translateArrayWithDictionary(exercise.targetMuscles || []),
    equipmentsPt: translateArrayWithDictionary(exercise.equipments || []),
    secondaryMusclesPt: translateArrayWithDictionary(exercise.secondaryMuscles || []),
    instructionsPt: (exercise.instructions || []).map(i => translateWithDictionary(i)),
    exerciseTipsPt: exercise.exerciseTips?.map(t => translateWithDictionary(t)),
    variationsPt: exercise.variations?.map(v => translateWithDictionary(v)),
    keywordsPt: exercise.keywords?.map(k => translateWithDictionary(k)),
    overviewPt: exercise.overview ? translateWithDictionary(exercise.overview) : undefined,
    difficultyPt: exercise.difficulty ? translateWithDictionary(exercise.difficulty) : undefined
  };
}

async function processWithAI(
  exercises: RawExercise[],
  stats: TranslateStats
): Promise<Map<string, Partial<TranslatedExercise>>> {
  const aiTranslations = new Map<string, Partial<TranslatedExercise>>();
  
  if (!CONFIG.openai.apiKey) {
    log.warn('OPENAI_API_KEY não configurada. Usando apenas dicionário local.');
    return aiTranslations;
  }
  
  log.section('TRADUÇÃO COM IA (Lotes)');
  
  for (let i = 0; i < exercises.length; i += CONFIG.batchSize) {
    const batch = exercises.slice(i, i + CONFIG.batchSize);
    const batchNum = Math.floor(i / CONFIG.batchSize) + 1;
    const totalBatches = Math.ceil(exercises.length / CONFIG.batchSize);
    
    log.progress(batchNum, totalBatches, `Traduzindo lote de ${batch.length} exercícios...`);
    
    const request: BatchTranslateRequest = {
      exercises: batch.map(e => ({
        id: e.exerciseId,
        name: e.name,
        instructions: e.instructions || [],
        tips: e.exerciseTips,
        overview: e.overview
      }))
    };
    
    const response = await translateBatchWithAI(request);
    
    if (response) {
      for (const translated of response.exercises) {
        aiTranslations.set(translated.id, {
          namePt: translated.namePt,
          instructionsPt: translated.instructionsPt,
          exerciseTipsPt: translated.tipsPt,
          overviewPt: translated.overviewPt
        });
      }
      stats.batchesSent++;
      log.success(`  Lote ${batchNum} traduzido com sucesso`);
    } else {
      log.warn(`  Lote ${batchNum} falhou, usando dicionário local`);
    }
    
    await delay(CONFIG.delayBetweenBatches);
  }
  
  return aiTranslations;
}


// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏰 OPERAÇÃO FORTALEZA - FASE 3: INTELIGÊNCIA                ║');
  console.log('║  Tradução contextual com IA de Personal Trainer              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Cria diretórios
  Object.values(CONFIG.dirs).forEach(ensureDir);
  
  const stats: TranslateStats = {
    totalFiles: 0,
    translated: 0,
    skipped: 0,
    failed: 0,
    batchesSent: 0,
    errors: []
  };
  
  // Verifica diretório de entrada
  if (!fs.existsSync(CONFIG.dirs.rawJson)) {
    log.error(`Diretório de JSONs não encontrado: ${CONFIG.dirs.rawJson}`);
    log.info('Execute primeiro: npm run etl:extract');
    process.exit(1);
  }
  
  // Lista arquivos JSON
  const jsonFiles = fs.readdirSync(CONFIG.dirs.rawJson).filter((f: string) => f.endsWith('.json'));
  stats.totalFiles = jsonFiles.length;
  
  log.info(`${jsonFiles.length} arquivos JSON encontrados`);
  
  // Carrega todos os exercícios
  log.section('CARREGANDO EXERCÍCIOS');
  
  const toTranslate: RawExercise[] = [];
  
  for (const file of jsonFiles) {
    const inputPath = path.join(CONFIG.dirs.rawJson, file);
    const outputPath = path.join(CONFIG.dirs.translatedJson, file);
    
    // IDEMPOTÊNCIA: Se já existe traduzido, pula
    if (fileExists(outputPath)) {
      stats.skipped++;
      continue;
    }
    
    try {
      const content = fs.readFileSync(inputPath, 'utf-8');
      const exercise = JSON.parse(content) as RawExercise;
      toTranslate.push(exercise);
    } catch (error: any) {
      stats.failed++;
      stats.errors.push({ id: file, error: error.message });
    }
  }
  
  log.info(`${toTranslate.length} exercícios para traduzir`);
  log.info(`${stats.skipped} já traduzidos anteriormente`);
  
  if (toTranslate.length === 0) {
    log.success('Nenhum exercício novo para traduzir!');
    return;
  }
  
  // Tenta tradução com IA primeiro
  const aiTranslations = await processWithAI(toTranslate, stats);
  
  // Processa e salva cada exercício
  log.section('SALVANDO TRADUÇÕES');
  
  for (let i = 0; i < toTranslate.length; i++) {
    const exercise = toTranslate[i];
    const outputPath = path.join(CONFIG.dirs.translatedJson, `${exercise.exerciseId}.json`);
    
    try {
      // Começa com tradução local
      let translated = translateExerciseLocally(exercise);
      
      // Sobrescreve com tradução da IA se disponível
      const aiTranslation = aiTranslations.get(exercise.exerciseId);
      if (aiTranslation) {
        translated = {
          ...translated,
          ...aiTranslation
        };
      }
      
      // Salva arquivo traduzido
      fs.writeFileSync(outputPath, JSON.stringify(translated, null, 2));
      stats.translated++;
      
      if ((i + 1) % 100 === 0) {
        log.progress(i + 1, toTranslate.length, `Salvando traduções...`);
      }
      
    } catch (error: any) {
      stats.failed++;
      stats.errors.push({ id: exercise.exerciseId, error: error.message });
    }
  }
  
  // Relatório final
  log.section('RELATÓRIO DE TRADUÇÃO');
  
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 ESTATÍSTICAS DA TRADUÇÃO                                 ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  📁 Total de arquivos:  ${String(stats.totalFiles).padStart(6)}                           ║`);
  console.log(`║  ✅ Traduzidos:         ${String(stats.translated).padStart(6)}                           ║`);
  console.log(`║  ⏭️  Já existiam:        ${String(stats.skipped).padStart(6)}                           ║`);
  console.log(`║  ❌ Falhas:             ${String(stats.failed).padStart(6)}                           ║`);
  console.log(`║  🤖 Lotes com IA:       ${String(stats.batchesSent).padStart(6)}                           ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  // Salva erros se houver
  if (stats.errors.length > 0) {
    const errorsPath = path.join(CONFIG.dirs.logs, 'translate-errors.json');
    fs.writeFileSync(errorsPath, JSON.stringify(stats.errors, null, 2));
    log.warn(`${stats.errors.length} erros salvos em: ${errorsPath}`);
  }
  
  // Salva relatório
  const reportPath = path.join(CONFIG.dirs.logs, 'translate-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    stats,
    aiEnabled: !!CONFIG.openai.apiKey
  }, null, 2));
  
  log.success(`Relatório salvo em: ${reportPath}`);
  log.info('\nPróximo passo: npm run etl:load');
}

main().catch(error => {
  log.error(`Erro fatal: ${error.message}`);
  process.exit(1);
});
