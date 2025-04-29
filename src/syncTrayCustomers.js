require('dotenv').config();
const traySync = require('./traySync');
const customerDatabase = require('./customerDatabase');

/**
 * Função principal que executa a sincronização dos clientes da Tray
 */
async function syncTrayCustomers() {
  try {
    console.log('Iniciando sincronização com a Tray...');
    
    // Inicializa os bancos de dados
    customerDatabase.initDatabase();
    traySync.initTrayConfigDatabase();
    
    // Garante que os planos padrão existam
    console.log('Verificando planos padrão...');
    const plansResult = traySync.ensureDefaultPlansExist();
    if (!plansResult.success) {
      console.error('Erro ao criar planos padrão:', plansResult.error);
      process.exit(1);
    }
    
    // Tenta carregar a configuração existente
    const configResult = traySync.loadAuthConfig();
    
    // Se não houver configuração, faz a autenticação
    if (!configResult.success) {
      console.log('Configuração não encontrada. Realizando autenticação...');
      
      const { TRAY_API_ADDRESS, TRAY_CONSUMER_KEY, TRAY_CONSUMER_SECRET, TRAY_CODE } = process.env;
      
      if (!TRAY_API_ADDRESS || !TRAY_CONSUMER_KEY || !TRAY_CONSUMER_SECRET || !TRAY_CODE) {
        console.error('Erro: Variáveis de ambiente da Tray não configuradas!');
        console.error('Configure as variáveis TRAY_API_ADDRESS, TRAY_CONSUMER_KEY, TRAY_CONSUMER_SECRET e TRAY_CODE no arquivo .env');
        process.exit(1);
      }
      
      const authResult = await traySync.authenticateWithTray(
        TRAY_API_ADDRESS,
        TRAY_CONSUMER_KEY,
        TRAY_CONSUMER_SECRET,
        TRAY_CODE
      );
      
      if (!authResult.success) {
        console.error('Erro na autenticação com a Tray:', authResult.error);
        process.exit(1);
      }
      
      console.log('Autenticação com a Tray realizada com sucesso!');
    } else {
      console.log('Configuração carregada. Inicializando cliente da API...');
      
      const initResult = await traySync.initTrayApiClient();
      if (!initResult.success) {
        console.error('Erro ao inicializar cliente da API Tray:', initResult.error);
        
        // Se o erro for de token inválido, tenta reaautenticar
        if (initResult.error === 'INVALID_TOKEN') {
          console.log('Token inválido. Tentando reautenticar...');
          
          const { TRAY_API_ADDRESS, TRAY_CONSUMER_KEY, TRAY_CONSUMER_SECRET, TRAY_CODE } = process.env;
          
          const authResult = await traySync.authenticateWithTray(
            TRAY_API_ADDRESS,
            TRAY_CONSUMER_KEY,
            TRAY_CONSUMER_SECRET,
            TRAY_CODE
          );
          
          if (!authResult.success) {
            console.error('Erro na reautenticação com a Tray:', authResult.error);
            process.exit(1);
          }
          
          console.log('Reautenticação com a Tray realizada com sucesso!');
        } else {
          process.exit(1);
        }
      }
    }
    
    // Importa os clientes da Tray
    console.log('Importando clientes da Tray...');
    const importResult = await traySync.importAllCustomersFromTray();
    
    if (!importResult.success) {
      console.error('Erro ao importar clientes da Tray:', importResult.error);
      process.exit(1);
    }
    
    console.log(`Importação concluída! ${importResult.data.total_imported} clientes importados.`);
    
    // Fecha as conexões
    traySync.closeDatabases();
    customerDatabase.closeDatabase();
    
    console.log('Sincronização concluída com sucesso!');
  } catch (error) {
    console.error('Erro durante a sincronização:', error);
    process.exit(1);
  }
}

// Executa a sincronização se o script for executado diretamente
if (require.main === module) {
  syncTrayCustomers().catch(error => {
    console.error('Erro não tratado:', error);
    process.exit(1);
  });
}

module.exports = { syncTrayCustomers }; 