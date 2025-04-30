// Importações necessárias
const { 
  Client, 
  GatewayIntentBits, 
  Events, 
  REST, 
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  Collection,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionsBitField,
  ChannelType,
  ActivityType,
  Discord,
  Message
} = require('discord.js');
require('dotenv').config();

// Importa os módulos de banco de dados
const db = require('./database');
const customerDb = require('./customerDatabase');
const traySync = require('./traySync');
const sheetSync = require('./sheetSync');

// Inicializa os bancos de dados
db.initDatabase();
customerDb.initDatabase();
traySync.initTrayConfigDatabase();

// Função para validar email
function validarEmail(email) {
  // Expressão regular mais permissiva para validação de email
  // Permite múltiplos underscores e outros caracteres válidos
  const regexEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-_]+\.[a-zA-Z]{2,}$/;
  
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // Verificações básicas adicionais
  if (email.length > 254) {
    return false;
  }
  
  // Verifica se tem pelo menos um @ e um .
  if (!email.includes('@') || !email.includes('.')) {
    return false;
  }
  
  // Verifica se o domínio tem pelo menos um caractere após o último ponto
  const dominioParts = email.split('@')[1].split('.');
  if (dominioParts[dominioParts.length - 1].length < 2) {
    return false;
  }
  
  return regexEmail.test(email);
}

// Função para formatar data em string legível
function formatarData(timestamp) {
  // Converte para número se for string
  const timestampNum = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
  // Se for timestamp unix (segundos), multiplica por 1000 para obter milissegundos
  const milliseconds = timestampNum < 10000000000 ? timestampNum * 1000 : timestampNum;
  
  const data = new Date(milliseconds);
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Função para criar um modal de email
function criarModalEmail(customId = 'email-modal', emailPadrao = '') {
  // Cria o modal para coleta de e-mail
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('✉️ Registro de E-mail');
  
  // Cria o campo de texto para o e-mail
  const emailInput = new TextInputBuilder()
    .setCustomId('email-input')
    .setLabel('📧 Digite seu e-mail')
    .setPlaceholder('exemplo@dominio.com')
    .setValue(emailPadrao) // Preenche com o valor anterior, se houver
    .setRequired(true)
    .setStyle(TextInputStyle.Short);
  
  // Adiciona o campo ao modal
  const actionRow = new ActionRowBuilder().addComponents(emailInput);
  modal.addComponents(actionRow);
  
  return modal;
}

// Função para criar embed de sucesso no registro
function criarEmbedSucesso(email) {
  const agora = Math.floor(Date.now() / 1000); // Timestamp atual em segundos
  
  return new EmbedBuilder()
    .setColor(0x00FF00) // Verde
    .setTitle('✅ Registro Concluído')
    .setDescription(`**Seu e-mail foi registrado com sucesso!**`)
    .addFields(
      { name: '📧 E-mail', value: `\`${email}\``, inline: true },
      { name: '🕒 Data', value: `<t:${agora}:F>`, inline: true }
    )
    .setFooter({ text: 'Obrigado por se registrar!' })
    .setTimestamp();
}

// Função para criar embed de sucesso na desvinculação
function criarEmbedDesvinculacao(email) {
  const agora = Math.floor(Date.now() / 1000); // Timestamp atual em segundos
  
  return new EmbedBuilder()
    .setColor(0x00BFFF) // Azul claro
    .setTitle('✅ Email Desvinculado')
    .setDescription(`**Seu e-mail foi desvinculado com sucesso!**`)
    .addFields(
      { name: '📧 E-mail Removido', value: `\`${email}\``, inline: true },
      { name: '🕒 Data', value: `<t:${agora}:F>`, inline: true }
    )
    .setFooter({ text: 'Você pode registrar um novo email a qualquer momento usando /registro' })
    .setTimestamp();
}

// Função para criar embed de erro com email já registrado
function criarEmbedErroEmailJaRegistrado(email, usuarioTag, dataRegistro) {
  return new EmbedBuilder()
    .setColor(0xFF7F00) // Laranja
    .setTitle('⚠️ Email Já Registrado')
    .setDescription(`**O email informado já está registrado por outro usuário.**`)
    .addFields(
      { name: '📧 E-mail', value: `\`${email}\``, inline: true },
      { name: '👤 Registrado por', value: `\`${usuarioTag}\``, inline: true },
      { name: '🕒 Data de Registro', value: `\`${dataRegistro}\``, inline: false }
    )
    .setFooter({ text: 'Por favor, use outro email ou contate um administrador.' });
}

// Função para criar embed de erro
function criarEmbedErro(email) {
  return new EmbedBuilder()
    .setColor(0xFF0000) // Vermelho
    .setTitle('❌ Erro no Registro')
    .setDescription(`**O e-mail fornecido é inválido.**`)
    .addFields(
      { name: '📧 E-mail Recebido', value: `\`${email}\``, inline: true },
      { name: '📋 Formato Esperado', value: '`exemplo@dominio.com`', inline: true }
    )
    .setFooter({ text: 'Por favor, corrija o e-mail e tente novamente' });
}

// Função para criar embed de erro ao desvincular
function criarEmbedErroDesvincular() {
  return new EmbedBuilder()
    .setColor(0xFF0000) // Vermelho
    .setTitle('❌ Erro ao Desvincular')
    .setDescription(`**Você não possui nenhum e-mail registrado.**`)
    .addFields(
      { name: '🔍 Próximos passos', value: 'Use o comando `/registro` para registrar um email.' }
    )
    .setFooter({ text: 'Se acredita que isso é um erro, contate um administrador.' });
}

// Função para criar embed de informações do usuário
function criarEmbedInfoUsuario(emailData) {
  // Para timestamp do SQLite (armazenado em segundos)
  let timestamp = emailData.registered_at;
  
  // Garantir que estamos trabalhando com segundos para o Discord
  if (timestamp > 10000000000) { // Se for em milissegundos
    timestamp = Math.floor(timestamp / 1000);
  }
  
  // Tenta obter informações do cliente vinculado
  let clienteInfo = null;
  let clienteId = null;
  let planoInfo = null;
  
  // Verifica se existe uma vinculação para este usuário
  const vinculacao = db.getUserLink(emailData.user_id);
  if (vinculacao.success) {
    clienteId = vinculacao.data.customer_id;
    
    // Busca os dados do cliente
    const cliente = customerDb.getCustomerByEmail(emailData.email);
    if (cliente.success) {
      clienteInfo = cliente.data.Customer;
      planoInfo = cliente.data.Customer.Plan;
    }
  }
  
  // Cria o embed com as informações básicas
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6) // Roxo
    .setTitle('ℹ️ Informações de Registro')
    .setDescription(`**Detalhes do seu registro atual:**`)
    .addFields(
      { name: '📧 E-mail', value: `\`${emailData.email}\``, inline: true },
      { name: '🕒 Data de Registro', value: `<t:${timestamp}:F>`, inline: false },
      { name: '👤 ID do Usuário', value: `\`${emailData.user_id}\``, inline: false }
    );
  
  // Adiciona informações do cliente se disponíveis
  if (clienteInfo) {
    embed.addFields(
      { name: '👥 Informações do Cliente', value: '───────────────────', inline: false },
      { name: '📝 Nome', value: `\`${clienteInfo.name}\``, inline: true },
      { name: '🏙️ Cidade', value: `\`${clienteInfo.city || 'Não informado'}\``, inline: true },
      { name: '🗓️ Última Visita', value: `\`${clienteInfo.last_visit || 'Não informado'}\``, inline: false }
    );
  }
  
  // Adiciona informações do plano se disponíveis
  if (planoInfo) {
    embed.addFields(
      { name: '🔰 Plano Contratado', value: '───────────────────', inline: false },
      { name: '📋 Nome do Plano', value: `\`${planoInfo.name}\``, inline: true },
      { name: '📜 Descrição', value: `${planoInfo.description || 'Sem descrição adicional'}`, inline: false }
    );
  }
  
  // Finaliza o embed
  embed.setFooter({ text: 'Para desvincular seu email, use o comando /desvincular' })
       .setTimestamp();
  
  return embed;
}

// Função para criar embed de erro de cliente não encontrado
function criarEmbedErroClienteNaoEncontrado(email) {
  return new EmbedBuilder()
    .setColor(0xFF0000) // Vermelho
    .setTitle('❌ Cliente Não Encontrado')
    .setDescription(`**O email fornecido não está cadastrado em nossa base de clientes.**`)
    .addFields(
      { name: '📧 E-mail', value: `\`${email}\``, inline: true },
      { name: '🔍 O que fazer', value: 'Verifique se digitou o email corretamente ou entre em contato com o suporte.', inline: false }
    )
    .setFooter({ text: 'Apenas emails cadastrados em nossa base de clientes podem ser registrados.' });
}

