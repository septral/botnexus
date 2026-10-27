import {
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits as P,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { button, defer, embed, reply, row, safe } from '../core/ui.js';
import { audit, log } from '../core/log.js';

const creating = new Set();
const deleting = new Set();

const vipRoleIds = (config) => config.tempcalls.vipRoleIds.split(/\s+/).filter(Boolean);

export const isTempCallVip = (member, config) =>
  Boolean(
    member?.permissions?.has(P.ManageChannels) ||
    vipRoleIds(config).some((roleId) => member?.roles?.cache?.has(roleId)),
  );

const tempCallLog = async (ctx, guild, config, title, description) => {
  await audit(ctx, guild, title, description);
  if (!config.tempcalls.logChannelId || config.tempcalls.logChannelId === config.logs.channelId)
    return;
  const channel = await guild.channels.fetch(config.tempcalls.logChannelId).catch(() => null);
  if (channel?.isTextBased())
    await channel
      .send({ embeds: [embed(config, title, description)], allowedMentions: { parse: [] } })
      .catch((error) =>
        log('warn', 'tempcall_log_failed', { guild: guild.id, error: error.message }),
      );
};

export function tempCallPanelView(config, guild, vip = false) {
  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.appearance.color.slice(1), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${vip ? '💎' : '🔊'} ${safe(config.tempcalls.panelTitle)}${vip ? ' VIP' : ''}\n${vip ? config.tempcalls.vipPanelMessage : config.tempcalls.panelMessage}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        vip
          ? `### Controle completo\nPersonalize nome, limite, privacidade, bitrate e região; permita, remova ou transfira membros. A sala desaparece quando todos saem.\n\n**Servidor:** ${safe(guild.name)} · **Limite inicial:** ${config.tempcalls.vipUserLimit || 'sem limite'}`
          : `### Sala sob demanda\nCrie sua call, ajuste acesso e limite e convide quem quiser. A sala desaparece automaticamente quando todos saem.\n\n**Servidor:** ${safe(guild.name)} · **Limite inicial:** ${config.tempcalls.normalUserLimit || 'sem limite'}`,
      ),
    )
    .addActionRowComponents(
      row(
        button(
          `tempcall:create:${vip ? 'vip' : 'normal'}`,
          vip ? 'Criar call VIP' : 'Criar minha call',
          ButtonStyle.Primary,
        ),
      ),
    );
  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function tempCallControlView(config, call) {
  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.appearance.color.slice(1), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${call.vip ? '💎' : '🔊'} Controle da sala\n**Proprietário:** <@${call.owner}>\n**Tipo:** ${call.vip ? 'VIP' : 'Normal'} · **Acesso:** ${call.locked ? 'Fechado' : 'Aberto'} · **Visibilidade:** ${call.hidden ? 'Oculta' : 'Visível'}\n\nOs controles abaixo afetam somente esta call.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId('tempcall:settings')
          .setPlaceholder('Configurar sala')
          .addOptions([
            { label: call.locked ? 'Desbloquear sala' : 'Bloquear sala', value: 'lock', emoji: call.locked ? '🔓' : '🔒' },
            { label: 'Renomear sala', value: 'renameopen', emoji: '✏️' },
            { label: 'Alterar limite', value: 'limitopen', emoji: '👥' },
            ...(call.vip ? [
              { label: call.hidden ? 'Tornar visível' : 'Ocultar sala', value: 'visibility', emoji: call.hidden ? '👁️' : '🙈' },
              { label: 'Alterar bitrate', value: 'bitrateopen', emoji: '🎚️' },
              { label: 'Alterar região', value: 'regionopen', emoji: '🌐' },
            ] : []),
            { label: 'Excluir call', value: 'delete', emoji: '🗑️' },
          ]),
      ),
    )
    .addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId('tempcall:members')
          .setPlaceholder('Gerenciar participantes')
          .addOptions([
            { label: 'Permitir membro', value: 'permitopen', emoji: '➕' },
            { label: 'Remover membro', value: 'kickopen', emoji: '➖' },
            { label: 'Transferir proprietário', value: 'transferopen', emoji: '👑' },
          ]),
      ),
    )
    ;
  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

