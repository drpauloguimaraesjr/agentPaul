/**
 * Preparador de Dados para Fine-tuning OpenAI
 * Converte conversas de alta qualidade para formato JSONL
 * 
 * Uso: node eval/prepare-finetune.js [--min-score 70]
 * Requer: eval/data/conversations.json (gerado por collect-conversations.js)
 * 
 * Formato de saída: JSONL compatível com OpenAI Fine-tuning API
 * {"messages": [{"role": "system", ...}, {"role": "user", ...}, {"role": "assistant", ...}]}
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data', 'conversations.json');
const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', 'prompts.js');

// Parse args
const args = process.argv.slice(2);
const minScore = parseInt(args.find((_, i) => args[i - 1] === '--min-score') || '0');
const maxResponseWords = parseInt(args.find((_, i) => args[i - 1] === '--max-words') || '150');

// Carregar system prompt
let systemPrompt = '';
try {
  const promptsModule = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
  const match = promptsModule.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
  if (match) {
    systemPrompt = match[1].trim();
  } else {
    systemPrompt = 'Você é o Paulo, nutricionista virtual do NutriBuddy. Responda de forma curta e natural.';
  }
} catch (e) {
  systemPrompt = 'Você é o Paulo, nutricionista virtual do NutriBuddy. Responda de forma curta e natural.';
}

// Truncar system prompt para economizar tokens no fine-tuning
const SYSTEM_PROMPT_SHORT = `Você é o Paulo, nutricionista virtual do NutriBuddy via WhatsApp.

Regras:
- Respostas CURTAS e naturais (como amigo)
- Use emojis com moderação (1-2 max)
- Para refeições: estime macros, peça confirmação, registre
- Para fotos: analise, estime, peça confirmação
- Prefira dados da Tabela TACO para alimentos naturais
- Não dê palestra, não seja robô
- Sem dieta prescrita = apenas registre (modo recordatório)
- Fora do escopo = "isso não é minha praia 😅"`;

function loadConversations() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error('❌ Arquivo não encontrado:', DATA_PATH);
    console.error('   Execute primeiro: node eval/collect-conversations.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}

/**
 * Filtra conversas de alta qualidade para fine-tuning
 */
function filterHighQuality(conversations) {
  return conversations.filter(conv => {
    // Deve ter input e output
    if (!conv.messageIn || !conv.responseOut) return false;
    
    // Input não pode ser vazio ou muito curto
    if (conv.messageIn.trim().length < 3) return false;
    
    // Resposta não pode ser muito longa
    const words = conv.responseOut.split(/\s+/).length;
    if (words > maxResponseWords) return false;
    
    // Resposta não pode ser erro
    if (conv.responseOut.includes('probleminha técnico') || 
        conv.responseOut.includes('Tive um problema')) return false;
    
    // Ignorar interceptações simples (emojis, cumprimentos)
    if (conv.flow === 'intercept' && conv.messageIn.length < 5) return false;
    
    // Ignorar respostas de rate limit
    if (conv.responseOut.includes('Rate limit')) return false;
    
    return true;
  });
}

/**
 * Converte conversa em formato OpenAI fine-tuning
 */
function toFineTuneFormat(conv) {
  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT_SHORT
    },
    {
      role: 'user',
      content: conv.messageIn
    },
    {
      role: 'assistant',
      content: conv.responseOut
    }
  ];

  return { messages };
}

/**
 * Agrupa conversas sequenciais do mesmo paciente em threads
 * (multi-turn para melhor fine-tuning)
 */
