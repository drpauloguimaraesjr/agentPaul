/**
 * NutriBuddy Agent - MVP
 * Versão 4.0 - Com confirmação de refeição e auto-registro
 */

const OpenAI = require('openai');
const { tools, executeTool, verificarEscalacao } = require('./tools');
const { SYSTEM_PROMPT } = require('./prompts');
const { logger } = require('./logger');
const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'https://web-production-c9eaf.up.railway.app';

class NutriBuddyAgent {
  constructor(config = {}) {
    // Limpa a API key (remove aspas, espaços, quebras de linha)
    const rawKey = config.openaiKey || process.env.OPENAI_API_KEY || '';
    const cleanKey = rawKey.trim().replace(/^["']|["']$/g, '').replace(/\n/g, '');
    
    // Valida a key
    if (!cleanKey) {
      logger.error('OPENAI_API_KEY não definida!');
      throw new Error('OPENAI_API_KEY não definida');
    }
    
    if (!cleanKey.startsWith('sk-')) {
      logger.error('OPENAI_API_KEY inválida - deve começar com sk-');
      throw new Error('OPENAI_API_KEY inválida');
    }
    
    // Log de diagnóstico (sem expor a key completa)
    logger.info('OpenAI API Key configurada', {
      length: cleanKey.length,
      prefix: cleanKey.substring(0, 7) + '...',
      suffix: '...' + cleanKey.slice(-4)
    });
    
    // Suporte a OpenRouter (default) ou outro provider compatível via OPENAI_BASE_URL
    const baseURL = config.baseURL || process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1';
    logger.info('Usando base URL para OpenAI client', { baseURL });

    this.openai = new OpenAI({
      apiKey: cleanKey,
      baseURL,
      timeout: 60000,      // 60 segundos de timeout
      maxRetries: 3,       // 3 tentativas automáticas
      defaultHeaders: {
        "HTTP-Referer": "https://nutribuddy.app", // Necessário pro OpenRouter
        "X-Title": "NutriBuddy Agent"
      }
    });
    this.model = config.model || 'openai/gpt-4o';
    this.maxIterations = config.maxIterations || 10;
    this.debug = config.debug || false;
  }

  log(...args) {
    if (this.debug) {
      console.log('[Agent]', ...args);
    }
  }

  /**
   * Processa uma mensagem do paciente
   */
  async processar(mensagem) {
    const startTime = Date.now();
    this.log('📩 Processando mensagem:', mensagem.messageId);

    // PRÉ-CHECK: Verificar se precisa escalar
    if (mensagem.content) {
      const escalacao = verificarEscalacao(mensagem.content);
      if (escalacao.escalar) {
        logger.escalation({
          patientId: mensagem.patientId,
          conversationId: mensagem.conversationId,
          motivo: escalacao.motivo,
          urgencia: 'alta',
          gatilho: escalacao.gatilho
        });
      }
    }

    // Monta o contexto da mensagem
    const userMessage = this.buildUserMessage(mensagem);

    // ================================================
    // 🧠 PRÉ-INJEÇÃO: Buscar contexto e dieta do paciente
    // Evita depender do LLM decidir chamar as tools certas
    // ================================================
    let preContext = '';
    try {
      const patientId = mensagem.patientId || mensagem.senderId;
      const [ctxRes, dietRes] = await Promise.allSettled([
        executeTool('buscar_contexto_paciente', { patientId }, mensagem),
        executeTool('buscar_dieta_paciente', { patientId }, mensagem)
      ]);

      if (ctxRes.status === 'fulfilled' && ctxRes.value) {
        preContext += `\n\n📋 CONTEXTO DO PACIENTE (pré-carregado):\n${JSON.stringify(ctxRes.value, null, 2)}`;
      }

      if (dietRes.status === 'fulfilled' && dietRes.value) {
        const dietData = dietRes.value?.data || dietRes.value;
        const hasDiet = dietData && (dietData.macros || dietData.dailyProtein || dietData.dailyCalories || dietData.templates || dietData.weekSchedule || dietData.meals);
        if (hasDiet) {
          preContext += `\n\n🍽️ DIETA PRESCRITA DO PACIENTE (pré-carregada - PACIENTE TEM DIETA!):\n${JSON.stringify(dietData, null, 2)}`;
        } else {
          preContext += `\n\n📝 MODO RECORDATÓRIO: Paciente SEM dieta prescrita.`;
        }
      }

      this.log('🧠 Pré-contexto injetado:', preContext.length, 'chars');
    } catch (err) {
      this.log('⚠️ Erro ao pré-carregar contexto (continuando sem):', err.message);
    }

    // Histórico da conversa com o agente
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + preContext },
      { role: 'user', content: userMessage }
    ];

    let iteration = 0;
    const toolsUsed = [];
    
    while (iteration < this.maxIterations) {
      iteration++;
      this.log(`🔄 Iteração ${iteration}`);

      try {
        // Chama o modelo
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages,
          tools: tools,
          tool_choice: 'auto',
          temperature: 0.7,
          max_tokens: 2000
        });

        const choice = response.choices[0];
        const assistantMessage = choice.message;
        messages.push(assistantMessage);

        // Se não tem tool calls, é a resposta final
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          this.log('✅ Resposta final gerada');
          
          const elapsed = Date.now() - startTime;
          
          return {
            success: true,
            response: assistantMessage.content,
            iterations: iteration,
            toolsUsed,
            messageId: mensagem.messageId,
            elapsedMs: elapsed
          };
        }

