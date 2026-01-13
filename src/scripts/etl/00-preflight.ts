/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPERAÇÃO FORTALEZA - FASE 0: PRE-FLIGHT CHECK
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Verificação completa antes de iniciar o pipeline:
 * - Valida API Key
 * - Testa conexão com a API
 * - Verifica ffmpeg instalado
 * - Verifica espaço em disco
 * - Cria estrutura de diretórios
 * 
 * Uso: npm run etl:check
 */

import axios from 'axios';
import { execSync } from 'child_process';
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

const API_CONFIG = {
  // API V1 (funciona com plano gratuito)
  baseUrl: 'https://exercisedb.p.rapidapi.com',
  headers: {
    'X-RapidAPI-Key': process.env.EXERCISEDB_API_KEY || '',
    'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════════════════

const log = {
  info: (msg: string) => console.log(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  warn: (msg: string) => console.log(`⚠️  ${msg}`),
  error: (msg: string) => console.log(`❌ ${msg}`),
  section: (title: string) => {
    console.log('\n' + '─'.repeat(50));
    console.log(`  ${title}`);
    console.log('─'.repeat(50));
  }
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICAÇÕES
// ═══════════════════════════════════════════════════════════════════════════

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  critical: boolean;
}

const checks: CheckResult[] = [];

function addCheck(name: string, passed: boolean, message: string, critical = true) {
  checks.push({ name, passed, message, critical });
  if (passed) {
    log.success(`${name}: ${message}`);
  } else if (critical) {
    log.error(`${name}: ${message}`);
  } else {
    log.warn(`${name}: ${message}`);
  }
}

// 1. Verificar API Key
function checkApiKey(): void {
  log.section('1. Verificando API Key');
  
  const apiKey = process.env.EXERCISEDB_API_KEY;
  
  if (!apiKey) {
    addCheck('API Key', false, 'EXERCISEDB_API_KEY não está configurada no .env');
    return;
  }
  
  if (apiKey.length < 20) {
    addCheck('API Key', false, 'API Key parece inválida (muito curta)');
    return;
  }
  
  addCheck('API Key', true, `Configurada (${apiKey.substring(0, 8)}...)`);
}

// 2. Testar conexão com API
async function checkApiConnection(): Promise<void> {
  log.section('2. Testando conexão com API');
  
  if (!process.env.EXERCISEDB_API_KEY) {
    addCheck('Conexão API', false, 'Não é possível testar sem API Key');
    return;
  }
  
  try {
    const response = await axios.get(`${API_CONFIG.baseUrl}/exercises?limit=1`, {
      headers: API_CONFIG.headers,
      timeout: 15000
    });
    
    if (response.status === 200) {
      const data = response.data;
      const count = Array.isArray(data) ? data.length : (data.exercises?.length || 0);
      addCheck('Conexão API', true, `API respondendo corretamente (${count} exercício(s) de teste)`);
    } else {
      addCheck('Conexão API', false, `Status inesperado: ${response.status}`);
    }
  } catch (error: any) {
    if (error.response?.status === 403) {
      addCheck('Conexão API', false, 'API Key inválida ou sem permissão (403 Forbidden)');
    } else if (error.response?.status === 429) {
      addCheck('Conexão API', false, 'Rate limit atingido (429). Aguarde alguns minutos.');
    } else {
      addCheck('Conexão API', false, `Erro: ${error.message}`);
    }
  }
}

// 3. Verificar ffmpeg
function checkFfmpeg(): void {
  log.section('3. Verificando ffmpeg');
  
  try {
    const version = execSync('ffmpeg -version', { encoding: 'utf-8' });
    const versionMatch = version.match(/ffmpeg version (\S+)/);
    const versionStr = versionMatch ? versionMatch[1] : 'desconhecida';
    addCheck('ffmpeg', true, `Instalado (versão ${versionStr})`);
  } catch {
    addCheck('ffmpeg', false, 'Não encontrado. Instale com: brew install ffmpeg', false);
  }
}

// 4. Verificar espaço em disco
function checkDiskSpace(): void {
  log.section('4. Verificando espaço em disco');
  
  try {
    // Estima espaço necessário: ~11.000 exercícios * ~2MB média = ~22GB
    const requiredSpace = 25 * 1024 * 1024 * 1024; // 25GB recomendado
    
    const dfOutput = execSync('df -k .', { encoding: 'utf-8' });
    const lines = dfOutput.trim().split('\n');
    const parts = lines[1].split(/\s+/);
    const availableKB = parseInt(parts[3], 10);
    const availableBytes = availableKB * 1024;
    
    if (availableBytes >= requiredSpace) {
      addCheck('Espaço em disco', true, `${formatBytes(availableBytes)} disponíveis (recomendado: 25GB)`);
    } else {
      addCheck('Espaço em disco', false, 
        `Apenas ${formatBytes(availableBytes)} disponíveis. Recomendado: 25GB para ~11.000 exercícios`, false);
    }
  } catch {
    addCheck('Espaço em disco', true, 'Não foi possível verificar (assumindo OK)', false);
  }
}

// 5. Criar estrutura de diretórios
function createDirectories(): void {
  log.section('5. Criando estrutura de diretórios');
  
  let created = 0;
  let existed = 0;
  
  for (const [name, dir] of Object.entries(DIRS)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created++;
    } else {
      existed++;
    }
  }
  
  addCheck('Diretórios', true, `${created} criados, ${existed} já existiam`);
}

// 6. Verificar estado atual (retomada)
function checkCurrentState(): void {
  log.section('6. Verificando estado atual (para retomada)');
  
  const jsonCount = fs.existsSync(DIRS.rawJson) 
    ? fs.readdirSync(DIRS.rawJson).filter(f => f.endsWith('.json')).length 
    : 0;
    
  const mediaCount = fs.existsSync(DIRS.rawMedia)
    ? fs.readdirSync(DIRS.rawMedia).filter(f => f.endsWith('.gif') || f.endsWith('.mp4')).length
    : 0;
    
  const webpCount = fs.existsSync(DIRS.optimizedMedia)
    ? fs.readdirSync(DIRS.optimizedMedia).filter(f => f.endsWith('.webp')).length
    : 0;
    
  const translatedCount = fs.existsSync(DIRS.translatedJson)
    ? fs.readdirSync(DIRS.translatedJson).filter(f => f.endsWith('.json')).length
    : 0;
  
  log.info(`  📄 JSONs brutos:      ${jsonCount}`);
  log.info(`  🎬 Mídias brutas:     ${mediaCount}`);
  log.info(`  🖼️  WebPs otimizados:  ${webpCount}`);
  log.info(`  🌐 JSONs traduzidos:  ${translatedCount}`);
  
  if (jsonCount > 0) {
    addCheck('Estado', true, `Pipeline pode ser retomado (${jsonCount} exercícios já baixados)`);
  } else {
    addCheck('Estado', true, 'Pipeline iniciará do zero');
  }
}

// 7. Verificar OpenAI (opcional)
function checkOpenAI(): void {
  log.section('7. Verificando OpenAI (opcional)');
  
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    addCheck('OpenAI', true, 'Não configurada. Tradução usará apenas dicionário local.', false);
  } else {
    addCheck('OpenAI', true, `Configurada (${apiKey.substring(0, 8)}...). Tradução com IA habilitada.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏰 OPERAÇÃO FORTALEZA - PRE-FLIGHT CHECK                    ║');
  console.log('║  Verificação completa antes de iniciar o pipeline            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  // Executa verificações
  checkApiKey();
  await checkApiConnection();
  checkFfmpeg();
  checkDiskSpace();
  createDirectories();
  checkCurrentState();
  checkOpenAI();
  
  // Resumo
  log.section('RESUMO');
  
  const criticalFailed = checks.filter(c => !c.passed && c.critical);
  const warnings = checks.filter(c => !c.passed && !c.critical);
  const passed = checks.filter(c => c.passed);
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 RESULTADO DA VERIFICAÇÃO                                 ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  ✅ Passou:           ${String(passed.length).padStart(3)}                                  ║`);
  console.log(`║  ⚠️  Avisos:           ${String(warnings.length).padStart(3)}                                  ║`);
  console.log(`║  ❌ Falhas críticas:  ${String(criticalFailed.length).padStart(3)}                                  ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  if (criticalFailed.length > 0) {
    console.log('\n❌ FALHAS CRÍTICAS QUE IMPEDEM A EXECUÇÃO:');
    criticalFailed.forEach(c => console.log(`   - ${c.name}: ${c.message}`));
    console.log('\n🔧 Corrija os problemas acima antes de continuar.\n');
    process.exit(1);
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  AVISOS (não impedem execução):');
    warnings.forEach(c => console.log(`   - ${c.name}: ${c.message}`));
  }
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ SISTEMA PRONTO PARA OPERAÇÃO FORTALEZA!                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');
  console.log('📋 Próximos passos:');
  console.log('   1. npm run etl:extract   → Baixar dados e mídias');
  console.log('   2. npm run etl:refine    → Converter para WebP');
  console.log('   3. npm run etl:translate → Traduzir para PT-BR');
  console.log('   4. npm run etl:load      → Carregar no banco');
  console.log('\n   Ou execute tudo: npm run etl:all\n');
}

main().catch(error => {
  log.error(`Erro fatal: ${error.message}`);
  process.exit(1);
});
