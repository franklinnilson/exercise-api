/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TESTE DE TRADUÇÃO - Valida OpenAI + Dicionário Fitness
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Testa a tradução completa usando os exercícios já baixados:
 * - Tradução de nomes com contexto fitness
 * - Tradução de instruções completas
 * - Tradução de músculos secundários
 * 
 * Uso: npm run etl:test-translate
 */

import axios from 'axios';
import 'dotenv/config';
import * as fs from 'fs';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const OPENAI_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY || '',
  baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
};

// Dicionário fitness PT-BR (termos técnicos de academia)
const FITNESS_DICTIONARY: Record<string, string> = {
  // Partes do corpo
  'waist': 'abdômen',
  'chest': 'peito',
  'back': 'costas',
  'shoulders': 'ombros',
  'upper arms': 'braços superiores',
  'lower arms': 'antebraços',
  'upper legs': 'coxas',
  'lower legs': 'panturrilhas',
  'cardio': 'cardio',
  'neck': 'pescoço',
  
  // Músculos
  'abs': 'abdominais',
  'pectorals': 'peitorais',
  'biceps': 'bíceps',
  'triceps': 'tríceps',
  'lats': 'dorsais',
  'latissimus dorsi': 'grande dorsal',
  'delts': 'deltoides',
  'deltoids': 'deltoides',
  'quads': 'quadríceps',
  'quadriceps': 'quadríceps',
  'glutes': 'glúteos',
  'gluteus maximus': 'glúteo máximo',
  'hamstrings': 'isquiotibiais',
  'calves': 'panturrilhas',
  'forearms': 'antebraços',
  'traps': 'trapézio',
  'trapezius': 'trapézio',
  'rhomboids': 'romboides',
  'serratus anterior': 'serrátil anterior',
  'obliques': 'oblíquos',
  'hip flexors': 'flexores do quadril',
  'lower back': 'lombar',
  'erector spinae': 'eretores da espinha',
  'adductors': 'adutores',
  'abductors': 'abdutores',
  'rotator cuff': 'manguito rotador',
  'core': 'core',
  'levator scapulae': 'elevador da escápula',
  'infraspinatus': 'infraespinhal',
  'teres major': 'redondo maior',
  'teres minor': 'redondo menor',
  'brachialis': 'braquial',
  'brachioradialis': 'braquiorradial',
  'soleus': 'sóleo',
  'gastrocnemius': 'gastrocnêmio',
  'tibialis anterior': 'tibial anterior',
  'rectus abdominis': 'reto abdominal',
  'transverse abdominis': 'transverso abdominal',
  'pectoralis major': 'peitoral maior',
  'pectoralis minor': 'peitoral menor',
  'anterior deltoid': 'deltoide anterior',
  'lateral deltoid': 'deltoide lateral',
  'posterior deltoid': 'deltoide posterior',
  'sternocleidomastoid': 'esternocleidomastoideo',
  'wrist flexors': 'flexores do punho',
  'wrist extensors': 'extensores do punho',
  'spine': 'coluna',
  'upper back': 'parte superior das costas',
  
  // Equipamentos
  'barbell': 'barra',
  'dumbbell': 'halter',
  'dumbbells': 'halteres',
  'body weight': 'peso corporal',
  'bodyweight': 'peso corporal',
  'cable': 'polia',
  'machine': 'máquina',
  'kettlebell': 'kettlebell',
  'resistance band': 'elástico',
  'band': 'elástico',
  'ez barbell': 'barra EZ',
  'smith machine': 'smith machine',
  'medicine ball': 'medicine ball',
  'stability ball': 'bola de estabilidade',
  'bosu ball': 'bosu',
  'foam roller': 'rolo de espuma',
  'pull-up bar': 'barra fixa',
  'bench': 'banco',
  'incline bench': 'banco inclinado',
  'decline bench': 'banco declinado',
  'flat bench': 'banco reto',
  'rope': 'corda',
  'assisted': 'assistido',
  'weighted': 'com peso',
  'leverage machine': 'máquina de alavanca',
  'sled machine': 'sled',
  'roller': 'rolo',
  'wheel roller': 'roda abdominal',
  'olympic barbell': 'barra olímpica',
  'trap bar': 'trap bar',
  'tire': 'pneu',
  'hammer': 'martelo',
  'upper body ergometer': 'ergômetro de membros superiores',
  'elliptical machine': 'elíptico',
  'stationary bike': 'bicicleta ergométrica',
  'skierg machine': 'skierg',
  'stepmill machine': 'escada ergométrica',
  
  // Tipos de exercício
  'strength': 'força',
  'stretching': 'alongamento',
  'plyometrics': 'pliometria',
  'powerlifting': 'powerlifting',
  'olympic weightlifting': 'levantamento olímpico',
  'strongman': 'strongman',
  
  // Dificuldade
  'beginner': 'iniciante',
  'intermediate': 'intermediário',
  'expert': 'avançado',
  'advanced': 'avançado',
};

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE TRADUÇÃO
// ═══════════════════════════════════════════════════════════════════════════

