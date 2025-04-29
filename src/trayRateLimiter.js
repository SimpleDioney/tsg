/**
 * Classe para implementar limitação de requisições à API Tray
 * Limita o número de requisições a 180 por minuto (3 por segundo)
 */
class TrayRateLimiter {
  constructor(requestsPerMinute = 180) {
    this.requestsPerMinute = requestsPerMinute;
    this.requestsThisMinute = 0;
    this.requestQueue = [];
    this.processingQueue = false;
    this.lastResetTime = Date.now();
    
    // Intervalo para resetar o contador a cada minuto
    setInterval(() => this.resetCounter(), 60000);
  }

  /**
   * Reseta o contador de requisições para o novo minuto
   */
  resetCounter() {
    this.requestsThisMinute = 0;
    this.lastResetTime = Date.now();
    console.log(`[Tray Rate Limiter] Contador de requisições resetado. ${this.requestQueue.length} requisições na fila.`);
    
    // Processa a fila se houver requisições pendentes
    if (this.requestQueue.length > 0 && !this.processingQueue) {
      this.processQueue();
    }
  }

  /**
   * Calcula o tempo restante para o próximo reset de contador
   * @returns {number} - Tempo em milissegundos
   */
  getTimeUntilReset() {
    const now = Date.now();
    const elapsed = now - this.lastResetTime;
    return Math.max(0, 60000 - elapsed);
  }

  /**
   * Submete uma função para ser executada respeitando o limite de taxa
   * @param {Function} requestFn - Função que faz a requisição à API
   * @returns {Promise} - Promessa que resolve com o resultado da requisição
   */
  async submitRequest(requestFn) {
    return new Promise((resolve, reject) => {
      // Adiciona a requisição à fila
      this.requestQueue.push({ requestFn, resolve, reject });
      
      // Inicia o processamento da fila se não estiver em andamento
      if (!this.processingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Processa a fila de requisições respeitando os limites
   */
  async processQueue() {
    if (this.requestQueue.length === 0) {
      this.processingQueue = false;
      return;
    }

    this.processingQueue = true;

    // Se ainda podemos fazer requisições neste minuto
    if (this.requestsThisMinute < this.requestsPerMinute) {
      const { requestFn, resolve, reject } = this.requestQueue.shift();
      this.requestsThisMinute++;
      
      try {
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        reject(error);
      }

      // Continua processando a fila após um breve intervalo para evitar sobrecarga
      setTimeout(() => this.processQueue(), 333); // ~3 requisições por segundo
    } else {
      // Se excedemos o limite, espera até o próximo reset
      const timeToWait = this.getTimeUntilReset();
      console.log(`[Tray Rate Limiter] Limite de ${this.requestsPerMinute} requisições por minuto atingido. Aguardando ${timeToWait}ms para o próximo reset. ${this.requestQueue.length} requisições na fila.`);
      
      setTimeout(() => this.processQueue(), timeToWait);
    }
  }
}

module.exports = TrayRateLimiter; 