// Função para criar embed de resultado da verificação
function criarEmbedVerificacaoEmail(email, encontrado, clienteInfo = null) {
  if (encontrado) {
    const embed = new EmbedBuilder()
      .setColor(0x00FF00) // Verde
      .setTitle('✅ Email Encontrado')
      .setDescription(`**O email \`${email}\` está cadastrado em nossa base de clientes.**`)
      .addFields(
        { name: '📝 Nome', value: `\`${clienteInfo.name}\``, inline: true },
        { name: '🏙️ Cidade', value: `\`${clienteInfo.city || 'Não informado'}\``, inline: true },
        { name: '🗓️ Última Visita', value: `\`${clienteInfo.last_visit || 'Não informado'}\``, inline: false },
        { name: '🔄 Próximos Passos', value: 'Você pode usar o comando `/registro` para vincular este email à sua conta no Discord.', inline: false }
      )
      .setFooter({ text: 'Apenas emails cadastrados podem ser registrados no bot.' })
      .setTimestamp();
    
    return embed;
  } else {
    const embed = new EmbedBuilder()
      .setColor(0xFF0000) // Vermelho
      .setTitle('❌ Email Não Encontrado')
      .setDescription(`**O email \`${email}\` não está cadastrado em nossa base de clientes.**`)
      .addFields(
        { name: '🔍 O que fazer', value: 'Verifique se digitou o email corretamente ou entre em contato com o suporte.', inline: false }
      )
      .setFooter({ text: 'Apenas emails cadastrados podem ser registrados no bot.' })
      .setTimestamp();
    
    return embed;
  }
}

// Função para criar embed de lista de vínculos
function criarEmbedListaVinculos(vinculos, emailsInfo) {
  const embed = new EmbedBuilder()
    .setColor(0x1E90FF) // Azul royal
    .setTitle('🔗 Lista de Vínculos')
    .setDescription(`**Total de vínculos encontrados: ${vinculos.length}**`);
  
  // Adiciona até 10 vínculos para não ultrapassar o limite de campos
  const limite = Math.min(vinculos.length, 10);
  
  for (let i = 0; i < limite; i++) {
    const vinculo = vinculos[i];
    const emailInfo = emailsInfo.find(e => e.user_id === vinculo.user_id);
    
    if (emailInfo) {
      embed.addFields({
        name: `👤 Usuário: ${emailInfo.user_tag}`,
        value: `📧 Email: \`${emailInfo.email}\`\n🆔 Cliente ID: \`${vinculo.customer_id}\`\n🕒 Vinculado em: <t:${vinculo.linked_at}:F>`,
        inline: false
      });
    }
  }
  
  // Se houver mais de 10 vínculos, adiciona um campo indicando
  if (vinculos.length > 10) {
    embed.addFields({
      name: '⚠️ Atenção',
      value: `Exibindo apenas 10 de ${vinculos.length} vínculos. Use canais específicos para exportar a lista completa.`,
      inline: false
    });
  }
  
  embed.setFooter({ text: 'Gerenciamento de vínculos entre usuários Discord e clientes' })
       .setTimestamp();
  
  return embed;
}

// Função para aplicar cargo baseado no plano do cliente
async function aplicarCargoPlano(member, plano) {
  if (!member || !plano || !plano.discord_role_id) return false;
  
  try {
    // Verificar se o cargo existe no servidor
    let cargo;
    try {
      cargo = await member.guild.roles.fetch(plano.discord_role_id);
    } catch (error) {
      console.error(`Erro ao buscar cargo do plano ${plano.name} (ID: ${plano.discord_role_id}):`, error);
      return false;
    }
    
    if (!cargo) {
      console.error(`Cargo não encontrado para o plano ${plano.name} (ID: ${plano.discord_role_id})`);
      return false;
    }
    
    // Verificar se o bot tem permissão para gerenciar esse cargo
    const botMember = await member.guild.members.fetchMe();
    
    // Verificar hierarquia de cargos
    if (botMember.roles.highest.position <= cargo.position) {
      console.error(`Bot não tem hierarquia suficiente para gerenciar o cargo ${cargo.name}. O cargo do bot precisa estar acima deste cargo.`);
      return false;
    }
    
    // NOVA VERIFICAÇÃO: Verificar se o bot tem hierarquia suficiente para gerenciar os cargos do usuário-alvo
    if (member.roles.highest.position >= botMember.roles.highest.position) {
      console.error(`Bot não tem hierarquia suficiente para gerenciar os cargos do usuário ${member.user.tag}, pois o cargo mais alto do usuário (${member.roles.highest.name}, posição ${member.roles.highest.position}) está acima ou na mesma posição do cargo mais alto do bot (${botMember.roles.highest.name}, posição ${botMember.roles.highest.position}).`);
      return false;
    }
    
    // Verificar permissão específica
    if (!botMember.permissions.has('ManageRoles')) {
      console.error('Bot não tem a permissão "Gerenciar Cargos" neste servidor.');
      return false;
    }
    
    // Remover cargos de planos anteriores
    // Obter todos os cargos de planos
    const planos = customerDb.getAllPlans();
    if (planos.success) {
      const cargosDePlanos = planos.data.map(p => p.discord_role_id).filter(id => id);
      
      try {
        // Remover cargos de planos que o usuário possa ter
        const cargosAtuais = member.roles.cache.filter(role => cargosDePlanos.includes(role.id));
        if (cargosAtuais.size > 0) {
          await member.roles.remove(cargosAtuais);
          console.log(`Cargos de planos anteriores removidos de ${member.user.tag}`);
        }
      } catch (removeError) {
        console.error(`Erro ao remover cargos anteriores de ${member.user.tag}:`, removeError);
        // Continuar com a adição do novo cargo mesmo que a remoção falhe
      }
    }
    
    // Adicionar o novo cargo
    try {
      await member.roles.add(cargo);
      console.log(`Cargo ${cargo.name} adicionado a ${member.user.tag} baseado no plano ${plano.name}`);
      return true;
    } catch (addError) {
      if (addError.code === 50013) {
        console.error(`Erro de permissão ao adicionar cargo a ${member.user.tag}. Verifique se o bot tem a permissão "Gerenciar Cargos" e se seu cargo está acima do cargo que está tentando gerenciar. Se o usuário for administrador ou tiver cargos elevados, o bot pode não conseguir modificar seus cargos.`);
      } else {
        console.error(`Erro ao adicionar cargo a ${member.user.tag}:`, addError);
      }
      return false;
    }
  } catch (error) {
    console.error(`Erro ao aplicar cargo do plano para ${member.user.tag}:`, error);
    return false;
  }
}

// Função para criar embed de sucesso no registro com informações do plano
function criarEmbedSucessoComPlano(email, plano, cargoAplicado) {
  const agora = Math.floor(Date.now() / 1000); // Timestamp atual em segundos
  
  const embed = new EmbedBuilder()
    .setColor(0x00FF00) // Verde
    .setTitle('✅ Registro Concluído')
    .setDescription(`**Seu e-mail foi registrado com sucesso!**`)
    .addFields(
      { name: '📧 E-mail', value: `\`${email}\``, inline: true },
      { name: '🕒 Data', value: `<t:${agora}:F>`, inline: true }
    );
    
  // Adicionar informações do plano, se disponível
  if (plano) {
    embed.addFields(
      { name: '🔰 Seu Plano', value: `\`${plano.name}\``, inline: false },
      { name: '📋 Descrição', value: `${plano.description || 'Sem descrição adicional'}`, inline: false }
    );
    
    // Adicionar informação sobre o cargo
    if (cargoAplicado) {
      embed.addFields(
        { name: '🏷️ Cargo no Discord', value: 'O cargo correspondente ao seu plano foi aplicado com sucesso!', inline: false }
      );
    } else {
      embed.addFields(
        { name: '⚠️ Cargo no Discord', value: 'Não foi possível aplicar o cargo correspondente ao seu plano.', inline: false }
      );
    }
  }
  
  embed.setFooter({ text: 'Obrigado por se registrar!' })
       .setTimestamp();
  
  return embed;
}

