import { PermissionFlagsBits as P } from 'discord.js';
import { D, channel, sub, text, user } from './definition.js';
import { embed, reply, safe, time, truncate } from '../core/ui.js';
import { requireBot } from '../core/permissions.js';
import { audit } from '../core/log.js';
import { joinBotVoice, leaveBotVoice } from '../features/bot-voice.js';

const BADGES = {
  Staff: 'Equipe do Discord',
  Partner: 'Servidor parceiro',
  Hypesquad: 'HypeSquad Events',
  BugHunterLevel1: 'Caçador de bugs I',
  BugHunterLevel2: 'Caçador de bugs II',
  HypeSquadOnlineHouse1: 'Bravery',
  HypeSquadOnlineHouse2: 'Brilliance',
  HypeSquadOnlineHouse3: 'Balance',
  PremiumEarlySupporter: 'Apoiador inicial',
  VerifiedBot: 'Bot verificado',
  VerifiedDeveloper: 'Desenvolvedor verificado',
  CertifiedModerator: 'Moderador certificado',
  ActiveDeveloper: 'Desenvolvedor ativo',
};

const emojiSource = (input) => {
  const mention = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/.exec(input.trim());
  if (mention)
    return {
      name: mention[2],
      url: `https://cdn.discordapp.com/emojis/${mention[3]}.${mention[1] ? 'gif' : 'png'}?size=256&quality=lossless`,
    };
  try {
    const url = new URL(input);
    if (
      url.protocol === 'https:' &&
      ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) &&
      /^\/emojis\/\d{17,20}\.(?:png|webp|gif)$/i.test(url.pathname)
    )
      return { name: 'emoji_nexus', url: url.href };
  } catch {}
  throw new Error(
    'Envie o emoji personalizado, como <:nome:id>, ou um link de emoji do CDN do Discord.',
  );
};

