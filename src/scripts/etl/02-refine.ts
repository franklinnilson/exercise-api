/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPERAÇÃO FORTALEZA - FASE 2: REFINARIA
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Otimização offline de mídias:
 * - Conversão para WebP animado (formato único)
 * - Processamento paralelo controlado (não trava a máquina)
 * - Pode rodar enquanto Fase 1 ainda está baixando
 * - Verificação de integridade
 * - Limpeza condicional
 * 
 * Dependências: ffmpeg (brew install ffmpeg)
 * 
 * Uso: npm run etl:refine
 */

import { exec, execSync } from 'child_process';
import 'dotenv/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  dirs: {
    rawMedia: 'data/raw/media',
    optimizedMedia: 'data/optimized/media',
    logs: 'data/logs'
  },
  
  // Configurações de conversão
  webp: {
    width: 400,           // Largura máxima (altura proporcional)
    quality: 75,          // Qualidade (0-100)
    fps: 15,              // Frames por segundo
    loop: 0               // 0 = loop infinito
  },
  
  // Performance - processamento paralelo controlado
  performance: {
    // Usa metade dos CPUs disponíveis para não travar a máquina
    maxConcurrent: Math.max(1, Math.floor(os.cpus().length / 2)),
    // Pausa entre lotes para dar respiro ao sistema
    batchPauseMs: 500,
    // Prioridade baixa para ffmpeg (nice)
    lowPriority: true
  },
  
  // Limites
  minFileSize: 1024,      // Mínimo 1KB para considerar válido
};

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface RefineStats {
  totalFiles: number;
  converted: number;
  skipped: number;
  failed: number;
  spaceSaved: number;
  errors: Array<{ file: string; error: string }>;
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
    log.info(`Diretório criado: ${dir}`);
  }
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function checkFfmpeg(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSÃO
// ═══════════════════════════════════════════════════════════════════════════

async function convertToWebP(
  inputPath: string,
  outputPath: string
): Promise<{ success: boolean; error?: string }> {
  const ext = path.extname(inputPath).toLowerCase();
  
  try {
    // Prefixo nice para baixa prioridade (não trava a máquina)
    const nicePrefix = CONFIG.performance.lowPriority ? 'nice -n 19 ' : '';
    
    let command: string;
    
    if (ext === '.gif') {
      // GIF para WebP animado
      command = `${nicePrefix}ffmpeg -y -i "${inputPath}" -vf "scale=${CONFIG.webp.width}:-1:flags=lanczos,fps=${CONFIG.webp.fps}" -loop ${CONFIG.webp.loop} -quality ${CONFIG.webp.quality} -preset default "${outputPath}" 2>/dev/null`;
    } else if (ext === '.mp4') {
      // MP4 para WebP animado (máximo 10s)
      command = `${nicePrefix}ffmpeg -y -i "${inputPath}" -vf "scale=${CONFIG.webp.width}:-1:flags=lanczos,fps=${CONFIG.webp.fps}" -loop ${CONFIG.webp.loop} -quality ${CONFIG.webp.quality} -preset default -t 10 "${outputPath}" 2>/dev/null`;
    } else {
      return { success: false, error: `Formato não suportado: ${ext}` };
    }
    
    await execAsync(command, { timeout: 120000 });
    
    // Verifica integridade do arquivo gerado
    const outputSize = getFileSize(outputPath);
    if (outputSize < CONFIG.minFileSize) {
      fs.unlinkSync(outputPath);
      return { success: false, error: 'Arquivo gerado muito pequeno ou corrompido' };
    }
    
    return { success: true };
    
  } catch (error: any) {
    // Remove arquivo parcial se existir
    if (fileExists(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    return { success: false, error: error.message };
  }
}

// Processa um lote de arquivos em paralelo
async function processBatch(
  files: string[],
  rawDir: string,
  optimizedDir: string,
  stats: RefineStats
): Promise<void> {
  const promises = files.map(async (file) => {
    const inputPath = path.join(rawDir, file);
    const baseName = path.basename(file, path.extname(file));
    const outputPath = path.join(optimizedDir, `${baseName}.webp`);
    
    // IDEMPOTÊNCIA: Se WebP já existe e é válido, pula
    if (fileExists(outputPath) && getFileSize(outputPath) >= CONFIG.minFileSize) {
      stats.skipped++;
      return;
    }
    
    const inputSize = getFileSize(inputPath);
    const result = await convertToWebP(inputPath, outputPath);
    
    if (result.success) {
      const outputSize = getFileSize(outputPath);
      const saved = inputSize - outputSize;
      stats.converted++;
      stats.spaceSaved += Math.max(0, saved);
    } else {
      stats.failed++;
      stats.errors.push({ file, error: result.error || 'Erro desconhecido' });
    }
  });
  
  await Promise.all(promises);
}


// ═══════════════════════════════════════════════════════════════════════════
// PROCESSAMENTO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function processMediaFiles(stats: RefineStats): Promise<void> {
  const rawDir = CONFIG.dirs.rawMedia;
  const optimizedDir = CONFIG.dirs.optimizedMedia;
  
  if (!fs.existsSync(rawDir)) {
    log.error(`Diretório de mídia bruta não encontrado: ${rawDir}`);
    log.info('Execute primeiro: npm run etl:extract');
    log.info('Ou aguarde a Fase 1 baixar alguns arquivos...');
    process.exit(1);
  }
  
  // Lista todos os arquivos de mídia
  const files = fs.readdirSync(rawDir).filter(f => 
    f.endsWith('.gif') || f.endsWith('.mp4')
  );
  
  stats.totalFiles = files.length;
  
  if (files.length === 0) {
    log.warn('Nenhum arquivo de mídia encontrado ainda.');
    log.info('A Fase 1 pode ainda estar baixando. Tente novamente em alguns minutos.');
    return;
  }
  
  log.info(`${files.length} arquivos de mídia encontrados`);
  log.info(`Processando em paralelo: ${CONFIG.performance.maxConcurrent} arquivos por vez`);
  log.info(`Prioridade baixa: ${CONFIG.performance.lowPriority ? 'SIM (não trava a máquina)' : 'NÃO'}`);
  
  // Processa em lotes paralelos
  const batchSize = CONFIG.performance.maxConcurrent;
  let processed = 0;
  
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    
    await processBatch(batch, rawDir, optimizedDir, stats);
    
    processed += batch.length;
    log.progress(processed, files.length, 
      `Convertidos: ${stats.converted} | Pulados: ${stats.skipped} | Erros: ${stats.failed}`);
    
    // Pausa entre lotes para dar respiro ao sistema
    if (i + batchSize < files.length) {
      await delay(CONFIG.performance.batchPauseMs);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LIMPEZA CONDICIONAL
// ═══════════════════════════════════════════════════════════════════════════

function cleanupOriginals(dryRun = true): { count: number; size: number } {
  const rawDir = CONFIG.dirs.rawMedia;
  const optimizedDir = CONFIG.dirs.optimizedMedia;
  
  let count = 0;
  let totalSize = 0;
  
  const rawFiles = fs.readdirSync(rawDir).filter(f => 
    f.endsWith('.gif') || f.endsWith('.mp4')
  );
  
  for (const file of rawFiles) {
    const baseName = path.basename(file, path.extname(file));
    const webpPath = path.join(optimizedDir, `${baseName}.webp`);
    const rawPath = path.join(rawDir, file);
    
    // Só remove se o WebP correspondente existe e é válido
    if (fileExists(webpPath) && getFileSize(webpPath) >= CONFIG.minFileSize) {
      const rawSize = getFileSize(rawPath);
      
      if (!dryRun) {
        fs.unlinkSync(rawPath);
      }
      
      count++;
      totalSize += rawSize;
    }
  }
  
  return { count, size: totalSize };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏰 OPERAÇÃO FORTALEZA - FASE 2: REFINARIA                   ║');
  console.log('║  Conversão para WebP animado otimizado                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Verifica ffmpeg
  if (!checkFfmpeg()) {
    log.error('ffmpeg não encontrado!');
    log.info('Instale com: brew install ffmpeg (macOS)');
    log.info('           : apt install ffmpeg (Ubuntu)');
    log.info('           : choco install ffmpeg (Windows)');
    process.exit(1);
  }
  
  log.success('ffmpeg encontrado');
  
  // Cria diretórios
  Object.values(CONFIG.dirs).forEach(ensureDir);
  
  const stats: RefineStats = {
    totalFiles: 0,
    converted: 0,
    skipped: 0,
    failed: 0,
    spaceSaved: 0,
    errors: []
  };
  
  // Processa arquivos
  log.section('CONVERSÃO PARA WEBP');
  await processMediaFiles(stats);
  
  // Verifica se deve limpar originais
  const shouldCleanup = process.argv.includes('--cleanup');
  
  if (shouldCleanup) {
    log.section('LIMPEZA DE ORIGINAIS');
    
    // Primeiro faz dry-run
    const preview = cleanupOriginals(true);
    log.info(`${preview.count} arquivos podem ser removidos (${formatBytes(preview.size)})`);
    
    // Executa limpeza
    const result = cleanupOriginals(false);
    log.success(`${result.count} arquivos removidos, ${formatBytes(result.size)} liberados`);
  }
  
  // Relatório final
  log.section('RELATÓRIO DE REFINARIA');
  
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 ESTATÍSTICAS DA REFINARIA                                ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  📁 Total de arquivos:  ${String(stats.totalFiles).padStart(6)}                           ║`);
  console.log(`║  ✅ Convertidos:        ${String(stats.converted).padStart(6)}                           ║`);
  console.log(`║  ⏭️  Já existiam:        ${String(stats.skipped).padStart(6)}                           ║`);
  console.log(`║  ❌ Falhas:             ${String(stats.failed).padStart(6)}                           ║`);
  console.log(`║  💾 Espaço economizado: ${formatBytes(stats.spaceSaved).padStart(10)}                       ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  // Salva erros se houver
  if (stats.errors.length > 0) {
    const errorsPath = path.join(CONFIG.dirs.logs, 'refine-errors.json');
    fs.writeFileSync(errorsPath, JSON.stringify(stats.errors, null, 2));
    log.warn(`${stats.errors.length} erros salvos em: ${errorsPath}`);
  }
  
  // Salva relatório
  const reportPath = path.join(CONFIG.dirs.logs, 'refine-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    stats,
    config: CONFIG.webp
  }, null, 2));
  
  log.success(`Relatório salvo em: ${reportPath}`);
  
  if (!shouldCleanup) {
    log.info('\n💡 Para limpar arquivos originais após verificar: npm run etl:refine -- --cleanup');
  }
  
  log.info('\nPróximo passo: npm run etl:translate');
}

main().catch(error => {
  log.error(`Erro fatal: ${error.message}`);
  process.exit(1);
});