// Função para criar embed com a lista de planos
function criarEmbedListaPlanos(planos) {
  const embed = new EmbedBuilder()
    .setColor(0x1E90FF) // Azul royal
    .setTitle('📋 Planos Disponíveis')
    .setDescription(`**Total de planos: ${planos.length}**`);
  
  // Adiciona cada plano como um campo no embed
  planos.forEach(plano => {
    let cargoInfo = 'Nenhum cargo configurado';
    if (plano.discord_role_id) {
      cargoInfo = `<@&${plano.discord_role_id}> (ID: ${plano.discord_role_id})`;
    }
    
    embed.addFields({
      name: `🔰 ${plano.name}`,
      value: `${plano.description || 'Sem descrição disponível'}\n**Cargo:** ${cargoInfo}`,
      inline: false
    });
  });
  
  embed.setFooter({ text: 'Para saber seu plano atual, use o comando /meu-email. Para configurar cargos, use /config-plano' })
       .setTimestamp();
  
  return embed;
}

// Função para remover cargos de planos de um membro
async function removerCargosPlano(member) {
  if (!member) return false;
  
  try {
    // Verificar se o bot tem permissão para gerenciar cargos
    const botMember = await member.guild.members.fetchMe();
    
    // Verificar permissão específica
    if (!botMember.permissions.has('ManageRoles')) {
      console.error('Bot não tem a permissão "Gerenciar Cargos" neste servidor.');
      return false;
    }
    
    // Obter todos os cargos de planos
    const planos = customerDb.getAllPlans();
    if (!planos.success) return false;
    
    // Extrair IDs dos cargos de planos
    const cargosDePlanos = planos.data
      .map(p => p.discord_role_id)
      .filter(id => id);
    
    if (cargosDePlanos.length === 0) return false;
    
    // Verificar se o membro tem algum dos cargos de planos
    const cargosAtuais = member.roles.cache.filter(role => 
      cargosDePlanos.includes(role.id)
    );
    
    if (cargosAtuais.size === 0) return false;
    
    // Verificar hierarquia de cada cargo a ser removido
    const cargosRemovíveis = cargosAtuais.filter(cargo => {
      return botMember.roles.highest.position > cargo.position;
    });
    
    if (cargosRemovíveis.size === 0) {
      console.error(`Bot não tem hierarquia suficiente para remover os cargos de ${member.user.tag}. O cargo do bot precisa estar acima dos cargos a serem removidos.`);
      return false;
    }
    
    // Remover os cargos
    try {
      await member.roles.remove(cargosRemovíveis);
      console.log(`${cargosRemovíveis.size} cargos de planos removidos de ${member.user.tag}`);
      return true;
    } catch (error) {
      if (error.code === 50013) {
        console.error(`Erro de permissão ao remover cargos de ${member.user.tag}. Verifique se o bot tem a permissão "Gerenciar Cargos" e se seu cargo está acima dos cargos que está tentando remover.`);
      } else {
        console.error(`Erro ao remover cargos de planos de ${member.user.tag}:`, error);
      }
      return false;
    }
  } catch (error) {
    console.error(`Erro ao remover cargos de planos de ${member.user.tag}:`, error);
    return false;
  }
}

// Função para criar embed de sucesso na desvinculação com informação sobre cargos
function criarEmbedDesvinculacaoComCargos(email, cargosRemovidos) {
  const agora = Math.floor(Date.now() / 1000); // Timestamp atual em segundos
  
  const embed = new EmbedBuilder()
    .setColor(0x00BFFF) // Azul claro
    .setTitle('✅ Email Desvinculado')
    .setDescription(`**Seu e-mail foi desvinculado com sucesso!**`)
    .addFields(
      { name: '📧 E-mail Removido', value: `\`${email}\``, inline: true },
      { name: '🕒 Data', value: `<t:${agora}:F>`, inline: true }
    );
  
  // Adicionar informação sobre os cargos removidos
  if (cargosRemovidos) {
    embed.addFields(
      { name: '🏷️ Cargos de Plano', value: 'Os cargos associados ao seu plano foram removidos.', inline: false }
    );
  }
  
  embed.setFooter({ text: 'Você pode registrar um novo email a qualquer momento usando /registro' })
       .setTimestamp();
  
  return embed;
}

// Função para criar embed de verificação de permissões
function criarEmbedVerificacaoPermissoes(guild, cargosPlanos) {
  const embed = new EmbedBuilder()
    .setColor(0x1E90FF)
    .setTitle('🔍 Verificação de Permissões')
    .setDescription('**Resultado da verificação de permissões do bot para gerenciar cargos:**');
  
  // Verificar permissão do bot para gerenciar cargos
  const botMember = guild.members.me;
  const temPermissaoGerenciarCargos = botMember.permissions.has('ManageRoles');
  
  embed.addFields({
    name: '🔐 Permissão "Gerenciar Cargos"',
    value: temPermissaoGerenciarCargos 
      ? '✅ O bot tem a permissão para gerenciar cargos.' 
      : '❌ O bot **NÃO** tem a permissão para gerenciar cargos! Esta permissão é necessária.',
    inline: false
  });
  
  // Verificar hierarquia de cargos
  const cargoBot = botMember.roles.highest;
  
  embed.addFields({
    name: '👑 Cargo mais alto do bot',
    value: `${cargoBot} (Posição: ${cargoBot.position})`,
    inline: false
  });
  
  // Se houver cargos de planos configurados, verificar a hierarquia
  if (cargosPlanos && cargosPlanos.length > 0) {
    const camposHierarquia = [];
    
    cargosPlanos.forEach(plano => {
      if (plano.discord_role_id) {
        const cargo = guild.roles.cache.get(plano.discord_role_id);
        
        if (cargo) {
          const hierarquiaOk = cargoBot.position > cargo.position;
          camposHierarquia.push({
            name: `🔰 ${plano.name}`,
            value: `Cargo: ${cargo} (Posição: ${cargo.position})\nHierarquia: ${hierarquiaOk ? '✅ OK' : '❌ Problema! O cargo do bot deve estar acima.'}`,
            inline: false
          });
        } else {
          camposHierarquia.push({
            name: `🔰 ${plano.name}`,
            value: `❌ Cargo não encontrado (ID: ${plano.discord_role_id}).\nUse o comando \`/config-plano\` para configurar corretamente.`,
            inline: false
          });
        }
      } else {
        camposHierarquia.push({
          name: `🔰 ${plano.name}`,
          value: `⚠️ Sem cargo configurado. Use o comando \`/config-plano\` para configurar.`,
          inline: false
        });
      }
    });
    
    // Adicionar campos de hierarquia
    embed.addFields(...camposHierarquia);
  } else {
    embed.addFields({
      name: '⚠️ Cargos de Planos',
      value: 'Nenhum cargo de plano configurado. Use o comando `/config-plano` para configurar os cargos.',
      inline: false
    });
  }
  
  // Buscar usuários problemáticos (que têm cargos mais altos que o bot)
  const usuariosProblematicos = [];
  guild.members.cache.forEach(member => {
    if (!member.user.bot && member.roles.highest.position >= cargoBot.position) {
      usuariosProblematicos.push(member);
    }
  });
  
  // Se encontrar usuários problemáticos, adicionar uma seção com informações
  if (usuariosProblematicos.length > 0) {
    embed.addFields({
      name: '⚠️ Usuários com Problemas Potenciais',
      value: `Encontrados ${usuariosProblematicos.length} usuários com cargos que o bot não pode gerenciar:`,
      inline: false
    });
    
    // Limitar para mostrar no máximo 5 usuários para não sobrecarregar o embed
    const usuariosParaMostrar = usuariosProblematicos.slice(0, 5);
    usuariosParaMostrar.forEach(usuario => {
      embed.addFields({
        name: `👤 ${usuario.user.tag}`,
        value: `Cargo mais alto: ${usuario.roles.highest} (Posição: ${usuario.roles.highest.position})\nO bot não pode gerenciar os cargos deste usuário devido à hierarquia.`,
        inline: false
      });
    });
    
    if (usuariosProblematicos.length > 5) {
      embed.addFields({
        name: '📊 Nota',
        value: `Mostrando 5 de ${usuariosProblematicos.length} usuários com problemas potenciais.`,
        inline: false
      });
    }
  }
  
  // Adicionar instruções para correção
  embed.addFields({
    name: '🔧 Como corrigir problemas',
    value: '1. Vá para as configurações do servidor → Cargos\n2. Certifique-se de que o cargo do bot está acima dos cargos dos planos\n3. Garanta que o bot tenha a permissão "Gerenciar Cargos"\n4. Use o comando `/config-plano` para atualizar os IDs dos cargos\n5. Se há usuários com cargos altos, você precisa mover o cargo do bot acima deles, ou remover os cargos problemáticos do usuário antes de tentar adicionar os cargos do plano.',
    inline: false
  });
  
  embed.setFooter({ text: 'A hierarquia de cargos é crucial para o funcionamento correto do sistema' })
       .setTimestamp();
  
  return embed;
}

