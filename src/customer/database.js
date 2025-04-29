// Função para fechar a conexão com o banco de dados de clientes
function closeDatabase() {
  if (db) {
    console.log('Fechando conexão com o banco de dados de clientes...');
    try {
      // Executar um checkpoint final antes de fechar
      if (db.pragma) {
        db.pragma('wal_checkpoint(FULL)');
      }
      db.close();
      console.log('Banco de dados de clientes fechado com sucesso');
    } catch (err) {
      console.error('Erro ao fechar o banco de dados de clientes:', err.message);
    }
    
    // Limpar o intervalo de checkpoint se existir
    if (global.customerCheckpointInterval) {
      clearInterval(global.customerCheckpointInterval);
      global.customerCheckpointInterval = null;
      console.log('Intervalo de checkpoint de clientes encerrado');
    }
  }
}

module.exports = {
  initDatabase,
  addCustomer,
  getCustomers,
  getCustomerById,
  getCustomerByDiscordId,
  updateCustomer,
  closeDatabase // Exportando a função para fechar o banco de dados
}; 