/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPERAÇÃO FORTALEZA - FASE 1: EXTRAÇÃO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Download inteligente com:
 * - Idempotência (retomada sem duplicação)
 * - Rate limiting (proteção contra bloqueio)
 * - Captura híbrida de mídia (GIF > MP4 > log de erro)
 * - Armazenamento bruto (dados originais intactos)
 * 
 * Uso: npm run etl:extract
 */

import axios, { AxiosError } from 'axios';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Diretórios de saída
  dirs: {
    rawJson: 'data/raw/json',
    rawMedia: 'data/raw/media',
    logs: 'data/logs'
  },
  
  // Rate limiting HUMANIZADO (delays variáveis para parecer natural)
  delays: {
    // Requisições de dados (JSON)
    dataMin: 800,              // Mínimo 0.8s
    dataMax: 2500,             // Máximo 2.5s
    
    // Downloads de mídia (mais lento, arquivos grandes)
    mediaMin: 1000,            // Mínimo 1s
    mediaMax: 4000,            // Máximo 4s
    
    // Pausas longas ocasionais (simula usuário distraído)
    longPauseChance: 0.05,     // 5% de chance
    longPauseMin: 5000,        // 5s
    longPauseMax: 15000,       // 15s
    
    // Rate limit e erros
    onRateLimit: 120000,       // 2min quando receber 429
    onError: 5000,             // 5s após erro
  },
  
  // API V1 (funciona com plano gratuito - ~1.300 exercícios)
  // Para V2 com vídeos (~11.000 exercícios), precisa do plano PRO ($29/mês)
  api: {
    // V1 - Gratuito
    baseUrl: 'https://exercisedb.p.rapidapi.com',
    headers: {
      'X-RapidAPI-Key': process.env.EXERCISEDB_API_KEY || '',
      'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
    },
    // Descomente abaixo para usar V2 (requer plano PRO)
    // baseUrl: 'https://exercisedb-api.p.rapidapi.com/api/v1',
    // headers: {
    //   'X-RapidAPI-Key': process.env.EXERCISEDB_API_KEY || '',
    //   'X-RapidAPI-Host': 'exercisedb-api.p.rapidapi.com'
    // }
  },
  
  // User-Agents rotativos (simula diferentes navegadores)
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ],
  
  // Limites
  batchSize: 50,
  maxRetries: 5,
  timeout: 60000
};

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

// Interface para API V1 (gratuita)
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

// Interface unificada para processamento interno
interface Exercise {
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
  gifUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  difficulty?: string;
  exerciseType?: string;
}

// Converte V1 para formato unificado
function convertV1ToUnified(v1: ExerciseV1): Exercise {
  return {
    exerciseId: v1.id,
    name: v1.name,
    bodyParts: [v1.bodyPart],
    targetMuscles: [v1.target],
    equipments: [v1.equipment],
    secondaryMuscles: v1.secondaryMuscles || [],
    instructions: v1.instructions || [],
    gifUrl: v1.gifUrl,
  };
}