function groupIntoThreads(conversations, maxTurns = 4) {
  const threads = [];
  const byPatient = {};

  for (const conv of conversations) {
    const key = conv.patientId || 'unknown';
    if (!byPatient[key]) byPatient[key] = [];
    byPatient[key].push(conv);
  }

  for (const convs of Object.values(byPatient)) {
    // Ordena por timestamp
    convs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let currentThread = [];
    let lastTimestamp = null;

    for (const conv of convs) {
      const convTime = new Date(conv.timestamp);
      
      // Nova thread se > 30 min de gap ou > maxTurns
      if (lastTimestamp && (convTime - lastTimestamp > 30 * 60 * 1000 || currentThread.length >= maxTurns * 2)) {
        if (currentThread.length >= 2) {
          threads.push(currentThread);
        }
        currentThread = [];
      }

      if (conv.messageIn) {
        currentThread.push({ role: 'user', content: conv.messageIn });
      }
      if (conv.responseOut) {
        currentThread.push({ role: 'assistant', content: conv.responseOut });
      }
      lastTimestamp = convTime;
    }

    if (currentThread.length >= 2) {
      threads.push(currentThread);
    }
  }

  return threads;
}

// ==========================================
// MAIN
// ==========================================

function main() {
  console.log('🔧 Preparando dados para fine-tuning OpenAI...\n');

  const data = loadConversations();
  const conversations = data.conversations || [];

  console.log(`   📥 ${conversations.length} conversas carregadas`);

  // Filtrar alta qualidade
  const highQuality = filterHighQuality(conversations);
  console.log(`   ✅ ${highQuality.length} conversas de alta qualidade (${Math.round(highQuality.length/conversations.length*100)}%)`);

  if (highQuality.length < 10) {
    console.log('\n⚠️ Poucas conversas de qualidade. Recomendado mínimo de 10 para fine-tuning.');
    console.log('   Dica: colete mais conversas com collect-conversations.js --days 60');
  }

  // Método 1: Single-turn (1 pergunta → 1 resposta)
  const singleTurn = highQuality.map(toFineTuneFormat);
  
  // Método 2: Multi-turn (threads de até 4 turnos)
  const threads = groupIntoThreads(highQuality);
  const multiTurn = threads.map(thread => ({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT_SHORT },
      ...thread
    ]
  }));

  // Salvar single-turn JSONL
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const singlePath = path.join(dataDir, 'finetune-single.jsonl');
  const singleContent = singleTurn.map(entry => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(singlePath, singleContent);

  // Salvar multi-turn JSONL
  const multiPath = path.join(dataDir, 'finetune-multi.jsonl');
  const multiContent = multiTurn.map(entry => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(multiPath, multiContent);

  // Estatísticas
  const totalTokensEstimate = Math.round(singleContent.length / 4); // ~4 chars per token
  const estimatedCost = (totalTokensEstimate / 1000000 * 8).toFixed(2); // ~$8/1M tokens para gpt-4o-mini

  console.log('\n📊 RESULTADO:');
  console.log(`   📄 Single-turn: ${singleTurn.length} exemplos → ${singlePath}`);
  console.log(`   📄 Multi-turn:  ${multiTurn.length} threads → ${multiPath}`);
  console.log(`   📏 Tokens estimados: ~${totalTokensEstimate.toLocaleString()}`);
  console.log(`   💰 Custo estimado (gpt-4o-mini): ~$${estimatedCost}`);

  console.log(`\n📋 PRÓXIMOS PASSOS:`);
  console.log(`   1. Revise os arquivos JSONL para garantir qualidade`);
  console.log(`   2. Faça upload na OpenAI:`);
  console.log(`      openai api files.create -f ${singlePath} -p fine-tune`);
  console.log(`   3. Crie o fine-tuning job:`);
  console.log(`      openai api fine_tuning.jobs.create -t file-ID -m gpt-4o-mini-2024-07-18`);
  console.log(`   4. Monitore o progresso:`);
  console.log(`      openai api fine_tuning.jobs.list`);
  console.log(`\n   Ou via API:`);
  console.log(`   const openai = new OpenAI();`);
  console.log(`   const file = await openai.files.create({ file: fs.createReadStream('finetune-single.jsonl'), purpose: 'fine-tune' });`);
  console.log(`   const job = await openai.fineTuning.jobs.create({ training_file: file.id, model: 'gpt-4o-mini-2024-07-18' });`);
}

main();
