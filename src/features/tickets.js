import {
  AttachmentBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits as P,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import { defer, embed, row, button, safe, reply, truncate } from '../core/ui.js';
import { requireBot } from '../core/permissions.js';
import { audit, log } from '../core/log.js';

const opening = new Set();
const TICKET_DELETE_DELAY_MS = 5000;
const PRIORITIES = {
  low: ['Baixa', '🟢'],
  normal: ['Normal', '🔵'],
  high: ['Alta', '🟠'],
  urgent: ['Urgente', '🔴'],
};
const DEFAULT_DEPARTMENTS = [
  {
    id: 'suporte',
    name: 'Suporte geral',
    emoji: '🛠️',
    description: 'Dúvidas, problemas de acesso e ajuda com o servidor.',
  },
  {
    id: 'denuncias',
    name: 'Denúncias',
    emoji: '🚨',
    description: 'Relatos privados sobre membros, conteúdo ou segurança.',
  },
  {
    id: 'financeiro',
    name: 'Loja e financeiro',
    emoji: '🪙',
    description: 'Compras, gift cards, moedas, produtos e pagamentos.',
  },
  {
    id: 'vip',
    name: 'Atendimento VIP',
    emoji: '💎',
    description: 'Ativação de benefícios e suporte para membros VIP.',
  },
];

const html = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? html(url.href) : '#';
  } catch {
    return '#';
  }
};

const normalizeSubject = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const ticketChannelName = (ticket) => {
  const priority = String(ticket.priority || 'normal').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9-]/g, '-');
  const department = String(ticket.departmentId || 'geral').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9-]/g, '-');
  const subject = normalizeSubject(ticket.subject).replace(/\s+/g, '-').slice(0, 28) || 'atendimento';
  return `ticket-${priority}-${department}-${subject}-${String(ticket.owner || ticket.channel || '').slice(-4)}`.replace(/-+/g, '-').slice(0, 95);
};

const replaceVariables = (text, values) =>
  Object.entries(values).reduce(
    (output, [key, value]) => output.replaceAll(`{${key}}`, String(value)),
    String(text ?? ''),
  );

const ticketVip = (member, config) => {
  if (!config.tickets.vipPriority) return null;
  if (config.vip?.nexusRoleId && member.roles?.cache?.has(config.vip.nexusRoleId))
    return { tier: 'vip_nexus', label: 'VIP N3XUS', priority: 'urgent' };
  if (config.vip?.plusRoleId && member.roles?.cache?.has(config.vip.plusRoleId))
    return { tier: 'vip_plus', label: 'VIP+', priority: 'urgent' };
  if (config.vip?.normalRoleId && member.roles?.cache?.has(config.vip.normalRoleId))
    return { tier: 'vip', label: 'VIP', priority: 'high' };
  return null;
};

export const ticketDepartments = (ctx, guildId) => {
  let departments = ctx.store
    .list('ticket-departments')
    .filter((department) => department.guild === guildId)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  if (!departments.length && !ctx.store.get('ticket-department-init', guildId)) {
    for (const department of DEFAULT_DEPARTMENTS)
      ctx.store.set('ticket-departments', `${guildId}:${department.id}`, {
        ...department,
        guild: guildId,
        categoryId: '',
        roleId: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    ctx.store.set('ticket-department-init', guildId, { initializedAt: Date.now() });
    departments = ctx.store
      .list('ticket-departments')
      .filter((department) => department.guild === guildId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  return departments;
};

const ticketDepartment = (ctx, guildId, id) =>
  id ? ctx.store.get('ticket-departments', `${guildId}:${id}`) : null;

export function ticketRoleLevel(member, config, department = null) {
  if (!member) return 0;
  if (member.permissions?.has(P.ManageGuild) || member.permissions?.has(P.ManageChannels)) return 3;
  const roles = member.roles?.cache;
  if (config.tickets.adminRoleId && roles?.has(config.tickets.adminRoleId)) return 3;
  if (config.tickets.supervisorRoleId && roles?.has(config.tickets.supervisorRoleId)) return 2;
  if (
    (department?.roleId && roles?.has(department.roleId)) ||
    (config.tickets.staffRoleId && roles?.has(config.tickets.staffRoleId))
  )
    return 1;
  return 0;
}

export function isTicketStaff(i, config, department = null) {
  return ticketRoleLevel(i.member, config, department) > 0;
}

const isAnyTicketStaff = (i, ctx, config) =>
  isTicketStaff(i, config) ||
  ticketDepartments(ctx, i.guildId).some((department) => isTicketStaff(i, config, department));

export function ticketAccess(i, ctx, staffOnly = false) {
  const ticket = ctx.store.get('tickets', i.channelId);
  const config = ctx.store.config(i.guildId);
  if (!ticket || ticket.guild !== i.guildId)
    throw new Error('Use este controle dentro de um ticket.');
  const department = ticketDepartment(ctx, i.guildId, ticket.departmentId);
  if (!isTicketStaff(i, config, department) && (staffOnly || ticket.owner !== i.user.id))
    throw new Error('Somente o responsável ou a equipe deste departamento pode fazer isso.');
  return ticket;
}

const ticketLog = async (ctx, guild, config, title, description) => {
  await audit(ctx, guild, title, description);
  if (!config?.tickets?.logChannelId || config.tickets.logChannelId === config.logs?.channelId)
    return;
  const channel = await guild.channels.fetch(config.tickets.logChannelId).catch(() => null);
  if (channel?.isTextBased())
    await channel
      .send({ embeds: [embed(config, title, description)], allowedMentions: { parse: [] } })
      .catch((error) =>
        log('warn', 'ticket_log_failed', { guild: guild.id, error: error.message }),
      );
};

const scheduleTicketDeletion = (ctx, guild, channelId) => {
  const timer = setTimeout(async () => {
    const ticket = ctx.store.get('tickets', channelId);
    if (!ticket?.closed || ticket.deleted) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      ticket.deleted = true;
      ticket.deleteAt = null;
      ctx.store.set('tickets', channelId, ticket);
      return;
    }
    try {
      await channel.delete('Ticket encerrado: limpeza após 5 segundos');
      ticket.deleted = true;
      ticket.deleteAt = null;
      ctx.store.set('tickets', channelId, ticket);
    } catch (error) {
      log('warn', 'ticket_delete_failed', { guild: guild.id, ticket: channelId, error: error.message });
    }
  }, TICKET_DELETE_DELAY_MS);
  timer.unref?.();
};

const addEvent = (ticket, type, actor = null, note = '') => {
  ticket.events = [...(ticket.events ?? []), { type, actor, note, at: Date.now() }].slice(-100);
  ticket.updatedAt = Date.now();
  return ticket;
};

export function ticketPanelView(config, guild, departments = []) {
  const panelButtonStyles = {
    primary: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary,
    success: ButtonStyle.Success,
    danger: ButtonStyle.Danger,
  };
  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.tickets.panelColor.slice(1), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 🎫 ${safe(config.tickets.panelTitle)}\n${config.tickets.message}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Como funciona\nEscolha a área correta, explique o pedido e acompanhe tudo em um canal privado. A equipe recebe prazos, lembretes e o histórico completo do atendimento.\n\n**Servidor:** ${safe(guild.name)}\n**Limite:** ${config.tickets.maxPerUser} ticket(s) simultâneo(s) por pessoa`,
      ),
    );
  if (config.tickets.panelImageUrl)
    panel.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(config.tickets.panelImageUrl),
      ),
    );
  panel.addSeparatorComponents(new SeparatorBuilder());
  if (departments.length)
    panel.addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId('ticket:department')
          .setPlaceholder('Escolha o departamento')
          .addOptions(
            departments.slice(0, 25).map((department) => ({
              label: truncate(department.name, 100),
              value: department.id,
              emoji: department.emoji || '🎫',
              description: truncate(department.description, 90),
            })),
          ),
      ),
    );
  else
    panel.addActionRowComponents(
      row(
        button(
          'ticket:open',
          config.tickets.panelButtonLabel,
          panelButtonStyles[config.tickets.panelButtonStyle] ?? ButtonStyle.Primary,
        ),
      ),
    );
  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

const ticketForm = (departmentId = '') =>
  new ModalBuilder()
    .setCustomId(`ticket:create${departmentId ? `:${departmentId}` : ''}`)
    .setTitle('Abrir atendimento')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Assunto')
        .setDescription('Um resumo objetivo ajuda a equipe a priorizar o chamado.')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('subject')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(4)
            .setMaxLength(120),
        ),
      new LabelBuilder()
        .setLabel('Detalhes')
        .setDescription('Explique o contexto; arquivos podem ser enviados depois no canal.')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('details')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(1800),
        ),
    );

const quickReplies = (config) =>
  config.tickets.quickReplies
    .split('\n')
    .map((line) => {
      const separator = line.indexOf('|');
      return separator > 0
        ? { label: line.slice(0, separator).trim(), text: line.slice(separator + 1).trim() }
        : null;
    })
    .filter((item) => item?.label && item.text)
    .slice(0, 25);

export const ticketManagementComponents = (closed = false) => [
  row(
    button('ticket:memberpanel', 'Painel do membro'),
    button('ticket:staffpanel', 'Painel staff'),
    button('ticket:claim', 'Assumir', ButtonStyle.Primary).setDisabled(closed),
    button('ticket:close', 'Encerrar', ButtonStyle.Danger).setDisabled(closed),
  ),
];

const staffRating = (ctx, guildId, staffId) => {
  if (!staffId) return null;
  const ratings = ctx.store
    .list('ticket-ratings')
    .filter((rating) => rating.guild === guildId && rating.staff === staffId);
  if (!ratings.length) return { average: null, count: 0 };
  return {
    average: ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length,
    count: ratings.length,
  };
};

const ticketControlEmbed = (ctx, config, guild, ticket) => {
  const priority = PRIORITIES[ticket.priority] ?? PRIORITIES.normal;
  const rating = staffRating(ctx, ticket.guild, ticket.claimedBy);
  const attendant = ticket.claimedBy
    ? `<@${ticket.claimedBy}>${rating?.average ? ` · ⭐ ${rating.average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} (${rating.count})` : ' · ainda sem avaliações'}`
    : 'Aguardando um atendente';
  return embed(
    config,
    `${ticket.departmentEmoji || '🎫'} ${ticket.departmentName}`,
    `### ${safe(ticket.subject)}\n${ticket.openingText ?? safe(ticket.details || 'Relato enviado no formulário de abertura.')}\n\n**Responsável:** <@${ticket.owner}>\n**Atendente:** ${attendant}\n**Prioridade:** ${priority[1]} ${priority[0]}${ticket.vipTier ? ` · 💎 ${ticket.vipTierLabel}` : ''}\n**Status:** ${ticket.closed ? 'Encerrado' : ticket.claimedBy ? 'Em atendimento' : 'Na fila'}\n**Aberto:** <t:${Math.floor(ticket.created / 1000)}:R>\n**Protocolo:** \`${ticket.channel}\``,
  ).setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined });
};

