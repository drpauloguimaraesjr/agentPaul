/**
 * Verificar pending_meals (com underscore) no Firebase
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'Nutri-Buddy-main', 'firebaseServiceAccount.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
  });
}

const db = admin.firestore();

async function verificar() {
  console.log('=== VERIFICANDO COLEÇÕES DE PENDING MEALS ===\n');
  
  // 1. pending_meals (com underscore - usado pelo AgentPaul)
  console.log('1. Coleção: pending_meals (underscore):');
  try {
    const pendingUnderscore = await db.collection('pending_meals').limit(10).get();
    
    if (pendingUnderscore.empty) {
      console.log('   ❌ VAZIA');
    } else {
      console.log(`   ✅ Encontrados: ${pendingUnderscore.size}`);
      pendingUnderscore.docs.forEach(doc => {
        const data = doc.data();
        console.log(`\n   🍽️ ${doc.id}`);
        console.log(`      Patient: ${data.patientId}`);
        console.log(`      Criado: ${data.createdAt?.toDate?.() || data.createdAt}`);
        console.log(`      Expira: ${data.expiresAt?.toDate?.() || data.expiresAt}`);
      });
    }
  } catch (e) {
    console.log('   Erro:', e.message);
  }
  
  // 2. pendingMeals (camelCase)
  console.log('\n\n2. Coleção: pendingMeals (camelCase):');
  try {
    const pendingCamel = await db.collection('pendingMeals').limit(10).get();
    
    if (pendingCamel.empty) {
      console.log('   ❌ VAZIA');
    } else {
      console.log(`   ✅ Encontrados: ${pendingCamel.size}`);
      pendingCamel.docs.forEach(doc => {
        const data = doc.data();
        console.log(`\n   🍽️ ${doc.id}`);
        console.log(`      Patient: ${data.patientId}`);
      });
    }
  } catch (e) {
    console.log('   Erro:', e.message);
  }
  
  console.log('\n=== FIM ===');
}

verificar().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
