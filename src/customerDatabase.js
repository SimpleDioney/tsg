// customerDatabase.js atualizado

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
const dbPath = path.join(dataDir, 'customers.db');

console.log(`Usando banco de dados de clientes em: ${dbPath}`);

// Inicializa o banco de dados
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao abrir o banco de dados de clientes:', err);
    return;
  }
  console.log('Conexão com o banco de dados de clientes estabelecida');
  
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

function initDatabase() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      discord_role_id TEXT,
      created TEXT,
      updated TEXT
    );
    
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      plan_id TEXT,
      status TEXT DEFAULT 'active',
      created TEXT,
      updated TEXT,
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    );
  `;

  db.exec(createTableSQL, (err) => {
    if (err) {
      console.error('Erro ao criar tabelas do banco de clientes:', err);
    } else {
      console.log('Tabelas do banco de clientes criadas com sucesso');
    }
  });
}

function getCustomerByEmail(email) {
  try {
    const stmt = db.prepare('SELECT * FROM customers WHERE email = ?');
    const customer = stmt.get(email);

    if (!customer) {
      return { success: false, error: 'CUSTOMER_NOT_FOUND' };
    }

    const addrStmt = db.prepare('SELECT id FROM customer_addresses WHERE customer_id = ?');
    const addresses = addrStmt.all(customer.id);

    let plan = null;
    if (customer.plan_id) {
      const planStmt = db.prepare('SELECT * FROM plans WHERE id = ?');
      plan = planStmt.get(customer.plan_id);
    }

    const result = {
      success: true,
      data: {
        Customer: {
          ...customer,
          CustomerAddress: addresses,
          Plan: plan
        }
      }
    };

    return result;
  } catch (error) {
    console.error('Erro ao buscar cliente por email:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

function getPlanById(planId) {
  try {
    const stmt = db.prepare('SELECT * FROM plans WHERE id = ?');
    const plan = stmt.get(planId);

    if (!plan) {
      return { success: false, error: 'PLAN_NOT_FOUND' };
    }

    return { success: true, data: plan };
  } catch (error) {
    console.error('Erro ao buscar plano por ID:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

function getPlanByName(planName) {
  try {
    const stmt = db.prepare('SELECT * FROM plans WHERE name = ?');
    const plan = stmt.get(planName);

    if (!plan) {
      return { success: false, error: 'PLAN_NOT_FOUND' };
    }

    return { success: true, data: plan };
  } catch (error) {
    console.error('Erro ao buscar plano por nome:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

function createPlan(planData) {
  try {
    const stmt = db.prepare(`
      INSERT INTO plans (id, name, description, discord_role_id, created, modified)
      VALUES (?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))
    `);

    const generatedId = planData.name.toLowerCase().replace(/\s+/g, '-');

    stmt.run(
      generatedId,
      planData.name,
      planData.description || '',
      planData.discord_role_id || null
    );

    console.log(`Plano ${planData.name} criado com ID ${generatedId}`);
    return { success: true, data: { id: generatedId } };
  } catch (error) {
    console.error('Erro ao criar plano:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

function getAllPlans() {
  try {
    const stmt = db.prepare('SELECT * FROM plans ORDER BY name');
    const plans = stmt.all();

    return { success: true, data: plans };
  } catch (error) {
    console.error('Erro ao buscar todos os planos:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

function updatePlanRole(planId, roleId) {
  try {
    const planCheck = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
    if (!planCheck) {
      return { success: false, error: 'PLAN_NOT_FOUND' };
    }

    const stmt = db.prepare(`
      UPDATE plans 
      SET discord_role_id = ?, 
          modified = strftime('%s','now') 
      WHERE id = ?
    `);

    const result = stmt.run(roleId, planId);

    if (result.changes > 0) {
      console.log(`Cargo do plano ${planId} atualizado para ${roleId}`);
      return { success: true, data: { plan_id: planId, role_id: roleId } };
    } else {
      return { success: false, error: 'NO_CHANGES' };
    }
  } catch (error) {
    console.error('Erro ao atualizar cargo do plano:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

function closeDatabase() {
  try {
    executeCheckpoint();
    db.close();
    console.log('Conexão com o banco de dados de clientes fechada');
    return { success: true };
  } catch (error) {
    console.error('Erro ao fechar conexão com o banco de dados de clientes:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

module.exports = {
  initDatabase,
  getCustomerByEmail,
  getPlanById,
  getPlanByName,
  createPlan,
  getAllPlans,
  updatePlanRole,
  closeDatabase
};