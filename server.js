/**
 * NutriBuddy Agent - Servidor Standalone
 * Versão 2.0 - Com rate limiting, logging e guardrails
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { NutriBuddyAgent } = require('./index');
const { logger } = require('./logger');
const { verificarEscalacao } = require('./tools');

const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// LOGS BUFFER (em memória - últimos 200 logs)
// ==========================================

const logsBuffer = [];
const MAX_LOGS = 200;

function addLog(level, category, message, metadata = {}) {
  const entry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    metadata
  };
  
  logsBuffer.push(entry);
  
  // Mantém apenas os últimos MAX_LOGS
  if (logsBuffer.length > MAX_LOGS) {
    logsBuffer.shift();
  }
  
  // Também loga no console
  console.log(`[${level.toUpperCase()}] [${category}] ${message}`, metadata);
  
  return entry;
}

// ==========================================
// RATE LIMITING (em memória - para produção use Redis)
// ==========================================

const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX = 15; // máximo 15 requests por minuto por paciente

function checkRateLimit(patientId) {
  const now = Date.now();
  const key = patientId || 'anonymous';
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  
  const record = rateLimitStore.get(key);
  
  // Reset se passou o tempo
  if (now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  
  // Incrementa
  record.count++;
  
  if (record.count > RATE_LIMIT_MAX) {
    logger.warn('Rate limit excedido', { patientId: key, count: record.count });
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((record.resetAt - now) / 1000) };
  }
  
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

// Limpa rate limit store periodicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

// ==========================================
// MIDDLEWARE
// ==========================================

// CORS configurado para o Dashboard
app.use(cors({
  origin: [
    'https://agent-paul-kohl.vercel.app',
    'https://agentpaul.vercel.app',
    /\.vercel\.app$/,
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Logging de requests
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const elapsed = Date.now() - start;
    logger.debug(`${req.method} ${req.path}`, { 
      status: res.statusCode, 
      elapsedMs: elapsed 
    });
  });
  
  next();
});

// ==========================================
// INSTÂNCIA DO AGENTE
// ==========================================

const agent = new NutriBuddyAgent({
  debug: process.env.DEBUG === 'true' || process.env.NODE_ENV !== 'production',
  model: process.env.AGENT_MODEL || 'gpt-4o',
  openaiKey: process.env.OPENAI_API_KEY
});

// ==========================================
// ROTAS
// ==========================================

/**
 * GET /health - Health check com teste de conectividade OpenAI
 */