        // Executa as ferramentas
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs;
          
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch (e) {
            logger.error('❌ Erro ao parsear argumentos da ferramenta - Bug 10 fix', { 
              tool: toolName, 
              args: toolCall.function.arguments,
              error: e.message
            });
            // Retornar erro para o modelo em vez de continuar silenciosamente
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ 
                error: true, 
                message: `Erro de parsing nos argumentos: ${e.message}` 
              })
            });
            continue; // Pula para próxima tool
          }
          
          this.log(`🔧 Executando: ${toolName}`, toolArgs);
          toolsUsed.push(toolName);

          const toolStartTime = Date.now();
          
          try {
            const result = await executeTool(toolName, toolArgs, mensagem);
            const toolElapsed = Date.now() - toolStartTime;
            
            this.log(`✅ ${toolName} resultado:`, 
              typeof result === 'string' ? result.substring(0, 100) : result
            );
            
            // Log da ferramenta
            logger.toolCall(toolName, toolArgs, result, toolElapsed);

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result)
            });
          } catch (toolError) {
            const toolElapsed = Date.now() - toolStartTime;
            
            this.log(`❌ Erro em ${toolName}:`, toolError.message);
            
            // Log do erro
            logger.toolCall(toolName, toolArgs, { error: toolError.message }, toolElapsed);
            
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: toolError.message })
            });
          }
        }

      } catch (error) {
        this.log('❌ Erro na iteração:', error.message);
        logger.error('Erro na iteração do agente', { 
          iteration, 
          error: error.message,
          messageId: mensagem.messageId 
        });
        throw error;
      }
    }

    // Atingiu limite de iterações
    const elapsed = Date.now() - startTime;
    
    logger.warn('Limite de iterações atingido', {
      messageId: mensagem.messageId,
      iterations: iteration,
      toolsUsed
    });
    
    return {
      success: false,
      error: 'Limite de iterações atingido',
      iterations: iteration,
      toolsUsed,
      messageId: mensagem.messageId,
      elapsedMs: elapsed
    };
  }

  /**
   * Monta a mensagem do usuário com contexto
   */
  buildUserMessage(mensagem) {
    const parts = [];

    parts.push(`📱 Nova mensagem de paciente`);
    parts.push(`---`);
    parts.push(`Paciente: ${mensagem.patientName || 'Desconhecido'}`);
    parts.push(`ID: ${mensagem.patientId || mensagem.senderId}`);
    parts.push(`Conversa: ${mensagem.conversationId}`);
    parts.push(`Telefone: ${mensagem.patientPhone || 'N/A'}`);
    parts.push(`---`);

    // Tipo de mídia
    if (mensagem.hasImage) {
      parts.push(`🖼️ FOTO ANEXADA: ${mensagem.imageUrl || mensagem.mediaUrl}`);
    }
    if (mensagem.hasAudio) {
      parts.push(`🎤 ÁUDIO ANEXADO: ${mensagem.audioUrl || mensagem.mediaUrl}`);
      if (mensagem.audioTranscription) {
        parts.push(`Transcrição: "${mensagem.audioTranscription}"`);
      }
    }

    // Conteúdo texto
    if (mensagem.content && mensagem.content.trim()) {
      parts.push(`💬 Mensagem: "${mensagem.content}"`);
    }

    // Timestamp
    parts.push(`---`);
    parts.push(`Horário: ${mensagem.timestamp || new Date().toISOString()}`);

    // Flag de dry run
    if (mensagem._dryRun) {
      parts.push(`⚠️ MODO TESTE - Não enviar mensagens reais`);
    }

    return parts.join('\n');
  }
}

module.exports = { NutriBuddyAgent };