interface ExtractionStats {
  totalFetched: number;
  totalSkipped: number;
  mediaDownloaded: number;
  mediaSkipped: number;
  mediaFailed: number;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════════════

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Delay humanizado com variação aleatória
async function humanDelay(min: number, max: number): Promise<void> {
  const randomDelay = Math.floor(Math.random() * (max - min + 1)) + min;
  await delay(randomDelay);
}

// Delay para requisições de dados (com chance de pausa longa)
async function dataDelay(): Promise<void> {
  // 5% de chance de pausa longa (simula usuário distraído)
  if (Math.random() < CONFIG.delays.longPauseChance) {
    const longPause = Math.floor(
      Math.random() * (CONFIG.delays.longPauseMax - CONFIG.delays.longPauseMin + 1)
    ) + CONFIG.delays.longPauseMin;
    log.info(`  ☕ Pausa natural de ${(longPause / 1000).toFixed(1)}s...`);
    await delay(longPause);
  }
  
  await humanDelay(CONFIG.delays.dataMin, CONFIG.delays.dataMax);
}

// Delay para downloads de mídia
async function mediaDelay(): Promise<void> {
  // 5% de chance de pausa longa
  if (Math.random() < CONFIG.delays.longPauseChance) {
    const longPause = Math.floor(
      Math.random() * (CONFIG.delays.longPauseMax - CONFIG.delays.longPauseMin + 1)
    ) + CONFIG.delays.longPauseMin;
    log.info(`  ☕ Pausa natural de ${(longPause / 1000).toFixed(1)}s...`);
    await delay(longPause);
  }
  
  await humanDelay(CONFIG.delays.mediaMin, CONFIG.delays.mediaMax);
}

// Seleciona User-Agent aleatório
function getRandomUserAgent(): string {
  return CONFIG.userAgents[Math.floor(Math.random() * CONFIG.userAgents.length)];
}

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

function appendToLog(logFile: string, content: string): void {
  const logPath = path.join(CONFIG.dirs.logs, logFile);
  fs.appendFileSync(logPath, `${new Date().toISOString()} - ${content}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE EXTRAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

async function fetchWithRetry<T>(
  url: string,
  retries = CONFIG.maxRetries
): Promise<T | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: {
          ...CONFIG.api.headers,
          'User-Agent': getRandomUserAgent(),
          'Accept': 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
        },
        timeout: CONFIG.timeout
      });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      
      // Rate limit - espera mais tempo
      if (axiosError.response?.status === 429) {
        const waitTime = CONFIG.delays.onRateLimit * attempt;
        log.warn(`Rate limit (429)! Aguardando ${waitTime / 1000}s antes de tentar novamente...`);
        appendToLog('rate-limits.log', `429 em ${url} - aguardando ${waitTime}ms`);
        await delay(waitTime);
        continue;
      }
      
      // Forbidden - API key inválida ou sem permissão
      if (axiosError.response?.status === 403) {
        log.error('API Key inválida ou sem permissão para V2 (403)');
        appendToLog('errors.log', `403 Forbidden em ${url}`);
        return null;
      }
      
      // Too Many Requests alternativo
      if (axiosError.response?.status === 503) {
        const waitTime = CONFIG.delays.onRateLimit * attempt;
        log.warn(`Serviço indisponível (503)! Aguardando ${waitTime / 1000}s...`);
        await delay(waitTime);
        continue;
      }
      
      // Última tentativa
      if (attempt === retries) {
        log.error(`Falha após ${retries} tentativas: ${axiosError.message}`);
        appendToLog('errors.log', `Falha em ${url}: ${axiosError.message}`);
        return null;
      }
      
      // Erro genérico - espera e tenta novamente
      const waitTime = CONFIG.delays.onError * attempt;
      log.warn(`Tentativa ${attempt}/${retries} falhou (${axiosError.message}), aguardando ${waitTime / 1000}s...`);
      await delay(waitTime);
    }
  }
  return null;
}

async function downloadMedia(
  url: string,
  outputPath: string,
  exerciseId: string
): Promise<boolean> {
  // IDEMPOTÊNCIA: Se já existe, pula
  if (fileExists(outputPath)) {
    return true;
  }
  
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000, // 2 minutos para downloads grandes
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'image/gif,image/webp,video/mp4,*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://exercisedb.io/',
      },
      maxRedirects: 5
    });
    
    // Verifica se recebeu dados
    if (!response.data || response.data.length === 0) {
      appendToLog('download-errors.log', `${exerciseId} - Resposta vazia de ${url}`);
      return false;
    }
    
    // Verifica tamanho mínimo (1KB)
    if (response.data.length < 1024) {
      appendToLog('download-errors.log', `${exerciseId} - Arquivo muito pequeno (${response.data.length} bytes)`);
      return false;
    }
    
    fs.writeFileSync(outputPath, response.data);
    return true;
    
  } catch (error: any) {
    appendToLog('download-errors.log', `${exerciseId} - ${error.message} - ${url}`);
    return false;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXTRAÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

async function fetchAllExercises(): Promise<Exercise[]> {
  log.section('FASE 1.1: Buscando lista de exercícios');
  
  const allExercises: Exercise[] = [];
  let offset = 0;
  
  while (true) {
    const url = `${CONFIG.api.baseUrl}/exercises?offset=${offset}&limit=${CONFIG.batchSize}`;
    log.info(`Buscando offset ${offset}...`);
    
    const response = await fetchWithRetry<ExerciseV1[]>(url);
    
    if (!response || response.length === 0) break;
    
    // Converte V1 para formato unificado
    const converted = response.map(convertV1ToUnified);
    allExercises.push(...converted);
    log.info(`  Total acumulado: ${allExercises.length} exercícios`);
    
    offset += CONFIG.batchSize;
    await dataDelay();
    
    // API V1 tem limite de ~1.300 exercícios
    if (allExercises.length >= 1500) break;
  }
  
  return allExercises;
}

async function saveExerciseJson(exercise: Exercise, stats: ExtractionStats): Promise<void> {
  const jsonPath = path.join(CONFIG.dirs.rawJson, `${exercise.exerciseId}.json`);
  
  // IDEMPOTÊNCIA: Se já existe, pula
  if (fileExists(jsonPath)) {
    stats.totalSkipped++;
    return;
  }
  
  // Salva JSON bruto (sem alterações)
  fs.writeFileSync(jsonPath, JSON.stringify(exercise, null, 2));
  stats.totalFetched++;
}

async function downloadExerciseMedia(
  exercise: Exercise,
  stats: ExtractionStats
): Promise<void> {
  const exerciseId = exercise.exerciseId;
  
  // Determina qual mídia baixar (hierarquia: GIF > MP4)
  let mediaUrl: string | null = null;
  let extension: string = '';
  
  if (exercise.gifUrl) {
    mediaUrl = exercise.gifUrl;
    extension = '.gif';
  } else if (exercise.videoUrl) {
    mediaUrl = exercise.videoUrl;
    extension = '.mp4';
  }
  
  if (!mediaUrl) {
    // Registra no log de mídia ausente
    appendToLog('missing-media.log', `${exerciseId} - ${exercise.name}`);
    stats.mediaFailed++;
    return;
  }
  
  const mediaPath = path.join(CONFIG.dirs.rawMedia, `${exerciseId}${extension}`);
  
  // IDEMPOTÊNCIA: Se já existe, pula
  if (fileExists(mediaPath)) {
    stats.mediaSkipped++;
    return;
  }
  
  const success = await downloadMedia(mediaUrl, mediaPath, exerciseId);
  
  if (success) {
    stats.mediaDownloaded++;
  } else {
    appendToLog('download-errors.log', `${exerciseId} - ${mediaUrl}`);
    stats.mediaFailed++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏰 OPERAÇÃO FORTALEZA - FASE 1: EXTRAÇÃO                    ║');
  console.log('║  Download inteligente com idempotência e rate limiting       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Valida API Key
  if (!process.env.EXERCISEDB_API_KEY) {
    log.error('EXERCISEDB_API_KEY não configurada!');
    log.info('Configure no arquivo .env e tente novamente.');
    process.exit(1);
  }
  
  // Cria diretórios
  Object.values(CONFIG.dirs).forEach(ensureDir);
  
  const stats: ExtractionStats = {
    totalFetched: 0,
    totalSkipped: 0,
    mediaDownloaded: 0,
    mediaSkipped: 0,
    mediaFailed: 0,
    errors: []
  };
  
  // FASE 1.1: Busca lista de exercícios
  const exercises = await fetchAllExercises();
  
  if (exercises.length === 0) {
    log.error('Nenhum exercício encontrado. Verifique sua API key e plano.');
    process.exit(1);
  }
  
  log.success(`${exercises.length} exercícios encontrados na API`);
  
  // FASE 1.2: Salva JSONs
  log.section('FASE 1.2: Salvando dados JSON');
  
  for (let i = 0; i < exercises.length; i++) {
    const exercise = exercises[i];
    await saveExerciseJson(exercise, stats);
    
    if ((i + 1) % 100 === 0) {
      log.progress(i + 1, exercises.length, `JSONs processados`);
    }
  }
  
  log.success(`JSONs: ${stats.totalFetched} novos, ${stats.totalSkipped} já existiam`);
  
  // FASE 1.3: Download de mídias
  log.section('FASE 1.3: Download de mídias (GIF/MP4)');
  
  for (let i = 0; i < exercises.length; i++) {
    const exercise = exercises[i];
    
    log.progress(i + 1, exercises.length, `"${exercise.name.substring(0, 40)}..."`);
    
    await downloadExerciseMedia(exercise, stats);
    await mediaDelay();
  }
  
  // Relatório final
  log.section('RELATÓRIO DE EXTRAÇÃO');
  
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 ESTATÍSTICAS DA EXTRAÇÃO                                 ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  📄 JSONs novos:        ${String(stats.totalFetched).padStart(6)}                           ║`);
  console.log(`║  📄 JSONs já existiam:  ${String(stats.totalSkipped).padStart(6)}                           ║`);
  console.log(`║  🎬 Mídias baixadas:    ${String(stats.mediaDownloaded).padStart(6)}                           ║`);
  console.log(`║  🎬 Mídias já existiam: ${String(stats.mediaSkipped).padStart(6)}                           ║`);
  console.log(`║  ⚠️  Mídias com erro:    ${String(stats.mediaFailed).padStart(6)}                           ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  // Salva relatório
  const reportPath = path.join(CONFIG.dirs.logs, 'extraction-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    stats,
    totalExercises: exercises.length
  }, null, 2));
  
  log.success(`Relatório salvo em: ${reportPath}`);
  log.info('\nPróximo passo: npm run etl:refine');
}

main().catch(error => {
  log.error(`Erro fatal: ${error.message}`);
  process.exit(1);
});
