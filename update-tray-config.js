const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Configuração do banco de dados
const dataDir = path.join(__dirname, 'data');
const configDbPath = path.join(dataDir, 'tray_config.db');
const customersDbPath = path.join(dataDir, 'customers.db');

// Parâmetros a serem atualizados
const apiAddress = 'www.sociofundador.com/web_api';
const code = '7cef1823e25756e413f10052d95a0b65e2313fb78604406fb90281bef7b38c16';
// Credenciais da homologação
const consumerKey = 'f8f2ccdc58bb6a6f60a8c5ce3168f364fc494f5b631e8414bb27ac311cc7302c';
const consumerSecret = '5addfc88f11bf5d723b5869f0850f52f69ce5e2e1d6999f12344e2f346a3f351';

try {
  console.log(`Atualizando configuração da Tray no banco de dados: ${configDbPath}`);
  const configDb = new Database(configDbPath);
  
  // Verificar se o banco de dados de clientes existe
  console.log(`Verificando banco de dados de clientes: ${customersDbPath}`);
  if (fs.existsSync(customersDbPath)) {
    const customerDb = new Database(customersDbPath);
    
    // Verificar se a tabela de planos existe e mostrar os planos disponíveis
    try {
      const plansExist = customerDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='plans'").get();
      
      if (plansExist) {
        console.log("Tabela de planos encontrada!");
        
        // Listar os planos disponíveis
        const plans = customerDb.prepare("SELECT id, name, discord_role_id FROM plans").all();
        
        if (plans.length > 0) {
          console.log("\n===== PLANOS DISPONÍVEIS PARA INTEGRAÇÃO COM DISCORD =====");
          console.log("ID\t\tNome\t\t\tID do Cargo no Discord");
          console.log("--------------------------------------------------------");
          
          plans.forEach(plan => {
            console.log(`${plan.id}\t\t${plan.name}\t\t${plan.discord_role_id || 'Não configurado'}`);
          });
          
          console.log("\nPara configurar os cargos do Discord para os planos, use o comando /config-plano após iniciar o bot.");
          console.log("Este comando permite associar um cargo do Discord a um plano específico.");
          console.log("Quando um usuário se registra, ele receberá automaticamente o cargo correspondente ao seu plano.\n");
        } else {
          console.log("Não foram encontrados planos no banco de dados.");
        }
      } else {
        console.log("Tabela de planos não encontrada no banco de dados de clientes.");
      }
      
      // Fechar o banco de dados de clientes
      customerDb.close();
    } catch (error) {
      console.error("Erro ao verificar planos:", error);
    }
  } else {
    console.log("Banco de dados de clientes não encontrado.");
  }

  // Verificar se a tabela existe
  const tableExists = configDb.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='tray_config'
  `).get();

  if (!tableExists) {
    console.log('Tabela tray_config não existe. Criando...');
    configDb.prepare(`
      CREATE TABLE IF NOT EXISTS tray_config (
        id INTEGER PRIMARY KEY,
        api_address TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        api_host TEXT,
        expiration_date TEXT,
        refresh_expiration_date TEXT,
        store_id TEXT,
        last_sync TEXT
      )
    `).run();
  }

  // Vamos criar uma tabela adicional para armazenar as credenciais
  configDb.prepare(`
    CREATE TABLE IF NOT EXISTS tray_credentials (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL,
      consumer_key TEXT NOT NULL,
      consumer_secret TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Obter configuração atual (para preservar outras informações se existirem)
  const currentConfig = configDb.prepare('SELECT * FROM tray_config WHERE id = 1').get();

  if (currentConfig) {
    console.log('Configuração existente encontrada. Atualizando...');
    
    // Atualizar apenas os campos necessários
    const stmt = configDb.prepare(`
      UPDATE tray_config
      SET api_address = ?
      WHERE id = 1
    `);
    
    stmt.run(apiAddress);
    
    console.log('Configuração atualizada com sucesso!');
    console.log(`API Address: ${apiAddress}`);
  } else {
    console.log('Nenhuma configuração encontrada. Inserindo nova configuração...');
    
    // Inserir nova configuração
    const stmt = configDb.prepare(`
      INSERT INTO tray_config 
      (id, api_address)
      VALUES (1, ?)
    `);
    
    stmt.run(apiAddress);
    
    console.log('Nova configuração inserida com sucesso!');
    console.log(`API Address: ${apiAddress}`);
  }

  // Inserir ou atualizar as credenciais
  const credentialsStmt = configDb.prepare(`
    INSERT OR REPLACE INTO tray_credentials 
    (id, code, consumer_key, consumer_secret)
    VALUES (1, ?, ?, ?)
  `);
  
  credentialsStmt.run(code, consumerKey, consumerSecret);
  console.log('Credenciais atualizadas com sucesso!');
  console.log(`Code: ${code}`);
  console.log(`Consumer Key: ${consumerKey}`);
  console.log(`Consumer Secret: ${consumerSecret}`);

  // Criar um script para exportar as credenciais para variáveis de ambiente
  const exportScriptPath = path.join(__dirname, 'export-tray-env.cmd');
  
  try {
    fs.writeFileSync(exportScriptPath, `@echo off
set TRAY_API_ADDRESS=${apiAddress}
set TRAY_CODE=${code}
set TRAY_CONSUMER_KEY=${consumerKey}
set TRAY_CONSUMER_SECRET=${consumerSecret}
echo Variáveis de ambiente configuradas com sucesso:
echo API Address: %TRAY_API_ADDRESS%
echo Code: %TRAY_CODE%
echo Consumer Key: %TRAY_CONSUMER_KEY%
echo Consumer Secret: %TRAY_CONSUMER_SECRET%
`);
    console.log(`Script de exportação de variáveis criado em: ${exportScriptPath}`);
  } catch (err) {
    console.error('Erro ao criar script de exportação:', err);
  }

  // Fechar a conexão
  configDb.close();
  
  console.log('\nOperação concluída com sucesso!');
  console.log('\nPara sincronizar, execute um dos scripts:');
  console.log('1. .\\sync-with-params.cmd             (solicita as credenciais)');
  console.log('2. .\\sync-with-params-alternative.cmd (usa as credenciais da homologação)');
  console.log('3. .\\export-tray-env.cmd && node src/syncTrayCustomers.js (executa diretamente)');
  console.log('\nLembre-se: Para configurar os cargos do Discord para os planos, use o comando /config-plano depois de iniciar o bot!');
} catch (error) {
  console.error('Erro ao atualizar configuração:', error);
} 