app.get('/health', async (req, res) => {
  let openaiStatus = 'unknown';
  let openaiError = null;
  
  // Teste rápido de conectividade com OpenAI
  try {
    const testResponse = await agent.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5
    });
    openaiStatus = 'connected';
  } catch (error) {
    openaiStatus = 'error';
    openaiError = error.message;
    logger.error('Health check - OpenAI falhou', { error: error.message });
  }
  
  res.json({
    status: openaiStatus === 'connected' ? 'ok' : 'degraded',
    service: 'nutribuddy-agent',
    version: '2.0.0',
    model: process.env.AGENT_MODEL || 'gpt-4o',
    openai: {
      status: openaiStatus,
      error: openaiError
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * GET / - Info básica
 */
app.get('/', (req, res) => {
  res.json({
    name: 'NutriBuddy Agent',
    version: '2.0.0',
    description: 'Agente inteligente para processamento de mensagens',
    features: [
      'Análise de fotos de refeições',
      'Registro de macros',
      'Informações de restaurantes',
      'Guardrails de segurança',
      'Rate limiting',
      'Escalação para humano'
    ],
    endpoints: {
      health: 'GET /health',
      webhook: 'POST /webhook',
      test: 'POST /test',
      stats: 'GET /stats'
    }
  });
});

/**
 * GET /stats - Estatísticas básicas
 */
app.get('/stats', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    rateLimitEntries: rateLimitStore.size,
    logsCount: logsBuffer.length,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /diag - Diagnóstico completo (para troubleshooting)
 */
app.get('/diag', async (req, res) => {
  const diag = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      PORT: process.env.PORT || '3001',
      AGENT_MODEL: process.env.AGENT_MODEL || 'gpt-4o',
      DEBUG: process.env.DEBUG || 'false'
    },
    apiKey: {
      defined: !!process.env.OPENAI_API_KEY,
      length: process.env.OPENAI_API_KEY?.length || 0,
      startsWithSk: process.env.OPENAI_API_KEY?.trim().startsWith('sk-') || false,
      hasQuotes: /^["']|["']$/.test(process.env.OPENAI_API_KEY || ''),
      hasNewline: /\n/.test(process.env.OPENAI_API_KEY || ''),
      hasSpaces: process.env.OPENAI_API_KEY !== process.env.OPENAI_API_KEY?.trim()
    },
    connectivity: {
      openai: 'testing...'
    }
  };
  
  // Teste de conectividade
  try {
    const start = Date.now();
    await agent.openai.models.list();
    diag.connectivity.openai = `ok (${Date.now() - start}ms)`;
  } catch (error) {
    diag.connectivity.openai = `error: ${error.message}`;
  }
  
  res.json(diag);
});

/**
 * GET /logs - Retorna últimos logs
 */
app.get('/logs', (req, res) => {
  const { limit = 100, level, category } = req.query;
  
  let filtered = [...logsBuffer];
  
  // Filtrar por level
  if (level && level !== 'all') {
    filtered = filtered.filter(log => log.level === level);
  }
  
  // Filtrar por categoria
  if (category && category !== 'all') {
    filtered = filtered.filter(log => log.category === category);
  }
  
  // Retorna os mais recentes primeiro
  const result = filtered.slice(-Number(limit)).reverse();
  
  res.json({
    total: logsBuffer.length,
    filtered: result.length,
    logs: result
  });
});

/**
 * POST /webhook - Recebe mensagens do WhatsApp
 */
app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  const mensagem = req.body;
  
  try {
    // Log da mensagem recebida (buffer + console)
    addLog('info', 'webhook', '📥 Mensagem recebida', {
      messageId: mensagem.messageId,
      patientId: mensagem.patientId,
      patientName: mensagem.patientName,
      hasImage: mensagem.hasImage,
      hasAudio: mensagem.hasAudio,
      contentPreview: mensagem.content?.substring(0, 50)
    });

    // RATE LIMITING
    const rateCheck = checkRateLimit(mensagem.patientId);
    if (!rateCheck.allowed) {
      addLog('warn', 'rate_limit', '⚠️ Rate limit excedido', { patientId: mensagem.patientId });
      return res.status(429).json({
        error: 'Rate limit excedido',
        retryAfter: rateCheck.retryAfter
      });
    }

    // Valida se é mensagem de paciente
    if (mensagem.senderRole !== 'patient') {
      addLog('debug', 'webhook', '⏭️ Ignorando mensagem não-paciente', { role: mensagem.senderRole });
      return res.json({ 
        skipped: true, 
        reason: 'Mensagem não é de paciente' 
      });
    }

    // ========================================
    // VERIFICAÇÃO DE ASSINATURA (Status do Paciente)
    // ========================================
    if (mensagem.patientStatus && mensagem.patientStatus !== 'active') {
      addLog('warn', 'subscription', '⚠️ Paciente com assinatura inativa', {
        patientId: mensagem.patientId,
        status: mensagem.patientStatus
      });
      
      // Enviar mensagem de regularização
      try {
        const { executeTool } = require('./tools');
        await executeTool('enviar_mensagem_whatsapp', {
          conversationId: mensagem.conversationId,
          mensagem: `⚠️ Seu acesso ao NutriBuddy está pendente de regularização.

Para continuar registrando suas refeições e recebendo acompanhamento nutricional inteligente, regularize seu plano agora.

Acesse: https://nutribuddy.dog/regularizar?p=${mensagem.patientId}`
        }, mensagem);
      } catch (e) {
        console.error('Erro ao enviar mensagem de regularização:', e.message);
      }
      
      return res.json({
        success: false,
        blocked: true,
        reason: 'subscription_inactive',
        patientStatus: mensagem.patientStatus
      });
    }

    // ========================================
    // DETECÇÃO DE ONBOARDING (Primeiro Acesso)
    // ========================================
    if (mensagem.isFirstMessage || mensagem.requiresOnboarding) {
      addLog('info', 'onboarding', '👋 Novo paciente - iniciando onboarding', {
        patientId: mensagem.patientId,
        patientName: mensagem.patientName
      });
      
      // Mensagem de boas-vindas personalizada
      try {
        const { executeTool } = require('./tools');
        const nomeCompleto = mensagem.patientName || 'Paciente';
        const primeiroNome = nomeCompleto.split(' ')[0];
        
        await executeTool('enviar_mensagem_whatsapp', {
          conversationId: mensagem.conversationId,
          mensagem: `👋 Olá, ${primeiroNome}! Bem-vindo(a) ao NutriBuddy! 🥗

Sou seu assistente de nutrição inteligente. Estou aqui para te ajudar a:

📸 Registrar suas refeições (basta enviar uma foto!)
📊 Acompanhar seus macros diários
💪 Manter o foco na sua dieta

Para começar, basta me enviar uma foto da sua próxima refeição! 

Qualquer dúvida, é só perguntar. Vamos juntos! 🚀`
        }, mensagem);
        
        return res.json({
          success: true,
          onboarding: true,
          message: 'Mensagem de boas-vindas enviada'
        });
      } catch (e) {
        console.error('Erro ao enviar mensagem de onboarding:', e.message);
        // Continua mesmo se falhar o onboarding
      }
    }

    // PRÉ-VERIFICAÇÃO: Checar se precisa escalar antes de processar
    if (mensagem.content) {
      const escalacao = verificarEscalacao(mensagem.content);
      if (escalacao.escalar) {
        addLog('escalation', 'safety', '🚨 Escalação necessária', {
          patientId: mensagem.patientId,
          conversationId: mensagem.conversationId,
          motivo: escalacao.motivo,
          urgencia: 'alta'
        });
      }
    }

    // Processa com o agente
    addLog('info', 'agent', '🤖 Processando com agente...', { patientId: mensagem.patientId });
    const resultado = await agent.processar(mensagem);

    const elapsed = Date.now() - startTime;
    
    // Log da interação completa
    addLog('info', 'webhook', '✅ Resposta enviada', {
      messageId: mensagem.messageId,
      patientId: mensagem.patientId,
      iterations: resultado.iterations,
      success: resultado.success,
      elapsedMs: elapsed
    });

    res.json({
      success: resultado.success,
      messageId: mensagem.messageId,
      iterations: resultado.iterations,
      elapsedMs: elapsed
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    
    addLog('error', 'webhook', '❌ Erro no processamento', {
      messageId: mensagem?.messageId,
      patientId: mensagem?.patientId,
      error: error.message,
      elapsedMs: elapsed
    });

    // Tenta enviar mensagem de erro pro paciente
    try {
      if (mensagem?.conversationId) {
        const { executeTool } = require('./tools');
        await executeTool('enviar_mensagem_whatsapp', {
          conversationId: mensagem.conversationId,
          mensagem: '😅 Opa! Tive um probleminha técnico. Pode tentar novamente em alguns segundos?'
        }, mensagem);
      }
    } catch (sendError) {
      logger.error('Falha ao enviar mensagem de erro', { error: sendError.message });
    }

    res.status(500).json({
      success: false,
      error: error.message,
      elapsedMs: elapsed
    });
  }
});

/**
 * POST /test - Testa o agente sem afetar produção
 */
app.post('/test', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { mensagem, dryRun = true } = req.body;
    
    logger.info('Teste iniciado', { dryRun });
    
    if (!mensagem) {
      return res.status(400).json({ 
        error: 'Campo "mensagem" é obrigatório',
        exemplo: {
          mensagem: {
            messageId: 'test-001',
            conversationId: 'conv-abc',
            patientId: 'patient-xyz',
            patientName: 'Teste',
            senderRole: 'patient',
            content: 'Oi!',
            hasImage: false,
            hasAudio: false
          },
          dryRun: true
        }
      });
    }

    const resultado = await agent.processar({
      ...mensagem,
      _dryRun: dryRun
    });

    const elapsed = Date.now() - startTime;

    res.json({
      dryRun,
      elapsedMs: elapsed,
      resultado
    });

  } catch (error) {
    logger.error('Erro no teste', { error: error.message });
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

/**
 * POST /simulate - Simula uma conversa completa
 */
app.post('/simulate', async (req, res) => {
  try {
    const { patientId, patientName, messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Campo "messages" deve ser um array' });
    }

    const resultados = [];
    
    for (const msg of messages) {
      const mensagem = {
        messageId: `sim-${Date.now()}`,
        conversationId: `conv-sim-${patientId}`,
        patientId,
        patientName: patientName || 'Paciente Simulado',
        senderRole: 'patient',
        content: msg.content || '',
        hasImage: msg.hasImage || false,
        imageUrl: msg.imageUrl,
        hasAudio: msg.hasAudio || false,
        audioUrl: msg.audioUrl,
        _dryRun: true
      };

      const resultado = await agent.processar(mensagem);
      resultados.push({
        input: msg,
        output: resultado
      });
    }

    res.json({ resultados });
  } catch (error) {
    logger.error('Erro na simulação', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ERROR HANDLER GLOBAL
// ==========================================

app.use((err, req, res, next) => {
  logger.error('Erro não tratado', { 
    error: err.message, 
    stack: err.stack,
    path: req.path 
  });
  
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV !== 'production' ? err.message : undefined
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  logger.info('Servidor iniciado', { port: PORT, model: process.env.AGENT_MODEL || 'gpt-4o' });
  
  console.log(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║   🤖 NutriBuddy Agent v2.0.0                       ║
║                                                    ║
║   Status: ONLINE                                   ║
║   Port: ${PORT}                                        ║
║   Model: ${(process.env.AGENT_MODEL || 'gpt-4o').padEnd(41)}║
║   Debug: ${process.env.DEBUG === 'true' ? 'ON ' : 'OFF'}                                      ║
║                                                    ║
║   Segurança:                                       ║
║   • Rate Limiting: ${RATE_LIMIT_MAX} req/min                    ║
║   • Guardrails: ATIVO                              ║
║   • Logging: ATIVO                                 ║
║                                                    ║
║   Endpoints:                                       ║
║   • GET  /health  - Health check                   ║
║   • GET  /stats   - Estatísticas                   ║
║   • POST /webhook - Processa mensagens             ║
║   • POST /test    - Testa sem afetar produção      ║
║                                                    ║
╚════════════════════════════════════════════════════╝
  `);
});
