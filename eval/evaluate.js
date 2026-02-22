/**
 * Avaliador de Qualidade do AgentPaul
 * Analisa conversas coletadas e gera relatório de métricas
 * 
 * Uso: node eval/evaluate.js
 * Requer: eval/data/conversations.json (gerado por collect-conversations.js)
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data', 'conversations.json');

// Carregar dados da TACO para validação de macros
let taco = null;
try {
  taco = require('../taco-database');
} catch (e) {
  console.log('⚠️ TACO não disponível para validação de macros');
}

function loadConversations() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error('❌ Arquivo não encontrado:', DATA_PATH);
    console.error('   Execute primeiro: node eval/collect-conversations.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}

// ==========================================
// MÉTRICAS DE AVALIAÇÃO
// ==========================================

/**
 * 1. Tom de Voz — respostas devem ser curtas e naturais
 */
function avaliarTomDeVoz(conversations) {
  const results = {
    total: 0,
    shortResponses: 0,     // < 50 palavras (ideal)
    mediumResponses: 0,    // 50-150 palavras (ok)
    longResponses: 0,      // > 150 palavras (ruim)
    avgWords: 0,
    excessiveEmojis: 0,    // > 3 emojis
    excessiveFormatting: 0, // muitos asteriscos
    examples: { good: [], bad: [] }
  };

  let totalWords = 0;

  for (const conv of conversations) {
    if (!conv.responseOut) continue;
    results.total++;

    const words = conv.responseOut.split(/\s+/).length;
    totalWords += words;

    if (words < 50) results.shortResponses++;
    else if (words <= 150) results.mediumResponses++;
    else {
      results.longResponses++;
      if (results.examples.bad.length < 3) {
        results.examples.bad.push({
          patient: conv.patientName,
          input: conv.messageIn?.substring(0, 60),
          responseWords: words,
          preview: conv.responseOut.substring(0, 100) + '...'
        });
      }
    }

    // Emojis excessivos
    const emojiCount = (conv.responseOut.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
    if (emojiCount > 3) results.excessiveEmojis++;

    // Formatação excessiva (muitos asteriscos)
    const asterisks = (conv.responseOut.match(/\*/g) || []).length;
    if (asterisks > 8) results.excessiveFormatting++;

    // Exemplos bons
    if (words < 30 && results.examples.good.length < 3) {
      results.examples.good.push({
        patient: conv.patientName,
        input: conv.messageIn?.substring(0, 60),
        responseWords: words,
        preview: conv.responseOut.substring(0, 100)
      });
    }
  }

  results.avgWords = results.total > 0 ? Math.round(totalWords / results.total) : 0;
  results.score = results.total > 0
    ? Math.round(((results.shortResponses + results.mediumResponses * 0.7) / results.total) * 100)
    : 0;

  return results;
}

/**
 * 2. Uso correto de Tools
 */
function avaliarUsoTools(conversations) {
  const results = {
    total: 0,
    withTools: 0,
    withoutTools: 0,
    toolFrequency: {},
    photoFlowCorrect: 0,   // foto → analisar_foto_refeicao
    photoFlowTotal: 0,
    confirmFlowCorrect: 0, // sim → registrar_refeicao
    confirmFlowTotal: 0,
    score: 0
  };

  for (const conv of conversations) {
    results.total++;

    const tools = conv.toolsCalled || [];
    if (tools.length > 0) {
      results.withTools++;
      for (const tool of tools) {
        results.toolFrequency[tool] = (results.toolFrequency[tool] || 0) + 1;
      }
    } else {
      results.withoutTools++;
    }

    // Photo flow check
    if (conv.hasImage || conv.flow === 'photo') {
      results.photoFlowTotal++;
      if (tools.includes('analisar_foto_refeicao')) {
        results.photoFlowCorrect++;
      }
    }

    // Confirmation flow check
    if (conv.flow === 'confirmation') {
      results.confirmFlowTotal++;
      if (tools.includes('registrar_refeicao') || tools.includes('confirmar_refeicao')) {
        results.confirmFlowCorrect++;
      }
    }
  }

  // Score: ponderado pela correctness dos fluxos
  let correctness = 1;
  if (results.photoFlowTotal > 0) {
    correctness *= results.photoFlowCorrect / results.photoFlowTotal;
  }
  if (results.confirmFlowTotal > 0) {
    correctness *= results.confirmFlowCorrect / results.confirmFlowTotal;
  }
  results.score = Math.round(correctness * 100);

  return results;
}

/**
 * 3. Performance (tempo de resposta)
 */
function avaliarPerformance(conversations) {
  const times = conversations.filter(c => c.elapsedMs > 0).map(c => c.elapsedMs);
  if (times.length === 0) return { score: 0, total: 0 };

  times.sort((a, b) => a - b);

  const results = {
    total: times.length,
    avgMs: Math.round(times.reduce((s, t) => s + t, 0) / times.length),
    medianMs: times[Math.floor(times.length / 2)],
    p95Ms: times[Math.floor(times.length * 0.95)],
    under1s: times.filter(t => t < 1000).length,
    under3s: times.filter(t => t < 3000).length,
    under5s: times.filter(t => t < 5000).length,
    over10s: times.filter(t => t > 10000).length,
    score: 0
  };

  // Score: % de respostas < 5s
  results.score = Math.round((results.under5s / times.length) * 100);

  return results;
}

/**
 * 4. Taxa de confirmação (primeira tentativa)
 */
function avaliarConfirmacao(conversations) {
  // Agrupa por conversationId para rastrear fluxos de confirmação
  const flows = {};
  for (const conv of conversations) {
    if (!conv.patientId) continue;
    
    const key = conv.patientId;
    if (!flows[key]) flows[key] = [];
    flows[key].push(conv);
  }

  let totalMeals = 0;
  let confirmedFirstTry = 0;
  let corrected = 0;
  let cancelled = 0;

  for (const convs of Object.values(flows)) {
    for (let i = 0; i < convs.length; i++) {
      const conv = convs[i];
      
      // Detecta início de fluxo de refeição
      if (conv.flow === 'photo' || (conv.toolsCalled || []).includes('preparar_refeicao')) {
        totalMeals++;
        
        // Verifica a próxima interação do mesmo paciente
        if (i + 1 < convs.length) {
          const next = convs[i + 1];
          if (next.flow === 'confirmation' || (next.toolsCalled || []).includes('confirmar_refeicao')) {
            confirmedFirstTry++;
          } else if ((next.toolsCalled || []).includes('corrigir_refeicao')) {
            corrected++;
          } else if ((next.toolsCalled || []).includes('cancelar_refeicao')) {
            cancelled++;
          }
        }
      }
    }
  }

  return {
    totalMeals,
    confirmedFirstTry,
    corrected,
    cancelled,
    firstTryRate: totalMeals > 0 ? Math.round((confirmedFirstTry / totalMeals) * 100) : 0,
    score: totalMeals > 0 ? Math.round((confirmedFirstTry / totalMeals) * 100) : 0
  };
}

/**
 * 5. Distribuição de fluxos
 */
function avaliarFluxos(conversations) {
  const distribution = {};
  for (const conv of conversations) {
    const flow = conv.flow || 'unknown';
    distribution[flow] = (distribution[flow] || 0) + 1;
  }
  return distribution;
}

// ==========================================
// GERAR RELATÓRIO
// ==========================================

function gerarRelatorio(data, metrics) {
  const { stats } = data;

  const report = `# Relatório de Avaliação — AgentPaul
  
> Gerado em: ${new Date().toISOString()}
> Período: ${stats.dateRange.start} → ${stats.dateRange.end}
> Total de conversas: ${stats.totalConversations}
> Total de pacientes: ${stats.totalPatients}

## Scores Gerais

| Métrica | Score | Detalhes |
|---------|-------|----------|
| 🗣️ Tom de Voz | ${metrics.tomDeVoz.score}/100 | Média ${metrics.tomDeVoz.avgWords} palavras/resposta |
| 🔧 Uso de Tools | ${metrics.usoTools.score}/100 | ${metrics.usoTools.withTools}/${metrics.usoTools.total} usaram tools |
| ⚡ Performance | ${metrics.performance.score}/100 | Mediana ${metrics.performance.medianMs}ms, P95 ${metrics.performance.p95Ms}ms |
| ✅ Confirmação | ${metrics.confirmacao.score}/100 | ${metrics.confirmacao.confirmedFirstTry}/${metrics.confirmacao.totalMeals} na 1ª tentativa |

**Score Geral: ${Math.round((metrics.tomDeVoz.score + metrics.usoTools.score + metrics.performance.score + metrics.confirmacao.score) / 4)}/100**

## Tom de Voz

- Respostas curtas (<50 palavras): ${metrics.tomDeVoz.shortResponses} (${Math.round(metrics.tomDeVoz.shortResponses/Math.max(1,metrics.tomDeVoz.total)*100)}%)
- Respostas médias (50-150): ${metrics.tomDeVoz.mediumResponses}
- Respostas longas (>150): ${metrics.tomDeVoz.longResponses} ⚠️
- Emojis excessivos: ${metrics.tomDeVoz.excessiveEmojis}
- Formatação excessiva: ${metrics.tomDeVoz.excessiveFormatting}

${metrics.tomDeVoz.examples.bad.length > 0 ? '### Exemplos de respostas longas (melhorar)\n' + metrics.tomDeVoz.examples.bad.map(e => `- **${e.patient}**: "${e.input}" → ${e.responseWords} palavras`).join('\n') : ''}

## Uso de Tools

| Tool | Frequência |
|------|-----------|
${Object.entries(metrics.usoTools.toolFrequency).sort((a, b) => b[1] - a[1]).map(([t, c]) => `| ${t} | ${c} |`).join('\n')}

- Fluxo foto correto: ${metrics.usoTools.photoFlowCorrect}/${metrics.usoTools.photoFlowTotal}
- Fluxo confirmação: ${metrics.usoTools.confirmFlowCorrect}/${metrics.usoTools.confirmFlowTotal}

## Performance

- Média: ${metrics.performance.avgMs}ms
- Mediana: ${metrics.performance.medianMs}ms
- P95: ${metrics.performance.p95Ms}ms
- Abaixo de 1s: ${metrics.performance.under1s} (${Math.round(metrics.performance.under1s/Math.max(1,metrics.performance.total)*100)}%)
- Abaixo de 3s: ${metrics.performance.under3s} (${Math.round(metrics.performance.under3s/Math.max(1,metrics.performance.total)*100)}%)
- Acima de 10s: ${metrics.performance.over10s} ⚠️

## Distribuição de Fluxos

| Fluxo | Contagem |
|-------|----------|
${Object.entries(metrics.fluxos).sort((a, b) => b[1] - a[1]).map(([f, c]) => `| ${f} | ${c} |`).join('\n')}

## Confirmação de Refeições

- Total de refeições: ${metrics.confirmacao.totalMeals}
- Confirmada 1ª tentativa: ${metrics.confirmacao.confirmedFirstTry} (${metrics.confirmacao.firstTryRate}%)
- Corrigidas: ${metrics.confirmacao.corrected}
- Canceladas: ${metrics.confirmacao.cancelled}
`;

  return report;
}

// ==========================================
// MAIN
// ==========================================

function main() {
  console.log('📊 Avaliando qualidade do AgentPaul...\n');

  const data = loadConversations();
  const conversations = data.conversations || [];

  if (conversations.length === 0) {
    console.log('⚠️ Nenhuma conversa encontrada. Execute collect-conversations.js primeiro.');
    process.exit(0);
  }

  console.log(`   📥 ${conversations.length} conversas carregadas`);

  const metrics = {
    tomDeVoz: avaliarTomDeVoz(conversations),
    usoTools: avaliarUsoTools(conversations),
    performance: avaliarPerformance(conversations),
    confirmacao: avaliarConfirmacao(conversations),
    fluxos: avaliarFluxos(conversations)
  };

  const overallScore = Math.round(
    (metrics.tomDeVoz.score + metrics.usoTools.score + metrics.performance.score + metrics.confirmacao.score) / 4
  );

  console.log('\n📊 RESULTADOS:');
  console.log(`   🗣️  Tom de Voz:     ${metrics.tomDeVoz.score}/100`);
  console.log(`   🔧 Uso de Tools:   ${metrics.usoTools.score}/100`);
  console.log(`   ⚡ Performance:    ${metrics.performance.score}/100`);
  console.log(`   ✅ Confirmação:    ${metrics.confirmacao.score}/100`);
  console.log(`   ─────────────────────`);
  console.log(`   🏆 SCORE GERAL:    ${overallScore}/100`);

  // Gerar relatório
  const report = gerarRelatorio(data, metrics);
  const reportPath = path.join(__dirname, 'data', 'report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Relatório salvo em: ${reportPath}`);

  // Salvar métricas JSON
  const metricsPath = path.join(__dirname, 'data', 'metrics.json');
  fs.writeFileSync(metricsPath, JSON.stringify({ timestamp: new Date().toISOString(), overallScore, metrics }, null, 2));
  console.log(`📊 Métricas JSON: ${metricsPath}`);
}

main();