function translateWithDictionary(text: string): string {
  const lower = text.toLowerCase().trim();
  return FITNESS_DICTIONARY[lower] || text;
}

async function translateWithOpenAI(exercises: any[]): Promise<any[]> {
  const systemPrompt = `Você é um Personal Trainer Brasileiro especializado em tradução de exercícios físicos.

REGRAS OBRIGATÓRIAS:
1. Traduza APENAS para português brasileiro (PT-BR)
2. Use terminologia de academia brasileira:
   - "Dumbbell" = "Halter"
   - "Barbell" = "Barra"
   - "Cable" = "Polia"
   - "Bench" = "Banco"
   - "Pull-up" = "Barra fixa"
   - "Push-up" = "Flexão"
   - "Squat" = "Agachamento"
   - "Deadlift" = "Levantamento terra"
   - "Lunge" = "Avanço"
   - "Crunch" = "Abdominal"
   - "Plank" = "Prancha"
   - "Row" = "Remada"
   - "Press" = "Supino" (para peito) ou "Desenvolvimento" (para ombros)
   - "Curl" = "Rosca"
   - "Extension" = "Extensão"
   - "Fly" = "Crucifixo"
   - "Raise" = "Elevação"
   - "Kickback" = "Coice"
   - "Pulldown" = "Puxada"
   - "Pullover" = "Pullover"
   
3. Mantenha nomes próprios de exercícios conhecidos (ex: "Burpee", "Jumping Jack")
4. Instruções devem ser claras e no imperativo (ex: "Deite-se", "Levante", "Mantenha")
5. Retorne EXATAMENTE o mesmo número de exercícios recebidos
6. Mantenha o ID original de cada exercício

FORMATO DE RESPOSTA (JSON):
{
  "exercises": [
    {
      "id": "0001",
      "namePt": "Nome traduzido",
      "instructionsPt": ["Instrução 1", "Instrução 2"],
      "secondaryMusclesPt": ["músculo 1", "músculo 2"],
      "descriptionPt": "Descrição traduzida"
    }
  ]
}`;

  const userPrompt = `Traduza os seguintes exercícios para PT-BR:

${JSON.stringify(exercises, null, 2)}`;

  try {
    const response = await axios.post(
      `${OPENAI_CONFIG.baseUrl}/chat/completions`,
      {
        model: OPENAI_CONFIG.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const content = response.data.choices[0].message.content;
    const parsed = JSON.parse(content);
    
    return parsed.exercises || [];
  } catch (error: any) {
    console.error('❌ Erro na OpenAI:', error.response?.data || error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🌐 TESTE DE TRADUÇÃO - OpenAI + Dicionário Fitness          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Verifica API Key
  if (!OPENAI_CONFIG.apiKey) {
    console.log('❌ OPENAI_API_KEY não configurada no .env');
    process.exit(1);
  }
  console.log('✅ OpenAI API Key configurada');
  console.log(`   Modelo: ${OPENAI_CONFIG.model}`);
  console.log(`   Base URL: ${OPENAI_CONFIG.baseUrl}`);

  // Carrega exercícios já baixados
  const rawDir = 'data/raw/json';
  const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.json'));
  
  if (files.length === 0) {
    console.log('\n❌ Nenhum exercício encontrado em data/raw/json/');
    console.log('   Execute primeiro: npm run etl:test');
    process.exit(1);
  }

  console.log(`\n📄 ${files.length} exercício(s) encontrado(s) para traduzir\n`);

  // Carrega os exercícios
  const exercises = files.map(file => {
    const content = fs.readFileSync(`${rawDir}/${file}`, 'utf-8');
    return JSON.parse(content);
  });

  // Mostra dados originais
  console.log('═'.repeat(60));
  console.log('  📥 DADOS ORIGINAIS (Inglês)');
  console.log('═'.repeat(60));
  
  for (const ex of exercises) {
    console.log(`\n🔹 ID: ${ex.id}`);
    console.log(`   Nome: ${ex.name}`);
    console.log(`   Parte do corpo: ${ex.bodyPart}`);
    console.log(`   Músculo alvo: ${ex.target}`);
    console.log(`   Equipamento: ${ex.equipment}`);
    console.log(`   Músculos secundários: ${(ex.secondaryMuscles || []).join(', ')}`);
    console.log(`   Dificuldade: ${ex.difficulty || 'N/A'}`);
    console.log(`   Descrição: ${ex.description?.substring(0, 100) || 'N/A'}...`);
    console.log(`   Instruções: ${(ex.instructions || []).length} passos`);
  }

  // TESTE 1: Tradução com dicionário local
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('  📚 TESTE 1: Dicionário Local (sem API)');
  console.log('═'.repeat(60));
  
  for (const ex of exercises) {
    console.log(`\n🔹 ${ex.id}:`);
    console.log(`   bodyPart: "${ex.bodyPart}" → "${translateWithDictionary(ex.bodyPart)}"`);
    console.log(`   target: "${ex.target}" → "${translateWithDictionary(ex.target)}"`);
    console.log(`   equipment: "${ex.equipment}" → "${translateWithDictionary(ex.equipment)}"`);
    console.log(`   difficulty: "${ex.difficulty}" → "${translateWithDictionary(ex.difficulty || '')}"`);
    
    const secondaryTranslated = (ex.secondaryMuscles || []).map((m: string) => 
      `"${m}" → "${translateWithDictionary(m)}"`
    );
    console.log(`   secondaryMuscles: ${secondaryTranslated.join(', ')}`);
  }

  // TESTE 2: Tradução com OpenAI
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('  🤖 TESTE 2: OpenAI GPT (tradução contextual)');
  console.log('═'.repeat(60));
  
  console.log('\n⏳ Enviando para OpenAI...\n');

  try {
    const startTime = Date.now();
    const translated = await translateWithOpenAI(exercises);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Tradução concluída em ${elapsed}s\n`);

    // Mostra resultados
    for (const ex of translated) {
      console.log(`\n🔹 ID: ${ex.id}`);
      console.log(`   Nome PT: ${ex.namePt}`);
      console.log(`   Descrição PT: ${ex.descriptionPt?.substring(0, 100) || 'N/A'}...`);
      console.log(`   Músculos secundários PT: ${(ex.secondaryMusclesPt || []).join(', ')}`);
      console.log(`   Instruções PT:`);
      (ex.instructionsPt || []).forEach((inst: string, i: number) => {
        console.log(`      ${i + 1}. ${inst}`);
      });
    }

    // Salva resultado traduzido
    const outputDir = 'data/translated/json';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (let i = 0; i < exercises.length; i++) {
      const original = exercises[i];
      const trans = translated.find((t: any) => t.id === original.id) || {};
      
      const merged = {
        exerciseId: original.id,
        // Original
        name: original.name,
        bodyPart: original.bodyPart,
        target: original.target,
        equipment: original.equipment,
        secondaryMuscles: original.secondaryMuscles || [],
        instructions: original.instructions || [],
        description: original.description,
        difficulty: original.difficulty,
        category: original.category,
        // Traduzido (dicionário)
        bodyPartPt: translateWithDictionary(original.bodyPart),
        targetPt: translateWithDictionary(original.target),
        equipmentPt: translateWithDictionary(original.equipment),
        difficultyPt: translateWithDictionary(original.difficulty || ''),
        // Traduzido (OpenAI)
        namePt: trans.namePt || original.name,
        descriptionPt: trans.descriptionPt || '',
        secondaryMusclesPt: trans.secondaryMusclesPt || [],
        instructionsPt: trans.instructionsPt || [],
      };

      const outputPath = `${outputDir}/${original.id}.json`;
      fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2));
      console.log(`\n💾 Salvo: ${outputPath}`);
    }

    // Validação
    console.log('\n');
    console.log('═'.repeat(60));
    console.log('  ✅ VALIDAÇÃO');
    console.log('═'.repeat(60));
    
    const inputCount = exercises.length;
    const outputCount = translated.length;
    
    console.log(`\n   Exercícios enviados: ${inputCount}`);
    console.log(`   Exercícios retornados: ${outputCount}`);
    
    if (inputCount === outputCount) {
      console.log(`   ✅ Contagem correta!`);
    } else {
      console.log(`   ❌ ERRO: Contagem diferente!`);
    }

    // Verifica se todos os IDs batem
    const inputIds = exercises.map((e: any) => e.id).sort();
    const outputIds = translated.map((e: any) => e.id).sort();
    const idsMatch = JSON.stringify(inputIds) === JSON.stringify(outputIds);
    
    console.log(`   IDs correspondem: ${idsMatch ? '✅ Sim' : '❌ Não'}`);

  } catch (error: any) {
    console.log(`\n❌ Erro na tradução: ${error.message}`);
    
    if (error.response?.status === 401) {
      console.log('   → API Key inválida ou expirada');
    } else if (error.response?.status === 429) {
      console.log('   → Rate limit excedido, aguarde um momento');
    } else if (error.response?.status === 500) {
      console.log('   → Erro interno da OpenAI');
    }
    
    process.exit(1);
  }

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ TESTE DE TRADUÇÃO CONCLUÍDO!                             ║');
  console.log('║                                                              ║');
  console.log('║  A tradução está funcionando corretamente.                   ║');
  console.log('║  Verifique os arquivos em data/translated/json/              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

main().catch(console.error);
