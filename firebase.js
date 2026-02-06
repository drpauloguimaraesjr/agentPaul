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
 * ============================================
 * 🔄 FUNÇÕES DE PENDING MEALS (DELEGAM PARA pending-meals.js)
 * ============================================
 * Bug 4 fix: Unificação de caches
 * Estas funções agora delegam para o sistema unificado em pending-meals.js
 * Mantidas para compatibilidade com código existente
 * ============================================
 */

// IMPORTAR o sistema unificado (lazy load para evitar circular dependency)
let pendingMealsSystem = null;
function getPendingMealsSystem() {
  if (!pendingMealsSystem) {
    pendingMealsSystem = require('./pending-meals');
  }
  return pendingMealsSystem;
}

/**
 * Salva análise pendente de confirmação
 * @param {string} conversationId - ID da conversa
 * @param {object} dados - Dados da análise (alimentos, macros, imageUrl, mealType)
 */
async function salvarAnalisePendente(conversationId, dados) {
  const pm = getPendingMealsSystem();
  // savePendingMeal já salva em memória + Firebase
  pm.savePendingMeal(conversationId, dados);
  console.log(`💾 [firebase.js] Delegado para pending-meals.js: ${conversationId}`);
  return { sucesso: true, fonte: 'unificado' };
}

/**
 * Busca análise pendente de confirmação
 * @param {string} conversationId - ID da conversa
 */
async function buscarAnalisePendente(conversationId) {
  const pm = getPendingMealsSystem();
  const pending = await pm.getPendingMeal(conversationId);
  if (pending) {
    console.log(`🔍 [firebase.js] Encontrado via pending-meals.js: ${conversationId}`);
  }
  return pending;
}

/**
 * Limpa análise pendente após registro ou cancelamento
 * @param {string} conversationId - ID da conversa
 */
async function limparAnalisePendente(conversationId) {
  const pm = getPendingMealsSystem();
  const result = await pm.confirmPendingMeal(conversationId);
  console.log(`🗑️ [firebase.js] Limpeza delegada para pending-meals.js: ${conversationId}`);
  return { sucesso: !!result, fonte: 'unificado' };
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
