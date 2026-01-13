import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mapeamento de traduções para equipamentos
const equipmentTranslations: Record<string, string> = {
  'assisted (towel)': 'assistido (toalha)',
  'dumbbell, exercise ball': 'halter e bola suíça',
  'dumbbell, exercise ball, tennis ball': 'halter, bola suíça e bola de tênis',
  'ez barbell, exercise ball': 'barra W e bola suíça',
  'halter (used as handles for deeper range)': 'halter (usado como apoio para maior amplitude)',
  'peso corporal (with resistance band)': 'peso corporal (com faixa elástica)',
  // Termos técnicos mantidos em inglês (uso comum no Brasil)
  // 'kettlebell': 'kettlebell',
  // 'medicine ball': 'medicine ball',
  // 'skierg': 'skierg',
  // 'smith': 'smith',
  // 'trap bar': 'trap bar',
};

// Mapeamento de traduções para bodyPart
const bodyPartTranslations: Record<string, string> = {
  // Adicione se necessário
};

// Mapeamento de traduções para target (termos de academia)
const targetTranslations: Record<string, string> = {
  'serrátil anterior': 'serrátil',
  'elevador da escápula': 'trapézio superior',
  'parte superior das costas': 'upper back',
  'posteriores da coxa': 'posterior de coxa',
  'sistema cardiovascular': 'cardio',
};

async function main() {
  console.log('🔍 Verificando equipamentos únicos...\n');
  
  const equipments = await prisma.exercise.groupBy({
    by: ['equipment'],
    _count: true,
    orderBy: { equipment: 'asc' }
  });
  
  console.log('📋 Equipamentos encontrados:');
  equipments.forEach(e => {
    const needsTranslation = equipmentTranslations[e.equipment];
    const status = needsTranslation ? `→ ${needsTranslation}` : '✓';
    console.log(`  ${e._count}x "${e.equipment}" ${status}`);
  });
  
  // Aplicar traduções
  console.log('\n🔄 Aplicando traduções...\n');
  
  for (const [original, translated] of Object.entries(equipmentTranslations)) {
    const result = await prisma.exercise.updateMany({
      where: { equipment: original },
      data: { equipment: translated }
    });
    if (result.count > 0) {
      console.log(`  ✅ "${original}" → "${translated}" (${result.count} exercícios)`);
    }
  }
  
  // Aplicar traduções de target
  console.log('\n🔄 Aplicando traduções de músculos alvo...\n');
  
  for (const [original, translated] of Object.entries(targetTranslations)) {
    const result = await prisma.exercise.updateMany({
      where: { target: original },
      data: { target: translated }
    });
    if (result.count > 0) {
      console.log(`  ✅ "${original}" → "${translated}" (${result.count} exercícios)`);
    }
  }
  
  // Verificar bodyParts
  console.log('\n🔍 Verificando partes do corpo...\n');
  const bodyParts = await prisma.exercise.groupBy({
    by: ['bodyPart'],
    _count: true,
    orderBy: { bodyPart: 'asc' }
  });
  
  console.log('📋 Partes do corpo:');
  bodyParts.forEach(b => console.log(`  ${b._count}x "${b.bodyPart}"`));
  
  // Verificar targets
  console.log('\n🔍 Verificando músculos alvo...\n');
  const targets = await prisma.exercise.groupBy({
    by: ['target'],
    _count: true,
    orderBy: { target: 'asc' }
  });
  
  console.log('📋 Músculos alvo:');
  targets.forEach(t => console.log(`  ${t._count}x "${t.target}"`));
  
  console.log('\n✅ Concluído!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
