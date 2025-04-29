// Importações necessárias
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Certifica-se de que o diretório de dados existe
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Caminho do banco de dados
const dbPath = path.join(dataDir, 'emails.db');

// Log do caminho do banco de dados
console.log(`Usando banco de dados em: ${dbPath}`);

// Inicializa o banco de dados com configurações para melhorar a confiabilidade
const db = new Database(dbPath, {
  verbose: console.log,   // Log de todas as consultas SQL (remova em produção)
  fileMustExist: false,   // Não exige que o arquivo exista
  timeout: 5000,          // Tempo de espera para operações bloqueadas (ms)
});

// Define pragmas importantes para garantir a consistência dos dados
db.pragma('journal_mode = WAL');       // Write-Ahead Logging para melhor performance e confiabilidade
db.pragma('synchronous = NORMAL');     // Compromisso entre velocidade e segurança
db.pragma('foreign_keys = ON');        // Ativa constraints de chave estrangeira

// Executa checkpoint a cada 30 segundos para garantir que os dados sejam salvos no arquivo principal
const CHECKPOINT_INTERVAL = 30000; // 30 segundos
let checkpointInterval = null;

// Função para executar checkpoint
function executeCheckpoint() {
  try {
    db.pragma('wal_checkpoint(PASSIVE)');
    console.log('Checkpoint executado com sucesso');
  } catch (error) {
    console.error('Erro ao executar checkpoint:', error);
  }
}

// Inicialização das tabelas
function initDatabase() {
  try {
    // Recria a tabela de emails com o formato correto de timestamp
    db.prepare(`
      CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        user_tag TEXT NOT NULL,
        guild_id TEXT,
        registered_at INTEGER DEFAULT (strftime('%s','now')),
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      )
    `).run();

    // Cria índice para melhorar a busca por user_id e email
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_emails_email ON emails(email)`).run();

    // Cria tabela de vinculação entre usuários do Discord e clientes
    db.prepare(`
      CREATE TABLE IF NOT EXISTS user_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        customer_id TEXT NOT NULL,
        linked_at INTEGER DEFAULT (strftime('%s','now'))
      )
    `).run();

    // Cria índice para melhorar a busca por user_id e customer_id
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_links_user_id ON user_links(user_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_user_links_customer_id ON user_links(customer_id)`).run();

    console.log('Banco de dados inicializado com sucesso!');
    
    // Inicia o intervalo de checkpoint
    if (checkpointInterval === null) {
      checkpointInterval = setInterval(executeCheckpoint, CHECKPOINT_INTERVAL);
      console.log(`Intervalo de checkpoint configurado para ${CHECKPOINT_INTERVAL/1000} segundos`);
    }
  } catch (error) {
    console.error('Erro ao inicializar banco de dados:', error);
  }
}