// Criação do cliente Discord com as intents necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Array com os comandos slash
const commands = [
  new SlashCommandBuilder()
    .setName('registro')
    .setDescription('Registra seu e-mail no sistema'),
  new SlashCommandBuilder()
    .setName('meu-email')
    .setDescription('Mostra o e-mail registrado em sua conta'),
  new SlashCommandBuilder()
    .setName('desvincular')
    .setDescription('Remove seu e-mail do sistema'),
  new SlashCommandBuilder()
    .setName('verificar-email')
    .setDescription('Verifica se um e-mail está na base de clientes')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(option => 
      option.setName('email')
        .setDescription('O email que deseja verificar')
        .setRequired(true)),
  new SlashCommandBuilder()
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
    ),
  new SlashCommandBuilder()
    .setName('verificar-permissoes')
    .setDescription('Verifica se o bot tem permissões para gerenciar cargos [ADMIN]')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder()
    .setName('tutorial')
    .setDescription('Envia um tutorial de como se registrar [DEV]')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
];

// Evento executado quando o bot estiver pronto
client.once(Events.ClientReady, async (c) => {
  console.log(`Bot online! Logado como ${c.user.tag}`);
  
  // Gera e exibe o link de convite do bot
  console.log('\n=== LINK DE CONVITE DO BOT ===');
  console.log(`https://discord.com/oauth2/authorize?client_id=${c.user.id}&scope=bot%20applications.commands&permissions=8`);
  console.log('==============================\n');
  
  // Exibe informações sobre os servidores onde o bot está
  console.log(`Bot presente em ${client.guilds.cache.size} servidores:`);
  const guildIds = [];
  client.guilds.cache.forEach(guild => {
    console.log(`- ${guild.name} (ID: ${guild.id})`);
    guildIds.push(guild.id);
  });

  // Registra os comandos Slash em cada servidor
  try {
    console.log('Iniciando registro de comandos Slash...');
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    // Se não tiver servidores, registra globalmente
    if (guildIds.length === 0) {
      console.log('Nenhum servidor encontrado. Registrando comandos globalmente...');
      await rest.put(
        Routes.applicationCommands(c.user.id),
        { body: commands.map(command => command.toJSON()) }
      );
      console.log('Comandos Slash registrados globalmente com sucesso!');
    } else {
      // Registra os comandos em cada servidor individualmente (mais rápido que registro global)
      console.log(`Registrando comandos em ${guildIds.length} servidores...`);
      for (const guildId of guildIds) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(c.user.id, guildId),
            { body: commands.map(command => command.toJSON()) }
          );
          console.log(`Comandos registrados no servidor ID: ${guildId}`);
        } catch (error) {
          console.error(`Erro ao registrar comandos no servidor ${guildId}:`, error);
        }
      }
      console.log('Comandos Slash registrados com sucesso em todos os servidores!');
      
      // Registra também globalmente para novos servidores
      console.log('Registrando comandos globalmente para novos servidores...');
      await rest.put(
        Routes.applicationCommands(c.user.id),
        { body: commands.map(command => command.toJSON()) }
      );
      console.log('Comandos Slash registrados globalmente com sucesso!');
    }
  } catch (error) {
    console.error('Erro ao registrar comandos Slash:', error);
  }
});

