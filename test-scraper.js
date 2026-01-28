import SiteScraper from './scraper.js';

// Script para testar apenas o scraper
async function testScraper() {
  console.log('🧪 Testando Scraper...\n');
  
  const scraper = new SiteScraper();
  
  try {
    const signals = await scraper.scrape();
    
    console.log('\n📋 Resultados:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (signals.length === 0) {
      console.log('⚠️ Nenhum sinal encontrado');
    } else {
      signals.forEach((signal, index) => {
        console.log(`\n${index + 1}. ${signal.title || 'Sinal sem título'}`);
        console.log(`   Tipo: ${signal.type || 'N/A'}`);
        console.log(`   Texto: ${signal.text ? signal.text.substring(0, 100) + '...' : 'N/A'}`);
      });
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n✅ Total: ${signals.length} sinal(is) encontrado(s)`);
    
  } catch (error) {
    console.error('\n❌ Erro no teste:', error);
  }
}

testScraper();

