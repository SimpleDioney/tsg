const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const path = require('path');

const PLANILHA_HTML_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRMAVWNkGgyUU6PUTw3cW-Oeepkhznh4RlduXMy1x4KUmCPEGAsv73nipgXhel4Ug/pubhtml';
const DATABASE_PATH = path.join(__dirname, 'sheetDatabase.db');

let db;

function initDatabase() {
  db = new sqlite3.Database(DATABASE_PATH, (err) => {
    if (err) {
      console.error('Erro ao abrir banco da planilha:', err);
    } else {
      console.log('Banco da planilha carregado');
      db.run(`CREATE TABLE IF NOT EXISTS customers (
        codigo TEXT,
        nome_produto TEXT,
        referencia TEXT,
        preco TEXT,
        codigo_pedido TEXT,
        assinante_newsletter TEXT,
        variacao_1 TEXT,
        variacao_2 TEXT,
        codigo_cliente TEXT,
        nome_cliente TEXT,
        email_cliente TEXT
      )`);

      // Cria tabela para cache de planos normalizados
      db.run(`CREATE TABLE IF NOT EXISTS normalized_plans (
        original_name TEXT PRIMARY KEY,
        normalized_name TEXT NOT NULL,
        last_updated INTEGER NOT NULL
      )`);
    }
  });
}