const sanitizeVoiceName = (value) =>
  String(value ?? '')
    .replace(/[\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);

const ownedCall = (ctx, guildId, userId) =>
  ctx.store
    .list('tempcalls')
    .find((call) => call.guild === guildId && call.owner === userId && !call.deleted);

export async function createTempCall(ctx, member, vip = false, { move = true } = {}) {
  const guild = member.guild;
  const config = ctx.store.config(guild.id);
  if (!config.modules.tempcalls || !config.tempcalls.enabled)
    throw new Error('O sistema de salas temporárias está desativado.');
  if (vip && !isTempCallVip(member, config))
    throw new Error('Você precisa de um dos cargos VIP configurados para criar esta sala.');
  const key = `${guild.id}:${member.id}`;
  if (creating.has(key)) throw new Error('Sua sala já está sendo criada.');
  const previous = ownedCall(ctx, guild.id, member.id);
  if (previous) {
    const channel = await guild.channels.fetch(previous.channel).catch(() => null);
    if (channel) {
      if (move && member.voice.channelId && member.voice.channelId !== channel.id)
        await member.voice.setChannel(channel, 'Retorno à call temporária existente');
      return channel;
    }
    previous.deleted = true;
    ctx.store.set('tempcalls', previous.channel, previous);
  }
  const categoryId = vip ? config.tempcalls.vipCategoryId : config.tempcalls.categoryId;
  if (!categoryId)
    throw new Error(
      `Configure a categoria ${vip ? 'VIP' : 'normal'} em /botconfig → Salas temporárias.`,
    );
  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (category?.type !== ChannelType.GuildCategory)
    throw new Error('A categoria configurada para as calls não existe mais.');
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!category.permissionsFor(me).has([P.ManageChannels, P.Connect, P.MoveMembers]))
    throw new Error('O bot precisa de Gerenciar canais, Conectar e Mover membros na categoria.');
  creating.add(key);
  try {
    const roles = vipRoleIds(config);
    const overwrites = [
      {
        id: guild.id,
        allow: vip ? [] : [P.ViewChannel, P.Connect, P.Speak, P.SendMessages, P.ReadMessageHistory],
        deny: vip ? [P.ViewChannel, P.Connect] : [],
      },
      {
        id: member.id,
        allow: [
          P.ViewChannel,
          P.Connect,
          P.Speak,
          P.Stream,
          P.UseVAD,
          P.SendMessages,
          P.ReadMessageHistory,
        ],
      },
      {
        id: ctx.client.user.id,
        allow: [
          P.ViewChannel,
          P.Connect,
          P.Speak,
          P.SendMessages,
          P.ReadMessageHistory,
          P.ManageChannels,
          P.MoveMembers,
        ],
      },
    ];
    if (vip)
      for (const roleId of roles)
        overwrites.push({
          id: roleId,
          allow: [P.ViewChannel, P.Connect, P.Speak, P.SendMessages, P.ReadMessageHistory],
        });
    const configuredBitrate =
      (vip ? config.tempcalls.vipBitrateKbps : config.tempcalls.normalBitrateKbps) * 1000;
    const bitrate = Math.min(configuredBitrate, guild.maximumBitrate ?? configuredBitrate);
    const channel = await guild.channels.create({
      name: `${vip ? '💎' : '🔊'} ${sanitizeVoiceName(member.displayName || member.user.username)}`,
      type: ChannelType.GuildVoice,
      parent: categoryId,
      userLimit: vip ? config.tempcalls.vipUserLimit : config.tempcalls.normalUserLimit,
      bitrate,
      permissionOverwrites: overwrites,
      reason: `Call temporária criada para ${member.user.tag}`,
    });
    const call = {
      guild: guild.id,
      channel: channel.id,
      owner: member.id,
      vip,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      locked: false,
      hidden: false,
      allowed: [],
      banned: [],
      controlMessage: null,
      deleted: false,
    };
    ctx.store.set('tempcalls', channel.id, call);
    if (move && member.voice.channelId)
      await member.voice.setChannel(channel, 'Entrada em criador de call temporária');
    const control = await channel.send(tempCallControlView(config, call)).catch((error) => {
      log('warn', 'tempcall_control_failed', { channel: channel.id, error: error.message });
      return null;
    });
    if (control) {
      call.controlMessage = control.id;
      ctx.store.set('tempcalls', channel.id, call);
    }
    await tempCallLog(
      ctx,
      guild,
      config,
      '🔊 Call temporária criada',
      `${channel} · proprietário <@${member.id}> · ${vip ? 'VIP' : 'normal'}`,
    );
    return channel;
  } finally {
    creating.delete(key);
  }
}