// Eventos de interação (comandos slash, botões, etc.)
client.on(Events.InteractionCreate, async (interaction) => {
  try {

    if (interaction.isAutocomplete()) {
      const { commandName, options } = interaction;
    
      if (commandName === 'config-plano') {
        const focusedOption = options.getFocused();
        
        try {
          const planosDisponiveis = await sheetSync.getNormalizedPlans();
          const resultados = planosDisponiveis
            .filter(plano => plano.toLowerCase().includes(focusedOption.toLowerCase()))
            .slice(0, 25);
          
          await interaction.respond(
            resultados.map(plano => ({
              name: plano.length > 100 ? plano.slice(0, 100) : plano,
              value: plano
            }))
          );
        } catch (error) {
          console.error('Erro ao buscar planos para autocomplete:', error);
          await interaction.respond([]);
        }
      }
      return;
    }

  
    // Tratamento de comandos slash
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      console.log(`[DEBUG] Comando recebido: /${commandName} de ${interaction.user.tag} no servidor ${interaction.guild?.name || 'DM'} (ID: ${interaction.guild?.id || 'DM'})`);

      // Comando /ping
      if (commandName === 'ping') {
        const embed = new EmbedBuilder()
          .setColor(0x3498DB) // Azul
          .setTitle('🏓 Pong!')
          .setDescription(`**Latência:** ${client.ws.ping}ms`)
          .setFooter({ text: `Solicitado por ${interaction.user.tag}` })
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
      
      // Comando /convite
      else if (commandName === 'convite') {
        const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot%20applications.commands&permissions=8`;
        
        const embed = new EmbedBuilder()
          .setColor(0x9B59B6) // Roxo
          .setTitle('🔗 Link de Convite')
          .setDescription(`Use o link abaixo para adicionar o bot ao seu servidor:`)
          .addFields(
            { name: '🌐 Link', value: `[Clique aqui para adicionar](${inviteLink})` }
          )
          .setFooter({ text: `Solicitado por ${interaction.user.tag}` })
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
      
      // Comando /registro
      else if (commandName === 'registro') {
        // Verifica se o usuário já tem um email registrado
        const emailExistente = db.getEmailByUserId(interaction.user.id);

        if (emailExistente.success && emailExistente.data) {
          const embed = criarEmbedInfoUsuario(emailExistente.data);

          const botaoDesvincular = new ButtonBuilder()
            .setCustomId('desvincular_email')
            .setLabel('Desvincular este email')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️');

          const botaoAtualizar = new ButtonBuilder()
            .setCustomId('atualizar_email')
            .setLabel('Atualizar email')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝');

          const row = new ActionRowBuilder().addComponents(botaoDesvincular, botaoAtualizar);

          await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
          });
          return;
        }

        try {
          // Cria o modal para coleta de e-mail
          const modal = criarModalEmail();
          
          // Exibe o modal
          await interaction.showModal(modal);
          console.log(`Modal de registro exibido para ${interaction.user.tag}`);
        } catch (error) {
          console.error('Erro ao exibir o modal de registro:', error);
          await interaction.reply({ 
            content: '❌ **Ocorreu um erro ao abrir o formulário de registro.** Por favor, tente novamente mais tarde.', 
            ephemeral: true 
          });
        }
      }
      
      // Comando /desvincular
      else if (commandName === 'desvincular') {
        // Busca o email do usuário
        const resultado = db.getEmailByUserId(interaction.user.id);
        
        if (resultado.success && resultado.data) {
          // Armazena o email para usar no embed
          const email = resultado.data.email;
          
          // Tenta remover os cargos de planos, se estiver em um servidor
          let cargosRemovidos = false;
          if (interaction.guild) {
            try {
              // Obter o objeto GuildMember para manipular cargos
              const member = await interaction.guild.members.fetch(interaction.user.id);
              cargosRemovidos = await removerCargosPlano(member);
            } catch (error) {
              console.error('Erro ao remover cargos de plano ao desvincular por botão:', error);
            }
          }
          
          // Remove a vinculação com o cliente, se existir
          db.unlinkUser(interaction.user.id);
          
          // Desvincular o email
          const resultadoDesvinculacao = db.unregisterEmail(interaction.user.id);
          
          if (resultadoDesvinculacao.success) {
            // Cria o embed de sucesso com informação sobre cargos
            const embed = criarEmbedDesvinculacaoComCargos(email, cargosRemovidos);
            
            await interaction.reply({
              embeds: [embed],
              ephemeral: true
            });
          } else {
            // Erro ao desvincular (improvável chegar aqui)
            const embed = criarEmbedErroDesvincular();
            
            await interaction.reply({
              embeds: [embed],
              ephemeral: true
            });
          }
        } else {
          // Sem email registrado
          const embed = criarEmbedErroDesvincular();
          
          await interaction.reply({
            embeds: [embed],
            ephemeral: true
          });
        }
      }
      
      // Comando /meu-email
      else if (commandName === 'meu-email') {
        const resultado = db.getEmailByUserId(interaction.user.id);
      
        if (resultado.success && resultado.data) {
          await interaction.deferReply({ ephemeral: true });
          
          try {
            // Busca todas as compras do email
            const duplicatas = await sheetSync.buscarDuplicatasEmail(resultado.data.email);
            console.log(`[DEBUG] Compras encontradas:`, duplicatas);
            
            const embed = new EmbedBuilder()
              .setColor(0x9B59B6)
              .setTitle('📧 Suas informações registradas')
              .addFields(
                { name: 'Email', value: `\`${resultado.data.email}\`` }
              );

            if (duplicatas && duplicatas.length > 0) {
              // Adiciona um campo para cada plano comprado
              embed.addFields({
                name: '📦 Seus Planos',
                value: duplicatas.map(d => 
                  `\`${d.nome_produto}\` (R$ ${d.preco})`
                ).join('\n'),
                inline: false
              });

              // Destaca o plano ativo (o de maior valor)
              const planoAtivo = duplicatas[0]; // Já está ordenado por preço DESC
              embed.addFields({
                name: '🌟 Plano Ativo',
                value: `\`${planoAtivo.nome_produto}\` (R$ ${planoAtivo.preco})`,
                inline: false
              });
            } else {
              embed.addFields({ 
                name: 'Plano', 
                value: 'Nenhum plano encontrado' 
              });
            }

            embed.setFooter({ text: 'Use /desvincular para remover seu registro.' })
                 .setTimestamp();

            await interaction.editReply({ embeds: [embed], ephemeral: true });
          } catch (error) {
            console.error('Erro ao buscar informações do plano:', error);
            await interaction.editReply({
              content: '❌ Ocorreu um erro ao buscar as informações do seu plano. Por favor, tente novamente mais tarde.',
              ephemeral: true
            });
          }
        } else {
          await interaction.reply({
            content: '❌ Nenhum e-mail registrado.',
            ephemeral: true
          });
        }
      }
      
      
      // Comando /verificar-email
      else if (commandName === 'verificar-email') {
        // Verifica se o usuário tem permissões elevadas
        if (!temPermissaoElevada(interaction.member)) {
          await interaction.reply({
            content: '❌ **Você não tem permissão para usar este comando.** Apenas administradores e cargos elevados podem usar este comando.',
            ephemeral: true
          });
          return;
        }

        const email = interaction.options.getString('email');
      
        if (!validarEmail(email)) {
          const embedErro = criarEmbedErro(email);
          return interaction.reply({ embeds: [embedErro], ephemeral: true });
        }
      
        const cliente = await sheetSync.buscarClientePorEmail(email);
      
        if (cliente) {
          const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Email Encontrado')
            .addFields(
              { name: '📧 Email', value: `\`${email}\`` },
              { name: '🏷️ Plano', value: `\`${cliente.nome_produto || 'Não informado'}\`` }
            )
            .setFooter({ text: 'Cliente localizado na base de dados.' })
            .setTimestamp();
      
          await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
          const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Email não encontrado')
            .setDescription('**O email informado não está em nossa base de dados.**')
            .setFooter({ text: 'Verifique se digitou corretamente.' })
            .setTimestamp();
      
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      }
      
      
      // Comando /planos
      else if (commandName === 'planos') {
        // Obtém todos os planos disponíveis
        const planos = customerDb.getAllPlans();
        
        if (!planos.success || planos.data.length === 0) {
          await interaction.reply({
            content: '❌ **Nenhum plano encontrado no sistema.**',
            ephemeral: true
          });
          return;
        }
        
        // Cria o embed com a lista de planos
        const embed = criarEmbedListaPlanos(planos.data);
        
        await interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }
      
      // Comando /config-plano
      else if (commandName === 'config-plano') {
        // Verifica se o usuário tem permissões elevadas
        if (!temPermissaoElevada(interaction.member)) {
          await interaction.reply({
            content: '❌ **Você não tem permissão para usar este comando.** Apenas administradores e cargos elevados podem usar este comando.',
            ephemeral: true
          });
          return;
        }
        try {
          console.log(`[DEBUG] Iniciando execução do comando /config-plano`);
          console.log(`[DEBUG] Servidor: ${interaction.guild.name} (ID: ${interaction.guild.id})`);
          console.log(`[DEBUG] Usuário: ${interaction.user.tag} (ID: ${interaction.user.id})`);
          
          const planoIdOriginal = interaction.options.getString('plano_id');
          console.log(`[DEBUG] Plano ID original: ${planoIdOriginal}`);
          
          const planoId = await sheetSync.getNormalizedPlanName(planoIdOriginal);
          console.log(`[DEBUG] Plano ID normalizado: ${planoId}`);
          
          const cargo = interaction.options.getRole('cargo');
          console.log(`[DEBUG] Cargo selecionado: ${cargo?.name || 'null'} (ID: ${cargo?.id || 'null'})`);
        
          if (!planoId || !cargo) {
            console.log(`[ERRO] Plano ou cargo não fornecidos. Plano: ${planoId}, Cargo: ${cargo?.id || 'null'}`);
            await interaction.reply({ content: '❌ Você precisa informar um plano e um cargo.', ephemeral: true });
            return;
          }

          // Verifica se o cargo realmente existe no servidor
          try {
            console.log(`[DEBUG] Tentando buscar cargo no servidor: ${cargo.id}`);
            const cargoVerificado = await interaction.guild.roles.fetch(cargo.id);
            if (!cargoVerificado) {
              console.log(`[ERRO] Cargo não encontrado no servidor ${interaction.guild.name}: ${cargo.name} (ID: ${cargo.id})`);
              await interaction.reply({ 
                content: '❌ O cargo selecionado não existe mais neste servidor. Por favor, selecione um cargo válido.',
                ephemeral: true 
              });
              return;
            }

            // Verifica se o bot tem permissão para gerenciar este cargo
            console.log(`[DEBUG] Verificando permissões do bot no servidor`);
            const botMember = await interaction.guild.members.fetchMe();
            console.log(`[DEBUG] Cargo mais alto do bot: ${botMember.roles.highest.name} (Posição: ${botMember.roles.highest.position})`);
            console.log(`[DEBUG] Posição do cargo alvo: ${cargoVerificado.position}`);

            if (botMember.roles.highest.position <= cargoVerificado.position) {
              console.log(`[ERRO] Bot não tem hierarquia suficiente no servidor ${interaction.guild.name}. Cargo do bot: ${botMember.roles.highest.position}, Cargo alvo: ${cargoVerificado.position}`);
              await interaction.reply({ 
                content: `❌ O bot não tem permissão para gerenciar o cargo ${cargoVerificado.name}. O cargo do bot precisa estar acima deste cargo na hierarquia.`,
                ephemeral: true 
              });
              return;
            }

            // Verifica se o bot tem a permissão específica de gerenciar cargos
            if (!botMember.permissions.has('ManageRoles')) {
              console.log(`[ERRO] Bot não tem permissão "Gerenciar Cargos" no servidor ${interaction.guild.name}`);
              await interaction.reply({ 
                content: '❌ O bot não tem a permissão "Gerenciar Cargos" neste servidor. Por favor, conceda esta permissão ao bot.',
                ephemeral: true 
              });
              return;
            }
          } catch (error) {
            console.error(`[ERRO] Erro ao verificar cargo no servidor ${interaction.guild.name}:`, error);
            await interaction.reply({ 
              content: '❌ Ocorreu um erro ao verificar o cargo. Por favor, tente novamente.',
              ephemeral: true 
            });
            return;
          }
        
          // Validar se o plano existe na planilha usando o cache normalizado
          console.log(`[DEBUG] Verificando planos disponíveis na planilha`);
          const planosDisponiveis = await sheetSync.getNormalizedPlans();
          if (!planosDisponiveis.includes(planoId)) {
            console.log(`[ERRO] Plano não encontrado na planilha: ${planoId}`);
            await interaction.reply({ 
              content: `❌ O plano \`${planoId}\` não existe na planilha. Verifique o nome exato.`,
              ephemeral: true 
            });
            return;
          }
        
          // Atualiza o banco de dados local para associar planoId -> cargo.id
          console.log(`[DEBUG] Verificando plano existente no banco de dados`);
          const planoExistente = customerDb.getPlanByName(planoId);
          console.log(`[DEBUG] Resultado da busca do plano: ${JSON.stringify(planoExistente)}`);

          let resultado;
          if (planoExistente.success && planoExistente.data) {
            // Plano existe: atualizar cargo usando o ID do plano
            console.log(`[INFO] Atualizando cargo do plano existente com ID: ${planoExistente.data.id}`);
            resultado = customerDb.updatePlanRole(planoExistente.data.id, cargo.id);
            console.log(`[INFO] Atualizando cargo do plano ${planoId} para ${cargo.name} (ID: ${cargo.id}) no servidor ${interaction.guild.name}`);
          } else {
            // Plano não existe: criar plano novo
            console.log(`[INFO] Criando novo plano pois não foi encontrado`);
            resultado = customerDb.createPlan({
              name: planoId,
              description: '',
              discord_role_id: cargo.id
            });
            console.log(`[INFO] Criando novo plano ${planoId} com cargo ${cargo.name} (ID: ${cargo.id}) no servidor ${interaction.guild.name}`);
          }

          if (resultado.success) {
            console.log(`[SUCESSO] Cargo configurado com sucesso`);
            const embed = new EmbedBuilder()
              .setColor(0x00FF00) // Verde
              .setTitle('✅ Cargo Configurado')
              .setDescription(`O cargo ${cargo} foi associado ao plano \`${planoId}\`.`)
              .addFields(
                { name: '📋 Plano', value: `\`${planoId}\``, inline: true },
                { name: '🏷️ Cargo', value: `${cargo}`, inline: true },
                { name: '🆔 ID do Cargo', value: `\`${cargo.id}\``, inline: false }
              )
              .setTimestamp();
        
            await interaction.reply({ embeds: [embed], ephemeral: true });
          } else {
            console.error(`[ERRO] Erro ao configurar cargo no servidor ${interaction.guild.name}:`, resultado.error);
            // Se o erro for PLAN_NOT_FOUND, tenta atualizar usando o ID do plano existente
            if (resultado.error === 'PLAN_NOT_FOUND' && planoExistente.success && planoExistente.data) {
              console.log(`[INFO] Tentando atualizar plano usando ID existente: ${planoExistente.data.id}`);
              const resultadoAtualizacao = customerDb.updatePlanRole(planoExistente.data.id, cargo.id);
              
              if (resultadoAtualizacao.success) {
                console.log(`[SUCESSO] Plano atualizado com sucesso após erro`);
                const embed = new EmbedBuilder()
                  .setColor(0x00FF00) // Verde
                  .setTitle('✅ Cargo Configurado')
                  .setDescription(`O cargo ${cargo} foi associado ao plano \`${planoId}\`.`)
                  .addFields(
                    { name: '📋 Plano', value: `\`${planoId}\``, inline: true },
                    { name: '🏷️ Cargo', value: `${cargo}`, inline: true },
                    { name: '🆔 ID do Cargo', value: `\`${cargo.id}\``, inline: false }
                  )
                  .setTimestamp();
            
                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
              }
            }
            
            await interaction.reply({ 
              content: '❌ Erro ao configurar o cargo para o plano. Verifique os logs para mais detalhes.',
              ephemeral: true 
            });
          }
        } catch (error) {
          console.error(`[ERRO] Erro geral ao executar comando /config-plano no servidor ${interaction.guild.name}:`, error);
          await interaction.reply({ 
            content: '❌ Ocorreu um erro ao processar o comando. Por favor, tente novamente.',
            ephemeral: true 
          });
        }
      }
      
      
      // Comando /verificar-permissoes
      else if (commandName === 'verificar-permissoes') {
        // Verifica se o usuário tem permissões elevadas
        if (!temPermissaoElevada(interaction.member)) {
          await interaction.reply({
            content: '❌ **Você não tem permissão para usar este comando.** Apenas administradores e cargos elevados podem usar este comando.',
            ephemeral: true
          });
          return;
        }
        
        try {
          // Obter todos os planos
          const planos = customerDb.getAllPlans();
          
          if (!planos.success) {
            await interaction.reply({
              content: '❌ **Erro ao buscar informações dos planos.**',
              ephemeral: true
            });
            return;
          }
          
          // Criar o embed de verificação de permissões
          const embed = criarEmbedVerificacaoPermissoes(interaction.guild, planos.data);
          
          await interaction.reply({
            embeds: [embed],
            ephemeral: true
          });
        } catch (error) {
          console.error('Erro ao verificar permissões:', error);
          
          await interaction.reply({
            content: '❌ **Ocorreu um erro ao verificar as permissões do bot.**',
            ephemeral: true
          });
        }
      }
      
      // Comando /admin-vinculos
      else if (commandName === 'admin-vinculos') {
        // Verifica se o usuário tem permissões elevadas
        if (!temPermissaoElevada(interaction.member)) {
          await interaction.reply({
            content: '❌ **Você não tem permissão para usar este comando.** Apenas administradores e cargos elevados podem usar este comando.',
            ephemeral: true
          });
          return;
        }
        
        try {
          // Obtém todos os vínculos
          const vinculos = db.getAllLinks();
          
          if (!vinculos.success || vinculos.data.length === 0) {
            await interaction.reply({
              content: '❌ **Nenhum vínculo encontrado entre usuários Discord e clientes.**',
              ephemeral: true
            });
            return;
          }
          
          // Obtém informações dos emails
          const emails = db.getAllEmails();
          
          if (!emails.success) {
            await interaction.reply({
              content: '❌ **Ocorreu um erro ao buscar informações dos emails.**',
              ephemeral: true
            });
            return;
          }
          
          // Cria o embed com a lista de vínculos
          const embed = criarEmbedListaVinculos(vinculos.data, emails.data);
          
          await interaction.reply({
            embeds: [embed],
            ephemeral: true
          });
        } catch (error) {
          console.error('Erro ao listar vínculos:', error);
          
          await interaction.reply({
            content: '❌ **Ocorreu um erro ao listar os vínculos.**',
            ephemeral: true
          });
        }
      }

      // Comando /tutorial
      else if (commandName === 'tutorial') {
        // Verifica se o usuário tem o cargo DEV
        if (!interaction.member.roles.cache.some(role => role.name === 'Dev')) {
          await interaction.reply({
            content: '❌ **Você não tem permissão para usar este comando.** Apenas usuários com o cargo DEV podem usar este comando.',
            ephemeral: true
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setColor(0x3498DB) // Azul
          .setTitle('📝 Tutorial de Registro')
          .setDescription('**Como se registrar no servidor:**')
          .addFields(
            { 
              name: '1️⃣ Comando de Registro', 
              value: 'Use o comando `/registro` para iniciar o processo de registro. Um formulário será aberto para você digitar seu email.', 
                inline: false
            },
            { 
              name: '2️⃣ Validação do Email', 
              value: 'O email deve ser válido e estar cadastrado em nossa base de clientes. Se não estiver, você não poderá se registrar.', 
              inline: false 
            },
            { 
              name: '3️⃣ Vinculação Automática', 
              value: 'Após o registro, você será automaticamente vinculado ao seu cliente e receberá o cargo correspondente ao seu plano.', 
              inline: false 
            },
            { 
              name: '4️⃣ Verificação', 
              value: 'Use o comando `/meu-email` para verificar seu email registrado e informações do seu plano.', 
              inline: false 
            },
            { 
              name: '5️⃣ Desvinculação', 
              value: 'Se precisar desvincular seu email, use o comando `/desvincular`. Isso removerá seu cargo de plano.', 
              inline: false 
            }
          )
          .setFooter({ text: 'Dúvidas? Contate um administrador.' })
          .setTimestamp();

        await interaction.reply({ content: '@everyone', embeds: [embed] });
      }
    }
    
    // Tratamento de botões 
    else if (interaction.isButton()) {
      if (interaction.customId.startsWith('retry_email_')) {
        try {
          // Extrai o email anterior do customId
          const emailAnterior = interaction.customId.replace('retry_email_', '');
          
          // Cria o modal com o email anterior
          const modal = criarModalEmail('email-modal-retry', emailAnterior);
          
          // Exibe o modal
          await interaction.showModal(modal);
          console.log(`Modal de correção de email exibido para ${interaction.user.tag}`);
        } catch (error) {
          console.error('Erro ao exibir o modal de correção:', error);
          await interaction.reply({ 
            content: '❌ **Ocorreu um erro ao abrir o formulário de correção.** Por favor, tente novamente mais tarde.', 
            ephemeral: true 
          });
        }
      }
      else if (interaction.customId === 'desvincular_email') {
        // Busca o email atual do usuário para usar no embed
        const emailAtual = db.getEmailByUserId(interaction.user.id);
        
        if (emailAtual.success && emailAtual.data) {
          const email = emailAtual.data.email;
          
          // Tenta remover os cargos de planos, se estiver em um servidor
          let cargosRemovidos = false;
          if (interaction.guild) {
            try {
              // Obter o objeto GuildMember para manipular cargos
              const member = await interaction.guild.members.fetch(interaction.user.id);
              cargosRemovidos = await removerCargosPlano(member);
            } catch (error) {
              console.error('Erro ao remover cargos de plano ao desvincular por botão:', error);
            }
          }
          
          // Remove a vinculação com o cliente, se existir
          db.unlinkUser(interaction.user.id);
          
          // Desvincular o email
          const resultado = db.unregisterEmail(interaction.user.id);
          
          if (resultado.success) {
            // Cria o embed de sucesso com informação sobre cargos
            const embed = criarEmbedDesvinculacaoComCargos(email, cargosRemovidos);
            
            await interaction.update({
              embeds: [embed],
              components: []
            });
          } else {
            // Erro ao desvincular (improvável chegar aqui)
            const embed = criarEmbedErroDesvincular();
            
            await interaction.update({
              embeds: [embed],
              components: []
            });
          }
        } else {
          // Erro ao desvincular
          const embed = criarEmbedErroDesvincular();
          
          await interaction.update({
            embeds: [embed],
            components: []
          });
        }
      }
      else if (interaction.customId === 'atualizar_email') {
        // Busca email atual do usuário
        const emailAtual = db.getEmailByUserId(interaction.user.id);
        let emailValor = '';
        
        if (emailAtual.success && emailAtual.data) {
          emailValor = emailAtual.data.email;
        }
        
        // Cria o modal com o email atual
        const modal = criarModalEmail('email-modal-update', emailValor);
        
        // Exibe o modal
        await interaction.showModal(modal);
      }
    }
    
    // Tratamento de modais
    else if (interaction.type === InteractionType.ModalSubmit) {
      if (interaction.customId.startsWith('email-modal')) {
        try {
          // Primeiro, adiar a resposta para evitar o timeout
          await interaction.deferReply({ ephemeral: true });

          const email = interaction.fields.getTextInputValue('email-input').trim();

          // Validação do email
          if (!validarEmail(email)) {
            console.log(`Email inválido recebido: ${email} de ${interaction.user.tag}`);
            const embedErro = criarEmbedErro(email);
            return await interaction.editReply({ embeds: [embedErro] });
          }

          // Verifica se o email já está registrado no sistema (banco local Discord)
          const emailVerificado = db.isEmailRegistered(email);

          if (emailVerificado.exists) {
            if (emailVerificado.data.user_id === interaction.user.id) {
              const embed = criarEmbedInfoUsuario(emailVerificado.data);
              return await interaction.editReply({ embeds: [embed] });
            }

            const dataFormatada = formatarData(emailVerificado.data.registered_at);
            const embedErroEmailJaRegistrado = criarEmbedErroEmailJaRegistrado(
              email,
              emailVerificado.data.user_tag,
              dataFormatada
            );

            return await interaction.editReply({ embeds: [embedErroEmailJaRegistrado] });
          }

          // Busca o cliente na planilha
          const cliente = await sheetSync.buscarClientePorEmail(email);

          if (!cliente) {
            const embedNaoEncontrado = new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('❌ Email não encontrado')
              .setDescription('**O email informado não foi encontrado em nossa base de dados.**')
              .setFooter({ text: 'Verifique se digitou corretamente ou aguarde atualização do sistema.' })
              .setTimestamp();

            return await interaction.editReply({ embeds: [embedNaoEncontrado] });
          }

          // Se chegou aqui, email é válido e está na planilha
          // Se for atualização (email-modal-update), desvincula antes
          if (interaction.customId === 'email-modal-update') {
            db.unregisterEmail(interaction.user.id);
          }

          // Registra email no banco
          const resultado = db.registerEmail(
            email,
            interaction.user.id,
            interaction.user.tag,
            interaction.guild ? interaction.guild.id : null
          );

          if (resultado.success) {
            console.log(`E-mail registrado com sucesso: ${email} por ${interaction.user.tag}`);

            // Busca o plano com maior preço entre as duplicatas
            const planoMaiorPreco = await sheetSync.obterPlanoMaiorPreco(email);
            console.log(`[DEBUG] Plano com maior preço:`, planoMaiorPreco);

            if (planoMaiorPreco) {
              try {
                // Busca todas as compras do email para listar
                const duplicatas = await sheetSync.buscarDuplicatasEmail(email);
                console.log(`[DEBUG] Todas as compras encontradas:`, duplicatas);

                // Vincula o usuário ao cliente usando o código do cliente
                const linkResult = db.linkUserToCustomer(interaction.user.id, cliente.codigo_cliente);
                if (!linkResult.success) {
                  console.error('Erro ao vincular usuário ao cliente:', linkResult.error);
                } else {
                  console.log(`Usuário ${interaction.user.tag} vinculado ao cliente ${cliente.codigo_cliente}`);
                }

                console.log(`[DEBUG] Plano original com maior preço: ${planoMaiorPreco.nome_produto} (R$ ${planoMaiorPreco.preco})`);
                
                // Normaliza o nome do plano (remove apenas o tamanho)
                const nomePlanoExibicao = planoMaiorPreco.nome_produto.replace(/\s*-\s*Tamanho.*$/i, '').trim();
                console.log(`[DEBUG] Nome do plano para exibição: ${nomePlanoExibicao}`);
                
                const nomePlanoNormalizado = await sheetSync.getNormalizedPlanName(planoMaiorPreco.nome_produto);
                console.log(`[DEBUG] Plano normalizado para cargo: ${nomePlanoNormalizado}`);
                
                const planoInfo = await customerDb.getPlanByName(nomePlanoNormalizado);
                console.log(`[DEBUG] Informações do plano:`, planoInfo);

                const embed = new EmbedBuilder()
                  .setColor(0x00FF00)
                  .setTitle('✅ Registro Concluído')
                  .addFields(
                    { name: '📧 Email', value: `\`${email}\`` },
                    { name: '📦 Plano', value: `\`${nomePlanoExibicao}\` (R$ ${planoMaiorPreco.preco})` }
                  );

                if (duplicatas && duplicatas.length > 1) {
                  // Adiciona todos os planos comprados
                  embed.addFields({
                    name: '📋 Todos os Planos',
                    value: duplicatas.map(d => 
                      `\`${d.nome_produto.replace(/\s*-\s*Tamanho.*$/i, '').trim()}\` (R$ ${d.preco})`
                    ).join('\n'),
                    inline: false
                  });
                }

                if (planoInfo.success && planoInfo.data?.discord_role_id) {
                  const member = await interaction.guild.members.fetch(interaction.user.id);
                  
                  // Remove cargos antigos primeiro
                  const planosResult = customerDb.getAllPlans();
                  if (planosResult.success) {
                    for (const plano of planosResult.data) {
                      if (plano.discord_role_id) {
                        console.log(`[DEBUG] Removendo cargo antigo ${plano.discord_role_id}`);
                        await member.roles.remove(plano.discord_role_id).catch(console.error);
                      }
                    }
                  }

                  // Adiciona o novo cargo
                  console.log(`[DEBUG] Adicionando novo cargo ${planoInfo.data.discord_role_id}`);
                  await member.roles.add(planoInfo.data.discord_role_id);
                  console.log(`[SUCESSO] Cargo ${planoInfo.data.discord_role_id} atribuído para ${interaction.user.tag}`);

                  embed.addFields({
                    name: '🏷️ Cargo',
                    value: 'Seu cargo foi atualizado de acordo com seu plano!'
                  });
                } else {
                  console.warn('[AVISO] Plano não encontrado ou sem cargo configurado:', nomePlanoNormalizado);
                  embed.addFields({
                    name: '⚠️ Cargo',
                    value: 'Seu plano não tem um cargo configurado. Por favor, contate um administrador.'
                  });
                }

                return await interaction.editReply({ embeds: [embed] });
              } catch (error) {
                console.error('[ERRO] Erro ao processar cargo:', error);
                const embedErro = new EmbedBuilder()
                  .setColor(0xFF0000)
                  .setTitle('⚠️ Erro no Sistema')
                  .setDescription('**Ocorreu um erro ao processar seu registro.**')
                  .addFields(
                    { name: '📧 Email', value: `\`${email}\`` },
                    { name: '⚠️ Erro', value: 'Ocorreu um erro ao configurar seu cargo. Por favor, contate um administrador.' }
                  )
                  .setFooter({ text: 'O email foi registrado, mas houve um problema com o cargo.' })
                  .setTimestamp();

                return await interaction.editReply({ embeds: [embedErro] });
              }
            }
          } else {
            console.error('Erro ao registrar email:', resultado.error);
            const embedErroProcessamento = new EmbedBuilder()
              .setColor(0xFF0000)
              .setTitle('⚠️ Erro no Registro')
              .setDescription('**Ocorreu um erro ao registrar seu email.**')
              .addFields(
                { name: '🔄 Próximos Passos', value: 'Tente novamente mais tarde.' }
              )
              .setFooter({ text: 'Se o problema persistir, contate o administrador.' })
              .setTimestamp();

            return await interaction.editReply({ embeds: [embedErroProcessamento] });
          }
        } catch (error) {
          console.error('Erro ao processar o modal de registro:', error);
          const embedErroSistema = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('⚠️ Erro no Sistema')
            .setDescription('**Ocorreu um erro ao processar seu registro.**')
            .setFooter({ text: 'Tente novamente mais tarde.' })
            .setTimestamp();

          if (!interaction.replied) {
            return await interaction.editReply({ embeds: [embedErroSistema] });
          }
        }
      }
    }
  } catch (error) {
    console.error('Erro ao processar interação:', error);
    // Tenta enviar mensagem de erro para o usuário
    try {
      if (!interaction.replied && !interaction.deferred) {
        const embedErroGeral = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('⚠️ Erro no Sistema')
          .setDescription('**Ocorreu um erro ao processar seu comando.**')
          .addFields(
            { name: '🔄 Próximos Passos', value: 'Por favor, tente novamente mais tarde.' }
          )
          .setFooter({ text: 'Se o problema persistir, contate o administrador' })
          .setTimestamp();
        
        await interaction.reply({ 
          embeds: [embedErroGeral], 
          ephemeral: true 
        });
      }
    } catch (replyError) {
      console.error('Erro ao enviar mensagem de erro:', replyError);
    }
  }
});