export async function refreshTicketControl(ctx, guild, channel, ticket) {
  if (!ticket.controlMessage) return;
  const config = ctx.store.config(guild.id);
  const message = await channel.messages.fetch(ticket.controlMessage).catch(() => null);
  if (message)
    await message
      .edit({
        embeds: [ticketControlEmbed(ctx, config, guild, ticket)],
        components: ticketManagementComponents(ticket.closed),
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
}

async function autoAssign(i, ctx, ticket, roleId) {
  const config = ctx.store.config(i.guildId);
  if (!config.tickets.autoAssign || !roleId) return null;
  const role = await i.guild.roles.fetch(roleId).catch(() => null);
  if (!role) return null;
  const active = ctx.store
    .list('tickets')
    .filter((item) => item.guild === i.guildId && !item.closed && item.claimedBy)
    .reduce(
      (counts, item) => counts.set(item.claimedBy, (counts.get(item.claimedBy) ?? 0) + 1),
      new Map(),
    );
  const candidates = [...role.members.values()]
    .filter(
      (member) =>
        !member.user.bot &&
        ctx.store.get('ticket-staff', `${i.guildId}:${member.id}`)?.available !== false,
    )
    .sort((a, b) => (active.get(a.id) ?? 0) - (active.get(b.id) ?? 0));
  if (!candidates.length) return null;
  ticket.claimedBy = candidates[0].id;
  ticket.assignedAutomatically = true;
  addEvent(ticket, 'assigned', i.client.user.id, `Distribuído para ${candidates[0].id}`);
  return candidates[0];
}

export async function openTicket(
  i,
  ctx,
  subject = 'Atendimento geral',
  { departmentId = '', details = '' } = {},
) {
  const config = ctx.store.config(i.guildId);
  if (!config.modules.tickets) throw new Error('O módulo de tickets está desativado.');
  const department = ticketDepartment(ctx, i.guildId, departmentId);
  if (departmentId && (!department || department.guild !== i.guildId))
    throw new Error('Este departamento não está mais disponível.');
  const nexusSpace = ctx.store
    .list('nexus-spaces')
    .find((space) => space.guild === i.guildId && !space.deleted && [space.configChannelId, space.ticketPanelChannelId].includes(i.channelId));
  const staffRoleId = department?.roleId || config.tickets.staffRoleId || nexusSpace?.roleId;
  if (!staffRoleId)
    throw new Error('Configure o cargo de atendentes em /botconfig → Tickets · estrutura.');
  await requireBot(i, [P.ManageChannels, P.ViewChannel, P.SendMessages, P.EmbedLinks]);
  const key = `${i.guildId}:${i.user.id}`;
  if (opening.has(key)) throw new Error('Seu ticket já está sendo aberto.');
  opening.add(key);
  try {
    const all = ctx.store
      .list('tickets')
      .filter((ticket) => ticket.guild === i.guildId && ticket.owner === i.user.id)
      .sort((a, b) => b.created - a.created);
    const existing = all.filter((ticket) => !ticket.closed);
    if (existing.length >= config.tickets.maxPerUser)
      throw new Error(
        `Você já atingiu o limite de ${config.tickets.maxPerUser} ticket(s): ${existing.map((ticket) => `<#${ticket.channel}>`).join(', ')}.`,
      );
    const latest = all[0];
    const cooldown = config.tickets.cooldownMinutes * 60000;
    if (cooldown > 0 && latest && Date.now() - latest.created < cooldown)
      throw new Error(
        `Aguarde <t:${Math.floor((latest.created + cooldown) / 1000)}:R> para abrir outro ticket.`,
      );
    const normalized = normalizeSubject(subject);
    const duplicate = existing.find(
      (ticket) =>
        normalizeSubject(ticket.subject) === normalized &&
        (config.tickets.duplicateWindowMinutes === 0 ||
          Date.now() - ticket.created <= config.tickets.duplicateWindowMinutes * 60000),
    );
    if (duplicate && config.tickets.blockDuplicates)
      throw new Error(`Já existe um atendimento semelhante: <#${duplicate.channel}>.`);
    const staffRole = await i.guild.roles.fetch(staffRoleId).catch(() => null);
    if (!staffRole) throw new Error('O cargo do departamento foi removido. Atualize /botconfig.');
    const categoryId = nexusSpace?.categoryId || department?.categoryId || config.tickets.categoryId || undefined;
    const permissionOverwrites = [
      { id: i.guildId, deny: [P.ViewChannel] },
      {
        id: i.user.id,
        allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles],
      },
      {
        id: staffRoleId,
        allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles],
      },
      {
        id: i.client.user.id,
        allow: [
          P.ViewChannel,
          P.SendMessages,
          P.EmbedLinks,
          P.ReadMessageHistory,
          P.ManageChannels,
          P.AttachFiles,
        ],
      },
    ];
    for (const roleId of [config.tickets.supervisorRoleId, config.tickets.adminRoleId])
      if (roleId && !permissionOverwrites.some((overwrite) => overwrite.id === roleId))
        permissionOverwrites.push({
          id: roleId,
          allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles],
        });
    const vip = ticketVip(i.member, config);
    const channel = await i.guild.channels.create({
      name: ticketChannelName({ priority: vip?.priority ?? 'normal', departmentId: department?.id ?? 'geral', subject, owner: i.user.id }),
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `${department?.emoji ?? '🎫'} Ticket de ${i.user.id} • ${truncate(subject, 250)}`,
      permissionOverwrites,
      reason: `Ticket solicitado por ${i.user.id}`,
    });
    const now = Date.now();
    const ticket = {
      guild: i.guildId,
      channel: channel.id,
      owner: i.user.id,
      departmentId: department?.id ?? '',
      departmentName: department?.name ?? 'Atendimento geral',
      departmentEmoji: department?.emoji ?? '🎫',
      subject: truncate(subject.trim(), 120),
      details: truncate(details.trim(), 1800),
      created: now,
      updatedAt: now,
      lastActivity: now,
      lastUserMessage: now,
      closed: false,
      status: 'open',
      priority: vip?.priority ?? 'normal',
      vipTier: vip?.tier ?? null,
      vipTierLabel: vip?.label ?? null,
      claimedBy: null,
      events: [{ type: 'opened', actor: i.user.id, note: subject, at: now }],
    };
    const assigned = await autoAssign(i, ctx, ticket, staffRoleId);
    ctx.store.set('tickets', channel.id, ticket);
    const openingText = replaceVariables(config.tickets.openMessage, {
      user: `<@${i.user.id}>`,
      subject: safe(ticket.subject),
      department: safe(ticket.departmentName),
      server: safe(i.guild.name),
    });
    ticket.openingText = openingText;
    const pingIds = [i.user.id, assigned?.id].filter(Boolean);
    const control = await channel.send({
      content:
        `${pingIds.map((id) => `<@${id}>`).join(' ')}${config.tickets.pingStaff && !assigned ? ` <@&${staffRoleId}>` : ''}`.trim(),
      embeds: [ticketControlEmbed(ctx, config, i.guild, ticket)],
      components: ticketManagementComponents(ticket.closed),
      allowedMentions: {
        users: pingIds,
        roles: config.tickets.pingStaff && !assigned ? [staffRoleId] : [],
        parse: [],
      },
    });
    ticket.controlMessage = control.id;
    ctx.store.set('tickets', channel.id, ticket);
    if (details)
      await channel.send({
        embeds: [embed(config, 'Relato inicial', `${safe(details)}\n\n— <@${i.user.id}>`)],
        allowedMentions: { parse: [] },
      });
    if (config.tickets.welcomeDm)
      await i.user
        .send({
          embeds: [
            embed(
              config,
              `Ticket aberto em ${i.guild.name}`,
              `**${safe(ticket.subject)}**\nAcompanhe o atendimento: ${channel}`,
            ),
          ],
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    await ticketLog(
      ctx,
      i.guild,
      config,
      '🎫 Ticket aberto',
      `<@${i.user.id}> abriu <#${channel.id}> em **${safe(ticket.departmentName)}**.`,
    );
    return channel;
  } finally {
    opening.delete(key);
  }
}

async function fetchTranscriptData(i, ctx) {
  const ticket = ticketAccess(i, ctx);
  await requireBot(i, [P.ViewChannel, P.ReadMessageHistory, P.AttachFiles]);
  let before;
  const messages = [];
  for (let page = 0; page < 20; page++) {
    const batch = await i.channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return { ticket, messages: messages.reverse() };
}

export async function transcriptFiles(i, ctx) {
  const { ticket, messages } = await fetchTranscriptData(i, ctx);
  const body = messages
    .map((message) => {
      const content = html(message.cleanContent || message.content || '').replaceAll('\n', '<br>');
      const attachments = message.attachments
        .map(
          (attachment) =>
            `<a class="attachment" href="${safeUrl(attachment.url)}" target="_blank" rel="noreferrer">📎 ${html(attachment.name ?? 'anexo')} <span>${attachment.size ? `${Math.ceil(attachment.size / 1024)} KB` : ''}</span></a>`,
        )
        .join('');
      const embeds = message.embeds
        .map(
          (item) =>
            `<div class="discord-embed"><strong>${html(item.title ?? 'Conteúdo incorporado')}</strong>${item.description ? `<p>${html(item.description).replaceAll('\n', '<br>')}</p>` : ''}</div>`,
        )
        .join('');
      return `<article class="message" id="m-${message.id}"><img class="avatar" src="${safeUrl(message.author.displayAvatarURL({ size: 128 }))}" alt=""><div class="message-body"><header><strong>${html(message.member?.displayName ?? message.author.globalName ?? message.author.username)}</strong><span>@${html(message.author.username)} · ${html(message.createdAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</span></header>${content ? `<div class="content">${content}</div>` : ''}${embeds}${attachments}</div></article>`;
    })
    .join('');
  const eventRows = (ticket.events ?? [])
    .map(
      (event) =>
        `<li><time>${html(new Date(event.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</time><b>${html(event.type)}</b>${event.actor ? ` por ${html(event.actor)}` : ''}${event.note ? ` — ${html(event.note)}` : ''}</li>`,
    )
    .join('');
  const priority = PRIORITIES[ticket.priority] ?? PRIORITIES.normal;
  const document = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ticket ${html(i.channel.id)}</title><style>
  :root{color-scheme:dark;--bg:#0d0a12;--panel:#17111f;--raised:#20172b;--line:#3b2b4d;--text:#f7f2fb;--muted:#b9a9c7;--accent:#b790e4}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 Inter,ui-sans-serif,system-ui,sans-serif}main{width:min(980px,calc(100% - 28px));margin:28px auto 80px}.hero{padding:30px;border:1px solid var(--line);border-radius:18px;background:var(--panel)}h1{margin:0 0 8px;font-size:28px}.protocol{color:var(--muted)}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:22px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}.fact{padding:13px;background:var(--raised)}.fact small{display:block;color:var(--muted)}.layout{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:18px;margin-top:18px}.messages,.timeline{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--panel)}.message{display:grid;grid-template-columns:42px 1fr;gap:12px;padding:17px}.message+.message{border-top:1px solid var(--line)}.avatar{width:42px;height:42px;border-radius:50%}.message header{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.message header span,.attachment span{font-size:12px;color:var(--muted)}.content{margin-top:5px;overflow-wrap:anywhere}.attachment{display:block;margin-top:9px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;color:var(--accent);text-decoration:none}.discord-embed{margin-top:9px;padding:11px;border-left:3px solid var(--accent);background:#120d18;border-radius:4px}.discord-embed p{margin:5px 0 0}.timeline{padding:18px;height:max-content}.timeline h2{font-size:16px;margin:0 0 12px}.timeline ul{list-style:none;padding:0;margin:0}.timeline li{padding:9px 0;border-top:1px solid var(--line);font-size:12px}.timeline time{display:block;color:var(--muted)}footer{margin-top:16px;color:var(--muted);font-size:12px}@media(max-width:760px){.facts{grid-template-columns:1fr 1fr}.layout{grid-template-columns:1fr}.timeline{order:-1}}@media(max-width:480px){.facts{grid-template-columns:1fr}.message{grid-template-columns:34px 1fr;padding:13px}.avatar{width:34px;height:34px}}
  </style></head><body><main><section class="hero"><h1>${html(ticket.subject)}</h1><div class="protocol">${html(i.guild.name)} · #${html(i.channel.name)} · protocolo ${html(i.channel.id)}</div><div class="facts"><div class="fact"><small>Departamento</small>${html(ticket.departmentName ?? 'Geral')}</div><div class="fact"><small>Prioridade</small>${priority[1]} ${html(priority[0])}</div><div class="fact"><small>Status</small>${ticket.closed ? 'Encerrado' : 'Em atendimento'}</div><div class="fact"><small>Mensagens</small>${messages.length}</div></div></section><div class="layout"><section class="messages">${body || '<article class="message">Nenhuma mensagem encontrada.</article>'}</section><aside class="timeline"><h2>Linha do tempo</h2><ul>${eventRows || '<li>Sem eventos registrados.</li>'}</ul></aside></div><footer>Gerado pelo Sanatório NEXUS em ${html(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}. Links de anexos podem expirar.</footer></main></body></html>`;
  const files = [
    new AttachmentBuilder(Buffer.from(document), { name: `ticket-${i.channel.id}.html` }),
  ];
  if (ctx.store.config(i.guildId).tickets.transcriptFormat === 'html+json')
    files.push(
      new AttachmentBuilder(
        Buffer.from(
          JSON.stringify(
            {
              ticket,
              messages: messages.map((message) => ({
                id: message.id,
                author: {
                  id: message.author.id,
                  username: message.author.username,
                  displayName: message.member?.displayName ?? message.author.globalName,
                },
                content: message.cleanContent || message.content,
                createdAt: message.createdAt.toISOString(),
                attachments: message.attachments.map((attachment) => ({
                  name: attachment.name,
                  url: attachment.url,
                  size: attachment.size,
                })),
              })),
            },
            null,
            2,
          ),
        ),
        { name: `ticket-${i.channel.id}.json` },
      ),
    );
  return files;
}

export async function transcript(i, ctx) {
  return (await transcriptFiles(i, ctx))[0];
}

async function finalizeTicket(i, ctx, ticket, actorId, reason = 'Encerrado pela equipe') {
  if (ticket.closed) throw new Error('Este ticket já está encerrado.');
  await requireBot(i, P.ManageChannels);
  const config = ctx.store.config(i.guildId);
  const files = await transcriptFiles(i, ctx);
  ticket.closed = true;
  ticket.status = 'closed';
  ticket.closedBy = actorId;
  ticket.closedAt = Date.now();
  ticket.closeReason = reason;
  ticket.deleteAt = Date.now() + TICKET_DELETE_DELAY_MS;
  addEvent(ticket, 'closed', actorId, reason);
  ctx.store.set('tickets', i.channelId, ticket);
  await refreshTicketControl(ctx, i.guild, i.channel, ticket);
  for (const overwrite of i.channel.permissionOverwrites.cache.values())
    if (overwrite.type === 1 && overwrite.id !== i.client.user.id)
      await overwrite.edit({ SendMessages: false, AddReactions: false }).catch(() => {});
  await i.channel.permissionOverwrites.edit(i.guildId, { SendMessages: false }).catch(() => {});
  let ratingRequest = null;
  if (config.tickets.ratingsEnabled && ticket.claimedBy) {
    const token = randomBytes(8).toString('hex');
    ratingRequest = {
      token,
      guild: i.guildId,
      ticket: i.channelId,
      user: ticket.owner,
      staff: ticket.claimedBy,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 86400000,
      state: 'pending',
    };
    ctx.store.set('ticket-rating-requests', token, ratingRequest);
  }
  await i.channel.send({
    embeds: [
      embed(
        config,
        'Atendimento encerrado',
        `${replaceVariables(config.tickets.closeMessage, { user: `<@${ticket.owner}>`, subject: safe(ticket.subject), server: safe(i.guild.name) })}\n\n**Encerrado por** <@${actorId}>\n**Motivo** ${safe(reason)}\n**Duração** <t:${Math.floor(ticket.created / 1000)}:R>${ratingRequest ? '\n\nA avaliação foi enviada por DM ao responsável.' : ''}`,
      ),
    ],
    files,
    allowedMentions: { parse: [] },
  });
  if (config.tickets.transcriptChannelId && config.tickets.transcriptChannelId !== i.channelId) {
    const archive = await i.guild.channels
      .fetch(config.tickets.transcriptChannelId)
      .catch(() => null);
    if (archive?.isTextBased())
      await archive
        .send({
          embeds: [
            embed(
              config,
              'Transcript arquivado',
              `**Protocolo** \`${i.channelId}\`\n**Responsável** <@${ticket.owner}>\n**Departamento** ${safe(ticket.departmentName)}\n**Assunto** ${safe(ticket.subject)}\n**Atendente** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Não assumido'}\n**Encerrado por** <@${actorId}>`,
            ),
          ],
          files,
          allowedMentions: { parse: [] },
        })
        .catch((error) =>
          log('warn', 'ticket_transcript_archive_failed', {
            guild: i.guildId,
            channel: config.tickets.transcriptChannelId,
            error: error.message,
          }),
        );
  }
  if (config.tickets.dmTranscript || ratingRequest) {
    const owner = await i.client.users.fetch(ticket.owner).catch(() => null);
    await owner
      ?.send({
        embeds: [
          embed(
            config,
            `Como foi seu atendimento?`,
            `**Servidor:** ${safe(i.guild.name)}\n**Assunto:** ${safe(ticket.subject)}\n**Atendente:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Não atribuído'}\n**Motivo do encerramento:** ${safe(reason)}${ratingRequest ? '\n\nEscolha uma nota. Sua resposta ajuda a equipe a melhorar.' : ''}`,
          ),
        ],
        files: config.tickets.dmTranscript ? files : [],
        components: ratingRequest
          ? [
              row(
                button(`ticketrate:${ratingRequest.token}:1`, '😞 1'),
                button(`ticketrate:${ratingRequest.token}:2`, '🙁 2'),
                button(`ticketrate:${ratingRequest.token}:3`, '😐 3'),
                button(`ticketrate:${ratingRequest.token}:4`, '🙂 4', ButtonStyle.Success),
                button(`ticketrate:${ratingRequest.token}:5`, '🤩 5', ButtonStyle.Success),
              ),
            ]
          : [],
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }
  await ticketLog(
    ctx,
    i.guild,
    config,
    '📁 Ticket encerrado',
    `<#${i.channelId}> · <@${actorId}> · ${safe(reason)}`,
  );
  scheduleTicketDeletion(ctx, i.guild, i.channelId);
}

export async function closeTicket(i, ctx, reason = 'Encerrado pelo usuário') {
  const ticket = ticketAccess(i, ctx);
  const config = ctx.store.config(i.guildId);
  const department = ticketDepartment(ctx, i.guildId, ticket.departmentId);
  const level = ticketRoleLevel(i.member, config, department);
  if (i.user.id === ticket.owner && !config.tickets.ownerCanClose)
    throw new Error('Somente a equipe pode encerrar este ticket.');
  if (level === 1 && !config.tickets.attendantCanClose)
    throw new Error('Somente supervisores podem encerrar tickets.');
  if (
    level >= 2 &&
    !config.tickets.supervisorCanManage &&
    !i.memberPermissions?.has(P.ManageChannels)
  )
    throw new Error('O gerenciamento por supervisores está desativado.');
  return finalizeTicket(i, ctx, ticket, i.user.id, reason);
}

export async function ticketRatingDmComponent(i, ctx) {
  const [, token, scoreText] = i.customId.split(':');
  const request = ctx.store.get('ticket-rating-requests', token);
  if (!request || request.user !== i.user.id || request.state !== 'pending')
    throw new Error('Esta avaliação não está mais disponível.');
  if (request.expiresAt < Date.now()) {
    request.state = 'expired';
    ctx.store.set('ticket-rating-requests', token, request);
    throw new Error('O prazo desta avaliação expirou.');
  }
  const score = Number(scoreText);
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('Avaliação inválida.');
  const guild = ctx.client.guilds.cache.get(request.guild);
  if (!guild) throw new Error('O servidor desta avaliação não está disponível.');
  const config = ctx.store.config(request.guild);
  const ticket = ctx.store.get('tickets', request.ticket);
  request.state = 'completed';
  request.score = score;
  request.completedAt = Date.now();
  ctx.store.set('ticket-rating-requests', token, request);
  ctx.store.set('ticket-ratings', request.ticket, {
    guild: request.guild,
    ticket: request.ticket,
    user: request.user,
    staff: request.staff,
    score,
    createdAt: Date.now(),
    source: 'dm',
  });
  if (ticket) {
    ticket.rating = score;
    ticket.ratedAt = Date.now();
    addEvent(ticket, 'rated', i.user.id, `${score}/5 por DM`);
    ctx.store.set('tickets', request.ticket, ticket);
  }
  if (config.tickets.ratingsChannelId) {
    const channel = await guild.channels.fetch(config.tickets.ratingsChannelId).catch(() => null);
    await channel
      ?.send({
        embeds: [
          embed(
            config,
            '⭐ Avaliação recebida',
            `### ${'⭐'.repeat(score)}\n**Protocolo:** \`${request.ticket}\`\n**Usuário:** ${config.tickets.ratingAnonymous ? 'Anônimo' : `<@${request.user}>`}\n**Atendente:** <@${request.staff}>\n**Origem:** mensagem privada`,
          ),
        ],
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }
  return i.update({
    embeds: [
      embed(
        config,
        'Avaliação registrada',
        `${'⭐'.repeat(score)}\n\nObrigado por avaliar. Sua nota foi associada ao atendimento e ao atendente responsável.`,
      ),
    ],
    components: [],
  });
}

export function ticketStaffView(ctx, guildId, userId) {
  const config = ctx.store.config(guildId);
  const tickets = ctx.store.list('tickets').filter((ticket) => ticket.guild === guildId);
  const active = tickets.filter((ticket) => !ticket.closed);
  const waiting = active.filter((ticket) => !ticket.claimedBy);
  const overdue = active.filter(
    (ticket) =>
      config.tickets.slaMinutes > 0 &&
      Date.now() - ticket.created > config.tickets.slaMinutes * 60000,
  );
  const ratings = ctx.store.list('ticket-ratings').filter((rating) => rating.guild === guildId);
  const average = ratings.length
    ? (ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length).toLocaleString(
        'pt-BR',
        { minimumFractionDigits: 1, maximumFractionDigits: 1 },
      )
    : '—';
  const available = ctx.store.get('ticket-staff', `${guildId}:${userId}`)?.available !== false;
  const priorityWeight = { urgent: 0, high: 1, normal: 2, low: 3 };
  const queue = active
    .sort(
      (a, b) =>
        (priorityWeight[a.priority] ?? 2) - (priorityWeight[b.priority] ?? 2) ||
        a.created - b.created,
    )
    .slice(0, 10)
    .map(
      (ticket) =>
        `${(PRIORITIES[ticket.priority] ?? PRIORITIES.normal)[1]} <#${ticket.channel}> · ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : '**aguardando**'} · <t:${Math.floor(ticket.created / 1000)}:R>`,
    )
    .join('\n');
  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.appearance.color.slice(1), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 🩺 Painel da equipe\n**${active.length} ativos** · **${waiting.length} aguardando** · **${overdue.length} fora do prazo** · **${average}★ de média**`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Fila atual\n${queue || 'A fila está vazia.'}`),
    )
    .addActionRowComponents(
      row(
        button(
          'ticket:stafftoggle',
          available ? 'Ficar indisponível' : 'Ficar disponível',
          available ? ButtonStyle.Danger : ButtonStyle.Success,
        ),
        button('ticket:staffrefresh', 'Atualizar painel'),
      ),
    );
  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function ticketUserView(ctx, guildId, userId) {
  const config = ctx.store.config(guildId);
  const tickets = ctx.store
    .list('tickets')
    .filter((ticket) => ticket.guild === guildId && ticket.owner === userId)
    .sort((a, b) => b.created - a.created);
  const active = tickets.filter((ticket) => !ticket.closed);
  const recent = tickets
    .slice(0, 8)
    .map(
      (ticket) =>
        `${ticket.closed ? '⚫' : (PRIORITIES[ticket.priority] ?? PRIORITIES.normal)[1]} <#${ticket.channel}> · ${safe(ticket.subject)} · <t:${Math.floor(ticket.created / 1000)}:R>`,
    )
    .join('\n');
  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.appearance.color.slice(1), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 🎫 Seus atendimentos\nVocê tem **${active.length}/${config.tickets.maxPerUser}** ticket(s) aberto(s). Acompanhe status, histórico e abra uma nova solicitação aqui.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Histórico recente\n${recent || 'Você ainda não abriu tickets.'}`,
      ),
    )
    .addActionRowComponents(
      row(
        button('ticket:useropen', 'Novo atendimento', ButtonStyle.Primary),
        button('ticket:userrefresh', 'Atualizar'),
      ),
    );
  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

const memberModal = (action) =>
  new ModalBuilder()
    .setCustomId(`ticket:member${action}`)
    .setTitle(action === 'add' ? 'Adicionar ao ticket' : 'Remover do ticket')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('ID do membro')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('userId')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(17)
            .setMaxLength(20),
        ),
    );

const memberTicketPanel = (config, ticket) => {
  const priority = PRIORITIES[ticket.priority] ?? PRIORITIES.normal;
  return {
    embeds: [
      embed(
        config,
        'Painel do membro',
        `**Assunto:** ${safe(ticket.subject)}\n**Departamento:** ${safe(ticket.departmentName)}\n**Status:** ${ticket.claimedBy ? 'Em atendimento' : 'Na fila'}\n**Atendente:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Aguardando'}\n**Prioridade:** ${priority[1]} ${priority[0]}\n\nUse **Chamar equipe** somente quando houver uma nova informação importante.`,
      ),
    ],
    components: [
      row(
        button('ticket:transcript', 'Baixar transcrição'),
        button('ticket:pingstaff', 'Chamar equipe', ButtonStyle.Primary),
      ),
    ],
  };
};

const staffTicketPanel = (ctx, config, ticket) => {
  const rating = staffRating(ctx, ticket.guild, ticket.claimedBy);
  return {
    embeds: [
      embed(
        config,
        'Painel staff',
        `**Responsável:** <@${ticket.owner}>\n**Atendente atual:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Nenhum'}\n**Avaliação do atendente:** ${rating?.average ? `${rating.average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ⭐ em ${rating.count} atendimento(s)` : 'Ainda sem avaliações'}\n\nAs ações ficam privadas para não poluir o atendimento.`,
      ),
    ],
    components: [
      row(
        button('ticket:notify', 'Notificar usuário', ButtonStyle.Primary),
        button('ticket:priority', 'Prioridade'),
        button('ticket:quick', 'Resposta rápida'),
        button('ticket:release', 'Liberar atendimento'),
      ),
      row(
        button('ticket:transcript', 'Transcrição'),
        button('ticket:memberaddopen', 'Adicionar membro'),
        button('ticket:memberremoveopen', 'Remover membro'),
        button('ticket:renameopen', 'Renomear'),
      ),
    ],
  };
};

export async function ticketComponent(i, ctx) {
  const [, action, argument] = i.customId.split(':');
  const config = ctx.store.config(i.guildId);
  if (action === 'memberpanel') {
    const ticket = ticketAccess(i, ctx);
    if (ticket.owner !== i.user.id && !isAnyTicketStaff(i, ctx, config))
      throw new Error('Este painel pertence ao responsável pelo ticket.');
    return reply(i, memberTicketPanel(config, ticket));
  }
  if (action === 'staffpanel') {
    const ticket = ticketAccess(i, ctx, true);
    return reply(i, staffTicketPanel(ctx, config, ticket));
  }
  if (action === 'open' || action === 'useropen') return i.showModal(ticketForm());
  if (action === 'department') return i.showModal(ticketForm(i.values[0]));
  if (action === 'memberaddopen' || action === 'memberremoveopen') {
    ticketAccess(i, ctx, true);
    return i.showModal(memberModal(action === 'memberaddopen' ? 'add' : 'remove'));
  }
  if (action === 'renameopen') {
    const ticket = ticketAccess(i, ctx, true);
    return i.showModal(
      new ModalBuilder()
        .setCustomId('ticket:rename')
        .setTitle('Renomear ticket')
        .addLabelComponents(
          new LabelBuilder()
            .setLabel('Novo nome do canal')
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId('name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(90)
                .setValue(i.channel.name),
            ),
          new LabelBuilder()
            .setLabel('Novo assunto')
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId('subject')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(120)
                .setValue(ticket.subject),
            ),
        ),
    );
  }
  if (action === 'close') {
    ticketAccess(i, ctx);
    return reply(i, {
      embeds: [
        embed(
          config,
          'Encerrar atendimento?',
          'O canal será bloqueado e o transcript será gerado.',
        ),
      ],
      components: [
        row(
          button('ticket:confirmclose', 'Encerrar e arquivar', ButtonStyle.Danger),
          button('ticket:cancelclose', 'Cancelar'),
        ),
      ],
    });
  }
  if (action === 'cancelclose')
    return i.update({ content: 'Encerramento cancelado.', embeds: [], components: [] });
  if (action === 'quick') {
    ticketAccess(i, ctx, true);
    const items = quickReplies(config);
    if (!items.length) throw new Error('Configure respostas rápidas em /botconfig.');
    return reply(i, {
      content: 'Escolha a resposta que será enviada neste ticket:',
      components: [
        row(
          new StringSelectMenuBuilder()
            .setCustomId('ticket:quickselect')
            .setPlaceholder('Escolha uma resposta')
            .addOptions(items.map((item, index) => ({ label: item.label, value: String(index) }))),
        ),
      ],
    });
  }
  if (action === 'priority') {
    ticketAccess(i, ctx, true);
    return reply(i, {
      content: 'Defina a prioridade operacional:',
      components: [
        row(
          new StringSelectMenuBuilder()
            .setCustomId('ticket:priorityselect')
            .setPlaceholder('Escolha a prioridade')
            .addOptions(
              Object.entries(PRIORITIES).map(([value, [label, emoji]]) => ({
                label,
                value,
                emoji,
              })),
            ),
        ),
      ],
    });
  }
  if (action === 'stafftoggle' || action === 'staffrefresh') {
    if (!isAnyTicketStaff(i, ctx, config))
      throw new Error('Este painel é exclusivo da equipe de tickets.');
    if (action === 'stafftoggle') {
      const key = `${i.guildId}:${i.user.id}`;
      const current = ctx.store.get('ticket-staff', key)?.available !== false;
      ctx.store.set('ticket-staff', key, {
        guild: i.guildId,
        user: i.user.id,
        available: !current,
        updatedAt: Date.now(),
      });
    }
    return i.update(ticketStaffView(ctx, i.guildId, i.user.id));
  }
  if (action === 'userrefresh') return i.update(ticketUserView(ctx, i.guildId, i.user.id));

  await defer(i);
  if (action === 'create') {
    const departmentId = argument ?? '';
    const subject = i.fields.getTextInputValue('subject');
    const details = i.fields.getTextInputValue('details');
    const channel = await openTicket(i, ctx, subject, { departmentId, details });
    return reply(i, `Atendimento criado: ${channel}`);
  }
  if (action === 'transcript') return reply(i, { files: await transcriptFiles(i, ctx) });
  if (action === 'confirmclose') {
    await closeTicket(i, ctx);
    return reply(i, 'Atendimento encerrado e arquivado.');
  }
  if (action === 'rate') {
    const ticket = ticketAccess(i, ctx);
    if (!ticket.closed || ticket.owner !== i.user.id)
      throw new Error('Somente o responsável pode avaliar um ticket encerrado.');
    if (ticket.rating) throw new Error('Este atendimento já foi avaliado.');
    const score = Number(argument);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('Avaliação inválida.');
    ticket.rating = score;
    ticket.ratedAt = Date.now();
    addEvent(ticket, 'rated', i.user.id, `${score}/5`);
    ctx.store.set('tickets', i.channelId, ticket);
    ctx.store.set('ticket-ratings', i.channelId, {
      guild: i.guildId,
      ticket: i.channelId,
      user: i.user.id,
      staff: ticket.claimedBy,
      score,
      createdAt: Date.now(),
    });
    if (config.tickets.ratingsChannelId) {
      const channel = await i.guild.channels
        .fetch(config.tickets.ratingsChannelId)
        .catch(() => null);
      await channel
        ?.send({
          embeds: [
            embed(
              config,
              '⭐ Nova avaliação',
              `**Nota** ${'⭐'.repeat(score)}\n**Ticket** \`${i.channelId}\`\n**Usuário** ${config.tickets.ratingAnonymous ? 'Anônimo' : `<@${i.user.id}>`}\n**Atendente** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Não atribuído'}`,
            ),
          ],
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    }
    return reply(i, `Avaliação registrada: ${'⭐'.repeat(score)}`);
  }
  if (action === 'pingstaff') {
    const ticket = ticketAccess(i, ctx);
    if (ticket.owner !== i.user.id) throw new Error('Somente o responsável pode chamar a equipe.');
    const noticeKey = `${i.guildId}:${i.channelId}:${i.user.id}`;
    const previous = ctx.store.get('ticket-staff-pings', noticeKey)?.at ?? 0;
    if (Date.now() - previous < 15 * 60000)
      throw new Error('A equipe já foi chamada. Aguarde 15 minutos antes de repetir.');
    const department = ticketDepartment(ctx, i.guildId, ticket.departmentId);
    const roleId = department?.roleId || config.tickets.staffRoleId;
    ctx.store.set('ticket-staff-pings', noticeKey, { at: Date.now() });
    await i.channel.send({
      content: roleId ? `<@&${roleId}>` : undefined,
      embeds: [
        embed(
          config,
          'Nova informação aguardando análise',
          `<@${ticket.owner}> solicitou a atenção da equipe neste atendimento.`,
        ),
      ],
      allowedMentions: { roles: roleId ? [roleId] : [], parse: [] },
    });
    return reply(i, 'Equipe notificada.');
  }

  const ticket = ticketAccess(i, ctx, true);
  if (ticket.closed) throw new Error('Este ticket está encerrado.');
  if (action === 'claim') {
    if (ticket.claimedBy && ticket.claimedBy !== i.user.id)
      throw new Error(`Atendimento já assumido por <@${ticket.claimedBy}>.`);
    ticket.claimedBy = i.user.id;
    addEvent(ticket, 'claimed', i.user.id);
    ctx.store.set('tickets', i.channelId, ticket);
    await refreshTicketControl(ctx, i.guild, i.channel, ticket);
    await i.channel.send({
      embeds: [embed(config, 'Atendimento assumido', `<@${i.user.id}> agora é o responsável.`)],
      allowedMentions: { parse: [] },
    });
    return reply(i, 'Você assumiu este atendimento.');
  }
  if (action === 'release') {
    if (ticket.claimedBy && ticket.claimedBy !== i.user.id && ticketRoleLevel(i.member, config) < 2)
      throw new Error('Somente o atendente atual ou um supervisor pode liberar este ticket.');
    ticket.claimedBy = null;
    addEvent(ticket, 'released', i.user.id);
    ctx.store.set('tickets', i.channelId, ticket);
    await refreshTicketControl(ctx, i.guild, i.channel, ticket);
    return reply(i, 'Ticket devolvido à fila.');
  }
  if (action === 'notify') {
    const owner = await i.client.users.fetch(ticket.owner);
    if (!config.tickets.notifyUserDm) throw new Error('Notificações por DM estão desativadas.');
    await owner.send({
      embeds: [
        embed(
          config,
          `Sua resposta é necessária em ${i.guild.name}`,
          `O atendimento **${safe(ticket.subject)}** aguarda você: ${i.channel}`,
        ),
      ],
      allowedMentions: { parse: [] },
    });
    addEvent(ticket, 'user_notified', i.user.id);
    ctx.store.set('tickets', i.channelId, ticket);
    return reply(i, 'Usuário notificado por DM.');
  }
  if (action === 'quickselect') {
    const item = quickReplies(config)[Number(i.values[0])];
    if (!item) throw new Error('Resposta rápida indisponível.');
    await i.channel.send({
      embeds: [embed(config, item.label, `${safe(item.text)}\n\n— <@${i.user.id}>`)],
      allowedMentions: { parse: [] },
    });
    addEvent(ticket, 'quick_reply', i.user.id, item.label);
    ctx.store.set('tickets', i.channelId, ticket);
    return reply(i, 'Resposta enviada.');
  }
  if (action === 'priorityselect') {
    const priority = i.values[0];
    if (!PRIORITIES[priority]) throw new Error('Prioridade inválida.');
    ticket.priority = priority;
    addEvent(ticket, 'priority', i.user.id, PRIORITIES[priority][0]);
    ctx.store.set('tickets', i.channelId, ticket);
    await i.channel.setName(ticketChannelName(ticket)).catch((error) =>
      log('warn', 'ticket_rename_priority_failed', { ticket: i.channelId, error: error.message }),
    );
    await refreshTicketControl(ctx, i.guild, i.channel, ticket);
    await i.channel.send({
      embeds: [
        embed(
          config,
          'Prioridade atualizada',
          `${PRIORITIES[priority][1]} **${PRIORITIES[priority][0]}** · alterada por <@${i.user.id}>`,
        ),
      ],
      allowedMentions: { parse: [] },
    });
    return reply(i, 'Prioridade atualizada.');
  }
  if (action === 'rename') {
    const name = i.fields
      .getTextInputValue('name')
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 90);
    if (name.length < 2) throw new Error('Nome de canal inválido.');
    ticket.subject = i.fields.getTextInputValue('subject').trim();
    addEvent(ticket, 'renamed', i.user.id, name);
    ctx.store.set('tickets', i.channelId, ticket);
    await i.channel.edit({ name, topic: `Ticket de ${ticket.owner} • ${ticket.subject}` });
    await refreshTicketControl(ctx, i.guild, i.channel, ticket);
    return reply(i, 'Ticket renomeado.');
  }
  if (action === 'memberadd' || action === 'memberremove') {
    await requireBot(i, P.ManageChannels);
    const userId = i.fields.getTextInputValue('userId').trim();
    if (!/^\d{17,20}$/.test(userId)) throw new Error('ID de membro inválido.');
    if ([ticket.owner, i.client.user.id, i.guild.ownerId].includes(userId))
      throw new Error('Não é possível alterar o responsável, o bot ou o dono por este controle.');
    const member = await i.guild.members.fetch(userId).catch(() => null);
    if (!member) throw new Error('Membro não encontrado neste servidor.');
    await i.channel.permissionOverwrites.edit(
      userId,
      action === 'memberadd'
        ? { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }
        : { ViewChannel: false, SendMessages: false },
    );
    addEvent(ticket, action, i.user.id, userId);
    ctx.store.set('tickets', i.channelId, ticket);
    return reply(i, action === 'memberadd' ? 'Membro adicionado.' : 'Membro removido.');
  }
  throw new Error('Ação de ticket inválida.');
}

export async function trackTicketMessage(message, ctx) {
  const ticket = ctx.store.get('tickets', message.channelId);
  if (!ticket || ticket.closed || message.author.bot) return;
  const config = ctx.store.config(message.guildId);
  const department = ticketDepartment(ctx, message.guildId, ticket.departmentId);
  ticket.lastActivity = Date.now();
  ticket.updatedAt = Date.now();
  ticket.reminderSentAt = null;
  ticket.warningSentAt = null;
  if (message.author.id === ticket.owner) ticket.lastUserMessage = Date.now();
  else if (ticketRoleLevel(message.member, config, department) > 0)
    ticket.lastStaffMessage = Date.now();
  ctx.store.set('tickets', message.channelId, ticket);
  if (
    config.tickets.notifyUserDm &&
    message.author.id !== ticket.owner &&
    message.mentions.users.has(ticket.owner)
  ) {
    const noticeKey = `${message.channelId}:${ticket.owner}`;
    const previous = ctx.store.get('ticket-mention-notices', noticeKey)?.at ?? 0;
    if (Date.now() - previous >= 60000) {
      ctx.store.set('ticket-mention-notices', noticeKey, { at: Date.now() });
      const owner = await message.client.users.fetch(ticket.owner).catch(() => null);
      await owner
        ?.send({
          embeds: [
            embed(
              config,
              `Você foi mencionado em ${message.guild.name}`,
              `**Ticket:** ${safe(ticket.subject)}\n**Por:** ${safe(message.member?.displayName ?? message.author.username)}\n\n${safe(truncate(message.cleanContent || message.content, 700))}\n\n[Abrir atendimento](${message.url})`,
            ),
          ],
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    }
  }
}

export async function ticketAutomationTick(ctx) {
  const now = Date.now();
  for (const ticket of ctx.store.list('tickets')) {
    const config = ctx.store.config(ticket.guild);
    if (!config.modules.tickets) continue;
    if (ticket.closed && !ticket.deleteAt) {
      ticket.deleteAt = now + TICKET_DELETE_DELAY_MS;
      ctx.store.set('tickets', ticket.channel, ticket);
    }
    const guild = ctx.client.guilds.cache.get(ticket.guild);
    if (!guild) continue;
    let channel;
    try {
      channel = await guild.channels.fetch(ticket.channel);
    } catch (error) {
      if (error.code === 10003) {
        ticket.closed = true;
        ticket.deleted = true;
        ticket.deleteAt = null;
        ctx.store.set('tickets', ticket.channel, ticket);
      } else {
        log('warn', 'ticket_channel_fetch_failed', {
          ticket: ticket.channel,
          error: error.message,
        });
      }
      continue;
    }
    if (!channel?.isTextBased()) continue;
    if (ticket.closed) {
      if (ticket.deleteAt && ticket.deleteAt <= now) {
        ticket.deleteAt = null;
        ctx.store.set('tickets', ticket.channel, ticket);
        await channel.delete('Limpeza automática de ticket encerrado').catch(() => {});
      }
      continue;
    }
    const inactiveFor = now - (ticket.lastActivity ?? ticket.created);
    const reminderAt = config.tickets.inactivityReminderMinutes * 60000;
    if (reminderAt > 0 && inactiveFor >= reminderAt && !ticket.reminderSentAt) {
      ticket.reminderSentAt = now;
      addEvent(ticket, 'inactivity_reminder', ctx.client.user.id);
      ctx.store.set('tickets', ticket.channel, ticket);
      await channel.send({
        content: `<@${ticket.owner}>`,
        embeds: [embed(config, 'Atendimento aguardando resposta', config.tickets.reminderMessage)],
        allowedMentions: { users: [ticket.owner], parse: [] },
      });
    }
    const closeAfter = config.tickets.autoCloseHours * 3600000;
    const warningBefore = config.tickets.closeWarningMinutes * 60000;
    if (
      closeAfter > 0 &&
      warningBefore > 0 &&
      inactiveFor >= Math.max(0, closeAfter - warningBefore) &&
      !ticket.warningSentAt
    ) {
      ticket.warningSentAt = now;
      addEvent(ticket, 'close_warning', ctx.client.user.id);
      ctx.store.set('tickets', ticket.channel, ticket);
      await channel.send({
        content: `<@${ticket.owner}>`,
        embeds: [
          embed(
            config,
            'Encerramento automático agendado',
            `Sem uma nova mensagem, este ticket será encerrado em aproximadamente **${config.tickets.closeWarningMinutes} minuto(s)**.`,
          ),
        ],
        allowedMentions: { users: [ticket.owner], parse: [] },
      });
    }
    if (closeAfter > 0 && inactiveFor >= closeAfter) {
      const synthetic = {
        channel,
        channelId: channel.id,
        guild,
        guildId: guild.id,
        client: ctx.client,
        user: ctx.client.user,
        member: guild.members.me,
        memberPermissions: channel.permissionsFor(guild.members.me),
      };
      await finalizeTicket(
        synthetic,
        ctx,
        ticket,
        ctx.client.user.id,
        'Encerrado automaticamente por inatividade',
      ).catch((error) =>
        log('warn', 'ticket_auto_close_failed', { ticket: ticket.channel, error: error.message }),
      );
      continue;
    }
    if (
      config.tickets.slaMinutes > 0 &&
      now - ticket.created >= config.tickets.slaMinutes * 60000 &&
      !ticket.slaEscalatedAt
    ) {
      ticket.slaEscalatedAt = now;
      addEvent(ticket, 'sla_escalated', ctx.client.user.id);
      ctx.store.set('tickets', ticket.channel, ticket);
      const roleId = config.tickets.supervisorRoleId || config.tickets.adminRoleId;
      await channel.send({
        content: roleId ? `<@&${roleId}>` : undefined,
        embeds: [
          embed(
            config,
            'Prazo de atendimento ultrapassado',
            `Este ticket está aberto há mais de **${config.tickets.slaMinutes} minuto(s)** e requer supervisão.`,
          ),
        ],
        allowedMentions: { roles: roleId ? [roleId] : [], parse: [] },
      });
    }
  }
}
