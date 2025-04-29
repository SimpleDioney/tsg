const axios = require('axios');
const querystring = require('querystring');
const TrayRateLimiter = require('./trayRateLimiter');

class TrayApiClient {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.apiHost = null;
    this.expirationDate = null;
    this.refreshExpirationDate = null;
    // Inicializa o limitador de taxa para 180 requisições por minuto
    this.rateLimiter = new TrayRateLimiter(180);
  }

  /**
   * Autentica com a API da Tray usando as credenciais
   * @param {string} apiAddress - Endereço da API da loja (ex: www.urldaloja.com.br/web_api)
   * @param {string} consumerKey - Chave do consumidor
   * @param {string} consumerSecret - Chave secreta do consumidor
   * @param {string} code - Código de autorização
   * @returns {Promise<Object>} - Objeto contendo as chaves de acesso
   */
  async authenticate(apiAddress, consumerKey, consumerSecret, code) {
    return this.rateLimiter.submitRequest(async () => {
      try {
        const data = querystring.stringify({
          consumer_key: consumerKey,
          consumer_secret: consumerSecret,
          code: code
        });

        const response = await axios.post(`https://${apiAddress}/auth`, data, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        if (response.data && response.data.access_token) {
          this.accessToken = response.data.access_token;
          this.refreshToken = response.data.refresh_token;
          this.apiHost = response.data.api_host;
          this.expirationDate = new Date(response.data.date_expiration_access_token);
          this.refreshExpirationDate = new Date(response.data.date_expiration_refresh_token);
          
          return {
            success: true,
            data: response.data
          };
        } else {
          console.error('Falha na autenticação com a API da Tray:', response.data);
          return {
            success: false,
            error: 'AUTH_FAILED',
            data: response.data
          };
        }
      } catch (error) {
        console.error('Erro ao autenticar com a API da Tray:', error.message);
        return {
          success: false,
          error: 'REQUEST_ERROR',
          message: error.message
        };
      }
    });
  }

  /**
   * Atualiza o token de acesso usando o refresh token
   * @returns {Promise<Object>} - Objeto contendo as novas chaves de acesso
   */
  async refreshAccessToken() {
    if (!this.apiHost || !this.refreshToken) {
      return {
        success: false,
        error: 'NO_REFRESH_TOKEN',
        message: 'Não há token de atualização disponível. Autentique-se primeiro.'
      };
    }

    return this.rateLimiter.submitRequest(async () => {
      try {
        const apiUrl = `${this.apiHost}/auth?refresh_token=${this.refreshToken}`;
        const response = await axios.get(apiUrl);

        if (response.data && response.data.access_token) {
          this.accessToken = response.data.access_token;
          this.refreshToken = response.data.refresh_token;
          this.expirationDate = new Date(response.data.date_expiration_access_token);
          this.refreshExpirationDate = new Date(response.data.date_expiration_refresh_token);
          
          return {
            success: true,
            data: response.data
          };
        } else {
          console.error('Falha ao atualizar token:', response.data);
          return {
            success: false,
            error: 'REFRESH_FAILED',
            data: response.data
          };
        }
      } catch (error) {
        console.error('Erro ao atualizar token:', error.message);
        return {
          success: false,
          error: 'REQUEST_ERROR',
          message: error.message
        };
      }
    });
  }

  /**
   * Verifica se o token está expirado e atualiza se necessário
   * @returns {Promise<boolean>} - True se o token está válido ou foi atualizado com sucesso
   */
  async ensureValidToken() {
    if (!this.accessToken || !this.expirationDate) {
      return false;
    }

    const now = new Date();
    if (now >= this.expirationDate) {
      console.log('[Tray API] Token expirado, realizando atualização...');
      const result = await this.refreshAccessToken();
      return result.success;
    }

    return true;
  }

  /**
   * Lista todos os clientes
   * @param {Object} params - Parâmetros opcionais (limit, page, etc)
   * @returns {Promise<Object>} - Lista de clientes
   */
  async listCustomers(params = {}) {
    const isTokenValid = await this.ensureValidToken();
    if (!isTokenValid) {
      return {
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Token inválido ou expirado'
      };
    }

    return this.rateLimiter.submitRequest(async () => {
      try {
        const queryParams = new URLSearchParams({
          access_token: this.accessToken,
          ...params
        }).toString();

        const response = await axios.get(`${this.apiHost}/customers?${queryParams}`);
        return {
          success: true,
          data: response.data
        };
      } catch (error) {
        console.error('Erro ao listar clientes:', error.message);
        return {
          success: false,
          error: 'REQUEST_ERROR',
          message: error.message
        };
      }
    });
  }

  /**
   * Obtém os detalhes de um cliente específico
   * @param {string} id - ID do cliente
   * @returns {Promise<Object>} - Detalhes do cliente
   */
  async getCustomer(id) {
    const isTokenValid = await this.ensureValidToken();
    if (!isTokenValid) {
      return {
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Token inválido ou expirado'
      };
    }

    return this.rateLimiter.submitRequest(async () => {
      try {
        const queryParams = new URLSearchParams({
          access_token: this.accessToken
        }).toString();

        const response = await axios.get(`${this.apiHost}/customers/${id}?${queryParams}`);
        return {
          success: true,
          data: response.data
        };
      } catch (error) {
        console.error(`Erro ao obter cliente ${id}:`, error.message);
        return {
          success: false,
          error: 'REQUEST_ERROR',
          message: error.message
        };
      }
    });
  }

  /**
   * Cria um novo cliente
   * @param {Object} customerData - Dados do cliente
   * @returns {Promise<Object>} - Resultado da criação
   */
  async createCustomer(customerData) {
    const isTokenValid = await this.ensureValidToken();
    if (!isTokenValid) {
      return {
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Token inválido ou expirado'
      };
    }

    return this.rateLimiter.submitRequest(async () => {
      try {
        // Transformando o objeto em formato aceito pela API da Tray
        const data = {};
        Object.entries(customerData).forEach(([key, value]) => {
          data[`Customer[${key}]`] = value;
        });

        if (customerData.CustomerAddress) {
          customerData.CustomerAddress.forEach((address, index) => {
            Object.entries(address).forEach(([key, value]) => {
              data[`Customer[CustomerAddress][${index}][${key}]`] = value;
            });
          });
        }

        const formData = querystring.stringify(data);
        const url = `${this.apiHost}/customers?access_token=${this.accessToken}`;
        
        const response = await axios.post(url, formData, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        return {
          success: true,
          data: response.data
        };
      } catch (error) {
        console.error('Erro ao criar cliente:', error.message);
        return {
          success: false,
          error: 'REQUEST_ERROR',
          message: error.message
        };
      }
    });
  }

  /**
   * Atualiza um cliente existente
   * @param {string} id - ID do cliente
   * @param {Object} customerData - Dados do cliente
   * @returns {Promise<Object>} - Resultado da atualização
   */
  async updateCustomer(id, customerData) {
    const isTokenValid = await this.ensureValidToken();
    if (!isTokenValid) {
      return {
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Token inválido ou expirado'
      };
    }

    return this.rateLimiter.submitRequest(async () => {
      try {
        // Transformando o objeto em formato aceito pela API da Tray
        const data = {};
        Object.entries(customerData).forEach(([key, value]) => {
          data[`Customer[${key}]`] = value;
        });

        const formData = querystring.stringify(data);
        const url = `${this.apiHost}/customers/${id}?access_token=${this.accessToken}`;
        
        const response = await axios.put(url, formData, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        return {
          success: true,
          data: response.data
        };
      } catch (error) {
        console.error(`Erro ao atualizar cliente ${id}:`, error.message);
        return {
          success: false,
          error: 'REQUEST_ERROR',
          message: error.message
        };
      }
    });
  }

  /**
   * Exclui um cliente
   * @param {string} id - ID do cliente
   * @returns {Promise<Object>} - Resultado da exclusão
   */
  async deleteCustomer(id) {
    const isTokenValid = await this.ensureValidToken();
    if (!isTokenValid) {
      return {
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Token inválido ou expirado'
      };
    }

    return this.rateLimiter.submitRequest(async () => {
      try {
        const url = `${this.apiHost}/customers/${id}?access_token=${this.accessToken}`;
        const response = await axios.delete(url);

        return {
          success: true,
          data: response.data
        };
      } catch (error) {
        console.error(`Erro ao excluir cliente ${id}:`, error.message);
        return {
          success: false,
          error: 'REQUEST_ERROR',
          message: error.message
        };
      }
    });
  }
}

module.exports = TrayApiClient; 