const callAccess = (i, ctx) => {
  const call = ctx.store.get('tempcalls', i.channelId);
  if (!call || call.guild !== i.guildId || call.deleted)
    throw new Error('Use este controle dentro de uma call temporária ativa.');
  if (call.owner !== i.user.id && !i.memberPermissions?.has(P.ManageChannels))
    throw new Error('Somente o proprietário da call pode usar este controle.');
  return call;
};

const simpleModal = (action, title, label, value = '', max = 90) => {
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(max);
  if (value) input.setValue(String(value));
  return new ModalBuilder()
    .setCustomId(`tempcall:${action}`)
    .setTitle(title)
    .addLabelComponents(new LabelBuilder().setLabel(label).setTextInputComponent(input));
};

async function refreshControl(i, config, call) {
  if (!call.controlMessage) return;
  const message = await i.channel.messages.fetch(call.controlMessage).catch(() => null);
  if (message) await message.edit(tempCallControlView(config, call)).catch(() => {});
}

export async function tempCallComponent(i, ctx) {
  const [, rawAction, argument] = i.customId.split(':');
  const action = ['settings', 'members'].includes(rawAction) ? i.values?.[0] : rawAction;
  const config = ctx.store.config(i.guildId);
  if (action === 'create') {
    await defer(i);
    const vip = argument === 'vip';
    const channel = await createTempCall(ctx, i.member, vip, { move: true });
    return reply(
      i,
      memberInChannel(i.member, channel.id)
        ? `Sua call foi criada e você foi movido: ${channel}`
        : `Sua call foi criada: ${channel}. Entre nela para começar.`,
    );
  }
  const call = callAccess(i, ctx);
  if (action.endsWith('open')) {
    const modals = {
      renameopen: simpleModal('rename', 'Renomear call', 'Novo nome', i.channel.name),
      limitopen: simpleModal('limit', 'Limite da call', 'Pessoas (0 a 99)', i.channel.userLimit, 2),
      permitopen: simpleModal('permit', 'Permitir membro', 'ID do membro', '', 20),
      kickopen: simpleModal('kick', 'Remover membro', 'ID do membro', '', 20),
      bitrateopen: simpleModal(
        'bitrate',
        'Bitrate da call',
        'Bitrate em kbps',
        Math.round(i.channel.bitrate / 1000),
        3,
      ),
      regionopen: simpleModal(
        'region',
        'Região de voz',
        'Região ou auto',
        i.channel.rtcRegion ?? 'auto',
        30,
      ),
      transferopen: simpleModal('transfer', 'Transferir call', 'ID do novo proprietário', '', 20),
    };
    if (!modals[action]) throw new Error('Controle de call inválido.');
    if (['bitrateopen', 'regionopen'].includes(action) && !call.vip)
      throw new Error('Este controle é exclusivo de calls VIP.');
    return i.showModal(modals[action]);
  }
  if (action === 'delete')
    return reply(i, {
      content: 'Excluir a call agora? Todos os membros serão desconectados.',
      components: [
        row(
          button('tempcall:confirmdelete', 'Excluir call', ButtonStyle.Danger),
          button('tempcall:canceldelete', 'Cancelar'),
        ),
      ],
    });
  if (action === 'canceldelete')
    return i.update({ content: 'Exclusão cancelada.', components: [] });
  if (action === 'confirmdelete') {
    await defer(i);
    call.deleted = true;
    call.deletedAt = Date.now();
    ctx.store.set('tempcalls', i.channelId, call);
    await reply(i, 'Call encerrada.');
    return i.channel.delete(`Call temporária encerrada por ${i.user.tag}`);
  }
  await defer(i);
  if (action === 'lock') {
    call.locked = !call.locked;
    const targets = call.vip ? vipRoleIds(config) : [i.guildId];
    for (const target of targets)
      await i.channel.permissionOverwrites.edit(target, { Connect: !call.locked });
  } else if (action === 'visibility') {
    if (!call.vip) throw new Error('Somente calls VIP podem ser ocultadas.');
    call.hidden = !call.hidden;
    for (const roleId of vipRoleIds(config))
      await i.channel.permissionOverwrites.edit(roleId, { ViewChannel: !call.hidden });
  } else if (action === 'rename') {
    if (!call.vip && !config.tempcalls.allowNormalRename)
      throw new Error('Renomear calls normais está desativado.');
    const name = sanitizeVoiceName(i.fields.getTextInputValue('value'));
    if (name.length < 2) throw new Error('Use um nome com pelo menos 2 caracteres.');
    await i.channel.setName(name, `Alterado por ${i.user.tag}`);
  } else if (action === 'limit') {
    const limit = Number(i.fields.getTextInputValue('value'));
    if (!Number.isInteger(limit) || limit < 0 || limit > 99)
      throw new Error('Use um limite inteiro entre 0 e 99.');
    await i.channel.setUserLimit(limit, `Alterado por ${i.user.tag}`);
  } else if (['permit', 'kick', 'transfer'].includes(action)) {
    const userId = i.fields.getTextInputValue('value').trim();
    if (!/^\d{17,20}$/.test(userId)) throw new Error('ID de membro inválido.');
    const member = await i.guild.members.fetch(userId).catch(() => null);
    if (!member || member.user.bot) throw new Error('Membro não encontrado.');
    if (action === 'permit') {
      await i.channel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        Connect: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      call.allowed = [...new Set([...(call.allowed ?? []), userId])];
      call.banned = (call.banned ?? []).filter((id) => id !== userId);
    } else if (action === 'kick') {
      await i.channel.permissionOverwrites.edit(userId, { Connect: false });
      if (member.voice.channelId === i.channelId)
        await member.voice.disconnect(`Removido da call por ${i.user.tag}`);
      call.banned = [...new Set([...(call.banned ?? []), userId])];
      call.allowed = (call.allowed ?? []).filter((id) => id !== userId);
    } else {
      if (member.voice.channelId !== i.channelId)
        throw new Error('O novo proprietário precisa estar dentro da call.');
      await i.channel.permissionOverwrites.edit(call.owner, {
        ViewChannel: null,
        Connect: null,
        Speak: null,
        SendMessages: null,
        ReadMessageHistory: null,
      });
      await i.channel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      call.owner = userId;
    }
  } else if (action === 'bitrate') {
    if (!call.vip) throw new Error('Bitrate personalizado é exclusivo de calls VIP.');
    const kbps = Number(i.fields.getTextInputValue('value'));
    const maximum = Math.floor((i.guild.maximumBitrate ?? 96000) / 1000);
    if (!Number.isInteger(kbps) || kbps < 8 || kbps > maximum)
      throw new Error(`Use um bitrate entre 8 e ${maximum} kbps para este servidor.`);
    await i.channel.setBitrate(kbps * 1000, `Alterado por ${i.user.tag}`);
  } else if (action === 'region') {
    if (!call.vip) throw new Error('Região personalizada é exclusiva de calls VIP.');
    const region = i.fields.getTextInputValue('value').trim().toLowerCase();
    if (!/^[a-z0-9-]{2,30}$/.test(region) && region !== 'auto')
      throw new Error('Use uma região válida, como brazil, us-east ou auto.');
    await i.channel.setRTCRegion(region === 'auto' ? null : region, `Alterado por ${i.user.tag}`);
  } else {
    throw new Error('Controle de call inválido.');
  }
  call.updatedAt = Date.now();
  ctx.store.set('tempcalls', i.channelId, call);
  await refreshControl(i, config, call);
  return reply(i, 'Configuração da call atualizada.');
}