export default [
  D(
    'callbot',
    'Mantém o bot conectado permanentemente em uma call.',
    'utilities',
    P.ManageGuild,
    [
      sub('entrar', 'Conecta o bot e restaura a conexão após reinícios', [
        channel('canal', 'Canal de voz', true, [2, 13]),
      ]),
      sub('sair', 'Desconecta o bot da call'),
      sub('status', 'Mostra a call persistente configurada'),
    ],
    async (i, ctx) => {
      const action = i.options.getSubcommand();
      if (action === 'status') {
        const record = ctx.store.get('bot-voice', i.guildId);
        return reply(
          i,
          record
            ? `🔊 O bot está configurado para permanecer em <#${record.channel}>.`
            : 'O bot não está configurado para permanecer em uma call.',
        );
      }
      if (action === 'sair') {
        leaveBotVoice(ctx, i.guildId);
        return reply(i, 'Bot desconectado e restauração automática desativada.');
      }
      const voice = i.options.getChannel('canal');
      await joinBotVoice(ctx, i.guild, voice, i.user.id);
      return reply(i, `Bot conectado em ${voice}. A conexão será restaurada após reinícios.`);
    },
  ),
  D(
    'adicionaremoji',
    'Copia para o servidor um emoji personalizado do Discord.',
    'community',
    P.ManageGuildExpressions,
    [
      text('emoji', 'Emoji de outro servidor ou link do CDN do Discord', true, { max_length: 300 }),
      text('nome', 'Novo nome do emoji', false, { max_length: 32 }),
    ],
    async (i, ctx) => {
      await requireBot(i, P.ManageGuildExpressions);
      const source = emojiSource(i.options.getString('emoji'));
      const name = (i.options.getString('nome') ?? source.name)
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .slice(0, 32);
      if (name.length < 2) throw new Error('O nome precisa ter pelo menos 2 caracteres válidos.');
      const response = await fetch(source.url, {
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/'))
        throw new Error('Não foi possível baixar esse emoji do Discord.');
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > 256 * 1024) throw new Error('O arquivo do emoji excede 256 KB.');
      const created = await i.guild.emojis.create({
        attachment: data,
        name,
        reason: `Importado por ${i.user.tag}`,
      });
      await audit(
        ctx,
        i.guild,
        '✨ Emoji importado',
        `${created} \`:${created.name}:\` · ${i.user.tag}`,
      );
      return reply(i, {
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            '✨ Emoji adicionado',
            `${created} agora está disponível como \`:${created.name}:\`.\n\n**ID** \`${created.id}\`\n**Animado** ${created.animated ? 'Sim' : 'Não'}\n**Criado por** <@${i.user.id}>`,
          ).setThumbnail(created.imageURL({ size: 256 })),
        ],
      });
    },
  ),
  D(
    'verificarusuario',
    'Exibe uma inspeção completa dos dados públicos de um usuário.',
    'utilities',
    null,
    [user('usuario', 'Usuário que será inspecionado', false)],
    async (i, ctx) => {
      const selected = i.options.getUser('usuario') ?? i.user;
      const u = await i.client.users.fetch(selected.id, { force: true });
      const member = await i.guild.members.fetch(u.id).catch(() => null);
      const flags = u.flags
        ?.toArray()
        .map((flag) => BADGES[flag] ?? flag)
        .join(', ');
      const roles = member?.roles.cache
        .filter((role) => role.id !== i.guildId)
        .sort((a, b) => b.position - a.position)
        .map((role) => role.toString())
        .join(' ');
      const keyPermissions = member?.permissions
        .toArray()
        .filter((permission) =>
          [
            'Administrator',
            'ManageGuild',
            'ManageChannels',
            'ManageRoles',
            'ManageMessages',
            'ModerateMembers',
            'KickMembers',
            'BanMembers',
          ].includes(permission),
        )
        .join(', ');
      const voice = member?.voice.channel
        ? `${member.voice.channel} · microfone ${member.voice.selfMute || member.voice.serverMute ? 'silenciado' : 'ativo'} · áudio ${member.voice.selfDeaf || member.voice.serverDeaf ? 'desativado' : 'ativo'}`
        : 'Fora de um canal de voz';
      const presence = member?.presence;
      const presenceText = presence
        ? `${presence.status} · dispositivos: ${Object.keys(presence.clientStatus ?? {}).join(', ') || 'não informados'}${presence.activities.length ? ` · atividades: ${presence.activities.map((activity) => activity.name).join(', ')}` : ''}`
        : 'Indisponível (ative Presence Intent para ampliar a consulta)';
      const c = ctx.store.config(i.guildId);
      const profile = embed(
        c,
        `👤 Perfil de ${u.globalName ?? u.username}`,
        `### Identidade\n**Usuário** ${safe(u.tag)}\n**ID** \`${u.id}\`\n**Nome global** ${safe(u.globalName ?? 'Não definido')}\n**Apelido no servidor** ${safe(member?.nickname ?? 'Não definido')}\n**Conta criada** ${time(u.createdTimestamp)}\n**Tipo** ${u.bot ? 'Bot' : u.system ? 'Sistema' : 'Pessoa'}\n**Insígnias públicas** ${safe(flags || 'Nenhuma')}\n\n### Perfil visual\n[Avatar global](${u.displayAvatarURL({ size: 4096 })})${member ? ` · [Avatar do servidor](${member.displayAvatarURL({ size: 4096 })})` : ''}${u.bannerURL() ? ` · [Banner](${u.bannerURL({ size: 4096 })})` : ''}\n**Cor de destaque** ${u.hexAccentColor ?? 'Não informada pela API'}`,
      )
        .setThumbnail(member?.displayAvatarURL({ size: 512 }) ?? u.displayAvatarURL({ size: 512 }))
        .setAuthor({ name: i.guild.name, iconURL: i.guild.iconURL() ?? undefined });
      if (u.bannerURL()) profile.setImage(u.bannerURL({ size: 1024 }));
      const server = embed(
        c,
        '🏥 Vínculo com o servidor',
        member
          ? `**Entrou** ${time(member.joinedTimestamp)}\n**Impulsionando desde** ${member.premiumSinceTimestamp ? time(member.premiumSinceTimestamp) : 'Não está impulsionando'}\n**Pendente de triagem** ${member.pending ? 'Sim' : 'Não'}\n**Timeout** ${member.communicationDisabledUntilTimestamp && member.communicationDisabledUntilTimestamp > Date.now() ? `até <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:F>` : 'Não'}\n**Maior cargo** ${member.roles.highest}\n**Cargos (${Math.max(0, member.roles.cache.size - 1)})** ${truncate(roles || 'Nenhum', 950)}\n**Permissões sensíveis** ${safe(keyPermissions || 'Nenhuma')}\n**Voz** ${voice}\n**Presença** ${safe(presenceText)}`
          : 'O usuário não é membro deste servidor. Dados específicos de membro não estão disponíveis.',
      );
      return reply(i, { embeds: [profile, server] });
    },
  ),
];
