/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPERAÇÃO FORTALEZA - ORQUESTRADOR PARALELO
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Executa as fases em paralelo de forma inteligente:
 * - Fase 1 (Extract): Roda sozinha (depende da API externa)
 * - Fase 2 (Refine): Pode rodar enquanto Fase 1 ainda baixa
 * - Fase 3 (Translate): Pode rodar enquanto Fase 1 ainda baixa
 * - Fase 4 (Load): Só roda quando 2 e 3 terminarem
 * 
 * Uso: npm run etl:parallel
 */

import { ChildProcess, spawn } from 'child_process';
import 'dotenv/config';
import * as fs from 'fs';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const DIRS = {
  rawJson: 'data/raw/json',
  rawMedia: 'data/raw/media',
  optimizedMedia: 'data/optimized/media',
  translatedJson: 'data/translated/json',
  logs: 'data/logs'
};

const SCRIPTS = {
  extract: 'src/scripts/etl/01-extract.ts',
  refine: 'src/scripts/etl/02-refine.ts',
  translate: 'src/scripts/etl/03-translate.ts',
  load: 'src/scripts/etl/04-load.ts'
};

// Intervalo para verificar progresso (ms)
const CHECK_INTERVAL = 30000; // 30 segundos

// Mínimo de arquivos para iniciar fase paralela
const MIN_FILES_TO_START = 100;

// ═══════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════════════

const log = {
  info: (msg: string) => console.log(`ℹ️  [ORQUESTRADOR] ${msg}`),
  success: (msg: string) => console.log(`✅ [ORQUESTRADOR] ${msg}`),
  warn: (msg: string) => console.log(`⚠️  [ORQUESTRADOR] ${msg}`),
  error: (msg: string) => console.log(`❌ [ORQUESTRADOR] ${msg}`),
  phase: (phase: string, msg: string) => console.log(`🔄 [${phase.toUpperCase()}] ${msg}`)
};

function countFiles(dir: string, extension?: string): number {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir);
  if (extension) {
    return files.filter(f => f.endsWith(extension)).length;
  }
  return files.length;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUÇÃO DE PROCESSOS
// ═══════════════════════════════════════════════════════════════════════════

interface ProcessInfo {
  name: string;
  process: ChildProcess | null;
  running: boolean;
  completed: boolean;
  startTime?: Date;
  endTime?: Date;
}

const processes: Record<string, ProcessInfo> = {
  extract: { name: 'Extração', process: null, running: false, completed: false },
  refine: { name: 'Refinaria', process: null, running: false, completed: false },
  translate: { name: 'Tradução', process: null, running: false, completed: false },
  load: { name: 'Carga', process: null, running: false, completed: false }
};

function startProcess(key: string): void {
  const info = processes[key];
  if (info.running || info.completed) return;
  
  log.phase(key, `Iniciando ${info.name}...`);
  
  const proc = spawn('npx', ['ts-node', SCRIPTS[key as keyof typeof SCRIPTS]], {
    stdio: 'inherit',
    shell: true
  });
  
  info.process = proc;
  info.running = true;
  info.startTime = new Date();
  
  proc.on('exit', (code) => {
    info.running = false;
    info.completed = true;
    info.endTime = new Date();
    
    const duration = info.endTime.getTime() - (info.startTime?.getTime() || 0);
    const durationMin = Math.round(duration / 60000);
    
    if (code === 0) {
      log.success(`${info.name} concluída em ${durationMin} minutos`);
    } else {
      log.error(`${info.name} falhou com código ${code}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LÓGICA DE ORQUESTRAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

async function orchestrate(): Promise<void> {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏰 OPERAÇÃO FORTALEZA - MODO PARALELO                       ║');
  console.log('║  Execução inteligente com fases simultâneas                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Sempre inicia a extração primeiro
  startProcess('extract');
  
  // Loop de monitoramento
  while (true) {
    await delay(CHECK_INTERVAL);
    
    // Conta arquivos em cada diretório
    const rawJsonCount = countFiles(DIRS.rawJson, '.json');
    const rawMediaCount = countFiles(DIRS.rawMedia);
    const optimizedCount = countFiles(DIRS.optimizedMedia, '.webp');
    const translatedCount = countFiles(DIRS.translatedJson, '.json');
    
    log.info(`Status: JSONs=${rawJsonCount} | Mídias=${rawMediaCount} | WebPs=${optimizedCount} | Traduzidos=${translatedCount}`);
    
    // Inicia Refinaria quando tiver mídias suficientes
    if (!processes.refine.running && !processes.refine.completed) {
      if (rawMediaCount >= MIN_FILES_TO_START) {
        startProcess('refine');
      }
    }
    
    // Inicia Tradução quando tiver JSONs suficientes
    if (!processes.translate.running && !processes.translate.completed) {
      if (rawJsonCount >= MIN_FILES_TO_START) {
        startProcess('translate');
      }
    }
    
    // Inicia Carga quando Refinaria E Tradução terminarem
    if (!processes.load.running && !processes.load.completed) {
      if (processes.refine.completed && processes.translate.completed) {
        startProcess('load');
      }
    }
    
    // Verifica se tudo terminou
    const allCompleted = Object.values(processes).every(p => p.completed);
    if (allCompleted) {
      break;
    }
    
    // Se extração terminou mas outras não iniciaram, inicia mesmo assim
    if (processes.extract.completed) {
      if (!processes.refine.running && !processes.refine.completed && rawMediaCount > 0) {
        startProcess('refine');
      }
      if (!processes.translate.running && !processes.translate.completed && rawJsonCount > 0) {
        startProcess('translate');
      }
    }
  }
  
  // Relatório final
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏰 OPERAÇÃO FORTALEZA CONCLUÍDA!                            ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  for (const [key, info] of Object.entries(processes)) {
    const duration = (info.endTime?.getTime() || 0) - (info.startTime?.getTime() || 0);
    const durationMin = Math.round(duration / 60000);
    const status = info.completed ? '✅' : '❌';
    console.log(`║  ${status} ${info.name.padEnd(12)} ${String(durationMin).padStart(4)} min                          ║`);
  }
  
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

orchestrate().catch(error => {
  log.error(`Erro fatal: ${error.message}`);
  process.exit(1);
});