const memberInChannel = (member, channelId) => member.voice?.channelId === channelId;

export async function handleTempCallVoiceState(oldState, newState, ctx) {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  const config = ctx.store.config(member.guild.id);
  if (config.modules.tempcalls && config.tempcalls.enabled && newState.channelId) {
    const vip = newState.channelId === config.tempcalls.vipLobbyChannelId;
    const normal = newState.channelId === config.tempcalls.lobbyChannelId;
    if (vip || normal)
      await createTempCall(ctx, member, vip, { move: true }).catch(async (error) => {
        log('warn', 'tempcall_voice_create_failed', {
          guild: member.guild.id,
          user: member.id,
          error: error.message,
        });
        await member.send(`⚠️ Não foi possível criar sua call: ${error.message}`).catch(() => {});
      });
  }
  if (!oldState.channelId || oldState.channelId === newState.channelId) return;
  const call = ctx.store.get('tempcalls', oldState.channelId);
  if (!call || call.deleted) return;
  const channel = oldState.channel;
  if (!channel || channel.members.size === 0) {
    if (deleting.has(oldState.channelId)) return;
    deleting.add(oldState.channelId);
    call.deleted = true;
    call.deletedAt = Date.now();
    ctx.store.set('tempcalls', oldState.channelId, call);
    await channel?.delete('Call temporária vazia').catch(() => {});
    deleting.delete(oldState.channelId);
    return;
  }
  if (call.owner === member.id) {
    const nextOwner = channel.members.find((candidate) => !candidate.user.bot);
    if (nextOwner) {
      await channel.permissionOverwrites
        .edit(member.id, {
          ViewChannel: null,
          Connect: null,
          Speak: null,
          SendMessages: null,
          ReadMessageHistory: null,
        })
        .catch(() => {});
      call.owner = nextOwner.id;
      call.updatedAt = Date.now();
      ctx.store.set('tempcalls', channel.id, call);
      await channel.permissionOverwrites.edit(nextOwner.id, {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      if (call.controlMessage) {
        const message = await channel.messages.fetch(call.controlMessage).catch(() => null);
        if (message) await message.edit(tempCallControlView(config, call)).catch(() => {});
      }
    }
  }
}

export async function tempCallSweep(ctx) {
  for (const call of ctx.store.list('tempcalls').filter((item) => !item.deleted)) {
    const guild = ctx.client.guilds.cache.get(call.guild);
    if (!guild) continue;
    let channel;
    try {
      channel = await guild.channels.fetch(call.channel);
    } catch (error) {
      if (error.code !== 10003) {
        log('warn', 'tempcall_channel_fetch_failed', {
          channel: call.channel,
          error: error.message,
        });
        continue;
      }
    }
    if (!channel) {
      call.deleted = true;
      call.deletedAt = Date.now();
      ctx.store.set('tempcalls', call.channel, call);
    } else if (channel.members?.size === 0 && Date.now() - call.createdAt > 30000) {
      call.deleted = true;
      call.deletedAt = Date.now();
      ctx.store.set('tempcalls', call.channel, call);
      await channel.delete('Limpeza de call temporária vazia').catch(() => {});
    }
  }
}
