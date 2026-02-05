/**
 * Conexão Firebase para AgentPaul
 * Usado para persistir produtos nutricionais aprendidos
 */

const admin = require('firebase-admin');

let db = null;
let initialized = false;

function initFirebase() {
  if (initialized) return db;
  
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  
  if (!projectId || !clientEmail || !privateKey) {
    console.log('⚠️ Firebase não configurado - usando apenas memória local');
    return null;
  }
  
  try {
    // Corrigir \n escapado na private key
    const formattedKey = privateKey.replace(/\\n/g, '\n');
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: formattedKey
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    
    db = admin.firestore();
    initialized = true;
    console.log('✅ Firebase conectado!');
    return db;
  } catch (error) {
    console.error('❌ Erro ao conectar Firebase:', error.message);
    return null;
  }
}

// Collections
const COLLECTION = 'produtos_nutricionais';
const PENDING_MEALS_COLLECTION = 'pending_meals';

/**
 * Busca produto no Firestore
 */
async function buscarProdutoFirestore(chave) {
  const firestore = initFirebase();
  if (!firestore) return null;
  
  try {
    const chaveNorm = chave.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    
    const doc = await firestore.collection(COLLECTION).doc(chaveNorm).get();
    
    if (doc.exists) {
      console.log(`🔥 Produto encontrado no Firestore: ${chaveNorm}`);
      return doc.data();
    }
    
    // Busca alternativa por campo 'nome' (caso a chave seja diferente)
    const snapshot = await firestore.collection(COLLECTION)
      .where('buscas', 'array-contains', chaveNorm)
      .limit(1)
      .get();
    
    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      console.log(`🔥 Produto encontrado por busca alternativa: ${data.nome}`);
      return data;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar no Firestore:', error.message);
    return null;
  }
}

/**
 * Salva produto no Firestore
 */
async function salvarProdutoFirestore(chave, dados) {
  const firestore = initFirebase();
  if (!firestore) {
    console.log('⚠️ Firestore não disponível - produto salvo apenas em memória');
    return false;
  }
  
  try {
    const chaveNorm = chave.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    
    // Cria array de termos de busca
    const buscas = [
      chaveNorm,
      ...chaveNorm.split(' ').filter(p => p.length > 2)
    ];
    
    const documento = {
      ...dados,
      chave: chaveNorm,
      buscas,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      fonte: 'agent_paul'
    };
    
    await firestore.collection(COLLECTION).doc(chaveNorm).set(documento, { merge: true });
    
    console.log(`🔥 Produto salvo no Firestore: ${chaveNorm}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao salvar no Firestore:', error.message);
    return false;
  }
}

/**
 * Carrega todos os produtos do Firestore para memória local
 */
async function carregarProdutosFirestore() {
  const firestore = initFirebase();
  if (!firestore) return {};
  
  try {
    const snapshot = await firestore.collection(COLLECTION).get();
    const produtos = {};
    
    snapshot.forEach(doc => {
      const data = doc.data();
      produtos[doc.id] = {
        nome: data.nome,
        peso: data.peso,
        macros: data.macros,
        observacoes: data.observacoes || ''
      };
    });
    
    console.log(`🔥 ${Object.keys(produtos).length} produtos carregados do Firestore`);
    return produtos;
  } catch (error) {
    console.error('❌ Erro ao carregar produtos:', error.message);
    return {};
  }
}

/**
 * Salva análise pendente de confirmação
 * @param {string} conversationId - ID da conversa
 * @param {object} dados - Dados da análise (alimentos, macros, imageUrl, mealType)
 */
async function salvarAnalisePendente(conversationId, dados) {
  const firestore = initFirebase();
  
  // Sempre salva em memória como fallback
  if (!global.pendingMealsCache) {
    global.pendingMealsCache = {};
  }
  
  const documento = {
    ...dados,
    conversationId,
    criadoEm: new Date().toISOString(),
    expiraEm: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutos
  };
  
  global.pendingMealsCache[conversationId] = documento;
  console.log(`💾 Análise pendente salva em memória: ${conversationId}`);
  
  if (!firestore) {
    return { sucesso: true, fonte: 'memoria' };
  }
  
  try {
    await firestore.collection(PENDING_MEALS_COLLECTION).doc(conversationId).set({
      ...documento,
      criadoEm: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`🔥 Análise pendente salva no Firestore: ${conversationId}`);
    return { sucesso: true, fonte: 'firestore' };
  } catch (error) {
    console.error('❌ Erro ao salvar análise pendente:', error.message);
    return { sucesso: true, fonte: 'memoria', erro: error.message };
  }
}

/**
 * Busca análise pendente de confirmação
 * @param {string} conversationId - ID da conversa
 */
async function buscarAnalisePendente(conversationId) {
  // Primeiro busca em memória (mais rápido)
  if (global.pendingMealsCache && global.pendingMealsCache[conversationId]) {
    const dados = global.pendingMealsCache[conversationId];
    
    // Verifica se não expirou
    if (new Date(dados.expiraEm) > new Date()) {
      console.log(`💾 Análise pendente encontrada em memória: ${conversationId}`);
      return dados;
    } else {
      // Expirou, remove
      delete global.pendingMealsCache[conversationId];
    }
  }
  
  const firestore = initFirebase();
  if (!firestore) {
    return null;
  }
  
  try {
    const doc = await firestore.collection(PENDING_MEALS_COLLECTION).doc(conversationId).get();
    
    if (doc.exists) {
      const dados = doc.data();
      
      // Verifica se não expirou (30 minutos)
      const criadoEm = dados.criadoEm?.toDate?.() || new Date(dados.criadoEm);
      const agora = new Date();
      const diffMinutos = (agora - criadoEm) / (1000 * 60);
      
      if (diffMinutos <= 30) {
        console.log(`🔥 Análise pendente encontrada no Firestore: ${conversationId}`);
        // Cacheia em memória
        if (!global.pendingMealsCache) global.pendingMealsCache = {};
        global.pendingMealsCache[conversationId] = dados;
        return dados;
      } else {
        // Expirou, remove
        await firestore.collection(PENDING_MEALS_COLLECTION).doc(conversationId).delete();
        console.log(`⏰ Análise pendente expirada: ${conversationId}`);
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ Erro ao buscar análise pendente:', error.message);
    return null;
  }
}

/**
 * Limpa análise pendente após registro ou cancelamento
 * @param {string} conversationId - ID da conversa
 */
async function limparAnalisePendente(conversationId) {
  // Remove da memória
  if (global.pendingMealsCache && global.pendingMealsCache[conversationId]) {
    delete global.pendingMealsCache[conversationId];
    console.log(`🗑️ Análise pendente removida da memória: ${conversationId}`);
  }
  
  const firestore = initFirebase();
  if (!firestore) {
    return { sucesso: true, fonte: 'memoria' };
  }
  
  try {
    await firestore.collection(PENDING_MEALS_COLLECTION).doc(conversationId).delete();
    console.log(`🔥 Análise pendente removida do Firestore: ${conversationId}`);
    return { sucesso: true, fonte: 'firestore' };
  } catch (error) {
    console.error('❌ Erro ao limpar análise pendente:', error.message);
    return { sucesso: true, fonte: 'memoria', erro: error.message };
  }
}

module.exports = {
  initFirebase,
  buscarProdutoFirestore,
  salvarProdutoFirestore,
  carregarProdutosFirestore,
  salvarAnalisePendente,
  buscarAnalisePendente,
  limparAnalisePendente
};