// Evento quando o bot entra em um novo servidor
client.on(Events.GuildCreate, async (guild) => {
  console.log(`Bot adicionado ao servidor: ${guild.name} (ID: ${guild.id})`);
  
  // Registra os comandos Slash no novo servidor
  try {
    console.log(`Registrando comandos no novo servidor: ${guild.name}`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commands.map(command => command.toJSON()) }
    );
    
    console.log(`Comandos Slash registrados com sucesso no servidor: ${guild.name}`);
  } catch (error) {
    console.error(`Erro ao registrar comandos no servidor ${guild.name}:`, error);
  }
});

// Evento executado quando uma mensagem é recebida (mantido para compatibilidade, mas usando comandos slash é o recomendado)
client.on(Events.MessageCreate, async (message) => {
  // Ignora mensagens de bots para evitar loops
  if (message.author.bot) return;
  
  try {
    // Exemplo de comando simples
    if (message.content === '!ping') {
      // Tenta usar reply ephemeral, se não for possível, usa o reply normal
      try {
        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('🏓 Pong!')
          .setDescription(`**Latência:** ${client.ws.ping}ms`)
          .setFooter({ text: `Solicitado por ${message.author.tag}` })
          .setTimestamp();
        
        await message.reply({ embeds: [embed] });
      } catch (error) {
        await message.reply('🏓 **Pong!** (Utilizando comandos slash como `/ping` é recomendado para mensagens efêmeras)');
      }
    }
    
    // Comando para registrar manualmente os comandos slash
    if (message.content === '!registrar-comandos' && message.guild) {
      try {
        const embedInicio = new EmbedBuilder()
          .setColor(0xFFA500) // Laranja
          .setTitle('🔄 Registrando Comandos')
          .setDescription('**Registrando comandos slash... Aguarde um momento.**')
          .setTimestamp();
          
        await message.reply({ embeds: [embedInicio] });
        
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, message.guild.id),
          { body: commands.map(command => command.toJSON()) }
        );
        
        const embedSucesso = new EmbedBuilder()
          .setColor(0x00FF00) // Verde
          .setTitle('✅ Comandos Registrados')
          .setDescription('**Comandos slash registrados com sucesso neste servidor!**')
          .addFields(
            { name: '🔍 Como Usar', value: 'Digite `/` para ver e usar os comandos slash do bot.' }
          )
          .setTimestamp();
        
        await message.reply({ embeds: [embedSucesso] });
      } catch (error) {
        console.error('Erro ao registrar comandos:', error);
        
        const embedErro = new EmbedBuilder()
          .setColor(0xFF0000) // Vermelho
          .setTitle('❌ Erro no Registro')
          .setDescription('**Ocorreu um erro ao registrar os comandos slash.**')
          .addFields(
            { name: '🔍 Detalhes', value: 'Por favor, verifique os logs do bot para mais detalhes.' }
          )
          .setTimestamp();
        
        await message.reply({ embeds: [embedErro] });
      }
    }
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
  }
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
  console.error('Erro não tratado:', error);
});

