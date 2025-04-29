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