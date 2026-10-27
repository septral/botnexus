import { createHash, randomBytes } from 'node:crypto';
import {
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits as P,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { button, defer, embed, reply, row, safe, truncate } from '../core/ui.js';
import { validateRole } from '../core/permissions.js';
import { audit, log } from '../core/log.js';
import { receiptAttachment } from './receipts.js';
import { openTicket, ticketPanelView } from './tickets.js';

const DAY = 86400000;

const vipProducts = (tier, label, prices) => [
  {
    id: `${tier}_1m`,
    kind: 'vip',
    tier,
    name: `${label} · 1 mês`,
    durationMs: 30 * DAY,
    durationLabel: '1 mês',
    price: prices[0],
  },
  {
    id: `${tier}_3m`,
    kind: 'vip',
    tier,
    name: `${label} · 3 meses`,
    durationMs: 90 * DAY,
    durationLabel: '3 meses',
    price: prices[1],
  },
  {
    id: `${tier}_1y`,
    kind: 'vip',
    tier,
    name: `${label} · 1 ano`,
    durationMs: 365 * DAY,
    durationLabel: '1 ano',
    price: prices[2],
  },
  {
    id: `${tier}_life`,
    kind: 'vip',
    tier,
    name: `${label} · vitalício`,
    durationMs: null,
    durationLabel: 'Vitalício',
    price: prices[3],
  },
];

const BASE_PRODUCTS = [
  ...vipProducts('vip', 'VIP', [45000, 115000, 360000, 800000]),
  ...vipProducts('vip_plus', 'VIP+', [75000, 195000, 600000, 1300000]),
  ...vipProducts('vip_nexus', 'VIP N3XUS', [120000, 310000, 950000, 2000000]),
  {
    id: 'work_boost_7d',
    kind: 'buff',
    buff: 'work',
    name: 'Impulso de trabalho +50% · 7 dias',
    durationMs: 7 * DAY,
    durationLabel: '7 dias',
    price: 15000,
  },
  {
    id: 'xp_boost_7d',
    kind: 'buff',
    buff: 'xp',
    name: 'Impulso de XP x2 · 7 dias',
    durationMs: 7 * DAY,
    durationLabel: '7 dias',
    price: 18000,
  },
  {
    id: 'daily_boost_7d',
    kind: 'buff',
    buff: 'daily',
    name: 'Diária em dobro · 7 dias',
    durationMs: 7 * DAY,
    durationLabel: '7 dias',
    price: 25000,
  },
];

const PRICE_FIELDS = {
  vip_1m: 'normal1mPrice',
  vip_3m: 'normal3mPrice',
  vip_1y: 'normal1yPrice',
  vip_life: 'normalLifetimePrice',
  vip_plus_1m: 'plus1mPrice',
  vip_plus_3m: 'plus3mPrice',
  vip_plus_1y: 'plus1yPrice',
  vip_plus_life: 'plusLifetimePrice',
  vip_nexus_1m: 'nexus1mPrice',
  vip_nexus_3m: 'nexus3mPrice',
  vip_nexus_1y: 'nexus1yPrice',
  vip_nexus_life: 'nexusLifetimePrice',
};

export const builtinProducts = (config = null) =>
  BASE_PRODUCTS.map((product) => ({
    ...product,
    price: config?.vip?.[PRICE_FIELDS[product.id]] ?? product.price,
  }));

export const builtinProduct = (id, config = null) =>
  builtinProducts(config).find((product) => product.id === id);

export const vipRoleForTier = (config, tier) =>
  ({
    vip: config.vip.normalRoleId,
    vip_plus: config.vip.plusRoleId,
    vip_nexus: config.vip.nexusRoleId,
  })[tier] ?? '';

export function memberVipTier(member, config) {
  if (config.vip.nexusRoleId && member?.roles?.cache?.has(config.vip.nexusRoleId))
    return 'vip_nexus';
  if (config.vip.plusRoleId && member?.roles?.cache?.has(config.vip.plusRoleId)) return 'vip_plus';
  if (config.vip.normalRoleId && member?.roles?.cache?.has(config.vip.normalRoleId)) return 'vip';
  return null;
}

export const vipWorkMultiplier = (member, config) => {
  if (member?.premiumSinceTimestamp) return 300;
  return (
    {
      vip: config.economy.vipNormalMultiplier,
      vip_plus: config.economy.vipPlusMultiplier,
      vip_nexus: config.economy.vipNexusMultiplier,
    }[memberVipTier(member, config)] ?? 100
  );
};

export const hasActiveBuff = (ctx, guildId, userId, buff) => {
  const record = ctx.store.get('buffs', `${guildId}:${userId}:${buff}`);
  return Boolean(record && record.expiresAt > Date.now());
};

const giftHash = (code) => createHash('sha256').update(code.trim().toUpperCase()).digest('hex');

const giftCode = () => {
  const raw = randomBytes(9).toString('hex').toUpperCase();
  return `NXS-${raw.slice(0, 6)}-${raw.slice(6, 12)}-${raw.slice(12, 18)}`;
};

export function createGiftCard(ctx, guildId, userId, product, purchaseId) {
  const code = giftCode();
  const id = randomBytes(8).toString('hex');
  ctx.store.set('giftcards', id, {
    id,
    guild: guildId,
    user: userId,
    productId: product.id,
    productName: product.name,
    price: product.price,
    codeHash: giftHash(code),
    lastFour: code.slice(-4),
    purchaseId,
    createdAt: Date.now(),
    redeemedAt: null,
  });
  return { id, code };
}

export function activateBuff(ctx, guildId, userId, product, purchaseId) {
  const key = `${guildId}:${userId}:${product.buff}`;
  const previous = ctx.store.get('buffs', key);
  const startsAt = Math.max(Date.now(), previous?.expiresAt ?? 0);
  const record = {
    guild: guildId,
    user: userId,
    buff: product.buff,
    productId: product.id,
    purchaseId,
    activatedAt: Date.now(),
    expiresAt: startsAt + product.durationMs,
  };
  ctx.store.set('buffs', key, record);
  return record;
}

export function vipRedemptionView(config, guild) {
  const panel = new ContainerBuilder()
    .setAccentColor(0x7c3aed)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 💎 Central VIP de ${safe(guild.name)}\nCompre seus planos em <#1564440848966357012> e use este painel para resgatar o acesso.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### VIP <@&${config.vip.normalRoleId || '0'}>\n• Envio de imagens nos chats\n• Atendimento prioritário nos tickets\n• Multiplicador de **${config.economy.vipNormalMultiplier}%** no comando /trabalhar\n• Acesso aos benefícios básicos do programa VIP\n\n### VIP+ <@&${config.vip.plusRoleId || '0'}>\n• Tudo do VIP normal\n• Acesso às calls VIP e ao painel de gerenciamento\n• Multiplicador de **${config.economy.vipPlusMultiplier}%** no comando /trabalhar\n• Mais espaço e prioridade nos atendimentos\n\n### VIP N3XUS <@&${config.vip.nexusRoleId || '0'}>\n• Tudo do VIP+\n• Multiplicador de **${config.economy.vipNexusMultiplier}%** no comando /trabalhar\n• Cargo personalizado seguindo as regras do servidor\n• Canal e categoria exclusivos\n• Convites para o cargo com aceite individual por DM\n• Atendimento VIP prioritário dentro do espaço exclusivo\n\nDurações disponíveis: **1 mês, 3 meses, 1 ano e vitalício**.\n\n🚀 **Boosters:** ao impulsionar o servidor, você recebe por DM um cupom pessoal de **50% de desconto em moedas** para comprar VIPs.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(row(button('vip:redeem', 'Resgatar gift card', ButtonStyle.Primary)));
  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

const vipLog = async (ctx, guild, config, title, description) => {
  await audit(ctx, guild, title, description);
  if (!config.vip?.logChannelId || config.vip.logChannelId === config.logs?.channelId) return;
  const channel = await guild.channels.fetch(config.vip.logChannelId).catch(() => null);
  await channel
    ?.send({ embeds: [embed(config, title, description)], allowedMentions: { parse: [] } })
    .catch(() => {});
};

async function activateVip(i, ctx, gift, product) {
  const config = ctx.store.config(i.guildId);
  const roleId = vipRoleForTier(config, product.tier);
  if (!roleId) throw new Error('O cargo deste VIP não está configurado.');
  const role = await validateRole(i.guild, roleId, null, { safeOnly: false });
  const member = await i.guild.members.fetch(i.user.id);
  await member.roles.add(role, `Gift card ${gift.id}`);
  if (!role.permissions.has(P.AttachFiles) && role.editable)
    await role
      .setPermissions(role.permissions.add(P.AttachFiles), 'Benefício VIP: envio de imagens')
      .catch((error) =>
        log('warn', 'vip_attach_permission_failed', { role: role.id, error: error.message }),
      );
  const key = `${i.guildId}:${i.user.id}:${product.tier}`;
  const previous = ctx.store.get('vip-entitlements', key);
  const base = Math.max(Date.now(), previous?.expiresAt ?? 0);
  const entitlement = {
    guild: i.guildId,
    user: i.user.id,
    tier: product.tier,
    roleId,
    productId: product.id,
    activatedAt: previous?.activatedAt ?? Date.now(),
    updatedAt: Date.now(),
    expiresAt:
      product.durationMs === null || previous?.expiresAt === null
        ? null
        : base + product.durationMs,
    active: true,
    reminders: {},
  };
  ctx.store.set('vip-entitlements', key, entitlement);
  gift.redeemedAt = Date.now();
  gift.entitlementKey = key;
  ctx.store.set('giftcards', gift.id, gift);
  return { entitlement, role };
}

export async function grantVipEntitlement(ctx, guild, userId, productId, actorId = null) {
  const config = ctx.store.config(guild.id);
  const product = builtinProduct(productId, config);
  if (!product || product.kind !== 'vip') throw new Error('Produto VIP inválido.');
  const roleId = vipRoleForTier(config, product.tier);
  if (!roleId) throw new Error('Configure o cargo desse VIP em /botconfig.');
  const role = await validateRole(guild, roleId, null, { safeOnly: false });
  const member = await guild.members.fetch(userId);
  await member.roles.add(role, `VIP concedido${actorId ? ` por ${actorId}` : ''}`);
  const key = `${guild.id}:${userId}:${product.tier}`;
  const previous = ctx.store.get('vip-entitlements', key);
  const base = Math.max(Date.now(), previous?.expiresAt ?? 0);
  const entitlement = {
    guild: guild.id,
    user: userId,
    tier: product.tier,
    roleId,
    productId: product.id,
    activatedAt: previous?.activatedAt ?? Date.now(),
    updatedAt: Date.now(),
    expiresAt: product.durationMs === null || previous?.expiresAt === null ? null : base + product.durationMs,
    active: true,
    grantedBy: actorId,
    reminders: {},
  };
  ctx.store.set('vip-entitlements', key, entitlement);
  return { entitlement, role, product };
}

export async function vipComponent(i, ctx) {
  const [, action] = i.customId.split(':');
  if (action === 'redeem')
    return i.showModal(
      new ModalBuilder()
        .setCustomId('vip:submit')
        .setTitle('Resgatar gift card')
        .addLabelComponents(
          new LabelBuilder()
            .setLabel('Código do gift card')
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId('code')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('NXS-XXXXXX-XXXXXX-XXXXXX')
                .setRequired(true)
                .setMaxLength(30),
            ),
        ),
    );
  await defer(i);
  const submitted = giftHash(i.fields.getTextInputValue('code'));
  const gift = ctx.store
    .list('giftcards')
    .find(
      (record) =>
        record.guild === i.guildId && record.user === i.user.id && record.codeHash === submitted,
    );
  if (!gift) throw new Error('Gift card inválido ou vinculado a outro usuário.');
  if (gift.redeemedAt) throw new Error('Este gift card já foi resgatado.');
  const product = builtinProduct(gift.productId, ctx.store.config(i.guildId));
  if (!product || product.kind !== 'vip') throw new Error('Produto VIP não encontrado.');
  const { entitlement, role } = await activateVip(i, ctx, gift, product);
  const config = ctx.store.config(i.guildId);
  const transactionId = `VIP-${gift.id.toUpperCase()}`;
  const receiptData = {
    kind: 'ATIVAÇÃO',
    guildName: i.guild.name,
    username: i.user.username,
    userId: i.user.id,
    product: gift.productName ?? product.name,
    amount: gift.price ?? product.price,
    currency: config.economy.currency,
    duration: entitlement.expiresAt
      ? `até ${new Date(entitlement.expiresAt).toLocaleDateString('pt-BR')}`
      : 'Vitalício',
    transactionId,
  };
  const extra =
    product.tier === 'vip_nexus'
      ? '\n\nAbra um ticket VIP para a equipe criar seu cargo personalizado e espaço exclusivo.'
      : '';
  await i.user
    .send({
      embeds: [
        embed(
          config,
          '💎 VIP ativado',
          `**Plano:** ${safe(product.name)}\n**Cargo:** ${role}\n**Validade:** ${entitlement.expiresAt ? `<t:${Math.floor(entitlement.expiresAt / 1000)}:F>` : 'Vitalício'}${extra}`,
        ),
      ],
      files: [receiptAttachment(receiptData, 'ativacao-vip')],
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
  await vipLog(
    ctx,
    i.guild,
    config,
    '💎 VIP ativado',
    `<@${i.user.id}> ativou **${safe(product.name)}**.`,
  );
  return reply(i, {
    embeds: [
      embed(
        config,
        'Gift card resgatado',
        `O cargo ${role} foi aplicado. Os detalhes da ativação foram enviados por DM.${extra}`,
      ),
    ],
    files: [receiptAttachment(receiptData, 'ativacao-vip')],
  });
}

const cleanName = (value, type = 'name') => {
  const raw = String(value ?? '')
    .replace(/[@\r\n]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    !raw ||
    /(?:everyone|here|discord|administrador|moderador|staff|suporte|nigger|nazista)/i.test(raw)
  )
    throw new Error('Escolha um nome comum, sem menções, termos reservados ou conteúdo ofensivo.');
  if (type === 'channel')
    return raw
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 90);
  return raw.slice(0, 90);
};

const nexusSpaceForChannel = (ctx, guildId, channelId) =>
  ctx.store
    .list('nexus-spaces')
    .find(
      (space) =>
        space.guild === guildId &&
        [space.channelId, space.configChannelId, space.ticketPanelChannelId, space.voiceChannelId, space.categoryId].includes(channelId) &&
        !space.deleted,
    );

export function nexusPanelView(config, space) {
  const panel = new ContainerBuilder()
    .setAccentColor(0x8b5cf6)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 👑 Espaço N3XUS\n**Proprietário:** <@${space.owner}>\n**Cargo:** <@&${space.roleId}>\n\nPersonalize sua comunidade privada e convide membros. Todo convite exige aceitação por DM.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      row(
        button('nexus:roleopen', 'Nome do cargo'),
        button('nexus:coloropen', 'Cor do cargo'),
        button('nexus:channelopen', 'Nome do canal'),
        button('nexus:categoryopen', 'Nome da categoria'),
        button('nexus:offeropen', 'Oferecer cargo', ButtonStyle.Primary),
      ),
    )
    .addActionRowComponents(
      row(
        button('nexus:ticket', 'Atendimento VIP', ButtonStyle.Success),
        button('nexus:topicopen', 'Descrição do canal'),
        button('nexus:slowmodeopen', 'Modo lento'),
        button('nexus:refresh', 'Atualizar painel'),
      ),
    );
  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

const nexusOverwrites = (i, config, roleId) => {
  const staffRoles = [config.tickets.staffRoleId, config.tickets.supervisorRoleId, config.tickets.adminRoleId].filter(Boolean);
  return [
    { id: i.guildId, deny: [P.ViewChannel] },
    { id: roleId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] },
    { id: i.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels] },
    ...staffRoles.map((staffRoleId) => ({ id: staffRoleId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] })),
  ];
};

