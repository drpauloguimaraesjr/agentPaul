/**
 * NutriBuddy Agent - Servidor Standalone
 * Versão 2.0 - Com rate limiting, logging e guardrails
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { NutriBuddyAgent } = require('./index');
const { logger } = require('./logger');
const { verificarEscalacao } = require('./tools');

const app = express();

// Servir arquivos estáticos (Dashboard)
app.use('/dashboard', express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 3001;

// Backend URL para enviar alertas
const BACKEND_URL = process.env.BACKEND_URL || 'https://web-production-c9eaf.up.railway.app';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'nutribuddy-secret-2024';

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
// ENVIAR ALERTAS PARA O BACKEND (Firestore)
// ==========================================

async function sendAlertToBackend(alertData) {
  try {
    await axios.post(`${BACKEND_URL}/api/n8n/system-alerts`, alertData, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': WEBHOOK_SECRET
      },
      timeout: 5000
    });
    console.log('✅ Alerta enviado ao backend:', alertData.type);
  } catch (error) {
    // Não falha se não conseguir enviar alerta
    console.error('⚠️ Falha ao enviar alerta (não bloqueante):', error.message);
  }
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
 * GET /health - Health check SEM gastar tokens OpenAI
 * Usa models.list() que é gratuito para verificar conectividade
 */