// Tratamento para encerramento do processo
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('uncaughtException', (error) => {
  console.error('Erro não tratado:', error);
  gracefulShutdown();
});

function gracefulShutdown() {
  console.log('Iniciando desligamento do bot...');
  
  try {
    // Fecha os bancos de dados
    db.closeDatabase();
    customerDb.closeDatabase();
    console.log('Bancos de dados fechados com sucesso');
    
    // Desliga o cliente do Discord
    client.destroy();
    console.log('Cliente do Discord desconectado');
    
    console.log('Desligamento concluído com sucesso');
    
    // Encerra o processo após um pequeno atraso para garantir que os logs sejam escritos
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } catch (error) {
    console.error('Erro durante o desligamento:', error);
    process.exit(1);
  }
}

// Login do bot usando o token do .env
client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log('Login realizado com sucesso!');
  })
  .catch((error) => {
    console.error('Erro ao fazer login:', error);
  });

  sheetSync.initDatabase();
sheetSync.iniciarAtualizacaoAutomatica();
async function atualizarCachePlanos() {
  try {
    await sheetSync.updateNormalizedPlansCache();
    console.log('Cache de planos normalizados atualizado com sucesso');
  } catch (error) {
    console.error('Erro ao atualizar cache de planos:', error);
  }
}

