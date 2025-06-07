// Importações necessárias
const sqlite3 = require('sqlite3').verbose();
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

// Inicializa o banco de dados
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao abrir o banco de dados:', err);
    return;
  }
  console.log('Conexão com o banco de dados estabelecida');
  
  // Define pragmas importantes
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA foreign_keys = ON');
  
  // Inicializa as tabelas
  initDatabase();
});

// Função para executar consultas de forma assíncrona
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Função para executar consultas que retornam uma única linha
function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Função para executar consultas que retornam múltiplas linhas
function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Inicialização das tabelas
function initDatabase() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT NOT NULL,
      guild_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS user_customer_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  db.exec(createTableSQL, (err) => {
    if (err) {
      console.error('Erro ao criar tabelas:', err);
    } else {
      console.log('Tabelas criadas com sucesso');
    }
  });
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
  try {
    // Verifica se o usuário já está vinculado
    const existingLink = db.prepare('SELECT * FROM user_customer_links WHERE user_id = ?').get(userId);
    
    if (existingLink) {
      // Atualiza a vinculação
      const updateStmt = db.prepare(`
        UPDATE user_customer_links 
        SET customer_id = ?, created_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `);
      
      updateStmt.run(customerId, userId);
      return { success: true, updated: true };
    } else {
      // Cria uma nova vinculação
      const insertStmt = db.prepare(`
        INSERT INTO user_customer_links (user_id, customer_id)
        VALUES (?, ?)
      `);
      
      insertStmt.run(userId, customerId);
      return { success: true, updated: false };
    }
  } catch (error) {
    console.error('Erro ao vincular usuário ao cliente:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// Obtém a vinculação de um usuário
function getUserLink(userId) {
  try {
    const stmt = db.prepare('SELECT * FROM user_customer_links WHERE user_id = ?');
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
    const stmt = db.prepare('DELETE FROM user_customer_links WHERE user_id = ?');
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
    const stmt = db.prepare('SELECT * FROM emails ORDER BY created_at DESC');
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
    const stmt = db.prepare('SELECT * FROM user_customer_links ORDER BY created_at DESC');
    const results = stmt.all();
    return { success: true, data: results };
  } catch (error) {
    console.error('Erro ao buscar todos os vínculos:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// Função para fechar a conexão com o banco de dados
function closeDatabase() {
  if (db) {
    console.log('Fechando conexão com o banco de dados de emails...');
    try {
      db.close();
      console.log('Banco de dados de emails fechado com sucesso');
    } catch (err) {
      console.error('Erro ao fechar o banco de dados de emails:', err.message);
    }
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
  closeDatabase
}; 