app.get('/health', async (req, res) => {
  let openaiStatus = 'unknown';
  let openaiError = null;
  
  // Teste de conectividade GRATUITO - busca 1 modelo só (não gasta tokens, logs mínimos)
  try {
    await agent.openai.models.retrieve('gpt-4o-mini');
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
    uptime: Math.floor(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
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
    dashboard: '/dashboard',
    features: [
      'Análise de fotos de refeições',
      'Registro de macros',
      'Informações de restaurantes',
      'Guardrails de segurança',
      'Rate limiting',
      'Escalação para humano'
    ],
    endpoints: {
      dashboard: 'GET /dashboard',
      health: 'GET /health',
      webhook: 'POST /webhook',
      test: 'POST /test',
      stats: 'GET /stats',
      logs: 'GET /logs',
      diag: 'GET /diag'
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
    await agent.openai.models.retrieve('gpt-4o-mini');
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

    // ==========================================
    // 🏗️ FLUXOS DETERMINÍSTICOS
    // O código controla o fluxo. GPT só é usado para inteligência.
    // ==========================================
    
    const { executeTool, toolImplementations } = require('./tools');
    const { buscarAnalisePendente, limparAnalisePendente, salvarAnalisePendente } = require('./firebase');
    const { normalizarMealType, detectarTipoRefeicaoPorHorario } = require('./tools').toolImplementations 
      ? { normalizarMealType: null, detectarTipoRefeicaoPorHorario: null } 
      : {};
    
    // Função auxiliar para detectar tipo de refeição pelo horário
    function detectarTipoRefeicao() {
      const hora = new Date().getHours();
      if (hora >= 5 && hora < 10) return 'cafe_manha';
      if (hora >= 10 && hora < 12) return 'lanche_manha';
      if (hora >= 12 && hora < 15) return 'almoco';
      if (hora >= 15 && hora < 18) return 'lanche_tarde';
      if (hora >= 18 && hora < 22) return 'jantar';
      return 'ceia';
    }

    // ==========================================
    // 📸 FLUXO 1: FOTO (determinístico)
    // Código analisa → salva → pede confirmação
    // Apenas 1 call GPT Vision (sem agent loop)
    // ==========================================
    if (mensagem.hasImage && mensagem.imageUrl) {
      addLog('info', 'photo-flow', '📸 Foto detectada - fluxo determinístico', {
        patientId: mensagem.patientId,
        imageUrl: mensagem.imageUrl?.substring(0, 50) + '...'
      });

      try {
        // 1. Enviar "Analisando..." imediatamente
        await executeTool('enviar_mensagem_whatsapp', {
          conversationId: mensagem.conversationId,
          mensagem: '🔍 *Analisando sua foto...*\n\n_Aguarde alguns segundos enquanto identifico os alimentos._'
        }, mensagem);

        // 2. Chamar GPT Vision diretamente (sem agent loop)
        const analise = await toolImplementations.analisar_foto_refeicao(
          { 
            imageUrl: mensagem.imageUrl,
            instrucaoExtra: mensagem.content || undefined
          }, 
          mensagem  // contexto com patientId e conversationId
        );

        // 3. Verificar se a análise retornou alimentos
        if (!analise.alimentos || analise.alimentos.length === 0) {
          await executeTool('enviar_mensagem_whatsapp', {
            conversationId: mensagem.conversationId,
            mensagem: '🤔 Não consegui identificar alimentos nessa foto.\n\nTente tirar a foto com melhor iluminação ou mais de perto! 📸'
          }, mensagem);
          
          return res.json({
            success: true, flow: 'photo', result: 'no_food_detected',
            elapsedMs: Date.now() - startTime
          });
        }

        // 4. Salvar análise como pendente (já feito dentro de analisar_foto_refeicao, mas garantir)
        const mealType = analise.mealType || detectarTipoRefeicao();
        const macros = analise.macros_totais || analise.alimentos.reduce(
          (t, a) => ({
            calorias: Math.round(t.calorias + (a.calorias || 0)),
            proteinas: Math.round((t.proteinas + (a.proteinas || 0)) * 10) / 10,
            carboidratos: Math.round((t.carboidratos + (a.carboidratos || 0)) * 10) / 10,
            gorduras: Math.round((t.gorduras + (a.gorduras || 0)) * 10) / 10,
          }),
          { calorias: 0, proteinas: 0, carboidratos: 0, gorduras: 0 }
        );

        // 5. Garantir que está salvo no Firebase
        try {
          await salvarAnalisePendente(mensagem.conversationId, {
            patientId: mensagem.patientId,
            mealType: mealType,
            alimentos: analise.alimentos,
            macrosTotais: macros,
            imageUrl: mensagem.imageUrl
          });
          addLog('info', 'photo-flow', '💾 Análise salva no Firebase', {
            conversationId: mensagem.conversationId,
            alimentos: analise.alimentos.length
          });
        } catch (saveErr) {
          addLog('error', 'photo-flow', '⚠️ Erro ao salvar pendente', { error: saveErr.message });
        }

        // 6. Montar e enviar mensagem de confirmação
        const alimentosFormatados = analise.alimentos.map(a => {
          const emoji = a.calorias > 200 ? '🍖' : a.proteinas > 10 ? '🥩' : '🥗';
          return `${emoji} ${a.nome} - ${a.peso}g (${a.calorias || 0} kcal)`;
        }).join('\n');

        const mensagemConfirmacao = `📋 *Vi aqui:*

${alimentosFormatados}

📊 *Total:* ~${macros.calorias} kcal | ${macros.proteinas}g prot | ${macros.carboidratos}g carbs | ${macros.gorduras}g gord

✅ *Confirma essa refeição?*
_Responda 'sim' para registrar ou me diz se quer corrigir algo!_

_(registro automático em 2 min se não responder)_`;

        await executeTool('enviar_mensagem_whatsapp', {
          conversationId: mensagem.conversationId,
          mensagem: mensagemConfirmacao
        }, mensagem);

        addLog('info', 'photo-flow', '✅ Foto analisada e confirmação enviada', {
          patientId: mensagem.patientId,
          alimentos: analise.alimentos.length,
          macros: macros,
          elapsedMs: Date.now() - startTime
        });

        return res.json({
          success: true, flow: 'photo', 
          alimentos: analise.alimentos.length,
          macros: macros,
          elapsedMs: Date.now() - startTime
        });

      } catch (photoError) {
        addLog('error', 'photo-flow', '❌ Erro na análise de foto', {
          error: photoError.message, patientId: mensagem.patientId
        });

        await executeTool('enviar_mensagem_whatsapp', {
          conversationId: mensagem.conversationId,
          mensagem: '😅 Tive um problema ao analisar a foto. Pode tentar enviar novamente?'
        }, mensagem).catch(() => {});

        return res.status(500).json({
          success: false, flow: 'photo', error: photoError.message,
          elapsedMs: Date.now() - startTime
        });
      }
    }

    // ==========================================
    // ✅ FLUXO 2: CONFIRMAÇÃO (determinístico)
    // Código busca pendente → registra → responde
    // Zero calls GPT
    // ==========================================
    if (mensagem.content && !mensagem.hasImage && !mensagem.hasAudio) {
      const msgLower = mensagem.content.toLowerCase().trim();
      
      // Palavras que indicam confirmação
      const PALAVRAS_CONFIRMACAO = [
        'sim', 'yes', 's', 'ok', 'confirmo', 'isso', 'correto', 
        'isso mesmo', 'confirma', 'pode registrar', 'pode', 
        'certo', 'exato', 'perfeito', 'isso aí', 'tá certo',
        'registra', 'salva', 'confirmar'
      ];
      
      const ehConfirmacao = msgLower.length <= 30 && PALAVRAS_CONFIRMACAO.some(palavra => 
        msgLower === palavra || 
        msgLower.startsWith(palavra + ' ') || 
        msgLower.startsWith(palavra + ',') ||
        msgLower.startsWith(palavra + '!')
      );
      
      if (ehConfirmacao) {
        addLog('info', 'confirm-flow', '🔍 Confirmação detectada', {
          patientId: mensagem.patientId,
          conversationId: mensagem.conversationId
        });
        
        const analisePendente = await buscarAnalisePendente(mensagem.conversationId);
        
        if (analisePendente && analisePendente.alimentos && analisePendente.alimentos.length > 0) {
          try {
            // Registrar a refeição
            const resultadoRegistro = await executeTool('registrar_refeicao', {
              patientId: analisePendente.patientId,
              conversationId: mensagem.conversationId,
              mealType: analisePendente.mealType || detectarTipoRefeicao(),
              alimentos: analisePendente.alimentos,
              imageUrl: analisePendente.imageUrl
            }, mensagem);
            
            // Limpar pendente
            await limparAnalisePendente(mensagem.conversationId);
            
            // Montar mensagem de sucesso
            const macros = analisePendente.macrosTotais || {};
            const tipoEmoji = {
              cafe_manha: '🌅', lanche_manha: '🍎', almoco: '☀️',
              lanche_tarde: '🍎', jantar: '🌙', ceia: '🌙'
            };
            const tipoNome = {
              cafe_manha: 'Café da manhã', lanche_manha: 'Lanche da manhã',
              almoco: 'Almoço', lanche_tarde: 'Lanche da tarde',
              jantar: 'Jantar', ceia: 'Ceia'
            };
            const tipo = analisePendente.mealType || 'almoco';
            
            await executeTool('enviar_mensagem_whatsapp', {
              conversationId: mensagem.conversationId,
              mensagem: `✅ ${tipoEmoji[tipo] || '🍽️'} ${tipoNome[tipo] || 'Refeição'} registrada com sucesso!\n\n📊 *Total registrado:*\n• 🔥 ${macros.calorias || 0} kcal\n• 🥩 ${macros.proteinas || 0}g proteína\n• 🍚 ${macros.carboidratos || 0}g carboidratos\n• 🥑 ${macros.gorduras || 0}g gorduras\n\n✨ Continue assim! Seu progresso está sendo acompanhado.\n\nSe algum peso estava errado, me avisa que eu corrijo! 😊`
            }, mensagem);
            
            addLog('info', 'confirm-flow', '✅ Refeição registrada na primeira confirmação!', {
              patientId: analisePendente.patientId,
              tipo: tipo,
              macros: macros
            });
            
            return res.json({
              success: true, flow: 'confirmation',
              autoConfirmation: true, elapsedMs: Date.now() - startTime
            });
            
          } catch (registroError) {
            addLog('error', 'confirm-flow', '❌ Erro ao registrar', {
              error: registroError.message
            });
            // Se falhar, deixa o agente tentar
          }
        } else {
          addLog('debug', 'confirm-flow', '⚠️ Confirmação sem pendente - enviando pro agente', {
            conversationId: mensagem.conversationId
          });
          // Sem pendente: cai pro agente inteligente ou interception abaixo
        }
      }
    }

    // ==========================================
    // ⚡ FLUXO 3: INTERCEPTAÇÃO (determinístico)
    // Emojis, cumprimentos, agradecimentos
    // Zero calls GPT
    // ==========================================
    if (mensagem.content && !mensagem.hasImage && !mensagem.hasAudio) {
      const msgLower = mensagem.content.toLowerCase().trim();
      
      // 3a. EMOJI PURO
      const EMOJI_REGEX = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\s]+$/u;
      if (EMOJI_REGEX.test(mensagem.content.trim())) {
        addLog('info', 'intercept', '😀 Emoji interceptado', { patientId: mensagem.patientId });
        return res.json({ success: true, flow: 'intercept', type: 'emoji', elapsedMs: Date.now() - startTime });
      }
      
      // 3b. AGRADECIMENTOS
      const AGRADECIMENTOS = [
        'obrigado', 'obrigada', 'obg', 'vlw', 'valeu', 'thanks', 
        'thank you', 'brigadão', 'brigado', 'brigada', 'muito obrigado',
        'muito obrigada', 'agradecido', 'agradecida', 'tmj', 'top',
        'show', 'massa', 'boa', 'ótimo', 'otimo', 'maravilha'
      ];
      if (msgLower.length <= 30 && AGRADECIMENTOS.some(a => 
        msgLower === a || msgLower === a + '!' || msgLower === a + '!!'
      )) {
        const respostas = [
          'De nada! 😊 Estou aqui sempre que precisar!',
          'Por nada! 💪 Continue firme na dieta!',
          'Disponha! 🥗 Se precisar de algo, é só chamar!',
          'Imagina! 😄 Qualquer coisa, manda uma foto da próxima refeição!'
        ];
        await executeTool('enviar_mensagem_whatsapp', {
          conversationId: mensagem.conversationId,
          mensagem: respostas[Math.floor(Math.random() * respostas.length)]
        }, mensagem);
        return res.json({ success: true, flow: 'intercept', type: 'agradecimento', elapsedMs: Date.now() - startTime });
      }
      
      // 3c. CUMPRIMENTOS
      const CUMPRIMENTOS = [
        'oi', 'olá', 'ola', 'hey', 'ei', 'eae', 'e aí', 'e ai',
        'bom dia', 'boa tarde', 'boa noite', 'hello', 'hi'
      ];
      if (msgLower.length <= 20 && CUMPRIMENTOS.some(c => 
        msgLower === c || msgLower === c + '!' || msgLower === c + '!!'
      )) {
        const hora = new Date().getHours();
        let saudacao = hora >= 5 && hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
        const nome = (mensagem.patientName || '').split(' ')[0] || '';
        
        await executeTool('enviar_mensagem_whatsapp', {
          conversationId: mensagem.conversationId,
          mensagem: `${saudacao}${nome ? ', ' + nome : ''}! 😊\n\nComo posso te ajudar?\n\n📸 Manda uma *foto da refeição* para eu analisar\n📝 Ou descreve o que comeu por texto\n❓ Também respondo dúvidas sobre nutrição!`
        }, mensagem);
        return res.json({ success: true, flow: 'intercept', type: 'cumprimento', elapsedMs: Date.now() - startTime });
      }
      
      // 3d. MENSAGENS MÍNIMAS
      if (msgLower.length <= 2 || msgLower === '.' || msgLower === '...' || msgLower === '?') {
        return res.json({ success: true, flow: 'intercept', type: 'minimal', elapsedMs: Date.now() - startTime });
      }
    }

    // ==========================================
    // 🧠 FLUXO 4: INTELIGENTE (usa GPT)
    // Somente para mensagens que PRECISAM de IA:
    // - Perguntas sobre nutrição
    // - Descrições de comida por texto
    // - Correções de registros
    // - Mensagens ambíguas
    // ==========================================
    addLog('info', 'agent', '🧠 Fluxo inteligente - processando com agente', { 
      patientId: mensagem.patientId,
      contentPreview: (mensagem.content || '').substring(0, 50)
    });
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

    // ========================================
    // ENVIAR ALERTA PARA O FRONTEND
    // ========================================
    sendAlertToBackend({
      type: 'agent_error',
      severity: 'high',
      title: 'Erro no AgentPaul',
      message: `Falha ao processar mensagem do paciente`,
      details: {
        error: error.message,
        patientId: mensagem?.patientId,
        patientName: mensagem?.patientName,
        conversationId: mensagem?.conversationId,
        messageId: mensagem?.messageId,
        elapsedMs: elapsed
      },
      link: mensagem?.conversationId ? `/conversations/${mensagem.conversationId}` : null,
      resolved: false
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
