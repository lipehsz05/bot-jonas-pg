import dotenv from 'dotenv';
import https from 'https';

// Carregar variáveis de ambiente
dotenv.config();

/**
 * Script para deletar o webhook do bot do Telegram
 * 
 * Use este script se o bot estiver mostrando o erro:
 * "TelegramError: 409: Conflict: can't use getUpdates method while webhook is active"
 * 
 * Uso:
 *   node delete-telegram-webhook.js
 */

async function deleteWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN não encontrado no arquivo .env');
    console.error('   Por favor, configure o token do bot no arquivo .env');
    process.exit(1);
  }

  console.log('🔧 Deletando webhook do bot do Telegram...');
  console.log(`   Token: ${token.substring(0, 10)}...`);

  const url = `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);

          if (result.ok) {
            console.log('✅ Webhook deletado com sucesso!');
            console.log('   Descrição:', result.description || 'Webhook removido');
            console.log('\n🚀 Agora você pode iniciar o bot com: npm start');
            resolve(result);
          } else {
            console.error('❌ Erro ao deletar webhook:');
            console.error('   Código:', result.error_code);
            console.error('   Descrição:', result.description);
            reject(new Error(result.description));
          }
        } catch (error) {
          console.error('❌ Erro ao parsear resposta:', error.message);
          reject(error);
        }
      });
    }).on('error', (error) => {
      console.error('❌ Erro ao fazer requisição:', error.message);
      reject(error);
    });
  });
}

// Executar
deleteWebhook().catch((error) => {
  console.error('\n❌ Falha ao deletar webhook:', error.message);
  process.exit(1);
});
