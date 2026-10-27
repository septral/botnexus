import { defer } from '../core/ui.js';
import {
  PermissionFlagsBits as P,
  AttachmentBuilder,
  StringSelectMenuBuilder,
  GatewayIntentBits,
  OAuth2Scopes,
} from 'discord.js';
import { D, text, user, channel, attachment, choices, integer, sub } from './definition.js';
import { embed, reply, safe, fmt, time, row, truncate, parseDuration } from '../core/ui.js';
import { SETTINGS, validateConfig } from '../core/config.js';
import { requireUser, validateSettingReference } from '../core/permissions.js';
import { configView } from '../features/config-panel.js';
import { calculate } from '../core/math.js';
import { randomInt } from 'node:crypto';
import { audit } from '../core/log.js';
export const CATEGORY_NAMES = {
  moderation: '🛡️ Moderação',
  community: '💬 Comunidade',
  tickets: '🎫 Tickets',
  tempcalls: '🔊 Salas temporárias',
  verification: '🔐 Verificação',
  levels: '📈 Níveis',
  economy: '💊 Economia',
  fun: '🎲 Diversão',
  utilities: '🧰 Utilidades',
  config: '⚙️ Configuração',
};
export function helpView(i, ctx, category = 'overview') {
  const c = ctx.store.config(i.guildId),
    disabled = c.access.disabledCommands.split('\n').map((v) => v.trim()),
    visible = [...ctx.commands.values()].filter(
      (cmd) =>
        (!cmd.module || cmd.module === 'config' || c.modules[cmd.module]) &&
        (cmd.module === 'config' || !disabled.includes(cmd.name)) &&
        (!cmd.permission || i.memberPermissions.has(cmd.permission)),
    );
  const list =
    category === 'overview'
      ? Object.entries(CATEGORY_NAMES)
          .map(
            ([key, label]) =>
              `**${label}** · ${visible.filter((cmd) => cmd.module === key).length} comando(s)`,
          )
          .join('\n')
      : visible
          .filter((cmd) => cmd.module === category)
          .map((cmd) => `**/${cmd.name}** — ${cmd.data.description}`)
          .join('\n');
  const count = visible.reduce(
    (n, c) => n + (c.data.options?.filter((o) => o.type === 1).length || 1),
    0,
  );
  return {
    embeds: [
      embed(
        c,
        `📚 COMANDOS / ${category === 'overview' ? 'CENTRAL' : (CATEGORY_NAMES[category] ?? category)}`,
        `${visible.length} comandos visíveis · ${count} ações (incluindo subcomandos)\n\n${truncate(list, 3400)}\n\nUse **/botconfig** para configurar os módulos. Controles respeitam suas permissões.`,
      ),
    ],
    components: [
      row(
        new StringSelectMenuBuilder()
          .setCustomId(`help:${i.user.id}`)
          .setPlaceholder('Explorar comandos por categoria')
          .addOptions([
            { label: 'Visão geral', value: 'overview' },
            ...Object.entries(CATEGORY_NAMES).map(([value, label]) => ({ label, value })),
          ]),
      ),
    ],
  };
}
export default [
  D(
    'botconfig',
    'Abre o painel interativo de configuração do servidor.',
    'config',
    P.ManageGuild,
    [],
    async (i, ctx) => reply(i, configView(ctx, i.guildId, i.user.id)),
  ),
  D(
    'ajuda',
    'Lista os comandos disponíveis e suas categorias.',
    'utilities',
    null,
    [
      text('categoria', 'Categoria de comandos', false, {
        choices: choices(...Object.keys(CATEGORY_NAMES)),
        max_length: 32,
      }),
    ],
    async (i, ctx) => reply(i, helpView(i, ctx, i.options.getString('categoria') ?? 'overview')),
  ),
  D('ping', 'Mede o tempo de resposta do bot.', 'utilities', null, [], async (i, ctx) => {
    await defer(i);
    return reply(i, {
      embeds: [
        embed(
          ctx.store.config(i.guildId),
          '🛰️ CONEXÃO',
          `**Gateway:** ${Math.max(0, Math.round(i.client.ws.ping))} ms\n**Resposta à interação:** ${Date.now() - i.createdTimestamp} ms`,
        ),
      ],
    });
  }),
  D('botinfo', 'Exibe tecnologias e estatísticas do bot.', 'utilities', null, [], async (i, ctx) =>
    reply(i, {
      embeds: [
        embed(
          ctx.store.config(i.guildId),
          '🧠 NEXUS / SISTEMA',
          `**Runtime:** Node ${process.version}\n**Linguagem:** JavaScript ESM\n**Interface:** Discord API v10 / componentes v2\n**Persistência:** SQLite\n**Comandos:** ${ctx.commands.size}\n**Servidores:** ${i.client.guilds.cache.size}\n**RAM:** ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB\n**Online desde:** ${time(Date.now() - process.uptime() * 1000)}`,
        ),
      ],
    }),
  ),
  D('servidor', 'Mostra informações deste servidor.', 'utilities', null, [], async (i, ctx) => {
    const g = i.guild;
    const e = embed(
      ctx.store.config(i.guildId),
      '🏥 ' + g.name,
      `**ID:** ${g.id}\n**Dono:** <@${g.ownerId}>\n**Membros:** ${fmt.format(g.memberCount)}\n**Canais em cache:** ${g.channels.cache.size}\n**Cargos:** ${g.roles.cache.size}\n**Boosts:** ${g.premiumSubscriptionCount ?? 0}\n**Criado:** ${time(g.createdTimestamp)}`,
    );
    if (g.iconURL()) e.setThumbnail(g.iconURL({ size: 256 }));
    return reply(i, { embeds: [e] });
  }),
  D(
    'usuario',
    'Mostra dados públicos de um membro.',
    'utilities',
    null,
    [user('usuario', 'Membro a consultar', false)],
    async (i, ctx) => {
      const u = i.options.getUser('usuario') ?? i.user,
        m = await i.guild.members.fetch(u.id).catch((e) => {
          if (e.code === 10007) return null;
          throw e;
        });
      return reply(i, {
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            '👤 ' + u.username,
            `**ID:** ${u.id}\n**Conta criada:** ${time(u.createdTimestamp)}\n**Entrou:** ${m?.joinedTimestamp ? time(m.joinedTimestamp) : 'Não está no servidor'}\n**Bot:** ${u.bot ? 'Sim' : 'Não'}\n**Cargos:** ${truncate(
              m?.roles.cache
                .filter((r) => r.id !== i.guildId)
                .map((r) => r.toString())
                .join(' ') || 'Nenhum',
              1000,
            )}`,
          ).setThumbnail(u.displayAvatarURL({ size: 512 })),
        ],
      });
    },
  ),
  D(
    'avatar',
    'Abre o avatar de um usuário.',
    'utilities',
    null,
    [user('usuario', 'Usuário a consultar', false)],
    async (i, ctx) => {
      const u = i.options.getUser('usuario') ?? i.user;
      return reply(i, {
        embeds: [
          embed(ctx.store.config(i.guildId), '🖼️ Avatar / ' + u.username)
            .setImage(u.displayAvatarURL({ size: 1024 }))
            .setURL(u.displayAvatarURL({ size: 4096 })),
        ],
      });
    },
  ),
  D(
    'banner',
    'Mostra o banner global de um usuário, se houver.',
    'utilities',
    null,
    [user('usuario', 'Usuário a consultar', false)],
    async (i, ctx) => {
      await defer(i);
      const u = await (i.options.getUser('usuario') ?? i.user).fetch(true);
      if (!u.bannerURL()) return reply(i, 'Esse usuário não tem banner global.');
      return reply(i, {
        embeds: [
          embed(ctx.store.config(i.guildId), '🎴 Banner / ' + u.username).setImage(
            u.bannerURL({ size: 1024 }),
          ),
        ],
      });
    },
  ),
  D('cargos', 'Lista os cargos do servidor.', 'utilities', null, [], async (i, ctx) =>
    reply(i, {
      embeds: [
        embed(
          ctx.store.config(i.guildId),
          '🏷️ CARGOS',
          truncate(
            i.guild.roles.cache
              .sort((a, b) => b.position - a.position)
              .filter((r) => r.id !== i.guildId)
              .map((r) => `${r} · \`${r.id}\``)
              .join('\n'),
            3900,
          ) || 'Nenhum cargo.',
        ),
      ],
    }),
  ),
  D(
    'canal',
    'Consulta informações de um canal visível para você.',
    'utilities',
    null,
    [channel()],
    async (i, ctx) => {
      const c = i.options.getChannel('canal') ?? i.channel;
      if (!c.permissionsFor(i.member).has(P.ViewChannel))
        throw new Error('Você não pode ver esse canal.');
      return reply(i, {
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            '📡 CANAL / ' + c.name,
            `**ID:** ${c.id}\n**Tipo:** ${c.type}\n**Criado:** ${time(c.createdTimestamp)}\n**Assunto:** ${safe(c.topic ?? 'Sem assunto')}`,
          ),
        ],
      });
    },
  ),
  D(
    'emojis',
    'Lista os emojis personalizados do servidor.',
    'utilities',
    null,
    [],
    async (i, ctx) =>
      reply(i, {
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            '✨ EMOJIS',
            truncate(i.guild.emojis.cache.map((e) => `${e} \`:${e.name}:\``).join('  '), 3900) ||
              'Nenhum emoji personalizado.',
          ),
        ],
      }),
  ),
  D('uptime', 'Mostra há quanto tempo o bot está online.', 'utilities', null, [], async (i) =>
    reply(i, `🟣 Online desde ${time(Date.now() - process.uptime() * 1000)}.`),
  ),
  D('convite', 'Gera o convite de instalação deste bot.', 'utilities', null, [], async (i) =>
    reply(
      i,
      `[Adicionar o bot ao servidor](${i.client.generateInvite({ scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands], permissions: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory, P.ManageChannels, P.ManageRoles, P.ManageMessages, P.ModerateMembers, P.KickMembers, P.BanMembers, P.MuteMembers, P.DeafenMembers, P.MoveMembers, P.ManageNicknames, P.MentionEveryone, P.SendPolls] })})`,
    ),
  ),
  D(
    'diagnostico',
    'Verifica permissões, intents e o estado local do bot.',
    'config',
    P.ManageGuild,
    [],
    async (i, ctx) => {
      const me = i.guild.members.me,
        c = ctx.store.config(i.guildId),
        needed = [
          P.ViewChannel,
          P.SendMessages,
          P.EmbedLinks,
          P.ReadMessageHistory,
          P.ManageChannels,
          P.ManageRoles,
          P.ManageMessages,
          P.ModerateMembers,
          P.MentionEveryone,
          P.MoveMembers,
        ];
      const missing = needed.filter((p) => !me.permissions.has(p));
      return reply(i, {
        embeds: [
          embed(
            c,
            '🩺 DIAGNÓSTICO',
            `**Intents de membros:** ${i.client.options.intents.has(GatewayIntentBits.GuildMembers) ? 'solicitada' : 'desativada'}\n**Conteúdo de mensagens:** ${i.client.options.intents.has(GatewayIntentBits.MessageContent) ? 'solicitada' : 'desativada'}\n**Maior cargo do bot:** ${me.roles.highest}\n**Permissões ausentes (bitfields):** ${missing.length ? missing.join(', ') : 'Nenhuma das verificadas'}\n**Tickets:** ${c.tickets.staffRoleId ? 'cargo de atendimento definido' : 'defina o cargo da equipe'}\n**Verificação:** ${c.verification.roleId ? 'cargo definido' : 'defina o cargo'}\n**Calls temporárias:** ${c.tempcalls.categoryId ? 'categoria normal definida' : 'defina a categoria normal'}\n\nOverrides do canal e hierarquia também são verificados ao executar as ações.`,
          ),
        ],
      });
    },
  ),
  D(
    'configexportar',
    'Exporta as configurações atuais em JSON.',
    'config',
    P.ManageGuild,
    [],
    async (i, ctx) =>
      reply(i, {
        files: [
          new AttachmentBuilder(Buffer.from(JSON.stringify(ctx.store.config(i.guildId), null, 2)), {
            name: 'sanatorio-config.json',
          }),
        ],
      }),
  ),
  D(
    'configimportar',
    'Importa e valida configurações de um arquivo JSON.',
    'config',
    P.ManageGuild,
    [attachment('arquivo', 'JSON exportado pelo bot')],
    async (i, ctx) => {
      const a = i.options.getAttachment('arquivo');
      if (a.size > 128000 || !a.name.endsWith('.json'))
        throw new Error('Envie um arquivo JSON de até 128 KB.');
      const url = new URL(a.url);
      if (
        url.protocol !== 'https:' ||
        !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)
      )
        throw new Error('Anexo fora do CDN do Discord.');
      await defer(i);
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!res.ok) throw new Error('Falha ao baixar o anexo.');
      const raw = await res.text();
      if (Buffer.byteLength(raw) > 128000) throw new Error('Arquivo grande demais.');
      const config = validateConfig(JSON.parse(raw));
      for (const setting of SETTINGS)
        await validateSettingReference(
          i,
          setting,
          setting.key.split('.').reduce((o, k) => o[k], config),
        );
      ctx.store.saveConfig(i.guildId, config);
      await audit(
        ctx,
        i.guild,
        '⚙️ Configuração importada',
        `Importação validada por ${i.user.tag}.`,
      );
      return reply(i, 'Configuração validada e importada. Abra /botconfig para conferir.');
    },
  ),
  D(
    'lembrete',
    'Cria, lista ou remove lembretes persistentes enviados por DM.',
    'utilities',
    null,
    [
      sub('criar', 'Cria um lembrete', [
        text('duracao', 'Ex.: 10m, 2h, 7d', true, { max_length: 12 }),
        text('texto', 'O que lembrar', true, { max_length: 1200 }),
      ]),
      sub('listar', 'Lista seus lembretes'),
      sub('remover', 'Remove um lembrete', [
        text('id', 'ID do lembrete', true, { max_length: 20 }),
      ]),
    ],
    async (i, ctx) => {
      const action = i.options.getSubcommand();
      if (action === 'criar') {
        const all = ctx.store
          .list('reminders')
          .filter((r) => r.user === i.user.id && r.status === 'pending');
        if (all.length >= 20) throw new Error('Limite de 20 lembretes pendentes.');
        const due = Date.now() + parseDuration(i.options.getString('duracao'));
        ctx.store.set('reminders', i.id, {
          id: i.id,
          user: i.user.id,
          guild: i.guildId,
          text: i.options.getString('texto'),
          due,
          status: 'pending',
        });
        return reply(
          i,
          `Lembrete \`${i.id}\` agendado para ${time(due)}. Mantenha suas DMs abertas.`,
        );
      }
      if (action === 'remover') {
        const id = i.options.getString('id'),
          r = ctx.store.get('reminders', id);
        if (!r || r.user !== i.user.id) throw new Error('Lembrete não encontrado.');
        ctx.store.delete('reminders', id);
        return reply(i, 'Lembrete removido.');
      }
      const list = ctx.store
        .list('reminders')
        .filter((r) => r.user === i.user.id && r.status !== 'sent');
      return reply(
        i,
        list
          .map((r) => `\`${r.id}\` · ${safe(truncate(r.text, 100))} · ${time(r.due)} · ${r.status}`)
          .join('\n') || 'Nenhum lembrete pendente.',
      );
    },
  ),
  D(
    'calcular',
    'Calcula uma expressão aritmética sem executar código.',
    'utilities',
    null,
    [text('expressao', 'Ex.: (15 + 20) * 3 ^ 2', true, { max_length: 200 })],
    async (i) =>
      reply(
        i,
        `Resultado: **${calculate(i.options.getString('expressao')).toLocaleString('pt-BR', { maximumFractionDigits: 12 })}**`,
      ),
  ),
  D(
    'horario',
    'Consulta a hora atual em um fuso IANA.',
    'utilities',
    null,
    [text('fuso', 'Ex.: America/Sao_Paulo ou Europe/London', false, { max_length: 80 })],
    async (i) => {
      const zone = i.options.getString('fuso') ?? 'America/Sao_Paulo';
      let value;
      try {
        value = new Intl.DateTimeFormat('pt-BR', {
          timeZone: zone,
          dateStyle: 'full',
          timeStyle: 'long',
        }).format(new Date());
      } catch {
        throw new Error('Fuso inválido. Exemplo: America/Sao_Paulo.');
      }
      return reply(i, `🕒 **${safe(zone)}**\n${value}`);
    },
  ),
  D(
    'dado',
    'Rola dados usando aleatoriedade criptográfica.',
    'fun',
    null,
    [
      integer('lados', 'Faces do dado', false, 2, 100000),
      integer('quantidade', 'Quantidade de dados', false, 1, 20),
    ],
    async (i) => {
      const result = Array.from({ length: i.options.getInteger('quantidade') ?? 1 }, () =>
        randomInt(1, (i.options.getInteger('lados') ?? 6) + 1),
      );
      return reply(i, `🎲 ${result.join(' · ')}\n**Total:** ${result.reduce((a, b) => a + b, 0)}`);
    },
  ),
  D('moeda', 'Joga uma moeda.', 'fun', null, [], async (i) =>
    reply(i, `🪙 **${randomInt(2) ? 'Cara' : 'Coroa'}**`),
  ),
  D(
    'escolher',
    'Escolhe uma opção separada por ponto e vírgula.',
    'fun',
    null,
    [text('opcoes', 'Ex.: pizza; hambúrguer; sushi', true, { max_length: 1000 })],
    async (i) => {
      const values = i.options
        .getString('opcoes')
        .split(';')
        .map((v) => v.trim())
        .filter(Boolean);
      if (values.length < 2) throw new Error('Informe ao menos duas opções separadas por ;.');
      return reply(i, `🧠 Escolhi: **${safe(values[randomInt(values.length)])}**`);
    },
  ),
  D(
    'oraculo',
    'Faz uma pergunta ao oráculo, apenas por diversão.',
    'fun',
    null,
    [text('pergunta', 'Sua pergunta', true, { max_length: 300 })],
    async (i) =>
      reply(
        i,
        `🔮 ${['Sim.', 'Não.', 'Talvez.', 'Tente novamente depois.', 'Tudo indica que sim.', 'Melhor conferir com a enfermaria.'][randomInt(6)]}\n-# Resposta aleatória de entretenimento.`,
      ),
  ),
];
