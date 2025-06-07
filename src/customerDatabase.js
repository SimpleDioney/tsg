// customerDatabase.js atualizado

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
const dbPath = path.join(dataDir, 'customers.db');

console.log(`Usando banco de dados de clientes em: ${dbPath}`);

// Inicializa o banco de dados
const db = new Database(dbPath, {
  verbose: null,
  fileMustExist: false,
  timeout: 5000,
});

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

const CHECKPOINT_INTERVAL = 30000;
let checkpointInterval = null;

function executeCheckpoint() {
  try {
    db.pragma('wal_checkpoint(PASSIVE)');
    console.log('Checkpoint do banco de clientes executado com sucesso');
  } catch (error) {
    console.error('Erro ao executar checkpoint do banco de clientes:', error);
  }
}

function initDatabase() {
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        discord_role_id TEXT,
        created TEXT,
        modified TEXT
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT,
        cpf TEXT,
        birth_date TEXT,
        gender TEXT,
        email TEXT UNIQUE,
        cnpj TEXT,
        last_visit TEXT,
        city TEXT,
        state TEXT,
        newsletter TEXT,
        plan_id TEXT,
        created TEXT,
        registration_date TEXT,
        modified TEXT,
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS customer_addresses (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        address TEXT,
        number TEXT,
        complement TEXT,
        district TEXT,
        city TEXT,
        state TEXT,
        zip_code TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `).run();

    db.prepare(`CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_customers_plan_id ON customers(plan_id)`).run();
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id)`).run();

    console.log('Banco de dados de clientes inicializado com sucesso!');

    if (checkpointInterval === null) {
      checkpointInterval = setInterval(executeCheckpoint, CHECKPOINT_INTERVAL);
      console.log(`Intervalo de checkpoint do banco de clientes configurado para ${CHECKPOINT_INTERVAL/1000} segundos`);
    }

  } catch (error) {
    console.error('Erro ao inicializar banco de dados de clientes:', error);
  }
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
    if (checkpointInterval !== null) {
      clearInterval(checkpointInterval);
      checkpointInterval = null;
    }

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