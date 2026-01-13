/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPERAÇÃO FORTALEZA - FASE 4: CARGA
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Persistência no banco de dados:
 * - Cruzamento de dados (texto + mídia)
 * - Mapeamento de caminhos para WebP otimizado
 * - Relatório de conclusão com auditoria
 * 
 * Uso: npm run etl:load
 */

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  dirs: {
    translatedJson: 'data/translated/json',
    optimizedMedia: 'data/optimized/media',
    logs: 'data/logs'
  },
  
  // Caminho base para servir as mídias (ajuste conforme seu servidor)
  mediaBaseUrl: process.env.MEDIA_BASE_URL || '/media/exercises',
  
  // Performance - processamento em lotes para o banco
  performance: {
    batchSize: 50,            // Insere 50 registros por transação
    pauseBetweenBatches: 100, // ms entre lotes (dar respiro ao banco)
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface TranslatedExercise {
  exerciseId: string;
  name: string;
  namePt?: string;
  // Suporta ambos formatos (singular e plural)
  bodyPart?: string;
  bodyParts?: string[];
  bodyPartPt?: string;
  bodyPartsPt?: string[];
  target?: string;
  targetMuscles?: string[];
  targetPt?: string;
  targetMusclesPt?: string[];
  equipment?: string;
  equipments?: string[];
  equipmentPt?: string;
  equipmentsPt?: string[];
  secondaryMuscles?: string[];
  secondaryMusclesPt?: string[];
  instructions?: string[];
  instructionsPt?: string[];
  exerciseTips?: string[];
  exerciseTipsPt?: string[];
  variations?: string[];
  variationsPt?: string[];
  keywords?: string[];
  keywordsPt?: string[];
  description?: string;
  descriptionPt?: string;
  overview?: string;
  overviewPt?: string;
  difficulty?: string;
  difficultyPt?: string;
  exerciseType?: string;
  category?: string;
  gifUrl?: string;
  videoUrl?: string;
  imageUrl?: string;
}

interface LoadStats {
  totalFiles: number;
  loaded: number;
  updated: number;
  skipped: number;
  incomplete: string[];
  errors: Array<{ id: string; error: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════════════

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
  }
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function getMediaPath(exerciseId: string): string | null {
  const webpPath = path.join(CONFIG.dirs.optimizedMedia, `${exerciseId}.webp`);
  
  if (fileExists(webpPath)) {
    return `${CONFIG.mediaBaseUrl}/${exerciseId}.webp`;
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CARGA NO BANCO
// ═══════════════════════════════════════════════════════════════════════════

async function loadExercise(
  exercise: TranslatedExercise,
  stats: LoadStats
): Promise<void> {
  const exerciseId = exercise.exerciseId;
  
  try {
    // CRUZAMENTO: Verifica se mídia otimizada existe
    const mediaPath = getMediaPath(exerciseId);
    
    if (!mediaPath) {
      stats.incomplete.push(exerciseId);
    }
    
    // Prepara dados para o banco - suporta ambos formatos (singular e plural)
    const bodyPartEn = exercise.bodyPart || exercise.bodyParts?.[0] || 'other';
    const bodyPart = exercise.bodyPartPt || exercise.bodyPartsPt?.[0] || bodyPartEn;
    
    const targetEn = exercise.target || exercise.targetMuscles?.[0] || 'other';
    const target = exercise.targetPt || exercise.targetMusclesPt?.[0] || targetEn;
    
    const equipmentEn = exercise.equipment || exercise.equipments?.[0] || 'body weight';
    const equipment = exercise.equipmentPt || exercise.equipmentsPt?.[0] || equipmentEn;
    
    // Nome traduzido
    const name = exercise.namePt || exercise.name;
    const nameEn = exercise.name;
    
    // Overview/Description
    const overview = exercise.overviewPt || exercise.descriptionPt || null;
    const overviewEn = exercise.overview || exercise.description || null;
    
    // Mapeia dificuldade
    const difficultyMap: Record<string, string> = {
      'beginner': 'iniciante',
      'intermediate': 'intermediário',
      'advanced': 'avançado',
      'expert': 'expert'
    };
    
    const difficultyEn = exercise.difficulty?.toLowerCase() || 'beginner';
    const difficulty = exercise.difficultyPt || difficultyMap[difficultyEn] || 'iniciante';
    
    // Músculos secundários
    const secondaryMusclesEn = exercise.secondaryMuscles || [];
    const secondaryMusclesPt = exercise.secondaryMusclesPt || [];
    
    // Instruções
    const instructionsEn = exercise.instructions || [];
    const instructionsPt = exercise.instructionsPt || [];
    
    // Verifica se já existe
    const existing = await prisma.exercise.findUnique({
      where: { id: exerciseId }
    });
    
    const exerciseData = {
      name,
      nameEn,
      bodyPart,
      bodyPartEn,
      target,
      targetEn,
      equipment,
      equipmentEn,
      gifUrl: mediaPath, // Aponta para WebP otimizado
      videoUrl: exercise.videoUrl || null,
      imageUrl: exercise.imageUrl || null,
      difficulty,
      category: exercise.category || exercise.exerciseType?.toLowerCase() || 'força',
      overview,
      overviewEn
    };
    
    if (existing) {
      // Atualiza registro existente - deleta relacionamentos e recria
      await prisma.$transaction([
        prisma.exerciseSecondaryMuscle.deleteMany({ where: { exerciseId } }),
        prisma.exerciseInstruction.deleteMany({ where: { exerciseId } }),
        prisma.exerciseTip.deleteMany({ where: { exerciseId } }),
        prisma.exerciseVariation.deleteMany({ where: { exerciseId } }),
        prisma.exerciseKeyword.deleteMany({ where: { exerciseId } }),
      ]);
      
      await prisma.exercise.update({
        where: { id: exerciseId },
        data: {
          ...exerciseData,
          secondaryMuscles: {
            create: secondaryMusclesEn.map((muscle, i) => ({
              muscle: secondaryMusclesPt[i] || muscle,
              muscleEn: muscle
            }))
          },
          instructions: {
            create: instructionsEn.map((instruction, i) => ({
              stepOrder: i + 1,
              instruction: instructionsPt[i] || instruction,
              instructionEn: instruction
            }))
          },
          tips: {
            create: (exercise.exerciseTips || []).map((tip, i) => ({
              tip: exercise.exerciseTipsPt?.[i] || tip,
              tipEn: tip
            }))
          },
          variations: {
            create: (exercise.variations || []).map((variation, i) => ({
              variation: exercise.variationsPt?.[i] || variation,
              variationEn: variation
            }))
          },
          keywords: {
            create: (exercise.keywords || []).map((keyword, i) => ({
              keyword: exercise.keywordsPt?.[i] || keyword,
              keywordEn: keyword
            }))
          }
        }
      });
      stats.updated++;
    } else {
      // Cria novo registro
      await prisma.exercise.create({
        data: {
          id: exerciseId,
          ...exerciseData,
          secondaryMuscles: {
            create: secondaryMusclesEn.map((muscle, i) => ({
              muscle: secondaryMusclesPt[i] || muscle,
              muscleEn: muscle
            }))
          },
          instructions: {
            create: instructionsEn.map((instruction, i) => ({
              stepOrder: i + 1,
              instruction: instructionsPt[i] || instruction,
              instructionEn: instruction
            }))
          },
          tips: {
            create: (exercise.exerciseTips || []).map((tip, i) => ({
              tip: exercise.exerciseTipsPt?.[i] || tip,
              tipEn: tip
            }))
          },
          variations: {
            create: (exercise.variations || []).map((variation, i) => ({
              variation: exercise.variationsPt?.[i] || variation,
              variationEn: variation
            }))
          },
          keywords: {
            create: (exercise.keywords || []).map((keyword, i) => ({
              keyword: exercise.keywordsPt?.[i] || keyword,
              keywordEn: keyword
            }))
          }
        }
      });
      stats.loaded++;
    }
    
  } catch (error: any) {
    stats.errors.push({ id: exerciseId, error: error.message });
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏰 OPERAÇÃO FORTALEZA - FASE 4: CARGA                       ║');
  console.log('║  Persistência no banco com validação cruzada                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Cria diretório de logs
  ensureDir(CONFIG.dirs.logs);
  
  const stats: LoadStats = {
    totalFiles: 0,
    loaded: 0,
    updated: 0,
    skipped: 0,
    incomplete: [],
    errors: []
  };
  
  // Verifica diretório de entrada
  if (!fs.existsSync(CONFIG.dirs.translatedJson)) {
    log.error(`Diretório de JSONs traduzidos não encontrado: ${CONFIG.dirs.translatedJson}`);
    log.info('Execute primeiro: npm run etl:translate');
    process.exit(1);
  }
  
  // Lista arquivos JSON traduzidos
  const jsonFiles = fs.readdirSync(CONFIG.dirs.translatedJson).filter(f => f.endsWith('.json'));
  stats.totalFiles = jsonFiles.length;
  
  log.info(`${jsonFiles.length} arquivos JSON traduzidos encontrados`);
  
  // Verifica diretório de mídia
  if (!fs.existsSync(CONFIG.dirs.optimizedMedia)) {
    log.warn(`Diretório de mídia otimizada não encontrado: ${CONFIG.dirs.optimizedMedia}`);
    log.info('Exercícios serão carregados sem mídia local');
  }
  
  // Processa em lotes
  log.section('CARREGANDO NO BANCO DE DADOS');
  
  for (let i = 0; i < jsonFiles.length; i++) {
    const file = jsonFiles[i];
    const filePath = path.join(CONFIG.dirs.translatedJson, file);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const exercise = JSON.parse(content) as TranslatedExercise;
      
      await loadExercise(exercise, stats);
      
      if ((i + 1) % 100 === 0) {
        log.progress(i + 1, jsonFiles.length, `Processando...`);
      }
      
    } catch (error: any) {
      const exerciseId = path.basename(file, '.json');
      stats.errors.push({ id: exerciseId, error: error.message });
    }
  }
  
  // Estatísticas do banco
  const dbStats = await prisma.exercise.aggregate({
    _count: { id: true }
  });
  
  const withMedia = await prisma.exercise.count({
    where: { gifUrl: { not: null } }
  });
  
  // Relatório final
  log.section('RELATÓRIO DE CARGA');
  
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 ESTATÍSTICAS DA CARGA                                    ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  📁 Arquivos processados: ${String(stats.totalFiles).padStart(5)}                          ║`);
  console.log(`║  ✅ Novos inseridos:      ${String(stats.loaded).padStart(5)}                          ║`);
  console.log(`║  🔄 Atualizados:          ${String(stats.updated).padStart(5)}                          ║`);
  console.log(`║  ❌ Erros:                ${String(stats.errors.length).padStart(5)}                          ║`);
  console.log(`║  ⚠️  Sem mídia local:      ${String(stats.incomplete.length).padStart(5)}                          ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  📊 ESTADO DO BANCO                                          ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  🏋️ Total de exercícios:  ${String(dbStats._count.id).padStart(5)}                          ║`);
  console.log(`║  🎬 Com mídia local:      ${String(withMedia).padStart(5)}                          ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  // Salva lista de incompletos para auditoria
  if (stats.incomplete.length > 0) {
    const incompletePath = path.join(CONFIG.dirs.logs, 'incomplete-exercises.json');
    fs.writeFileSync(incompletePath, JSON.stringify({
      timestamp: new Date().toISOString(),
      count: stats.incomplete.length,
      ids: stats.incomplete
    }, null, 2));
    log.warn(`${stats.incomplete.length} exercícios sem mídia listados em: ${incompletePath}`);
  }
  
  // Salva erros se houver
  if (stats.errors.length > 0) {
    const errorsPath = path.join(CONFIG.dirs.logs, 'load-errors.json');
    fs.writeFileSync(errorsPath, JSON.stringify(stats.errors, null, 2));
    log.warn(`${stats.errors.length} erros salvos em: ${errorsPath}`);
  }
  
  // Salva relatório completo
  const reportPath = path.join(CONFIG.dirs.logs, 'load-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    stats,
    database: {
      totalExercises: dbStats._count.id,
      withMedia
    }
  }, null, 2));
  
  log.success(`Relatório salvo em: ${reportPath}`);
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏰 OPERAÇÃO FORTALEZA CONCLUÍDA!                            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  log.info('Próximos passos:');
  log.info('  1. Verifique os logs em data/logs/');
  log.info('  2. Copie data/optimized/media/ para seu servidor de arquivos');
  log.info('  3. Configure MEDIA_BASE_URL no .env');
  log.info('  4. Inicie a API: npm run start:dev');
}

main()
  .catch(error => {
    log.error(`Erro fatal: ${error.message}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