atualizarCachePlanos();



// Cria um embed de busca da API Tray
function criarEmbedBuscandoTray() {
  return new EmbedBuilder()
    .setColor(0xFFA500) // Laranja
    .setTitle('⏳ Buscando informações...')
    .setDescription('**Estamos verificando seu email na API da Tray Commerce.**')
    .addFields(
      { name: '📡 Status', value: 'Aguarde enquanto consultamos o servidor...', inline: false }
    )
    .setFooter({ text: 'Isso pode levar alguns segundos' })
    .setTimestamp();
}

// Cria embed para o caso de cliente não encontrado na Tray
function criarEmbedClienteNaoEncontradoTray(email) {
  return new EmbedBuilder()
    .setColor(0xFF0000) // Vermelho
    .setTitle('❌ Cliente não encontrado')
    .setDescription(`**O email informado não foi encontrado na plataforma de e-commerce.**`)
    .addFields(
      { name: '📧 E-mail', value: `\`${email}\``, inline: true },
      { name: '🔄 Possíveis motivos', value: 'O email pode estar incorreto ou não estar cadastrado na loja.' },
      { name: '🔍 O que fazer?', value: 'Certifique-se de que o email está correto e que você já realizou compras na loja.' }
    )
    .setFooter({ text: 'Se o problema persistir, contate o administrador.' });
}

// Função para verificar se o usuário tem permissões elevadas
function temPermissaoElevada(member) {
  // Verifica se o usuário tem permissão de administrador
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return true;
  }

  // Verifica se o usuário tem algum dos cargos elevados
  const cargosElevados = [
    'Admin Setup',
    'Dev'
  ];

  return member.roles.cache.some(role => 
    cargosElevados.some(cargo => 
      role.name.toLowerCase().includes(cargo.toLowerCase())
    )
  );
}

// Função para atualizar cargo do usuário com base no plano
async function atualizarCargoUsuario(member, planoNome) {
  try {
    // Busca todos os planos disponíveis
    const planosResult = customerDb.getAllPlans();
    if (!planosResult.success) {
      console.error('Erro ao buscar planos:', planosResult.error);
      return false;
    }

    const planos = planosResult.data;
    
    // Remove todos os cargos de plano existentes
    for (const plano of planos) {
      if (plano.discord_role_id) {
        await member.roles.remove(plano.discord_role_id).catch(console.error);
      }
    }

    // Encontra o plano correspondente e adiciona o cargo
    const planoCorrespondente = planos.find(p => p.name.toLowerCase() === planoNome.toLowerCase());
    if (planoCorrespondente && planoCorrespondente.discord_role_id) {
      await member.roles.add(planoCorrespondente.discord_role_id);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Erro ao atualizar cargo:', error);
    return false;
  }
}