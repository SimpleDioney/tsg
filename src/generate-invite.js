// Script para gerar link de convite para o bot do Discord
require('dotenv').config();

if (!process.env.CLIENT_ID) {
  console.log('\n===== ERRO =====');
  console.log('CLIENT_ID não encontrado no arquivo .env');
  console.log('Por favor, adicione seu CLIENT_ID ao arquivo .env');
  console.log('Exemplo: CLIENT_ID=1359543235655110817');
  console.log('===============\n');
  process.exit(1);
}

const clientId = process.env.CLIENT_ID;

console.log('\n========== LINK DE CONVITE DO BOT ==========');
console.log(`https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=8`);
console.log('============================================\n');

console.log('Permissões incluídas:');
console.log('- Permissão 8: Permissão de Administrador (todas as permissões)');
console.log('Escopos incluídos:');
console.log('- bot: Permite que o bot entre em servidores');
console.log('- applications.commands: Permite registrar comandos slash');
console.log('\nPara permissões mais específicas, acesse:');
console.log('https://discord.com/developers/docs/topics/permissions'); 