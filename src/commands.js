const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

// Comando para listar todos os vínculos (apenas para administradores)
async function handleAdminVinculos(interaction) {
  try {
    console.log('[DEBUG] Iniciando comando admin-vinculos...');
    
    // Verifica se o usuário tem permissões elevadas
    if (!isElevatedUser(interaction.user.id)) {
      console.log(`[DEBUG] Usuário ${interaction.user.id} não tem permissões elevadas`);
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        ephemeral: true
      });
    }

    // Busca todos os vínculos
    const linksResult = await db.getAllLinks();
    console.log('[DEBUG] Resultado da busca de vínculos:', linksResult);

    if (!linksResult.success) {
      if (linksResult.error === 'TABLE_NOT_FOUND') {
        return interaction.reply({
          content: '❌ A tabela de vínculos não foi encontrada. Por favor, contate o administrador.',
          ephemeral: true
        });
      }
      return interaction.reply({
        content: '❌ Erro ao buscar vínculos. Por favor, tente novamente mais tarde.',
        ephemeral: true
      });
    }

    const links = linksResult.data;
    if (!links || links.length === 0) {
      console.log('[DEBUG] Nenhum vínculo encontrado');
      return interaction.reply({
        content: '❌ Nenhum vínculo encontrado entre usuários Discord e clientes.',
        ephemeral: true
      });
    }

    // Busca todos os emails
    const emailsResult = await db.getAllEmails();
    console.log('[DEBUG] Resultado da busca de emails:', emailsResult);

    if (!emailsResult.success) {
      return interaction.reply({
        content: '❌ Erro ao buscar emails. Por favor, tente novamente mais tarde.',
        ephemeral: true
      });
    }

    const emails = emailsResult.data;
    const emailMap = new Map(emails.map(email => [email.user_id, email.email]));

    // Formata a lista de vínculos
    const formattedLinks = links.map(link => {
      const email = emailMap.get(link.user_id) || 'Email não encontrado';
      return `👤 **${link.discord_username}** (${link.discord_id}) -> 📧 ${email}`;
    });

    console.log('[DEBUG] Vínculos formatados:', formattedLinks);

    return interaction.reply({
      content: `📋 **Lista de Vínculos**\n\n${formattedLinks.join('\n')}`,
      ephemeral: true
    });
  } catch (error) {
    console.error('[ERRO] Erro no comando admin-vinculos:', error);
    return interaction.reply({
      content: '❌ Ocorreu um erro ao processar o comando. Por favor, tente novamente mais tarde.',
      ephemeral: true
    });
  }
}

// Comando para executar a vinculação automática (apenas para administradores)
async function handleAutoLink(interaction) {
  try {
    console.log('[DEBUG] Iniciando comando auto-link...');
    
    // Verifica se o usuário tem permissões elevadas
    if (!isElevatedUser(interaction.user.id)) {
      console.log(`[DEBUG] Usuário ${interaction.user.id} não tem permissões elevadas`);
      return interaction.reply({
        content: '❌ Você não tem permissão para usar este comando.',
        ephemeral: true
      });
    }

    // Envia uma mensagem inicial
    await interaction.reply({
      content: '🔄 Iniciando vinculação automática de emails...',
      ephemeral: true
    });

    // Executa a vinculação automática
    const result = await db.autoLinkEmailsToCustomers();

    if (!result.success) {
      return interaction.followUp({
        content: `❌ Erro ao executar vinculação automática: ${result.error}`,
        ephemeral: true
      });
    }

    const { total_emails, total_clientes, vinculacoes_criadas, erros } = result.data;

    return interaction.followUp({
      content: `✅ Vinculação automática concluída!\n\n` +
               `📧 Total de emails registrados: ${total_emails}\n` +
               `👥 Total de clientes na planilha: ${total_clientes}\n` +
               `🔗 Vínculos criados: ${vinculacoes_criadas}\n` +
               `❌ Erros: ${erros}`,
      ephemeral: true
    });
  } catch (error) {
    console.error('[ERRO] Erro no comando auto-link:', error);
    return interaction.followUp({
      content: '❌ Ocorreu um erro ao processar o comando. Por favor, tente novamente mais tarde.',
      ephemeral: true
    });
  }
}

// Comando /registro
const registroCommand = new SlashCommandBuilder()
  .setName('registro')
  .setDescription('Registra seu e-mail no sistema');

// Comando /meu-email
const meuEmailCommand = new SlashCommandBuilder()
  .setName('meu-email')
  .setDescription('Mostra o e-mail registrado em sua conta');

// Comando /desvincular
const desvincularCommand = new SlashCommandBuilder()
  .setName('desvincular')
  .setDescription('Remove seu e-mail do sistema');

// Comando /verificar-email
const verificarEmailCommand = new SlashCommandBuilder()
  .setName('verificar-email')
  .setDescription('Verifica se um e-mail está na base de clientes')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
  .addStringOption(option => 
    option.setName('email')
      .setDescription('O email que deseja verificar')
      .setRequired(true));

// Comando /config-plano
const configPlanoCommand = new SlashCommandBuilder()
  .setName('config-plano')
  .setDescription('Configura o cargo de um plano [ADMIN]')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
  .addStringOption(option => 
    option.setName('plano_id')
      .setDescription('Nome do plano') 
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addRoleOption(option => 
    option.setName('cargo')
      .setDescription('Cargo Discord a ser associado ao plano')
      .setRequired(true)
  );

// Comando /verificar-permissoes
const verificarPermissoesCommand = new SlashCommandBuilder()
  .setName('verificar-permissoes')
  .setDescription('Verifica se o bot tem permissões para gerenciar cargos [ADMIN]')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator);

// Comando /tutorial
const tutorialCommand = new SlashCommandBuilder()
  .setName('tutorial')
  .setDescription('Mostra um tutorial com os comandos disponíveis');

// Comando /restringir
const restringirCommand = new SlashCommandBuilder()
  .setName('restringir')
  .setDescription('Restringe o envio de links no canal atual (apenas Dev)');

// Comando /relatorio
const relatorioCommand = new SlashCommandBuilder()
  .setName('relatorio')
  .setDescription('Mostra um relatório com a quantidade de usuários em cada plano');

// Comando /compras
const comprasCommand = new SlashCommandBuilder()
  .setName('compras')
  .setDescription('Mostra o histórico de compras de um email')
  .addStringOption(option =>
    option.setName('email')
      .setDescription('Email do usuário')
      .setRequired(true));

// Array com todos os comandos
const commands = [
  registroCommand,
  meuEmailCommand,
  desvincularCommand,
  verificarEmailCommand,
  configPlanoCommand,
  verificarPermissoesCommand,
  tutorialCommand,
  restringirCommand,
  relatorioCommand,
  comprasCommand
];

// Exporta os comandos
module.exports = {
  commands
}; 