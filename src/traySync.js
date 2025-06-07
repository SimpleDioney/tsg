const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const TrayApiClient = require('./trayApiClient');

// Configuração do banco de dados
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Caminho do banco de dados de configuração
const configDbPath = path.join(dataDir, 'tray_config.db');
const configDb = new sqlite3.Database(configDbPath);

// Caminho do banco de dados de clientes
const customersDbPath = path.join(dataDir, 'customers.db');
const customersDb = new sqlite3.Database(customersDbPath);

// Cliente da API Tray
const trayClient = new TrayApiClient();

// Função para executar consultas de forma assíncrona
function runAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Função para executar consultas que retornam uma única linha
function getAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Função para executar consultas que retornam múltiplas linhas
function allAsync(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Inicializa o banco de dados de configuração da Tray
 */
function initTrayConfigDatabase() {
  const createTableSQL = `
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
    );
  `;

  configDb.exec(createTableSQL, (err) => {
    if (err) {
      console.error('Erro ao criar tabela de configuração:', err);
    } else {
      console.log('Tabela de configuração criada com sucesso');
    }
  });
}

/**
 * Salva as informações de autenticação da Tray no banco de dados
 * @param {Object} authData - Dados de autenticação
 * @returns {Object} - Resultado da operação
 */
function saveAuthConfig(authData) {
  try {
    const stmt = configDb.prepare(`
      INSERT OR REPLACE INTO tray_config 
      (id, api_address, access_token, refresh_token, api_host, expiration_date, refresh_expiration_date, store_id)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      authData.api_address,
      authData.access_token,
      authData.refresh_token,
      authData.api_host,
      authData.date_expiration_access_token,
      authData.date_expiration_refresh_token,
      authData.store_id
    );

    return { success: true };
  } catch (error) {
    console.error('Erro ao salvar configuração de autenticação da Tray:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

/**
 * Carrega as informações de autenticação da Tray do banco de dados
 * @returns {Object} - Dados de autenticação
 */
function loadAuthConfig() {
  try {
    const stmt = configDb.prepare('SELECT * FROM tray_config WHERE id = 1');
    const config = stmt.get();
    
    if (!config) {
      return { success: false, error: 'CONFIG_NOT_FOUND' };
    }
    
    return { success: true, data: config };
  } catch (error) {
    console.error('Erro ao carregar configuração de autenticação da Tray:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

/**
 * Atualiza a data da última sincronização
 * @returns {Object} - Resultado da operação
 */
function updateLastSyncDate() {
  try {
    const now = new Date().toISOString();
    const stmt = configDb.prepare('UPDATE tray_config SET last_sync = ? WHERE id = 1');
    stmt.run(now);
    
    return { success: true, data: { last_sync: now } };
  } catch (error) {
    console.error('Erro ao atualizar data da última sincronização:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

/**
 * Inicializa o cliente da API Tray com as credenciais salvas
 * @returns {Promise<Object>} - Resultado da inicialização
 */
async function initTrayApiClient() {
  try {
    const configResult = loadAuthConfig();
    if (!configResult.success) {
      return configResult;
    }
    
    const config = configResult.data;
    
    // Configura o cliente da API com os tokens salvos
    trayClient.accessToken = config.access_token;
    trayClient.refreshToken = config.refresh_token;
    trayClient.apiHost = config.api_host;
    trayClient.expirationDate = new Date(config.expiration_date);
    trayClient.refreshExpirationDate = new Date(config.refresh_expiration_date);
    
    // Verifica se o token ainda é válido ou precisa ser atualizado
    const isTokenValid = await trayClient.ensureValidToken();
    if (!isTokenValid) {
      return { 
        success: false, 
        error: 'INVALID_TOKEN', 
        message: 'Não foi possível obter um token válido' 
      };
    }
    
    // Se o token foi atualizado, salva as novas informações
    saveAuthConfig({
      api_address: config.api_address,
      access_token: trayClient.accessToken,
      refresh_token: trayClient.refreshToken,
      api_host: trayClient.apiHost,
      date_expiration_access_token: trayClient.expirationDate.toISOString(),
      date_expiration_refresh_token: trayClient.refreshExpirationDate.toISOString(),
      store_id: config.store_id
    });
    
    return { success: true };
  } catch (error) {
    console.error('Erro ao inicializar cliente da API Tray:', error);
    return { success: false, error: 'INIT_ERROR', message: error.message };
  }
}

/**
 * Autentica com a API da Tray e salva as informações
 * @param {string} apiAddress - Endereço da API
 * @param {string} consumerKey - Chave do consumidor
 * @param {string} consumerSecret - Chave secreta do consumidor
 * @param {string} code - Código de autorização
 * @returns {Promise<Object>} - Resultado da autenticação
 */
async function authenticateWithTray(apiAddress, consumerKey, consumerSecret, code) {
  try {
    const authResult = await trayClient.authenticate(apiAddress, consumerKey, consumerSecret, code);
    
    if (!authResult.success) {
      return authResult;
    }
    
    // Salva as informações de autenticação
    const saveResult = saveAuthConfig({
      api_address: apiAddress,
      ...authResult.data
    });
    
    if (!saveResult.success) {
      return saveResult;
    }
    
    return { success: true, data: authResult.data };
  } catch (error) {
    console.error('Erro ao autenticar com a Tray:', error);
    return { success: false, error: 'AUTH_ERROR', message: error.message };
  }
}

/**
 * Verifica se um plano existe no banco de dados local
 * @param {string} planId - ID do plano
 * @returns {boolean} - True se o plano existe
 */
function planExists(planId) {
  try {
    const stmt = customersDb.prepare('SELECT 1 FROM plans WHERE id = ?');
    const result = stmt.get(planId);
    return !!result;
  } catch (error) {
    console.error(`Erro ao verificar existência do plano ${planId}:`, error);
    return false;
  }
}

/**
 * Mapeia um cliente da Tray para o formato do banco de dados local
 * @param {Object} trayCustomer - Cliente no formato da API da Tray
 * @returns {Object} - Cliente no formato do banco de dados local
 */
function mapTrayCustomerToLocalFormat(trayCustomer) {
  if (!trayCustomer || !trayCustomer.Customer) {
    return null;
  }
  
  const customer = trayCustomer.Customer;
  
  // Verifica se o plano 'basic' existe, caso contrário, não associa plano
  const defaultPlan = 'basic';
  const plan_id = planExists(defaultPlan) ? defaultPlan : null;
  
  return {
    id: customer.id,
    name: customer.name,
    cpf: customer.cpf,
    birth_date: customer.birth_date,
    gender: customer.gender,
    email: customer.email,
    cnpj: customer.cnpj,
    last_visit: customer.last_visit,
    city: customer.city,
    state: customer.state,
    newsletter: customer.newsletter,
    plan_id: plan_id,
    created: customer.created,
    registration_date: customer.registration_date,
    modified: customer.modified
  };
}

/**
 * Mapeia um endereço da Tray para o formato do banco de dados local
 * @param {Object} trayAddress - Endereço no formato da API da Tray
 * @param {string} customerId - ID do cliente
 * @returns {Object} - Endereço no formato do banco de dados local
 */
function mapTrayAddressToLocalFormat(trayAddress, customerId) {
  return {
    id: trayAddress.id,
    customer_id: customerId,
    address: trayAddress.address,
    number: trayAddress.number,
    complement: trayAddress.complement || '',
    district: trayAddress.neighborhood,
    city: trayAddress.city,
    state: trayAddress.state,
    zip_code: trayAddress.zip_code
  };
}

/**
 * Salva um cliente no banco de dados local
 * @param {Object} customer - Cliente no formato do banco de dados local
 * @returns {Object} - Resultado da operação
 */
function saveCustomerToLocalDB(customer) {
  try {
    // Verifica se os campos obrigatórios estão presentes
    if (!customer.id) {
      return { 
        success: false, 
        error: 'MISSING_REQUIRED_FIELD', 
        message: 'Campo obrigatório ID não fornecido' 
      };
    }

    // Verifica se o plano associado existe (se um plano foi especificado)
    if (customer.plan_id && !planExists(customer.plan_id)) {
      console.warn(`Plano ${customer.plan_id} não encontrado para o cliente ${customer.id}. Removendo associação.`);
      customer.plan_id = null;
    }

    // Tenta inserir o cliente
    const stmt = customersDb.prepare(`
      INSERT OR REPLACE INTO customers 
      (id, name, cpf, birth_date, gender, email, cnpj, last_visit, city, state, newsletter, plan_id, created, registration_date, modified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      customer.id,
      customer.name || '',
      customer.cpf || '',
      customer.birth_date || null,
      customer.gender || '',
      customer.email || '',
      customer.cnpj || '',
      customer.last_visit || null,
      customer.city || '',
      customer.state || '',
      customer.newsletter || '0',
      customer.plan_id,
      customer.created || new Date().toISOString(),
      customer.registration_date || null,
      customer.modified || new Date().toISOString()
    );

    return { success: true, data: { id: customer.id } };
  } catch (error) {
    console.error(`Erro ao salvar cliente ${customer.id} no banco local:`, error);
    return { 
      success: false, 
      error: 'DATABASE_ERROR', 
      message: error.message,
      details: {
        customer_id: customer.id,
        customer_email: customer.email,
        error_code: error.code
      }
    };
  }
}

/**
 * Salva um endereço no banco de dados local
 * @param {Object} address - Endereço no formato do banco de dados local
 * @returns {Object} - Resultado da operação
 */
function saveAddressToLocalDB(address) {
  try {
    // Verifica se os campos obrigatórios estão presentes
    if (!address.id || !address.customer_id) {
      return { 
        success: false, 
        error: 'MISSING_REQUIRED_FIELD', 
        message: `Campo obrigatório não fornecido: ${!address.id ? 'id' : 'customer_id'}` 
      };
    }

    // Verifica se o cliente associado existe
    const customerExists = customersDb.prepare('SELECT 1 FROM customers WHERE id = ?').get(address.customer_id);
    if (!customerExists) {
      return { 
        success: false, 
        error: 'CUSTOMER_NOT_FOUND', 
        message: `Cliente ${address.customer_id} não encontrado` 
      };
    }

    // Tenta inserir o endereço
    const stmt = customersDb.prepare(`
      INSERT OR REPLACE INTO customer_addresses 
      (id, customer_id, address, number, complement, district, city, state, zip_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      address.id,
      address.customer_id,
      address.address || '',
      address.number || '',
      address.complement || '',
      address.district || '',
      address.city || '',
      address.state || '',
      address.zip_code || ''
    );

    return { success: true, data: { id: address.id } };
  } catch (error) {
    console.error(`Erro ao salvar endereço ${address.id} no banco local:`, error);
    return { 
      success: false, 
      error: 'DATABASE_ERROR', 
      message: error.message,
      details: {
        address_id: address.id,
        customer_id: address.customer_id,
        error_code: error.code
      }
    };
  }
}

/**
 * Cria os planos padrão no banco de dados local se eles não existirem
 * @returns {Object} - Resultado da operação
 */
function ensureDefaultPlansExist() {
  try {
    // Verifica se a tabela de planos existe
    try {
      customersDb.prepare('SELECT 1 FROM plans LIMIT 1').get();
    } catch (error) {
      // Se a tabela não existir, considera que o banco ainda não foi inicializado
      console.log('Tabela de planos não encontrada. Prosseguindo com a importação sem verificação de planos.');
      return { success: true };
    }

    // Planos padrão
    const defaultPlans = [
      {
        id: 'basic',
        name: 'Plano Básico',
        description: 'Acesso a funcionalidades básicas',
        discord_role_id: '1234567890123456',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      },
      {
        id: 'premium',
        name: 'Plano Premium',
        description: 'Acesso a funcionalidades premium com suporte prioritário',
        discord_role_id: '1234567890123457',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      },
      {
        id: 'vip',
        name: 'Plano VIP',
        description: 'Acesso total a todas as funcionalidades e suporte exclusivo',
        discord_role_id: '1234567890123458',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      }
    ];

    // Prepara a instrução SQL
    const stmt = customersDb.prepare(`
      INSERT OR IGNORE INTO plans (id, name, description, discord_role_id, created, modified)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Insere os planos
    for (const plan of defaultPlans) {
      stmt.run(
        plan.id,
        plan.name,
        plan.description,
        plan.discord_role_id,
        plan.created,
        plan.modified
      );
    }

    console.log('Planos padrão verificados/criados com sucesso.');
    return { success: true };
  } catch (error) {
    console.error('Erro ao criar planos padrão:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

/**
 * Importa todos os clientes da Tray para o banco de dados local
 * @returns {Promise<Object>} - Resultado da importação
 */
async function importAllCustomersFromTray() {
  try {
    // Garante que o cliente da API esteja inicializado
    await initTrayApiClient();
    
    // Garante que os planos padrão existam
    ensureDefaultPlansExist();
    
    let page = 1;
    let totalImported = 0;
    let hasMorePages = true;
    
    while (hasMorePages) {
      const result = await trayClient.listCustomers({ page, limit: 50 });
      
      if (!result.success || !result.data.Customers || result.data.Customers.length === 0) {
        hasMorePages = false;
        continue;
      }
      
      // Processa cada cliente
      for (const item of result.data.Customers) {
        try {
          // Busca os detalhes do cliente
          const customerDetails = await trayClient.getCustomer(item.Customer.id);
          
          if (!customerDetails.success) {
            console.error(`Erro ao buscar detalhes do cliente ${item.Customer.id}`);
            continue;
          }
          
          // Mapeia o cliente para o formato local e salva
          const localCustomer = mapTrayCustomerToLocalFormat(customerDetails.data);
          if (localCustomer) {
            const saveResult = saveCustomerToLocalDB(localCustomer);
            
            if (!saveResult.success) {
              console.error(`Erro ao salvar cliente ${localCustomer.id}:`, saveResult.error);
              continue;
            }
            
            // Processa os endereços do cliente
            if (customerDetails.data.Customer.CustomerAddress) {
              // Se for um único endereço ou uma matriz de endereços
              const addresses = Array.isArray(customerDetails.data.Customer.CustomerAddress) 
                ? customerDetails.data.Customer.CustomerAddress 
                : [customerDetails.data.Customer.CustomerAddress];
              
              for (const addrItem of addresses) {
                // Se o item contém apenas um ID, busca os detalhes do endereço
                if (addrItem.id && Object.keys(addrItem).length === 1) {
                  // Aqui precisaríamos de uma chamada para obter endereço por ID, mas não está disponível na API
                  // Por enquanto, vamos pular esses endereços
                  continue;
                }
                
                const localAddress = mapTrayAddressToLocalFormat(addrItem, localCustomer.id);
                saveAddressToLocalDB(localAddress);
              }
            }
            
            totalImported++;
          }
        } catch (error) {
          console.error(`Erro ao processar cliente ${item.Customer.id}:`, error);
          // Continua com o próximo cliente
          continue;
        }
      }
      
      // Se temos menos clientes que o limite, não há mais páginas
      hasMorePages = result.data.Customers.length >= 50;
      page++;
    }
    
    // Atualiza a data da última sincronização
    updateLastSyncDate();
    
    return { 
      success: true, 
      data: { 
        total_imported: totalImported 
      } 
    };
  } catch (error) {
    console.error('Erro ao importar clientes da Tray:', error);
    return { success: false, error: 'IMPORT_ERROR', message: error.message };
  }
}

/**
 * Busca um cliente pelo email na API da Tray e salva no banco de dados local
 * @param {string} email - Email do cliente
 * @returns {Promise<Object>} - Dados do cliente
 */
async function getCustomerByEmailFromTray(email) {
  try {
    // Inicializa o cliente da API da Tray
    const initResult = await initTrayApiClient();
    if (!initResult.success) {
      return initResult;
    }
    
    // Busca o cliente na API da Tray
    const result = await trayClient.listCustomers({ email });
    
    if (!result.success) {
      return result;
    }
    
    // Verifica se encontrou algum cliente
    if (!result.data.Customers || result.data.Customers.length === 0) {
      return {
        success: false,
        error: 'CUSTOMER_NOT_FOUND',
        message: `Cliente com email ${email} não encontrado na Tray`
      };
    }
    
    // Pega o primeiro cliente encontrado (geralmente será apenas um)
    const customerId = result.data.Customers[0].Customer.id;
    
    // Busca os detalhes completos do cliente
    const customerDetails = await trayClient.getCustomer(customerId);
    
    if (!customerDetails.success) {
      return customerDetails;
    }
    
    // Garante que os planos padrão existam antes de salvar o cliente
    ensureDefaultPlansExist();
    
    // Converte o cliente para o formato local
    const localCustomer = mapTrayCustomerToLocalFormat(customerDetails.data);
    
    if (!localCustomer) {
      return {
        success: false,
        error: 'MAPPING_ERROR',
        message: 'Erro ao mapear dados do cliente'
      };
    }
    
    // Salva o cliente no banco de dados local
    const saveResult = saveCustomerToLocalDB(localCustomer);
    
    if (!saveResult.success) {
      return saveResult;
    }
    
    // Processa e salva os endereços do cliente
    if (customerDetails.data.Customer.CustomerAddress) {
      const addresses = Array.isArray(customerDetails.data.Customer.CustomerAddress) 
        ? customerDetails.data.Customer.CustomerAddress 
        : [customerDetails.data.Customer.CustomerAddress];
      
      for (const addrItem of addresses) {
        // Se o item contém apenas um ID, busca os detalhes do endereço
        if (addrItem.id && Object.keys(addrItem).length === 1) {
          // Pula este endereço pois não temos dados completos
          continue;
        }
        
        const localAddress = mapTrayAddressToLocalFormat(addrItem, localCustomer.id);
        saveAddressToLocalDB(localAddress);
      }
    }
    
    // Retorna os dados do cliente salvo
    return {
      success: true,
      data: {
        customer: localCustomer
      }
    };
  } catch (error) {
    console.error(`Erro ao buscar cliente pelo email ${email}:`, error);
    return {
      success: false,
      error: 'API_ERROR',
      message: error.message
    };
  }
}

/**
 * Verifica e fecha as conexões com o banco de dados
 */
function closeDatabases() {
  try {
    configDb.close();
    customersDb.close();
    console.log('Conexões com bancos de dados fechadas');
    return { success: true };
  } catch (error) {
    console.error('Erro ao fechar conexões com bancos de dados:', error);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

module.exports = {
  initTrayConfigDatabase,
  authenticateWithTray,
  importAllCustomersFromTray,
  loadAuthConfig,
  initTrayApiClient,
  ensureDefaultPlansExist,
  getCustomerByEmailFromTray,
  closeDatabases
}; 