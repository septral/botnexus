import { defer } from '../core/ui.js';
import {
  PermissionFlagsBits as P,
  ButtonStyle,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  MessageFlags,
  ChannelType,
} from 'discord.js';
import { D, text, user, channel, integer, boolean, sub, choices } from './definition.js';
import { embed, row, button, reply, safe, parseDuration, truncate, time } from '../core/ui.js';
import { requireUser, requireBot, validateRole } from '../core/permissions.js';
import {
  ticketAccess,
  isTicketStaff,
  openTicket,
  closeTicket,
  transcript,
  ticketPanelView,
  ticketStaffView,
  ticketUserView,
  ticketDepartments,
  refreshTicketControl,
} from '../features/tickets.js';
import { createTempCall, isTempCallVip, tempCallPanelView } from '../features/tempcalls.js';
import { setupNexusSpace, vipRedemptionView, grantVipEntitlement, builtinProduct, revokeVipEntitlements } from '../features/vip.js';
import { verificationComponent, verificationView } from '../features/verification.js';
import { suggestionView } from '../features/suggestions.js';
import { giveawayView } from '../features/giveaways.js';
import { audit } from '../core/log.js';

export function rulesView(config, guild, acceptedCount = 0) {
  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.appearance.color.slice(1), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 📜 Regras de ${safe(guild.name)}\n${config.community.rulesIntro}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(config.community.rules))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${config.community.rulesFooter}\n\n**${acceptedCount.toLocaleString('pt-BR')} membro(s)** confirmaram a leitura · versão <t:${Math.floor(Date.now() / 1000)}:d>`,
      ),
    )
    .addActionRowComponents(
      row(
        button('rules:accept', 'Li e concordo', ButtonStyle.Primary),
        new ButtonBuilder()
          .setLabel('Diretrizes do Discord')
          .setStyle(ButtonStyle.Link)
          .setURL('https://discord.com/guidelines'),
      ),
    );
  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export async function rulesComponent(i, ctx) {
  if (i.customId !== 'rules:accept') throw new Error('Controle de regras inválido.');
  const key = `${i.guildId}:${i.user.id}`;
  const previous = ctx.store.get('rules-acceptances', key);
  if (!previous)
    ctx.store.set('rules-acceptances', key, {
      guild: i.guildId,
      user: i.user.id,
      acceptedAt: Date.now(),
    });
  return reply(
    i,
    previous
      ? '✅ Você já confirmou a leitura destas regras.'
      : '✅ Leitura confirmada. Obrigado por ajudar a manter a comunidade segura e organizada.',
  );
}

export async function embedComponent(i, ctx) {
  if (i.isModalSubmit()) {
    requireUser(i, P.ManageMessages);
    const title = i.fields.getTextInputValue('title'),
      body = i.fields.getTextInputValue('body'),
      color = i.fields.getTextInputValue('color') || ctx.store.config(i.guildId).appearance.color;
    if (!/^#[a-f0-9]{6}$/i.test(color)) throw new Error('Cor inválida. Use #7C3AED.');
    const draft = {
      guild: i.guildId,
      owner: i.user.id,
      channel: i.channelId,
      title,
      body,
      color,
      expires: Date.now() + 600000,
    };
    ctx.store.set('drafts', i.id, draft);
    return reply(i, {
      embeds: [embed(ctx.store.config(i.guildId), title, body).setColor(color)],
      components: [
        row(
          button(`draft:${i.id}:publish`, 'Publicar neste canal', ButtonStyle.Primary),
          button(`draft:${i.id}:cancel`, 'Cancelar'),
        ),
      ],
    });
  }
  requireUser(i, P.ManageMessages);
  const [, id, action] = i.customId.split(':'),
    d = ctx.store.get('drafts', id);
  if (!d || d.guild !== i.guildId || d.owner !== i.user.id || d.expires < Date.now())
    throw new Error('Rascunho indisponível ou expirado.');
  if (action === 'cancel') {
    ctx.store.delete('drafts', id);
    return i.update({ content: 'Publicação cancelada.', embeds: [], components: [] });
  }
  await i.deferUpdate();
  const channel = await i.guild.channels.fetch(d.channel);
  await requireBot(i, [P.SendMessages, P.EmbedLinks], channel);
  if (!channel.permissionsFor(i.member).has(P.SendMessages))
    throw new Error('Você não pode publicar nesse canal.');
  // Consome o rascunho antes da chamada para não duplicar em dois cliques concorrentes.
  if (!ctx.store.delete('drafts', id)) throw new Error('Rascunho já publicado.');
  const message = await channel.send({
    embeds: [embed(ctx.store.config(i.guildId), d.title, d.body).setColor(d.color)],
    allowedMentions: { parse: [] },
  });
  return i.editReply({ content: `Publicado: ${message.url}`, embeds: [], components: [] });
}
const commands = [
  D(
    'ticket',
    'Abre e gerencia chamados privados.',
    'tickets',
    null,
    [
      sub('abrir', 'Abre um chamado privado', [
        text('assunto', 'Resumo do atendimento', false, { max_length: 200 }),
      ]),
      sub('painel', 'Publica o painel de abertura', [channel()]),
      sub('painel_equipe', 'Abre ou publica o painel operacional da equipe', [channel()]),
      sub('painel_usuario', 'Abre seu painel pessoal de atendimentos'),
      sub('adicionar', 'Dá acesso a um membro', [user()]),
      sub('remover', 'Remove o acesso de um membro', [user()]),
      sub('assumir', 'Assume o atendimento'),
      sub('fechar', 'Encerra e preserva o chamado'),
      sub('transcricao', 'Exporta até 2.000 mensagens'),
    ],
    async (i, ctx) => {
      const action = i.options.getSubcommand(),
        c = ctx.store.config(i.guildId);
      if (action === 'painel') {
        requireUser(i, P.ManageGuild);
        const target = i.options.getChannel('canal') ?? i.channel;
        await requireBot(i, [P.ViewChannel, P.SendMessages, P.EmbedLinks], target);
        const msg = await target.send(
          ticketPanelView(c, i.guild, ticketDepartments(ctx, i.guildId)),
        );
        return reply(i, `Painel publicado: ${msg.url}`);
      }
      if (action === 'painel_usuario') return reply(i, ticketUserView(ctx, i.guildId, i.user.id));
      if (action === 'painel_equipe') {
        const departments = ticketDepartments(ctx, i.guildId);
        if (
          !isTicketStaff(i, c) &&
          !departments.some((department) => isTicketStaff(i, c, department))
        )
          throw new Error('Este painel é exclusivo da equipe de tickets.');
        const target = i.options.getChannel('canal');
        const view = ticketStaffView(ctx, i.guildId, i.user.id);
        if (!target) return reply(i, view);
        requireUser(i, P.ManageGuild);
        await requireBot(i, [P.ViewChannel, P.SendMessages], target);
        const msg = await target.send(view);
        return reply(i, `Painel da equipe publicado: ${msg.url}`);
      }
      await defer(i);
      if (action === 'abrir') {
        const channel = await openTicket(
          i,
          ctx,
          i.options.getString('assunto') ?? 'Atendimento geral',
        );
        return reply(i, `Seu chamado: ${channel}`);
      }
      if (action === 'transcricao') return reply(i, { files: [await transcript(i, ctx)] });
      if (action === 'fechar') {
        await closeTicket(i, ctx);
        return reply(i, 'Chamado encerrado.');
      }
      const t = ticketAccess(i, ctx, true);
      if (t.closed) throw new Error('Chamado encerrado.');
      if (action === 'assumir') {
        if (t.claimedBy && t.claimedBy !== i.user.id)
          throw new Error('Chamado já assumido por outro membro da equipe.');
        t.claimedBy = i.user.id;
        ctx.store.set('tickets', i.channelId, t);
        await refreshTicketControl(ctx, i.guild, i.channel, t);
        return reply(i, 'Você assumiu este atendimento.');
      }
      await requireBot(i, P.ManageChannels);
      const uid = i.options.getUser('usuario').id;
      if ([t.owner, i.client.user.id, i.guild.ownerId].includes(uid))
        throw new Error('Não é possível alterar o responsável, o bot ou o dono por este comando.');
      await i.channel.permissionOverwrites.edit(
        uid,
        action === 'adicionar'
          ? { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }
          : { ViewChannel: false, SendMessages: false },
      );
      return reply(i, 'Acesso atualizado.');
    },
  ),
  D(
    'tempcall',
    'Publica painéis e cria salas de voz temporárias.',
    'tempcalls',
    null,
    [
      sub('painel', 'Publica um painel fixo de criação de calls', [
        text('tipo', 'Painel normal ou VIP', true, {
          choices: choices(['Normal', 'normal'], ['VIP', 'vip']),
          max_length: undefined,
        }),
        channel('canal', 'Canal de texto do painel', false),
      ]),
      sub('criar', 'Cria sua call temporária agora', [
        text('tipo', 'Call normal ou VIP', true, {
          choices: choices(['Normal', 'normal'], ['VIP', 'vip']),
          max_length: undefined,
        }),
      ]),
      sub('geradores', 'Cria os canais de voz que geram calls ao entrar'),
    ],
    async (i, ctx) => {
      const action = i.options.getSubcommand();
      const type = i.options.getString('tipo');
      const vip = type === 'vip';
      const c = ctx.store.config(i.guildId);
      if (action === 'geradores') {
        requireUser(i, P.ManageGuild);
        await requireBot(i, [P.ManageChannels, P.MoveMembers]);
        if (!c.tempcalls.categoryId)
          throw new Error('Configure a categoria normal em /botconfig → Salas temporárias.');
        let normal = c.tempcalls.lobbyChannelId
          ? await i.guild.channels.fetch(c.tempcalls.lobbyChannelId).catch(() => null)
          : null;
        if (!normal)
          normal = await i.guild.channels.create({
            name: '➕ Criar call',
            type: ChannelType.GuildVoice,
            parent: c.tempcalls.categoryId,
            userLimit: 1,
            reason: `Gerador de calls criado por ${i.user.tag}`,
          });
        let vipLobby = c.tempcalls.vipLobbyChannelId
          ? await i.guild.channels.fetch(c.tempcalls.vipLobbyChannelId).catch(() => null)
          : null;
        const roles = c.tempcalls.vipRoleIds.split(/\s+/).filter(Boolean);
        if (c.tempcalls.vipCategoryId && roles.length && !vipLobby)
          vipLobby = await i.guild.channels.create({
            name: '💎 Criar call VIP',
            type: ChannelType.GuildVoice,
            parent: c.tempcalls.vipCategoryId,
            userLimit: 1,
            permissionOverwrites: [
              { id: i.guildId, deny: [P.ViewChannel, P.Connect] },
              ...roles.map((roleId) => ({ id: roleId, allow: [P.ViewChannel, P.Connect] })),
              {
                id: i.client.user.id,
                allow: [P.ViewChannel, P.Connect, P.MoveMembers, P.ManageChannels],
              },
            ],
            reason: `Gerador VIP criado por ${i.user.tag}`,
          });
        c.tempcalls.lobbyChannelId = normal.id;
        c.tempcalls.vipLobbyChannelId = vipLobby?.id ?? '';
        ctx.store.saveConfig(i.guildId, c);
        return reply(
          i,
          `Canais geradores configurados: ${normal}${vipLobby ? ` e ${vipLobby}` : ''}. Ao entrar, o membro será movido para sua própria call.`,
        );
      }
      if (action === 'criar') {
        if (vip && !isTempCallVip(i.member, c))
          throw new Error('Você não possui um dos cargos VIP configurados.');
        const voice = await createTempCall(ctx, i.member, vip, { move: true });
        return reply(i, `Sua call foi criada: ${voice}`);
      }
      requireUser(i, P.ManageGuild);
      const target = i.options.getChannel('canal') ?? i.channel;
      if (!target?.isTextBased()) throw new Error('Escolha um canal de texto para o painel.');
      await requireBot(i, [P.ViewChannel, P.SendMessages], target);
      if (vip) {
        const roles = c.tempcalls.vipRoleIds.split(/\s+/).filter(Boolean);
        if (!roles.length) throw new Error('Configure ao menos um cargo VIP em /botconfig.');
        if (target.permissionsFor(i.guild.roles.everyone).has(P.ViewChannel))
          throw new Error('O painel VIP deve ser publicado em um canal privado para @everyone.');
        if (!roles.some((roleId) => target.permissionsFor(roleId)?.has(P.ViewChannel)))
          throw new Error('Nenhum cargo VIP configurado consegue visualizar este canal.');
      }
      const message = await target.send(tempCallPanelView(c, i.guild, vip));
      ctx.store.set('tempcall-panels', message.id, {
        guild: i.guildId,
        channel: target.id,
        message: message.id,
        vip,
        createdBy: i.user.id,
        createdAt: Date.now(),
      });
      return reply(i, `Painel ${vip ? 'VIP' : 'normal'} publicado: ${message.url}`);
    },
  ),
  D(
    'vip',
    'Publica o painel de resgate e consulta assinaturas VIP.',
    'economy',
    null,
    [
      sub('painel', 'Publica o painel de resgate de gift cards', [channel()]),
      sub('status', 'Consulta seus VIPs ativos e respectivas validades'),
    ],
    async (i, ctx) => {
      const action = i.options.getSubcommand();
      const config = ctx.store.config(i.guildId);
      if (action === 'status') {
        const subscriptions = ctx.store
          .list('vip-entitlements')
          .filter(
            (record) => record.guild === i.guildId && record.user === i.user.id && record.active,
          );
        return reply(i, {
          embeds: [
            embed(
              config,
              '💎 Seus benefícios VIP',
              subscriptions.length
                ? subscriptions
                    .map(
                      (record) =>
                        `**${safe(record.tier.replaceAll('_', ' ').toUpperCase())}** · ${record.expiresAt ? `expira <t:${Math.floor(record.expiresAt / 1000)}:R>` : 'vitalício'}`,
                    )
                    .join('\n')
                : 'Você não possui um VIP ativo. Consulte os planos no painel fixo da loja.',
            ),
          ],
        });
      }
      requireUser(i, P.ManageGuild);
      const target = i.options.getChannel('canal') ?? i.channel;
      await requireBot(i, [P.ViewChannel, P.SendMessages], target);
      const message = await target.send(vipRedemptionView(config, i.guild));
      config.vip.redemptionChannelId = target.id;
      ctx.store.saveConfig(i.guildId, config);
      return reply(i, `Painel VIP publicado: ${message.url}`);
    },
  ),
  D(
    'setvip',
    'Concede ou renova um plano VIP para um membro.',
    'economy',
    P.ManageGuild,
    [
      user('usuario', 'Membro', true),
      text('nivel', 'vip, vip_plus ou vip_nexus', true, { choices: choices(['VIP', 'vip'], ['VIP+', 'vip_plus'], ['VIP N3XUS', 'vip_nexus']) }),
      text('duracao', '1m, 3m, 1y ou life', true, { choices: choices(['1 mês', '1m'], ['3 meses', '3m'], ['1 ano', '1y'], ['Vitalício', 'life']) }),
    ],
    async (i, ctx) => {
      const config = ctx.store.config(i.guildId);
      const target = i.options.getUser('usuario');
      const tier = i.options.getString('nivel');
      const duration = i.options.getString('duracao');
      const product = builtinProduct(`${tier}_${duration === 'life' ? 'life' : duration}`, config);
      if (!product) throw new Error('Duração ou nível VIP inválido.');
      const result = await grantVipEntitlement(ctx, i.guild, target.id, product.id, i.user.id);
      return reply(i, `✅ ${result.role} concedido a <@${target.id}> até ${result.entitlement.expiresAt ? `<t:${Math.floor(result.entitlement.expiresAt / 1000)}:F>` : 'vitalício'}.`);
    },
  ),
  D(
    'criarvipnx',
    'Cria a estrutura completa de canais do VIP N3XUS.',
    'economy',
    P.ManageGuild,
    [user('usuario', 'Assinante VIP N3XUS', true)],
    async (i, ctx) => {
      await requireBot(i, [P.ManageChannels, P.ManageRoles, P.SendMessages]);
      const target = i.options.getUser('usuario');
      const space = await setupNexusSpace(i, ctx, target);
      return reply(i, `✅ Estrutura N3XUS criada para <@${target.id}>.\nCategoria: <#${space.categoryId}>\nPainel: <#${space.configChannelId}>\nTickets: <#${space.ticketPanelChannelId}>\nCall: <#${space.voiceChannelId}>`);
    },
  ),
  D(
    'revogarvip',
    'Remove todos os benefícios VIP de um membro e apaga seu espaço N3XUS.',
    'economy',
    P.ManageGuild,
    [user('usuario', 'Membro que terá o VIP revogado', true)],
    async (i, ctx) => {
      await requireBot(i, [P.ManageRoles, P.ManageChannels]);
      const target = i.options.getUser('usuario');
      const result = await revokeVipEntitlements(ctx, i.guild, target.id, i.user.id);
      return reply(i, `✅ VIP revogado de <@${target.id}>. ${result.removed ? `${result.removed} plano(s) encerrado(s).` : 'Nenhum plano ativo foi encontrado.'} Cargos e espaço N3XUS foram removidos quando existiam.`);
    },
  ),
  D(
    'verificacao',
    'Publica o painel de verificação com CAPTCHA em imagem.',
    'verification',
    P.ManageGuild,
    [channel()],
    async (i, ctx) => {
      const c = ctx.store.config(i.guildId);
      if (!c.verification.roleId) throw new Error('Defina o cargo de verificação em /botconfig.');
      await validateRole(i.guild, c.verification.roleId, i.user.id);
      const target = i.options.getChannel('canal') ?? i.channel;
      await requireBot(i, [P.SendMessages], target);
      const msg = await target.send(verificationView(c, i.guild));
      return reply(i, `Painel publicado: ${msg.url}`);
    },
  ),
  D(
    'verificar',
    'Conclui a triagem de acesso do servidor.',
    'verification',
    null,
    [],
    verificationComponent,
  ),
  D(
    'regras',
    'Publica as regras configuradas em /botconfig.',
    'community',
    P.ManageGuild,
    [channel()],
    async (i, ctx) => {
      const target = i.options.getChannel('canal') ?? i.channel;
      await requireBot(i, [P.SendMessages], target);
      const config = ctx.store.config(i.guildId);
      const acceptedCount = ctx.store
        .list('rules-acceptances')
        .filter((record) => record.guild === i.guildId).length;
      const m = await target.send(rulesView(config, i.guild, acceptedCount));
      return reply(i, `Regras publicadas: ${m.url}`);
    },
  ),
  D(
    'anunciar',
    'Publica um comunicado formatado em um canal.',
    'community',
    P.ManageGuild,
    [
      text('titulo', 'Título do anúncio', true, { max_length: 200 }),
      text('mensagem', 'Texto do anúncio', true, { max_length: 1800 }),
      channel(),
      boolean('mencionar_todos', 'Autoriza uma menção a @everyone'),
    ],
    async (i, ctx) => {
      const target = i.options.getChannel('canal') ?? i.channel,
        mention = i.options.getBoolean('mencionar_todos') ?? false;
      if (mention) requireUser(i, P.MentionEveryone);
      await requireBot(
        i,
        [P.SendMessages, P.EmbedLinks, ...(mention ? [P.MentionEveryone] : [])],
        target,
      );
      const m = await target.send({
        content: mention ? '@everyone' : undefined,
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            i.options.getString('titulo'),
            i.options.getString('mensagem'),
          ),
        ],
        allowedMentions: { parse: mention ? ['everyone'] : [] },
      });
      await audit(
        ctx,
        i.guild,
        '📣 Comunicado publicado',
        `${i.user.tag} publicou em <#${target.id}>.`,
      );
      return reply(i, `Comunicado publicado: ${m.url}`);
    },
  ),
  D(
    'embed',
    'Cria uma embed com prévia antes de publicar.',
    'community',
    P.ManageMessages,
    [],
    async (i) => {
      const field = (id, label, style, max) =>
        new LabelBuilder().setLabel(label).setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(id)
            .setStyle(style)
            .setRequired(id !== 'color')
            .setMaxLength(max),
        );
      return i.showModal(
        new ModalBuilder()
          .setCustomId('draft:create')
          .setTitle('Criar embed')
          .addLabelComponents(
            field('title', 'Título', TextInputStyle.Short, 200),
            field('body', 'Conteúdo', TextInputStyle.Paragraph, 3500),
            field('color', 'Cor hexadecimal (opcional)', TextInputStyle.Short, 7),
          ),
      );
    },
  ),
  D(
    'enquete',
    'Cria uma enquete nativa do Discord.',
    'community',
    null,
    [
      text('pergunta', 'Pergunta da enquete', true, { max_length: 300 }),
      text('opcoes', 'De 2 a 10 respostas separadas por ;', true, { max_length: 1000 }),
      integer('horas', 'Duração em horas', false, 1, 768),
      boolean('multiplas', 'Permite escolher mais de uma resposta'),
    ],
    async (i) => {
      requireUser(i, P.SendMessages);
      await requireBot(i, [P.SendMessages, P.SendPolls]);
      const answers = i.options
        .getString('opcoes')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
      if (answers.length < 2 || answers.length > 10 || answers.some((s) => s.length > 55))
        throw new Error('Informe 2 a 10 respostas de até 55 caracteres cada.');
      const m = await i.channel.send({
        poll: {
          question: { text: i.options.getString('pergunta') },
          answers: answers.map((text) => ({ text })),
          duration: i.options.getInteger('horas') ?? 24,
          allowMultiselect: i.options.getBoolean('multiplas') ?? false,
        },
        allowedMentions: { parse: [] },
      });
      return reply(i, `Enquete criada: ${m.url}`);
    },
  ),
  D(
    'sugerir',
    'Publica uma sugestão com votos persistentes.',
    'community',
    null,
    [text('texto', 'Sua sugestão', true, { max_length: 1500 })],
    async (i, ctx) => {
      const c = ctx.store.config(i.guildId);
      if (!c.community.suggestionsChannelId)
        throw new Error('Configure o canal de sugestões em /botconfig.');
      const target = await i.guild.channels.fetch(c.community.suggestionsChannelId);
      if (!target.permissionsFor(i.member).has(P.ViewChannel))
        throw new Error('Você não tem acesso ao canal de sugestões.');
      await requireBot(i, [P.SendMessages, P.EmbedLinks], target);
      const s = {
        id: i.id,
        guild: i.guildId,
        author: i.user.id,
        text: i.options.getString('texto'),
        votes: {},
        created: Date.now(),
      };
      const m = await target.send(suggestionView(c, s));
      s.message = m.id;
      s.channel = m.channelId;
      ctx.store.set('suggestions', i.id, s);
      return reply(i, `Sugestão publicada: ${m.url}`);
    },
  ),
  D(
    'denunciar',
    'Envia um relato ao canal privado da equipe.',
    'community',
    null,
    [
      text('relato', 'Descreva o ocorrido', true, { max_length: 1500 }),
      user('usuario', 'Usuário envolvido', false),
    ],
    async (i, ctx) => {
      const c = ctx.store.config(i.guildId);
      if (!c.community.reportsChannelId)
        throw new Error('O canal privado de denúncias não foi configurado.');
      const target = await i.guild.channels.fetch(c.community.reportsChannelId);
      if (target.permissionsFor(i.guild.roles.everyone).has(P.ViewChannel))
        throw new Error(
          'O canal de denúncias precisa ser privado para @everyone. Peça à equipe para configurá-lo.',
        );
      await requireBot(i, [P.SendMessages, P.EmbedLinks], target);
      await target.send({
        embeds: [
          embed(
            c,
            '🚨 RELATO À EQUIPE',
            `**Autor:** <@${i.user.id}>\n**Envolvido:** ${i.options.getUser('usuario') ? `<@${i.options.getUser('usuario').id}>` : 'Não informado'}\n**Canal de origem:** <#${i.channelId}>\n\n${safe(i.options.getString('relato'))}`,
          ),
        ],
        allowedMentions: { parse: [] },
      });
      return reply(i, 'Relato enviado ao canal da equipe.');
    },
  ),
  D(
    'afk',
    'Marca você como ausente; uma mensagem remove a ausência.',
    'community',
    null,
    [text('motivo', 'Motivo da ausência', false, { max_length: 200 })],
    async (i, ctx) => {
      ctx.store.set('afk', `${i.guildId}:${i.user.id}`, {
        guild: i.guildId,
        user: i.user.id,
        reason: i.options.getString('motivo') ?? 'Ausente',
        since: Date.now(),
      });
      return reply(i, 'Ausência registrada. Ao enviar uma mensagem, você volta automaticamente.');
    },
  ),
  D(
    'rolepanel',
    'Cria um painel de cargos comuns autoatribuíveis.',
    'community',
    P.ManageRoles,
    [
      text('cargos', 'IDs de até 25 cargos separados por espaço', true, { max_length: 600 }),
      text('titulo', 'Título do painel', false, { max_length: 100 }),
      channel(),
    ],
    async (i, ctx) => {
      const ids = [...new Set(i.options.getString('cargos').split(/\s+/).filter(Boolean))];
      if (!ids.length || ids.length > 25 || ids.some((v) => !/^\d{17,20}$/.test(v)))
        throw new Error('Use IDs numéricos de 1 a 25 cargos.');
      await defer(i);
      const roles = [];
      for (const id of ids) roles.push(await validateRole(i.guild, id, i.user.id));
      const target = i.options.getChannel('canal') ?? i.channel;
      await requireBot(i, [P.SendMessages, P.EmbedLinks, P.ManageRoles], target);
      const id = i.id,
        m = await target.send({
          embeds: [
            embed(
              ctx.store.config(i.guildId),
              i.options.getString('titulo') ?? '🏷️ IDENTIFICAÇÃO / CARGOS',
              'Selecione um cargo para adicioná-lo ou removê-lo.',
            ),
          ],
          components: [
            row(
              new StringSelectMenuBuilder()
                .setCustomId(`rolepanel:${id}`)
                .setPlaceholder('Escolha um cargo')
                .addOptions(roles.map((r) => ({ label: truncate(r.name, 100), value: r.id }))),
            ),
          ],
          allowedMentions: { parse: [] },
        });
      ctx.store.set('rolepanels', id, {
        guild: i.guildId,
        message: m.id,
        channel: target.id,
        roles: ids,
      });
      return reply(i, `Painel publicado: ${m.url}`);
    },
  ),
  D(
    'sorteio',
    'Cria, encerra, lista e refaz sorteios persistentes.',
    'community',
    null,
    [
      sub('criar', 'Abre um sorteio', [
        text('premio', 'Prêmio do sorteio', true, { max_length: 150 }),
        text('duracao', 'Ex.: 30m, 2h ou 3d', true, { max_length: 12 }),
        integer('vencedores', 'Número de vencedores', false, 1, 20),
      ]),
      sub('encerrar', 'Encerra um sorteio', [
        text('id', 'ID do sorteio', true, { max_length: 20 }),
      ]),
      sub('rerolar', 'Escolhe novos vencedores, excluindo os anteriores', [
        text('id', 'ID do sorteio', true, { max_length: 20 }),
      ]),
      sub('listar', 'Lista sorteios ativos'),
    ],
    async (i, ctx) => {
      const action = i.options.getSubcommand();
      if (action === 'listar') {
        const list = ctx.store
          .list('giveaways')
          .filter((g) => g.guild === i.guildId && g.state === 'active');
        return reply(
          i,
          list.map((g) => `\`${g.id}\` · ${safe(g.prize)} · ${time(g.endsAt)}`).join('\n') ||
            'Nenhum sorteio ativo.',
        );
      }
      requireUser(i, P.ManageGuild);
      await defer(i);
      if (action === 'criar') {
        await requireBot(i, [P.SendMessages, P.EmbedLinks]);
        if (
          ctx.store.list('giveaways').filter((g) => g.guild === i.guildId && g.state === 'active')
            .length >= 10
        )
          throw new Error('Limite de 10 sorteios ativos.');
        const g = {
          id: i.id,
          guild: i.guildId,
          channel: i.channelId,
          prize: i.options.getString('premio'),
          endsAt: Date.now() + parseDuration(i.options.getString('duracao')),
          count: i.options.getInteger('vencedores') ?? 1,
          participants: [],
          state: 'active',
          round: 0,
        };
        const m = await i.channel.send(giveawayView(ctx.store.config(i.guildId), g));
        g.message = m.id;
        ctx.store.set('giveaways', i.id, g);
        return reply(i, `Sorteio criado: ${m.url}\nID: \`${g.id}\``);
      }
      const g = ctx.store.get('giveaways', i.options.getString('id'));
      if (!g || g.guild !== i.guildId) throw new Error('Sorteio não encontrado neste servidor.');
      await ctx.giveaways.finish(g.id, { reroll: action === 'rerolar' });
      return reply(i, 'Sorteio processado. Confira o resultado no canal original.');
    },
  ),
  D(
    'estatisticas',
    'Exibe contadores locais dos módulos.',
    'utilities',
    null,
    [],
    async (i, ctx) => {
      const g = i.guildId,
        tickets = ctx.store.list('tickets').filter((t) => t.guild === g),
        active = tickets.filter((t) => !t.closed).length,
        closed = tickets.filter((t) => t.closed).length,
        waiting = tickets.filter((t) => !t.closed && !t.claimedBy).length,
        ratings = ctx.store.list('ticket-ratings').filter((r) => r.guild === g),
        rating = ratings.length
          ? (ratings.reduce((sum, item) => sum + item.score, 0) / ratings.length).toLocaleString(
              'pt-BR',
              { minimumFractionDigits: 1, maximumFractionDigits: 1 },
            )
          : '—',
        tempCalls = ctx.store
          .list('tempcalls')
          .filter((call) => call.guild === g && !call.deleted).length,
        suggestions = ctx.store.list('suggestions').filter((s) => s.guild === g).length,
        accounts = ctx.store.db
          .prepare('SELECT COUNT(*) AS n FROM accounts WHERE guild=?')
          .get(g).n;
      return reply(i, {
        embeds: [
          embed(
            ctx.store.config(g),
            '📊 PAINEL / ESTATÍSTICAS',
            `### Atendimento\n**Tickets ativos:** ${active}\n**Aguardando equipe:** ${waiting}\n**Tickets encerrados:** ${closed}\n**Avaliação média:** ${rating} ⭐ (${ratings.length} avaliação(ões))\n\n### Comunidade\n**Calls temporárias ativas:** ${tempCalls}\n**Sugestões registradas:** ${suggestions}\n**Perfis com atividade:** ${accounts}\n**Comandos disponíveis:** ${ctx.commands.size}`,
          ),
        ],
      });
    },
  ),
];
for (const [name, pinned] of [
  ['fixar', true],
  ['desfixar', false],
])
  commands.push(
    D(
      name,
      `${pinned ? 'Fixa' : 'Desfixa'} uma mensagem deste canal.`,
      'moderation',
      P.ManageMessages,
      [text('id', 'ID da mensagem', true, { max_length: 20 })],
      async (i) => {
        await requireBot(i, [P.ManageMessages, P.ReadMessageHistory]);
        const id = i.options.getString('id');
        if (!/^\d{17,20}$/.test(id)) throw new Error('ID inválido.');
        const m = await i.channel.messages.fetch(id);
        await m[pinned ? 'pin' : 'unpin']();
        return reply(i, 'Mensagem atualizada.');
      },
    ),
  );
export default commands;
