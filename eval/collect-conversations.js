/**
 * Coletor de Conversas do AgentPaul
 * Extrai logs tipo 'conversation' do backend e salva localmente
 * 
 * Uso: node eval/collect-conversations.js [--days 30] [--patient PATIENT_ID]
 * 
 * Requer: BACKEND_URL e WEBHOOK_SECRET no .env
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BACKEND_URL = process.env.BACKEND_URL || 'https://web-production-c9eaf.up.railway.app';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'nutribuddy-secret-2024';

const api = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Secret': WEBHOOK_SECRET
  },
  timeout: 30000
});

// Parse args
const args = process.argv.slice(2);
const daysBack = parseInt(args.find((_, i) => args[i - 1] === '--days') || '30');
const filterPatient = args.find((_, i) => args[i - 1] === '--patient') || null;

async function collectConversations() {
  console.log('📥 Coletando conversas do AgentPaul...');
  console.log(`   Backend: ${BACKEND_URL}`);
  console.log(`   Período: últimos ${daysBack} dias`);
  if (filterPatient) console.log(`   Paciente: ${filterPatient}`);

  const allConversations = [];
  const limit = 500;

  try {
    // Coleta via API de logs
    const params = { type: 'conversation', limit };
    if (filterPatient) params.patientId = filterPatient;

    const response = await api.get('/api/agent-logs', { params });
    const logs = response.data.logs || [];

    console.log(`   Logs brutos recebidos: ${logs.length}`);

    // Filtra por data
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    for (const log of logs) {
      const logDate = new Date(log.timestamp);
      if (logDate < cutoffDate) continue;

      allConversations.push({
        id: log.id,
        timestamp: log.timestamp,
        patientId: log.patientId,
        patientName: log.patientName || 'Desconhecido',
        messageIn: log.messageIn || '',
        responseOut: log.responseOut || '',
        flow: log.flow || 'unknown',
        hasImage: log.hasImage || false,
        hasAudio: log.hasAudio || false,
        toolsCalled: log.toolsCalled || [],
        iterations: log.iterations || 0,
        elapsedMs: log.elapsedMs || 0,
        model: log.model || 'unknown'
      });
    }

    // Também tenta endpoint de conversas
    try {
      const convResponse = await api.get('/api/agent-logs/conversations', { params: { limit: 200 } });
      const convs = convResponse.data.conversations || [];
      
      for (const conv of convs) {
        const exists = allConversations.some(c => c.id === conv.id);
        const convDate = new Date(conv.timestamp);
        if (!exists && convDate >= cutoffDate) {
          allConversations.push({
            id: conv.id,
            timestamp: conv.timestamp,
            patientId: conv.patientId,
            patientName: conv.patientName || 'Desconhecido',
            messageIn: conv.messageIn || '',
            responseOut: conv.responseOut || '',
            flow: conv.flow || 'unknown',
            hasImage: false,
            hasAudio: false,
            toolsCalled: [],
            iterations: 0,
            elapsedMs: conv.elapsedMs || 0,
            model: 'unknown'
          });
        }
      }
    } catch (e) {
      console.log('   ⚠️ Endpoint /conversations não disponível, usando apenas /agent-logs');
    }

  } catch (error) {
    console.error('❌ Erro ao coletar conversas:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data).substring(0, 200));
    }
    process.exit(1);
  }

  // Ordena por timestamp
  allConversations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Agrupa por paciente
  const byPatient = {};
  for (const conv of allConversations) {
    const key = conv.patientId || 'unknown';
    if (!byPatient[key]) {
      byPatient[key] = { name: conv.patientName, conversations: [] };
    }
    byPatient[key].conversations.push(conv);
  }

  // Estatísticas
  const stats = {
    totalConversations: allConversations.length,
    totalPatients: Object.keys(byPatient).length,
    dateRange: {
      start: allConversations[0]?.timestamp || 'N/A',
      end: allConversations[allConversations.length - 1]?.timestamp || 'N/A'
    },
    flowDistribution: {},
    avgResponseMs: 0
  };

  let totalMs = 0;
  for (const conv of allConversations) {
    stats.flowDistribution[conv.flow] = (stats.flowDistribution[conv.flow] || 0) + 1;
    totalMs += conv.elapsedMs;
  }
  stats.avgResponseMs = allConversations.length > 0 ? Math.round(totalMs / allConversations.length) : 0;

  // Salvar
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const output = {
    collected_at: new Date().toISOString(),
    stats,
    byPatient,
    conversations: allConversations
  };

  const outputPath = path.join(dataDir, 'conversations.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log('\n✅ Coleta concluída!');
  console.log(`   📊 ${stats.totalConversations} conversas de ${stats.totalPatients} pacientes`);
  console.log(`   📁 Salvo em: ${outputPath}`);
  console.log(`   ⏱️  Tempo médio de resposta: ${stats.avgResponseMs}ms`);
  console.log(`   📈 Distribuição por fluxo:`, stats.flowDistribution);
}

collectConversations();