async function baixarPlanilha() {
  console.log('Baixando planilha em HTML...');
  try {
    const response = await axios.get(PLANILHA_HTML_URL);
    const html = response.data;

    const $ = cheerio.load(html);
    const rows = $('table.waffle tbody tr');

    const clientes = [];

    rows.each((i, row) => {
      const cols = $(row).find('td');
      if (cols.length >= 11) {
        const cliente = {
          codigo: $(cols[0]).text().trim(),
          nome_produto: $(cols[1]).text().trim(),
          referencia: $(cols[2]).text().trim(),
          preco: $(cols[3]).text().trim(),
          codigo_pedido: $(cols[4]).text().trim(),
          assinante_newsletter: $(cols[5]).text().trim(),
          variacao_1: $(cols[6]).text().trim(),
          variacao_2: $(cols[7]).text().trim(),
          codigo_cliente: $(cols[8]).text().trim(),
          nome_cliente: $(cols[9]).text().trim(),
          email_cliente: $(cols[10]).text().trim()
        };

        if (cliente.email_cliente && cliente.nome_produto) {
          clientes.push(cliente);
        }
      }
    });

    if (clientes.length === 0) {
      console.error('Nenhum cliente válido encontrado!');
      return;
    }

    console.log(`Planilha carregada: ${clientes.length} registros.`);
    

    db.serialize(() => {
      db.run('DELETE FROM customers', (err) => {
        if (err) {
          console.error('Erro ao limpar tabela:', err);
        } else {
          const stmt = db.prepare(`INSERT INTO customers (
            codigo, nome_produto, referencia, preco, codigo_pedido,
            assinante_newsletter, variacao_1, variacao_2,
            codigo_cliente, nome_cliente, email_cliente
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

          clientes.forEach(cliente => {
            stmt.run([
              cliente.codigo,
              cliente.nome_produto,
              cliente.referencia,
              cliente.preco,
              cliente.codigo_pedido,
              cliente.assinante_newsletter,
              cliente.variacao_1,
              cliente.variacao_2,
              cliente.codigo_cliente,
              cliente.nome_cliente,
              cliente.email_cliente
            ]);
          });

          stmt.finalize(async () => {
            console.log(`✅ Importação finalizada: ${clientes.length} clientes inseridos.`);
            
            // Atualiza o cache de planos normalizados após a importação
            try {
              await updateNormalizedPlansCache();
              console.log('✅ Cache de planos normalizados atualizado');
            } catch (error) {
              console.error('❌ Erro ao atualizar cache de planos:', error);
            }
          });
        }
      });
    });

  } catch (error) {
    console.error('Erro ao baixar planilha:', error);
  }
}

function buscarClientePorEmail(email) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM customers WHERE LOWER(TRIM(email_cliente)) = LOWER(TRIM(?))', [email.trim()], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function iniciarAtualizacaoAutomatica() {
  baixarPlanilha(); // Baixar ao iniciar
  cron.schedule('0 0 * * *', () => { // Atualizar a cada 24h
    console.log('Atualizando planilha automática...');
    baixarPlanilha();
  });
}

// Novo método: Retorna todos os planos únicos
function getPlanosUnicos() {
    return new Promise((resolve, reject) => {
      db.all('SELECT DISTINCT nome_produto FROM customers WHERE nome_produto IS NOT NULL AND nome_produto != ""', [], (err, rows) => {
        if (err) {
          console.error('Erro ao buscar planos únicos:', err);
          reject(err);
        } else {
          const planos = rows.map(r => r.nome_produto.trim()).filter(Boolean);
          resolve(planos);
        }
      });
    });
  }
  
// Função para normalizar o nome do plano
function normalizePlanName(originalName) {
  return originalName
    .replace(/^Kit\s+/i, '')          // Remove "Kit " do começo
    .replace(/\s*-\s*Tamanho.*$/i, '') // Remove "- Tamanho X" do final
    .trim();
}

// Função para atualizar o cache de planos normalizados
async function updateNormalizedPlansCache() {
  return new Promise((resolve, reject) => {
    db.all('SELECT DISTINCT nome_produto FROM customers WHERE nome_produto IS NOT NULL AND nome_produto != ""', [], async (err, rows) => {
      if (err) {
        console.error('Erro ao buscar planos para normalização:', err);
        reject(err);
        return;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      
      // Inicia uma transação para atualizar o cache
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Limpa o cache antigo
        db.run('DELETE FROM normalized_plans', (err) => {
          if (err) {
            console.error('Erro ao limpar cache de planos:', err);
            db.run('ROLLBACK');
            reject(err);
            return;
          }

          // Prepara a inserção dos novos dados
          const stmt = db.prepare('INSERT INTO normalized_plans (original_name, normalized_name, last_updated) VALUES (?, ?, ?)');
          
          // Processa cada plano
          rows.forEach(row => {
            const originalName = row.nome_produto.trim();
            const normalizedName = normalizePlanName(originalName);
            stmt.run([originalName, normalizedName, timestamp]);
          });

          stmt.finalize(() => {
            db.run('COMMIT', (err) => {
              if (err) {
                console.error('Erro ao commitar transação:', err);
                reject(err);
              } else {
                console.log('Cache de planos normalizados atualizado com sucesso');
                resolve();
              }
            });
          });
        });
      });
    });
  });
}

// Função para obter todos os planos normalizados únicos
function getNormalizedPlans() {
  return new Promise((resolve, reject) => {
    db.all('SELECT DISTINCT normalized_name FROM normalized_plans ORDER BY normalized_name', [], (err, rows) => {
      if (err) {
        console.error('Erro ao buscar planos normalizados:', err);
        reject(err);
      } else {
        const planos = rows.map(r => r.normalized_name);
        resolve(planos);
      }
    });
  });
}

// Função para obter o nome normalizado de um plano original
function getNormalizedPlanName(originalName) {
  return new Promise((resolve, reject) => {
    db.get('SELECT normalized_name FROM normalized_plans WHERE original_name = ?', [originalName], (err, row) => {
      if (err) {
        console.error('Erro ao buscar nome normalizado:', err);
        reject(err);
      } else if (row) {
        resolve(row.normalized_name);
      } else {
        // Se não encontrar, normaliza na hora
        resolve(normalizePlanName(originalName));
      }
    });
  });
}

// Função para buscar duplicatas de email e seus preços
function buscarDuplicatasEmail(email) {
  return new Promise((resolve, reject) => {
    console.log(`[DEBUG] Buscando duplicatas para o email: ${email}`);
    
    const query = `
      SELECT 
        email_cliente,
        nome_produto,
        preco,
        CAST(REPLACE(REPLACE(REPLACE(preco, 'R$', ''), '.', ''), ',', '.') AS DECIMAL(10,2)) as preco_decimal
      FROM customers 
      WHERE LOWER(TRIM(email_cliente)) = LOWER(TRIM(?))
      ORDER BY preco_decimal DESC
    `;

    console.log(`[DEBUG] Query SQL:`, query);

    db.all(query, [email], (err, rows) => {
      if (err) {
        console.error('Erro ao buscar duplicatas:', err);
        reject(err);
      } else {
        console.log(`[DEBUG] Duplicatas encontradas:`, rows);
        resolve(rows);
      }
    });
  });
}

// Função para obter o plano com maior preço
async function obterPlanoMaiorPreco(email) {
  try {
    const duplicatas = await buscarDuplicatasEmail(email);
    if (duplicatas.length === 0) {
      return null;
    }
    
    // Retorna o primeiro resultado já que a query ordena por preço DESC
    return {
      nome_produto: duplicatas[0].nome_produto,
      preco: duplicatas[0].preco_decimal,
      total_duplicatas: duplicatas.length
    };
  } catch (error) {
    console.error('Erro ao obter plano com maior preço:', error);
    throw error;
  }
}

module.exports = {
  initDatabase,
  iniciarAtualizacaoAutomatica,
  buscarClientePorEmail,
  getPlanosUnicos,
  getNormalizedPlans,
  getNormalizedPlanName,
  updateNormalizedPlansCache,
  buscarDuplicatasEmail,
  obterPlanoMaiorPreco
};