// Registra um novo email
function registerEmail(email, userId, userTag, guildId = null) {
  try {
    const stmt = db.prepare(`
      INSERT INTO emails (email, user_id, user_tag, guild_id)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(email, userId, userTag, guildId);
    return { success: true, id: result.lastInsertRowid };
  } catch (error) {
    // Verifica se é um erro de duplicação (UNIQUE constraint failed)
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { success: false, error: 'EMAIL_ALREADY_EXISTS' };
    }
    console.error('Erro ao registrar email:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// Verifica se um email já está registrado
function isEmailRegistered(email) {
  try {
    const stmt = db.prepare('SELECT * FROM emails WHERE email = ?');
    const result = stmt.get(email);
    return { exists: !!result, data: result };
  } catch (error) {
    console.error('Erro ao verificar email:', error);
    return { exists: false, error: 'DATABASE_ERROR' };
  }
}

// Obtém o email registrado por um usuário
function getEmailByUserId(userId) {
  try {
    const stmt = db.prepare('SELECT * FROM emails WHERE user_id = ?');
    const result = stmt.get(userId);
    return { success: true, data: result };
  } catch (error) {
    console.error('Erro ao buscar email do usuário:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// Obtém informações sobre um email
function getEmailInfo(email) {
  try {
    const stmt = db.prepare('SELECT * FROM emails WHERE email = ?');
    const result = stmt.get(email);
    return { success: true, data: result };
  } catch (error) {
    console.error('Erro ao buscar informações do email:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// Remove o registro de email de um usuário
function unregisterEmail(userId) {
  try {
    // Primeiro verifica se o usuário tem um email registrado
    const emailInfo = getEmailByUserId(userId);
    if (!emailInfo.success || !emailInfo.data) {
      return { success: false, error: 'NO_EMAIL_FOUND' };
    }

    // Remove o registro
    const stmt = db.prepare('DELETE FROM emails WHERE user_id = ?');
    const result = stmt.run(userId);
    
    if (result.changes > 0) {
      return { success: true, data: emailInfo.data };
    } else {
      return { success: false, error: 'NO_RECORD_DELETED' };
    }
  } catch (error) {
    console.error('Erro ao remover registro de email:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// Vincula um usuário do Discord a um cliente
function linkUserToCustomer(userId, customerId) {
  console.log(`[DEBUG] Iniciando vinculação do usuário ${userId} ao cliente ${customerId}`);
  
  try {
    // Verifica se a tabela existe
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='user_links'
    `).get();
    
    if (!tableExists) {
      console.error('[ERRO] Tabela user_links não encontrada');
      return { success: false, error: 'TABLE_NOT_FOUND' };
    }

    // Verifica se já existe um vínculo para este usuário
    const existingLink = db.prepare(`
      SELECT * FROM user_links 
      WHERE user_id = ?
    `).get(userId);

    if (existingLink) {
      console.log(`[DEBUG] Vínculo existente encontrado para o usuário ${userId}, atualizando...`);
      // Atualiza o vínculo existente
      db.prepare(`
        UPDATE user_links 
        SET customer_id = ?, linked_at = strftime('%s','now')
        WHERE user_id = ?
      `).run(customerId, userId);
      console.log(`[DEBUG] Vínculo atualizado com sucesso`);
      return { success: true };
    } else {
      console.log(`[DEBUG] Criando novo vínculo para o usuário ${userId}`);
      // Cria um novo vínculo
      db.prepare(`
        INSERT INTO user_links (user_id, customer_id)
        VALUES (?, ?)
      `).run(userId, customerId);
      console.log(`[DEBUG] Novo vínculo criado com sucesso`);
      return { success: true };
    }
  } catch (error) {
    console.error(`[ERRO] Erro ao vincular usuário ao cliente:`, error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// Obtém a vinculação de um usuário
function getUserLink(userId) {
  try {
    const stmt = db.prepare('SELECT * FROM user_links WHERE user_id = ?');
    const result = stmt.get(userId);
    
    if (!result) {
      return { success: false, error: 'NO_LINK_FOUND' };
    }
    
    return { success: true, data: result };
  } catch (error) {
    console.error('Erro ao obter vinculação do usuário:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// Remove a vinculação de um usuário
function unlinkUser(userId) {
  try {
    // Verifica se o usuário está vinculado
    const existingLink = getUserLink(userId);
    
    if (!existingLink.success) {
      return existingLink; // Retorna o erro
    }
    
    // Remove a vinculação
    const stmt = db.prepare('DELETE FROM user_links WHERE user_id = ?');
    const result = stmt.run(userId);
    
    if (result.changes > 0) {
      return { success: true, data: existingLink.data };
    } else {
      return { success: false, error: 'NO_RECORD_DELETED' };
    }
  } catch (error) {
    console.error('Erro ao desvincular usuário:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// Obtém todos os emails registrados (para fins administrativos)
function getAllEmails() {
  try {
    const stmt = db.prepare('SELECT * FROM emails ORDER BY registered_at DESC');
    const results = stmt.all();
    return { success: true, data: results };
  } catch (error) {
    console.error('Erro ao buscar todos os emails:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// Obtém todos os vínculos entre usuários e clientes (para uso administrativo)
function getAllLinks() {
  try {
    console.log('[DEBUG] Iniciando busca de todos os vínculos...');
    
    // Primeiro verifica se a tabela existe
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_links'");
    const tableExists = tableCheck.get();
    
    if (!tableExists) {
      console.error('[ERRO] Tabela user_links não encontrada!');
      return { success: false, error: 'TABLE_NOT_FOUND' };
    }
    
    console.log('[DEBUG] Tabela user_links encontrada, verificando estrutura...');
    
    // Verifica a estrutura da tabela
    const tableInfo = db.prepare("PRAGMA table_info(user_links)").all();
    console.log('[DEBUG] Estrutura da tabela user_links:', tableInfo);
    
    // Verifica se há registros
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM user_links');
    const countResult = countStmt.get();
    console.log(`[DEBUG] Total de registros na tabela user_links: ${countResult.count}`);
    
    // Busca todos os registros
    const stmt = db.prepare('SELECT * FROM user_links ORDER BY linked_at DESC');
    const results = stmt.all();
    
    console.log(`[DEBUG] Encontrados ${results.length} vínculos`);
    if (results.length > 0) {
      console.log('[DEBUG] Primeiro vínculo encontrado:', results[0]);
    } else {
      console.log('[DEBUG] Nenhum vínculo encontrado na tabela user_links');
    }
    
    return { 
      success: true, 
      data: results,
      metadata: {
        total_records: countResult.count,
        table_structure: tableInfo
      }
    };
  } catch (error) {
    console.error('[ERRO] Erro ao buscar todos os vínculos:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// Função para fechar a conexão com o banco de dados
function closeDatabase() {
  if (db) {
    console.log('Fechando conexão com o banco de dados de emails...');
    try {
      // Executar um checkpoint final antes de fechar
      if (db.pragma) {
        db.pragma('wal_checkpoint(FULL)');
      }
      db.close();
      console.log('Banco de dados de emails fechado com sucesso');
    } catch (err) {
      console.error('Erro ao fechar o banco de dados de emails:', err.message);
    }
    
    // Limpar o intervalo de checkpoint se existir
    if (checkpointInterval !== null) {
      clearInterval(checkpointInterval);
      checkpointInterval = null;
      console.log('Intervalo de checkpoint de emails encerrado');
    }
  }
}

// Função para automatizar a vinculação entre emails registrados e clientes
async function autoLinkEmailsToCustomers() {
  try {
    console.log('[DEBUG] Iniciando vinculação automática de emails...');
    
    // Busca todos os emails registrados
    const emailsResult = getAllEmails();
    if (!emailsResult.success) {
      console.error('[ERRO] Erro ao buscar emails:', emailsResult.error);
      return { success: false, error: 'EMAILS_FETCH_ERROR' };
    }

    const emails = emailsResult.data;
    console.log(`[DEBUG] Encontrados ${emails.length} emails registrados`);

    // Busca todos os clientes da planilha
    const sheetSync = require('./sheetSync');
    const clientes = await new Promise((resolve, reject) => {
      sheetSync.db.all('SELECT * FROM customers', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    console.log(`[DEBUG] Encontrados ${clientes.length} clientes na planilha`);

    let vinculacoesCriadas = 0;
    let erros = 0;

    // Para cada email registrado
    for (const email of emails) {
      try {
        // Busca o cliente correspondente na planilha
        const cliente = clientes.find(c => 
          c.email_cliente && 
          c.email_cliente.trim().toLowerCase() === email.email.trim().toLowerCase()
        );

        if (cliente) {
          // Tenta vincular o usuário ao cliente
          const linkResult = linkUserToCustomer(email.user_id, cliente.codigo_cliente);
          
          if (linkResult.success) {
            console.log(`[DEBUG] Vinculado: ${email.email} -> ${cliente.codigo_cliente}`);
            vinculacoesCriadas++;
          } else {
            console.error(`[ERRO] Erro ao vincular ${email.email}:`, linkResult.error);
            erros++;
          }
        }
      } catch (error) {
        console.error(`[ERRO] Erro ao processar email ${email.email}:`, error);
        erros++;
      }
    }

    console.log(`[DEBUG] Vinculação automática concluída: ${vinculacoesCriadas} vínculos criados, ${erros} erros`);
    
    return { 
      success: true, 
      data: { 
        total_emails: emails.length,
        total_clientes: clientes.length,
        vinculacoes_criadas: vinculacoesCriadas,
        erros: erros
      }
    };
  } catch (error) {
    console.error('[ERRO] Erro na vinculação automática:', error);
    return { success: false, error: 'AUTO_LINK_ERROR' };
  }
}

// Exporta as funções
module.exports = {
  initDatabase,
  registerEmail,
  isEmailRegistered,
  getEmailByUserId,
  getEmailInfo,
  unregisterEmail,
  linkUserToCustomer,
  getUserLink,
  unlinkUser,
  getAllEmails,
  getAllLinks,
  autoLinkEmailsToCustomers,
  closeDatabase
}; 