export async function setupNexusSpace(i, ctx, user) {
  const config = ctx.store.config(i.guildId);
  const entitlement = ctx.store.get('vip-entitlements', `${i.guildId}:${user.id}:vip_nexus`);
  if (!entitlement?.active || (entitlement.expiresAt && entitlement.expiresAt <= Date.now()))
    throw new Error('Este usuário não possui um VIP N3XUS ativo.');
  const existing = ctx.store.get('nexus-spaces', `${i.guildId}:${user.id}`);
  if (existing && !existing.deleted) {
    const category = await i.guild.channels.fetch(existing.categoryId).catch(() => null);
    const configChannel = existing.configChannelId
      ? await i.guild.channels.fetch(existing.configChannelId).catch(() => null)
      : null;
    if (category && configChannel) {
      const message = await configChannel.send(nexusPanelView(config, existing));
      existing.panelMessage = message.id;
      ctx.store.set('nexus-spaces', `${i.guildId}:${user.id}`, existing);
      return { ...existing, channel: await i.guild.channels.fetch(existing.channelId).catch(() => null) };
    }
    if (category && existing.roleId) {
      const overwrites = nexusOverwrites(i, config, existing.roleId);
      const member = await i.guild.members.fetch(user.id);
      const baseName = cleanName(member.displayName, 'channel');
      const voiceChannel = existing.voiceChannelId
        ? await i.guild.channels.fetch(existing.voiceChannelId).catch(() => null)
        : await i.guild.channels.create({ name: `🔊 call-${baseName.slice(0, 70)}`, type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: overwrites, reason: `Call VIP N3XUS de ${user.tag}` });
      const newConfigChannel = configChannel || await i.guild.channels.create({ name: `⚙️ painel-${baseName.slice(0, 65)}`, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites, reason: `Painel VIP N3XUS de ${user.tag}` });
      const ticketPanelChannel = existing.ticketPanelChannelId
        ? await i.guild.channels.fetch(existing.ticketPanelChannelId).catch(() => null)
        : await i.guild.channels.create({ name: `🎫 atendimento-${baseName.slice(0, 62)}`, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites, reason: `Painel de tickets VIP N3XUS de ${user.tag}` });
      Object.assign(existing, { voiceChannelId: voiceChannel.id, configChannelId: newConfigChannel.id, ticketPanelChannelId: ticketPanelChannel.id });
      const panel = await newConfigChannel.send(nexusPanelView(config, existing));
      const ticketPanel = await ticketPanelChannel.send(ticketPanelView(config, i.guild, []));
      existing.panelMessage = panel.id;
      existing.ticketPanelMessage = ticketPanel.id;
      ctx.store.set('nexus-spaces', `${i.guildId}:${user.id}`, existing);
      return { ...existing, channel: await i.guild.channels.fetch(existing.channelId).catch(() => null) };
    }
  }
  const member = await i.guild.members.fetch(user.id);
  const role = await i.guild.roles.create({
    name: `${config.vip.nexusRolePrefix} ${truncate(member.displayName, 70)}`,
    color: 0x8b5cf6,
    permissions: [P.AttachFiles],
    reason: `Espaço VIP N3XUS de ${user.tag}`,
  });
  await member.roles.add(role, 'Proprietário do espaço N3XUS');
  const overwrites = nexusOverwrites(i, config, role.id);
  const category = await i.guild.channels.create({
    name: cleanName(
      config.vip.nexusCategoryName.replaceAll('{username}', member.displayName),
      'name',
    ),
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
    reason: `Categoria VIP N3XUS de ${user.tag}`,
  });
  const channel = await i.guild.channels.create({
    name: `n3xus-${cleanName(member.displayName, 'channel')}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    reason: `Canal VIP N3XUS de ${user.tag}`,
  });
  const voiceChannel = await i.guild.channels.create({
    name: `🔊 call-${cleanName(member.displayName, 'channel').slice(0, 70)}`,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites: overwrites.map((overwrite) => ({
      ...overwrite,
      allow: overwrite.allow ? [...overwrite.allow, P.Connect, P.Speak] : overwrite.allow,
    })),
    reason: `Call VIP N3XUS de ${user.tag}`,
  });
  const configChannel = await i.guild.channels.create({
    name: `⚙️ painel-${cleanName(member.displayName, 'channel').slice(0, 65)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    reason: `Painel de configuração VIP N3XUS de ${user.tag}`,
  });
  const ticketPanelChannel = await i.guild.channels.create({
    name: `🎫 atendimento-${cleanName(member.displayName, 'channel').slice(0, 62)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    reason: `Painel de tickets VIP N3XUS de ${user.tag}`,
  });
  const space = {
    guild: i.guildId,
    owner: user.id,
    roleId: role.id,
    categoryId: category.id,
    channelId: channel.id,
    voiceChannelId: voiceChannel.id,
    configChannelId: configChannel.id,
    ticketPanelChannelId: ticketPanelChannel.id,
    createdAt: Date.now(),
    deleted: false,
  };
  const panel = await configChannel.send(nexusPanelView(config, space));
  space.panelMessage = panel.id;
  const ticketPanel = await ticketPanelChannel.send(ticketPanelView(config, i.guild, []));
  space.ticketPanelMessage = ticketPanel.id;
  ctx.store.set('nexus-spaces', `${i.guildId}:${user.id}`, space);
  return { ...space, channel };
}

const nexusModal = (action, title, label, value = '', max = 90) => {
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(max);
  if (value) input.setValue(value);
  return new ModalBuilder()
    .setCustomId(`nexus:${action}`)
    .setTitle(title)
    .addLabelComponents(new LabelBuilder().setLabel(label).setTextInputComponent(input));
};

export async function nexusComponent(i, ctx) {
  const [, action] = i.customId.split(':');
  const space = nexusSpaceForChannel(ctx, i.guildId, i.channelId);
  if (!space) throw new Error('Este painel não pertence a um espaço N3XUS ativo.');
  const config = ctx.store.config(i.guildId);
  const entitlement = ctx.store.get('vip-entitlements', `${i.guildId}:${space.owner}:vip_nexus`);
  if (!entitlement?.active || (entitlement.expiresAt && entitlement.expiresAt <= Date.now()))
    throw new Error('O VIP N3XUS deste espaço expirou.');
  const staff =
    i.memberPermissions?.has(P.ManageGuild) ||
    [config.tickets.supervisorRoleId, config.tickets.adminRoleId]
      .filter(Boolean)
      .some((roleId) => i.member.roles.cache.has(roleId));
  if (space.owner !== i.user.id && !staff)
    throw new Error('Somente o proprietário do espaço pode usar este painel.');
  if (action.endsWith('open')) {
    const role = await i.guild.roles.fetch(space.roleId);
    const channel = await i.guild.channels.fetch(space.channelId);
    const category = await i.guild.channels.fetch(space.categoryId);
    const topicInput = new TextInputBuilder()
      .setCustomId('value')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500);
    if (channel.topic) topicInput.setValue(channel.topic);
    const modals = {
      roleopen: nexusModal('role', 'Nome do cargo', 'Novo nome', role.name),
      coloropen: nexusModal('color', 'Cor do cargo', 'Cor hexadecimal', role.hexColor, 7),
      channelopen: nexusModal('channel', 'Nome do canal', 'Novo nome', channel.name),
      categoryopen: nexusModal('category', 'Nome da categoria', 'Novo nome', category.name),
      offeropen: nexusModal('offer', 'Oferecer cargo', 'ID do usuário', '', 20),
      slowmodeopen: nexusModal(
        'slowmode',
        'Modo lento',
        'Segundos entre mensagens (0 a 21600)',
        channel.rateLimitPerUser,
        5,
      ),
      topicopen: new ModalBuilder()
        .setCustomId('nexus:topic')
        .setTitle('Descrição do canal')
        .addLabelComponents(
          new LabelBuilder().setLabel('Nova descrição').setTextInputComponent(topicInput),
        ),
    };
    return i.showModal(modals[action]);
  }
  if (action === 'refresh') return i.update(nexusPanelView(config, space));
  await defer(i);
  if (action === 'ticket') {
    const channel = await openTicket(i, ctx, 'Atendimento VIP N3XUS', {
      details: 'Solicitação iniciada pelo painel do espaço exclusivo N3XUS.',
    });
    return reply(i, `Atendimento prioritário criado: ${channel}`);
  }
  if (action === 'role') {
    const role = await i.guild.roles.fetch(space.roleId);
    await role.setName(
      cleanName(i.fields.getTextInputValue('value')),
      `Alterado por ${i.user.tag}`,
    );
  } else if (action === 'color') {
    const color = i.fields.getTextInputValue('value').trim();
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Use uma cor como #8B5CF6.');
    const role = await i.guild.roles.fetch(space.roleId);
    await role.setColor(color, `Alterado por ${i.user.tag}`);
  } else if (action === 'channel') {
    const channel = await i.guild.channels.fetch(space.channelId);
    await channel.setName(
      cleanName(i.fields.getTextInputValue('value'), 'channel'),
      `Alterado por ${i.user.tag}`,
    );
  } else if (action === 'category') {
    const category = await i.guild.channels.fetch(space.categoryId);
    await category.setName(
      cleanName(i.fields.getTextInputValue('value')),
      `Alterado por ${i.user.tag}`,
    );
  } else if (action === 'topic') {
    const channel = await i.guild.channels.fetch(space.channelId);
    await channel.setTopic(
      i.fields.getTextInputValue('value').trim() || null,
      `Alterado por ${i.user.tag}`,
    );
  } else if (action === 'slowmode') {
    const seconds = Number(i.fields.getTextInputValue('value'));
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600)
      throw new Error('Use um número inteiro entre 0 e 21600 segundos.');
    const channel = await i.guild.channels.fetch(space.channelId);
    await channel.setRateLimitPerUser(seconds, `Alterado por ${i.user.tag}`);
  } else if (action === 'offer') {
    const userId = i.fields.getTextInputValue('value').trim();
    if (!/^\d{17,20}$/.test(userId) || userId === space.owner)
      throw new Error('Informe o ID de outro membro do servidor.');
    const target = await i.guild.members.fetch(userId).catch(() => null);
    if (!target || target.user.bot) throw new Error('Membro não encontrado.');
    if (target.roles.cache.has(space.roleId)) throw new Error('Este membro já possui o cargo.');
    const token = randomBytes(8).toString('hex');
    ctx.store.set('nexus-invites', token, {
      token,
      guild: i.guildId,
      owner: space.owner,
      target: userId,
      roleId: space.roleId,
      channelId: space.channelId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 48 * 3600000,
      state: 'pending',
    });
    await target.send({
      embeds: [
        embed(
          config,
          '👑 Convite para um espaço N3XUS',
          `<@${space.owner}> ofereceu acesso a um cargo e canal exclusivos em **${safe(i.guild.name)}**. O convite expira em 48 horas.`,
        ),
      ],
      components: [
        row(
          button(`nexusinvite:${token}:accept`, 'Aceitar convite', ButtonStyle.Success),
          button(`nexusinvite:${token}:decline`, 'Recusar', ButtonStyle.Danger),
        ),
      ],
      allowedMentions: { parse: [] },
    });
    return reply(i, `Convite enviado por DM para ${target.user}.`);
  } else {
    throw new Error('Controle N3XUS inválido.');
  }
  return reply(i, 'Espaço N3XUS atualizado.');
}

export async function nexusInviteDmComponent(i, ctx) {
  const [, token, action] = i.customId.split(':');
  const invite = ctx.store.get('nexus-invites', token);
  if (!invite || invite.target !== i.user.id || invite.state !== 'pending')
    throw new Error('Este convite não está mais disponível.');
  if (invite.expiresAt < Date.now()) {
    invite.state = 'expired';
    ctx.store.set('nexus-invites', token, invite);
    throw new Error('Este convite expirou.');
  }
  if (action === 'decline') {
    invite.state = 'declined';
    invite.respondedAt = Date.now();
    ctx.store.set('nexus-invites', token, invite);
    return i.update({ content: 'Convite recusado.', embeds: [], components: [] });
  }
  const guild = ctx.client.guilds.cache.get(invite.guild);
  if (!guild) throw new Error('O servidor não está disponível.');
  const entitlement = ctx.store.get(
    'vip-entitlements',
    `${invite.guild}:${invite.owner}:vip_nexus`,
  );
  if (!entitlement?.active || (entitlement.expiresAt && entitlement.expiresAt <= Date.now()))
    throw new Error('O espaço N3XUS não está mais ativo.');
  const member = await guild.members.fetch(i.user.id);
  const role = await guild.roles.fetch(invite.roleId);
  if (!role) throw new Error('O cargo do convite não existe mais.');
  await member.roles.add(role, `Convite N3XUS aceito (${token})`);
  invite.state = 'accepted';
  invite.respondedAt = Date.now();
  ctx.store.set('nexus-invites', token, invite);
  return i.update({
    content: `Convite aceito. Você recebeu **${safe(role.name)}** em **${safe(guild.name)}**.`,
    embeds: [],
    components: [],
  });
}

async function removeNexusSpace(ctx, guild, userId) {
  const key = `${guild.id}:${userId}`;
  const space = ctx.store.get('nexus-spaces', key);
  if (!space || space.deleted) return;
  for (const channelId of [space.channelId, space.voiceChannelId, space.configChannelId, space.ticketPanelChannelId].filter(Boolean)) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    await channel?.delete('VIP N3XUS expirado').catch(() => {});
  }
  const category = space.categoryId
    ? await guild.channels.fetch(space.categoryId).catch(() => null)
    : null;
  await category?.delete('VIP N3XUS expirado').catch(() => {});
  const role = space.roleId ? await guild.roles.fetch(space.roleId).catch(() => null) : null;
  await role?.delete('VIP N3XUS expirado').catch(() => {});
  space.deleted = true;
  space.deletedAt = Date.now();
  ctx.store.set('nexus-spaces', key, space);
}

export async function revokeVipEntitlements(ctx, guild, userId, actorId = null) {
  const keyPrefix = `${guild.id}:${userId}:`;
  const entitlements = ctx.store
    .list('vip-entitlements')
    .filter((item) => item.guild === guild.id && item.user === userId && item.active);
  const member = await guild.members.fetch(userId).catch(() => null);
  const roleIds = new Set([
    ctx.store.config(guild.id).vip.normalRoleId,
    ctx.store.config(guild.id).vip.plusRoleId,
    ctx.store.config(guild.id).vip.nexusRoleId,
    ...entitlements.map((item) => item.roleId),
  ].filter(Boolean));
  for (const entitlement of entitlements) {
    entitlement.active = false;
    entitlement.revokedAt = Date.now();
    entitlement.revokedBy = actorId;
    ctx.store.set('vip-entitlements', `${keyPrefix}${entitlement.tier}`, entitlement);
    if (entitlement.tier === 'vip_nexus') await removeNexusSpace(ctx, guild, userId);
  }
  if (ctx.store.get('nexus-spaces', `${guild.id}:${userId}`)?.deleted !== true)
    await removeNexusSpace(ctx, guild, userId);
  if (member)
    for (const roleId of roleIds)
      await member.roles.remove(roleId, `VIP revogado${actorId ? ` por ${actorId}` : ''}`).catch(() => {});
  return { removed: entitlements.length, member };
}

export async function vipSweep(ctx) {
  const now = Date.now();
  for (const entitlement of ctx.store.list('vip-entitlements').filter((item) => item.active)) {
    if (entitlement.expiresAt === null) continue;
    const guild = ctx.client.guilds.cache.get(entitlement.guild);
    if (!guild) continue;
    const config = ctx.store.config(guild.id);
    const daysLeft = Math.ceil((entitlement.expiresAt - now) / DAY);
    const stages = [...new Set([config.vip.expiryReminderDays, 3, 1])].sort((a, b) => a - b);
    entitlement.reminders ??= {};
    const reminderStage = stages.find(
      (stage) => daysLeft > 0 && daysLeft <= stage && !entitlement.reminders[stage],
    );
    if (reminderStage) {
      for (const stage of stages.filter((stage) => stage >= reminderStage))
        entitlement.reminders[stage] = now;
      ctx.store.set(
        'vip-entitlements',
        `${entitlement.guild}:${entitlement.user}:${entitlement.tier}`,
        entitlement,
      );
      const user = await ctx.client.users.fetch(entitlement.user).catch(() => null);
      await user
        ?.send({
          embeds: [
            embed(
              config,
              'Seu VIP está perto de expirar',
              `Faltam aproximadamente **${daysLeft} dia(s)**. Renove pela loja e resgate o novo gift card para somar a duração.`,
            ),
          ],
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    }
    if (entitlement.expiresAt > now) continue;
    entitlement.active = false;
    entitlement.expiredAt = now;
    ctx.store.set(
      'vip-entitlements',
      `${entitlement.guild}:${entitlement.user}:${entitlement.tier}`,
      entitlement,
    );
    const member = await guild.members.fetch(entitlement.user).catch(() => null);
    if (member && entitlement.roleId)
      await member.roles.remove(entitlement.roleId, 'VIP expirado').catch(() => {});
    if (entitlement.tier === 'vip_nexus') await removeNexusSpace(ctx, guild, entitlement.user);
    const user = await ctx.client.users.fetch(entitlement.user).catch(() => null);
    await user
      ?.send({
        embeds: [
          embed(
            config,
            'VIP expirado',
            'O cargo VIP foi removido. Você pode comprar uma nova duração na loja a qualquer momento.',
          ),
        ],
        allowedMentions: { parse: [] },
      })
      .catch(() => {});
  }
}
