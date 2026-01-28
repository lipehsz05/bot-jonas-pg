import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

class WhatsAppGroupLister {
  constructor() {
    this.client = null;
    this.isReady = false;
  }

  async init() {
    console.log('📱 Inicializando WhatsApp...\n');
    
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      }
    });

    // Gerar QR Code
    this.client.on('qr', (qr) => {
      console.log('\n📲 Escaneie o QR Code abaixo com seu WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n');
    });

    // Quando estiver autenticado
    this.client.on('ready', async () => {
      console.log('✅ WhatsApp conectado!\n');
      this.isReady = true;
      await this.listGroups();
    });

    // Erro de autenticação
    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp autenticado!');
    });

    // Erro
    this.client.on('auth_failure', (msg) => {
      console.error('❌ Falha na autenticação do WhatsApp:', msg);
    });

    // Desconectado
    this.client.on('disconnected', (reason) => {
      console.log('⚠️ WhatsApp desconectado:', reason);
      this.isReady = false;
    });

    // Inicializar cliente
    await this.client.initialize();
  }

  async listGroups() {
    try {
      console.log('🔍 Buscando grupos...\n');
      
      // Buscar todos os chats
      const chats = await this.client.getChats();
      
      // Filtrar apenas grupos
      const groups = chats.filter(chat => chat.isGroup);
      
      if (groups.length === 0) {
        console.log('⚠️ Nenhum grupo encontrado.');
        await this.client.destroy();
        process.exit(0);
        return;
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📋 Encontrados ${groups.length} grupo(s):\n`);
      
      groups.forEach((group, index) => {
        console.log(`${index + 1}. ${group.name || 'Sem nome'}`);
        console.log(`   ID: ${group.id._serialized}`);
        console.log(`   Participantes: ${group.participants.length}`);
        console.log(`   Descrição: ${group.description || 'Sem descrição'}`);
        console.log('');
      });
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n💡 Copie o ID do grupo desejado e cole no arquivo .env como:');
      console.log('   WHATSAPP_GROUP_ID=ID_DO_GRUPO_AQUI\n');
      
      // Também mostrar contatos/chat privado se necessário
      const contacts = chats.filter(chat => !chat.isGroup);
      if (contacts.length > 0) {
        console.log(`\n📱 Encontrados ${contacts.length} contato(s)/chat(s) privado(s):\n`);
        contacts.slice(0, 5).forEach((contact, index) => {
          console.log(`${index + 1}. ${contact.name || contact.id._serialized}`);
          console.log(`   ID: ${contact.id._serialized}`);
          console.log('');
        });
        if (contacts.length > 5) {
          console.log(`   ... e mais ${contacts.length - 5} contato(s)\n`);
        }
      }
      
      await this.client.destroy();
      console.log('✅ Listagem concluída!');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Erro ao listar grupos:', error);
      await this.client.destroy();
      process.exit(1);
    }
  }
}

// Executar
async function main() {
  const lister = new WhatsAppGroupLister();
  
  try {
    await lister.init();
    
    // Aguardar WhatsApp conectar (timeout de 5 minutos)
    const startTime = Date.now();
    const timeout = 300000; // 5 minutos
    
    while (!lister.isReady && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (!lister.isReady) {
      console.log('\n⏱️ Timeout aguardando WhatsApp conectar.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  }
}

// Tratamento de encerramento
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Encerrando...');
  process.exit(0);
});

main();

