/**
 * Teste do pipeline de mídia (GIF → WebP)
 * 
 * Este script testa:
 * 1. Download de GIF de uma URL
 * 2. Conversão para WebP animado
 * 3. Verificação de integridade
 * 
 * Uso: npx ts-node src/scripts/etl/test-media-pipeline.ts
 */

import axios from 'axios';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

const TEST_DIR = 'data/test-media';
const TEST_GIFS = [
  {
    name: 'pushup',
    url: 'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif',
    description: 'Push-up animation'
  },
  {
    name: 'squat',
    url: 'https://media.giphy.com/media/xT9DPIBYf0pAviBLzO/giphy.gif',
    description: 'Squat animation'
  }
];

const CONFIG = {
  webp: {
    width: 400,
    quality: 75,
    fps: 15,
    loop: 0
  }
};

async function downloadGif(url: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`  📥 Baixando: ${url.substring(0, 50)}...`);
    
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    if (response.data.length < 1024) {
      console.log(`  ❌ Arquivo muito pequeno: ${response.data.length} bytes`);
      return false;
    }
    
    fs.writeFileSync(outputPath, response.data);
    const size = (response.data.length / 1024).toFixed(1);
    console.log(`  ✅ Download OK: ${size} KB`);
    return true;
    
  } catch (error: any) {
    console.log(`  ❌ Erro no download: ${error.message}`);
    return false;
  }
}

async function convertToWebP(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    console.log(`  🔄 Convertendo para WebP...`);
    
    const command = `ffmpeg -y -i "${inputPath}" -vf "scale=${CONFIG.webp.width}:-1:flags=lanczos,fps=${CONFIG.webp.fps}" -loop ${CONFIG.webp.loop} -quality ${CONFIG.webp.quality} -preset default "${outputPath}" 2>/dev/null`;
    
    await execAsync(command, { timeout: 60000 });
    
    // Verifica se arquivo foi criado
    if (!fs.existsSync(outputPath)) {
      console.log(`  ❌ Arquivo WebP não foi criado`);
      return false;
    }
    
    const inputSize = fs.statSync(inputPath).size;
    const outputSize = fs.statSync(outputPath).size;
    const reduction = ((1 - outputSize / inputSize) * 100).toFixed(1);
    
    console.log(`  ✅ Conversão OK: ${(inputSize/1024).toFixed(1)}KB → ${(outputSize/1024).toFixed(1)}KB (${reduction}% menor)`);
    return true;
    
  } catch (error: any) {
    console.log(`  ❌ Erro na conversão: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🎬 TESTE DO PIPELINE DE MÍDIA                               ║');
  console.log('║  Download GIF → Conversão WebP                               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Verifica ffmpeg
  try {
    await execAsync('ffmpeg -version');
    console.log('✅ ffmpeg encontrado\n');
  } catch {
    console.log('❌ ffmpeg não encontrado! Instale com: brew install ffmpeg');
    process.exit(1);
  }
  
  // Cria diretório de teste
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  
  let success = 0;
  let failed = 0;
  
  for (const test of TEST_GIFS) {
    console.log(`\n📋 Testando: ${test.name} (${test.description})`);
    console.log('─'.repeat(50));
    
    const gifPath = path.join(TEST_DIR, `${test.name}.gif`);
    const webpPath = path.join(TEST_DIR, `${test.name}.webp`);
    
    // Download
    const downloadOk = await downloadGif(test.url, gifPath);
    if (!downloadOk) {
      failed++;
      continue;
    }
    
    // Conversão
    const convertOk = await convertToWebP(gifPath, webpPath);
    if (!convertOk) {
      failed++;
      continue;
    }
    
    success++;
  }
  
  // Relatório
  console.log('\n');
  console.log('═'.repeat(50));
  console.log(`  📊 RESULTADO: ${success}/${TEST_GIFS.length} testes passaram`);
  console.log('═'.repeat(50));
  
  if (success === TEST_GIFS.length) {
    console.log('\n✅ Pipeline de mídia está 100% funcional!');
    console.log('\n📁 Arquivos gerados em:', TEST_DIR);
    
    // Lista arquivos
    const files = fs.readdirSync(TEST_DIR);
    for (const file of files) {
      const size = (fs.statSync(path.join(TEST_DIR, file)).size / 1024).toFixed(1);
      console.log(`   - ${file}: ${size} KB`);
    }
  } else {
    console.log(`\n⚠️  ${failed} teste(s) falharam`);
  }
  
  console.log('\n');
}

main().catch(console.error);
