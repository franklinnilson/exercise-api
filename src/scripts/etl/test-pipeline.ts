/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPERAÇÃO FORTALEZA - TESTE DO PIPELINE (2 exercícios)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Testa todo o fluxo com apenas 2 exercícios:
 * 1. Extrai 2 exercícios da API
 * 2. Converte GIFs para WebP
 * 3. Traduz para PT-BR
 * 4. Carrega no banco
 * 
 * Uso: npm run etl:test
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { execSync } from 'child_process';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  testLimit: 2, // Apenas 2 exercícios para teste
  
  dirs: {
    rawJson: 'data/raw/json',
    rawMedia: 'data/raw/media',
    optimizedMedia: 'data/optimized/media',
    translatedJson: 'data/translated/json',
    logs: 'data/logs'
  },
  
  api: {
    baseUrl: 'https://exercisedb.p.rapidapi.com',
    headers: {
      'X-RapidAPI-Key': process.env.EXERCISEDB_API_KEY || '',
      'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
    }
  },
  
  webp: {
    width: 400,
    quality: 75,
    fps: 15
  }
};

// Dicionário fitness simplificado para teste
const FITNESS_DICT: Record<string, string> = {
  'chest': 'peito',
  'back': 'costas',
  'shoulders': 'ombros',
  'upper arms': 'braços',
  'lower arms': 'antebraços',
  'upper legs': 'coxas',
  'lower legs': 'panturrilhas',
  'waist': 'abdômen',
  'cardio': 'cardio',
  'neck': 'pescoço',
  'barbell': 'barra',
  'dumbbell': 'halter',
  'body weight': 'peso corporal',
  'cable': 'polia',
  'machine': 'máquina',
  'pectorals': 'peitorais',
  'biceps': 'bíceps',
  'triceps': 'tríceps',
  'lats': 'dorsais',
  'delts': 'deltoides',
  'quads': 'quadríceps',
  'glutes': 'glúteos',
  'abs': 'abdominais',
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════════════

const log = {
  info: (msg: string) => console.log(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  warn: (msg: string) => console.log(`⚠️  ${msg}`),
  error: (msg: string) => console.log(`❌ ${msg}`),
  step: (num: number, msg: string) => console.log(`\n📌 PASSO ${num}: ${msg}\n${'─'.repeat(50)}`),
};

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function translate(text: string): string {
  const lower = text.toLowerCase();
  return FITNESS_DICT[lower] || text;
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 1: EXTRAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

interface ExerciseV1 {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  equipment: string;
  gifUrl: string;
  secondaryMuscles: string[];
  instructions: string[];
}

async function extractExercises(): Promise<ExerciseV1[]> {
  log.step(1, 'EXTRAÇÃO - Baixando 2 exercícios da API');
  
  const response = await axios.get(`${CONFIG.api.baseUrl}/exercises?limit=${CONFIG.testLimit}`, {
    headers: CONFIG.api.headers,
    timeout: 30000
  });
  
  const exercises = response.data as ExerciseV1[];
  log.success(`${exercises.length} exercícios baixados da API`);
  
  // Salva JSONs
  for (const ex of exercises) {
    const jsonPath = path.join(CONFIG.dirs.rawJson, `${ex.id}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(ex, null, 2));
    log.info(`  📄 Salvo: ${ex.id}.json - "${ex.name}"`);
  }
  
  // Baixa GIFs
  for (const ex of exercises) {
    if (ex.gifUrl) {
      const gifPath = path.join(CONFIG.dirs.rawMedia, `${ex.id}.gif`);
      
      try {
        const gifResponse = await axios.get(ex.gifUrl, {
          responseType: 'arraybuffer',
          timeout: 60000
        });
        fs.writeFileSync(gifPath, gifResponse.data);
        const sizeMB = (gifResponse.data.length / 1024 / 1024).toFixed(2);
        log.info(`  🎬 Baixado: ${ex.id}.gif (${sizeMB} MB)`);
      } catch (err: any) {
        log.warn(`  ⚠️ Falha ao baixar GIF: ${err.message}`);
      }
    }
  }
  
  return exercises;
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 2: REFINARIA
// ═══════════════════════════════════════════════════════════════════════════

async function refineMedia(): Promise<void> {
  log.step(2, 'REFINARIA - Convertendo GIFs para WebP');
  
  const files = fs.readdirSync(CONFIG.dirs.rawMedia).filter(f => f.endsWith('.gif'));
  
  for (const file of files) {
    const inputPath = path.join(CONFIG.dirs.rawMedia, file);
    const baseName = path.basename(file, '.gif');
    const outputPath = path.join(CONFIG.dirs.optimizedMedia, `${baseName}.webp`);
    
    const inputSize = fs.statSync(inputPath).size;
    
    try {
      const cmd = `ffmpeg -y -i "${inputPath}" -vf "scale=${CONFIG.webp.width}:-1:flags=lanczos,fps=${CONFIG.webp.fps}" -loop 0 -quality ${CONFIG.webp.quality} -preset default "${outputPath}" 2>/dev/null`;
      execSync(cmd, { timeout: 60000 });
      
      const outputSize = fs.statSync(outputPath).size;
      const reduction = ((1 - outputSize / inputSize) * 100).toFixed(1);
      
      log.success(`  🖼️ ${baseName}.webp - Redução: ${reduction}% (${(inputSize/1024).toFixed(0)}KB → ${(outputSize/1024).toFixed(0)}KB)`);
    } catch (err: any) {
      log.error(`  ❌ Falha ao converter ${file}: ${err.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 3: TRADUÇÃO
// ═══════════════════════════════════════════════════════════════════════════

interface TranslatedExercise {
  exerciseId: string;
  name: string;
  namePt: string;
  bodyPart: string;
  bodyPartPt: string;
  target: string;
  targetPt: string;
  equipment: string;
  equipmentPt: string;
  secondaryMuscles: string[];
  secondaryMusclesPt: string[];
  instructions: string[];
  instructionsPt: string[];
  gifUrl?: string;
}

async function translateExercises(): Promise<void> {
  log.step(3, 'TRADUÇÃO - Convertendo para PT-BR');
  
  const files = fs.readdirSync(CONFIG.dirs.rawJson).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const inputPath = path.join(CONFIG.dirs.rawJson, file);
    const content = fs.readFileSync(inputPath, 'utf-8');
    const ex = JSON.parse(content) as ExerciseV1;
    
    const translated: TranslatedExercise = {
      exerciseId: ex.id,
      name: ex.name,
      namePt: ex.name, // Nome mantém original por enquanto
      bodyPart: ex.bodyPart,
      bodyPartPt: translate(ex.bodyPart),
      target: ex.target,
      targetPt: translate(ex.target),
      equipment: ex.equipment,
      equipmentPt: translate(ex.equipment),
      secondaryMuscles: ex.secondaryMuscles || [],
      secondaryMusclesPt: (ex.secondaryMuscles || []).map(m => translate(m)),
      instructions: ex.instructions || [],
      instructionsPt: ex.instructions || [], // Instruções mantém original por enquanto
      gifUrl: ex.gifUrl
    };
    
    const outputPath = path.join(CONFIG.dirs.translatedJson, file);
    fs.writeFileSync(outputPath, JSON.stringify(translated, null, 2));
    
    log.success(`  🌐 ${ex.id}: "${ex.bodyPart}" → "${translated.bodyPartPt}"`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 4: CARGA NO BANCO
// ═══════════════════════════════════════════════════════════════════════════

async function loadToDatabase(): Promise<void> {
  log.step(4, 'CARGA - Inserindo no banco de dados');
  
  const files = fs.readdirSync(CONFIG.dirs.translatedJson).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const filePath = path.join(CONFIG.dirs.translatedJson, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const ex = JSON.parse(content) as TranslatedExercise;
    
    // Verifica se WebP existe
    const webpPath = path.join(CONFIG.dirs.optimizedMedia, `${ex.exerciseId}.webp`);
    const hasWebp = fs.existsSync(webpPath);
    
    try {
      await prisma.exercise.upsert({
        where: { id: ex.exerciseId },
        update: {
          name: ex.namePt,
          nameEn: ex.name,
          bodyPart: ex.bodyPartPt,
          bodyPartEn: ex.bodyPart,
          target: ex.targetPt,
          targetEn: ex.target,
          equipment: ex.equipmentPt,
          equipmentEn: ex.equipment,
          gifUrl: hasWebp ? `/media/exercises/${ex.exerciseId}.webp` : null,
        },
        create: {
          id: ex.exerciseId,
          name: ex.namePt,
          nameEn: ex.name,
          bodyPart: ex.bodyPartPt,
          bodyPartEn: ex.bodyPart,
          target: ex.targetPt,
          targetEn: ex.target,
          equipment: ex.equipmentPt,
          equipmentEn: ex.equipment,
          gifUrl: hasWebp ? `/media/exercises/${ex.exerciseId}.webp` : null,
          secondaryMuscles: {
            create: ex.secondaryMuscles.map((m, i) => ({
              muscle: ex.secondaryMusclesPt[i] || m,
              muscleEn: m
            }))
          },
          instructions: {
            create: ex.instructions.map((inst, i) => ({
              stepOrder: i + 1,
              instruction: ex.instructionsPt[i] || inst,
              instructionEn: inst
            }))
          }
        }
      });
      
      log.success(`  💾 ${ex.exerciseId}: "${ex.namePt}" inserido no banco`);
    } catch (err: any) {
      log.error(`  ❌ Erro ao inserir ${ex.exerciseId}: ${err.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICAÇÃO FINAL
// ═══════════════════════════════════════════════════════════════════════════

async function verifyResults(): Promise<void> {
  log.step(5, 'VERIFICAÇÃO - Conferindo resultados');
  
  // Conta arquivos
  const rawJsons = fs.readdirSync(CONFIG.dirs.rawJson).filter(f => f.endsWith('.json')).length;
  const rawMedia = fs.readdirSync(CONFIG.dirs.rawMedia).filter(f => f.endsWith('.gif')).length;
  const webps = fs.readdirSync(CONFIG.dirs.optimizedMedia).filter(f => f.endsWith('.webp')).length;
  const translated = fs.readdirSync(CONFIG.dirs.translatedJson).filter(f => f.endsWith('.json')).length;
  
  // Conta no banco
  const dbCount = await prisma.exercise.count();
  const dbWithMedia = await prisma.exercise.count({ where: { gifUrl: { not: null } } });
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 RESULTADO DO TESTE                                       ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  📄 JSONs brutos:       ${String(rawJsons).padStart(3)}                                 ║`);
  console.log(`║  🎬 GIFs baixados:      ${String(rawMedia).padStart(3)}                                 ║`);
  console.log(`║  🖼️  WebPs convertidos:  ${String(webps).padStart(3)}                                 ║`);
  console.log(`║  🌐 JSONs traduzidos:   ${String(translated).padStart(3)}                                 ║`);
  console.log(`║  💾 Registros no banco: ${String(dbCount).padStart(3)}                                 ║`);
  console.log(`║  🎬 Com mídia local:    ${String(dbWithMedia).padStart(3)}                                 ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  // Mostra exercícios do banco
  const exercises = await prisma.exercise.findMany({
    take: 5,
    include: {
      secondaryMuscles: true,
      instructions: { take: 2 }
    }
  });
  
  console.log('\n📋 Exercícios no banco:\n');
  for (const ex of exercises) {
    console.log(`  ID: ${ex.id}`);
    console.log(`  Nome: ${ex.name} (EN: ${ex.nameEn})`);
    console.log(`  Parte: ${ex.bodyPart} | Alvo: ${ex.target} | Equip: ${ex.equipment}`);
    console.log(`  Mídia: ${ex.gifUrl || 'N/A'}`);
    console.log(`  Músculos secundários: ${ex.secondaryMuscles.map(m => m.muscle).join(', ') || 'N/A'}`);
    console.log(`  Instruções: ${ex.instructions.length} passos`);
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🧪 TESTE DO PIPELINE - 2 EXERCÍCIOS                         ║');
  console.log('║  Validando todo o fluxo antes da execução completa           ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  // Cria diretórios
  Object.values(CONFIG.dirs).forEach(ensureDir);
  
  try {
    // Executa todas as fases
    await extractExercises();
    await refineMedia();
    await translateExercises();
    await loadToDatabase();
    await verifyResults();
    
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ TESTE CONCLUÍDO COM SUCESSO!                             ║');
    console.log('║                                                              ║');
    console.log('║  O pipeline está funcionando corretamente.                   ║');
    console.log('║  Você pode prosseguir com a extração completa.               ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n');
    
  } catch (error: any) {
    log.error(`\n❌ TESTE FALHOU: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
