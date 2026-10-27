import { defer } from '../core/ui.js';
import { PermissionFlagsBits as P } from 'discord.js';
import { D, text, user, integer, role, sub, choices, channel } from './definition.js';
import {
  reply,
  embed,
  fmt,
  levelFor,
  requiredXp,
  progress,
  time,
  safe,
  truncate,
} from '../core/ui.js';
import { requireUser, validateRole } from '../core/permissions.js';
import { receiptAttachment } from '../features/receipts.js';
import {
  activateBuff,
  builtinProduct,
  builtinProducts,
  createGiftCard,
  hasActiveBuff,
} from '../features/vip.js';
import { configureShopPanel } from '../features/shop.js';
import { publishScratchPanel, publishWorkPanel } from '../features/economy-panels.js';
const purchaseLocks = new Set();
const commands = [
  D(
    'raspadinha',
    'Publica o painel fixo de raspadinha neste canal.',
    'economy',
    P.ManageGuild,
    [channel('canal', 'Canal do painel', false)],
    async (i, ctx) => {
      const target = i.options.getChannel('canal') ?? i.channel;
      const message = await publishScratchPanel(i, ctx, target);
      return reply(i, `Painel de raspadinha publicado em ${message.channel}.`);
    },
  ),
  D(
    'setarloja',
    'Publica ou atualiza o painel fixo da loja neste canal.',
    'economy',
    P.ManageGuild,
    [channel('canal', 'Canal do painel da loja', false)],
    async (i, ctx) => {
      const target = i.options.getChannel('canal') ?? i.channel;
      const message = await configureShopPanel(i, ctx, target);
      return reply(i, `Painel da loja publicado em ${message.channel}.`);
    },
  ),
  D(
    'economia',
    'Gerencia moedas de um usuário.',
    'economy',
    P.ManageGuild,
    [
      sub('adicionar', 'Adiciona moedas', [user(), integer('quantidade', 'Quantidade', true, 1, 100000000)]),
      sub('remover', 'Remove moedas', [user(), integer('quantidade', 'Quantidade', true, 1, 100000000)]),
      sub('definir', 'Define o saldo da carteira', [user(), integer('quantidade', 'Quantidade', true, 0, 100000000)]),
      sub('consultar', 'Consulta o saldo', [user()]),
    ],
    async (i, ctx) => {
      const target = i.options.getUser('usuario');
      const action = i.options.getSubcommand();
      const account = ctx.store.account(i.guildId, target.id);
      if (action === 'consultar') return reply(i, `💰 <@${target.id}> possui **${fmt.format(account.balance)} ${safe(ctx.store.config(i.guildId).economy.currency)}** na carteira e **${fmt.format(account.bank)}** no banco.`);
      const amount = i.options.getInteger('quantidade');
      const balance = action === 'adicionar' ? account.balance + amount : action === 'remover' ? account.balance - amount : amount;
      if (balance < 0) throw new Error('O saldo não pode ficar negativo.');
      ctx.store.changeAccount(i.guildId, target.id, { balance });
      return reply(i, `✅ Saldo de <@${target.id}> atualizado para **${fmt.format(balance)} ${safe(ctx.store.config(i.guildId).economy.currency)}**.`);
    },
  ),
  D(
    'nivel',
    'Consulta a experiência e o nível de um membro.',
    'levels',
    null,
    [user('usuario', 'Membro', false)],
    async (i, ctx) => {
      const u = i.options.getUser('usuario') ?? i.user,
        a = ctx.store.account(i.guildId, u.id),
        level = levelFor(a.xp),
        base = requiredXp(level),
        next = requiredXp(level + 1);
      return reply(i, {
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            '📈 PROGRESSO / ' + u.username,
            `**Nível ${level}** · ${fmt.format(a.xp)} XP\n\`${progress(((a.xp - base) / (next - base)) * 100)}\`\nPróximo nível: ${fmt.format(next - a.xp)} XP`,
          ).setThumbnail(u.displayAvatarURL()),
        ],
      });
    },
  ),
  D(
    'ranking',
    'Lista os 10 maiores níveis ou saldos.',
    'levels',
    null,
    [
      text('tipo', 'Tipo do ranking', false, {
        choices: choices(['Experiência', 'xp'], ['Riqueza (carteira + banco)', 'wealth']),
        max_length: 10,
      }),
    ],
    async (i, ctx) => {
      const field = i.options.getString('tipo') ?? 'xp';
      if (field === 'wealth' && !ctx.store.config(i.guildId).modules.economy)
        throw new Error('Economia desativada.');
      const list =
        field === 'wealth'
          ? ctx.store.db
              .prepare(
                'SELECT *,balance+bank AS wealth FROM accounts WHERE guild=? ORDER BY wealth DESC LIMIT 10',
              )
              .all(i.guildId)
          : ctx.store.leaderboard(i.guildId);
      return reply(i, {
        embeds: [
          embed(
            ctx.store.config(i.guildId),
            '🏆 RANKING / ' + (field === 'xp' ? 'EXPERIÊNCIA' : 'ECONOMIA'),
            list
              .map(
                (a, n) =>
                  `**${n + 1}.** <@${a.user}> · ${field === 'xp' ? `nível ${levelFor(a.xp)} / ${fmt.format(a.xp)} XP` : fmt.format(a.wealth)}`,
              )
              .join('\n') || 'Sem dados ainda.',
          ),
        ],
      });
    },
  ),
  D(
    'perfil',
    'Mostra o perfil de atividade e economia de um membro.',
    'levels',
    null,
    [user('usuario', 'Membro', false)],
    async (i, ctx) => {
      const u = i.options.getUser('usuario') ?? i.user,
        a = ctx.store.account(i.guildId, u.id),
        c = ctx.store.config(i.guildId);
      return reply(i, {
        embeds: [
          embed(
            c,
            '🪪 FICHA / ' + u.username,
            `**Nível:** ${levelFor(a.xp)}\n**Experiência:** ${fmt.format(a.xp)} XP${c.modules.economy ? `\n**Carteira:** ${fmt.format(a.balance)} ${safe(c.economy.currency)}\n**Banco:** ${fmt.format(a.bank)}` : ''}`,
          ).setThumbnail(u.displayAvatarURL()),
        ],
      });
    },
  ),
  D(
    'saldo',
    'Consulta o saldo de um membro.',
    'economy',
    null,
    [user('usuario', 'Membro', false)],
    async (i, ctx) => {
      const u = i.options.getUser('usuario') ?? i.user,
        a = ctx.store.account(i.guildId, u.id),
        c = ctx.store.config(i.guildId);
      return reply(i, {
        embeds: [
          embed(
            c,
            '🪙 CARTEIRA / ' + u.username,
            `**Carteira:** ${fmt.format(a.balance)} ${safe(c.economy.currency)}\n**Banco:** ${fmt.format(a.bank)}\n**Total:** ${fmt.format(a.balance + a.bank)}`,
          ),
        ],
      });
    },
  ),
  D('diario', 'Resgata a recompensa a cada 24 horas.', 'economy', null, [], async (i, ctx) => {
    const c = ctx.store.config(i.guildId),
      now = Date.now(),
      reward = c.economy.daily * (hasActiveBuff(ctx, i.guildId, i.user.id, 'daily') ? 2 : 1);
    const result = ctx.store.transaction(() => {
      const a = ctx.store.account(i.guildId, i.user.id);
      if (now - a.last_daily < 86400000)
        throw new Error(`Sua próxima diária estará disponível ${time(a.last_daily + 86400000)}.`);
      return ctx.store.changeAccount(i.guildId, i.user.id, {
        balance: a.balance + reward,
        last_daily: now,
      });
    });
    return reply(
      i,
      `🪙 Você recebeu **${fmt.format(reward)} ${safe(c.economy.currency)}**${reward > c.economy.daily ? ' com o buff de diária em dobro' : ''}. Saldo: ${fmt.format(result.balance)}.`,
    );
  }),
  D(
    'trabalhar',
    'Publica o painel fixo de trabalho.',
    'economy',
    P.ManageGuild,
    [channel('canal', 'Canal para publicar o painel', false)],
    async (i, ctx) => {
      const target = i.options.getChannel('canal') ?? i.channel;
      const message = await publishWorkPanel(i, ctx, target);
      return reply(i, `Painel de trabalho publicado em ${message.channel}.`);
    },
  ),
  D(
    'transferir',
    'Transfere moedas virtuais para outro membro.',
    'economy',
    null,
    [user(), integer('quantidade', 'Quantidade de moedas', true, 1, 1000000)],
    async (i, ctx) => {
      const u = i.options.getUser('usuario');
      if (u.bot) throw new Error('Bots não recebem transferências.');
      const member = await i.guild.members.fetch(u.id).catch((e) => {
        if (e.code === 10007) return null;
        throw e;
      });
      if (!member) throw new Error('O destinatário precisa estar neste servidor.');
      const amount = i.options.getInteger('quantidade');
      ctx.store.transfer(i.guildId, i.user.id, u.id, amount);
      return reply(
        i,
        `Transferência de **${fmt.format(amount)}** para ${safe(u.username)} concluída.`,
      );
    },
  ),
  D(
    'banco',
    'Deposita, saca ou consulta moedas virtuais.',
    'economy',
    null,
    [
      sub('depositar', 'Move da carteira para o banco', [
        integer('quantidade', 'Quantidade', true, 1, 1000000),
      ]),
      sub('sacar', 'Move do banco para a carteira', [
        integer('quantidade', 'Quantidade', true, 1, 1000000),
      ]),
      sub('consultar', 'Consulta o banco'),
    ],
    async (i, ctx) => {
      const action = i.options.getSubcommand();
      if (action === 'consultar')
        return reply(
          i,
          `🏦 Banco: **${fmt.format(ctx.store.account(i.guildId, i.user.id).bank)}**.`,
        );
      const amount = i.options.getInteger('quantidade');
      const a = ctx.store.transaction(() => {
        const a = ctx.store.account(i.guildId, i.user.id);
        if (action === 'depositar') {
          if (a.balance < amount) throw new Error('Saldo insuficiente na carteira.');
          return ctx.store.changeAccount(i.guildId, i.user.id, {
            balance: a.balance - amount,
            bank: a.bank + amount,
          });
        }
        if (a.bank < amount) throw new Error('Saldo insuficiente no banco.');
        return ctx.store.changeAccount(i.guildId, i.user.id, {
          balance: a.balance + amount,
          bank: a.bank - amount,
        });
      });
      return reply(
        i,
        `🏦 Operação concluída. Carteira: ${fmt.format(a.balance)} · Banco: ${fmt.format(a.bank)}.`,
      );
    },
  ),
  D(
    'loja',
    'Gerencia e compra cargos cosméticos com moedas virtuais.',
    'economy',
    null,
    [
      sub('listar', 'Lista os itens da loja'),
      sub('adicionar', 'Cria um item de cargo comum', [
        text('nome', 'Nome do item', true, { max_length: 80 }),
        integer('preco', 'Preço em moedas', true, 1, 1000000),
        role(),
      ]),
      sub('remover', 'Remove um item', [text('id', 'ID do item', true, { max_length: 20 })]),
      sub('comprar', 'Compra ou reaplica um item já adquirido', [
        text('id', 'ID do item', true, { max_length: 20 }),
      ]),
    ],
    async (i, ctx) => {
      const action = i.options.getSubcommand();
      if (action === 'listar') {
        const config = ctx.store.config(i.guildId);
        const list = ctx.store.list('shop').filter((r) => r.guild === i.guildId);
        const products = builtinProducts(config);
        const vip = products
          .filter((product) => product.kind === 'vip')
          .map(
            (product) =>
              `\`${product.id}\` · **${safe(product.name)}** · ${fmt.format(product.price)} ${safe(config.economy.currency)}`,
          )
          .join('\n');
        const buffs = products
          .filter((product) => product.kind === 'buff')
          .map(
            (product) =>
              `\`${product.id}\` · **${safe(product.name)}** · ${fmt.format(product.price)} ${safe(config.economy.currency)}`,
          )
          .join('\n');
        const custom = list
          .map(
            (item) =>
              `\`${item.id}\` · **${safe(item.name)}** · ${fmt.format(item.price)} ${safe(config.economy.currency)} · <@&${item.role}>`,
          )
          .join('\n');
        return reply(i, {
          embeds: [
            embed(
              config,
              '🛍️ Loja N3XUS',
              truncate(
                `### Planos VIP\nCada plano está disponível por 1 mês, 3 meses, 1 ano ou vitalício. A compra entrega um gift card pessoal.\n${vip}\n\n### Buffs temporários\n${buffs}${custom ? `\n\n### Produtos do servidor\n${custom}` : ''}\n\nAs compras agora são feitas no painel fixo publicado por **/setarloja**.`,
                3900,
              ),
            ),
          ],
        });
      }
      if (action === 'adicionar') {
        requireUser(i, P.ManageGuild);
        const r = await validateRole(i.guild, i.options.getRole('cargo').id, i.user.id);
        ctx.store.set('shop', i.id, {
          id: i.id,
          guild: i.guildId,
          name: i.options.getString('nome'),
          price: i.options.getInteger('preco'),
          role: r.id,
        });
        return reply(i, `Item cadastrado. ID: \`${i.id}\``);
      }
      const id = i.options.getString('id'),
        builtin = builtinProduct(id, ctx.store.config(i.guildId)),
        stored = ctx.store.get('shop', id),
        item = builtin ?? (stored?.guild === i.guildId ? stored : null);
      if (!item) throw new Error('Item não encontrado. Atualize o painel da loja.');
      if (action === 'remover') {
        requireUser(i, P.ManageGuild);
        if (builtin) throw new Error('Os produtos VIP e buffs padrão não podem ser removidos.');
        ctx.store.delete('shop', id);
        return reply(i, 'Item removido da loja.');
      }
      const lock = `${i.guildId}:${i.user.id}`;
      if (purchaseLocks.has(lock)) throw new Error('Aguarde a conclusão da compra anterior.');
      purchaseLocks.add(lock);
      try {
        await defer(i);
        const config = ctx.store.config(i.guildId);
        if (builtin) {
          let gift;
          let buff;
          ctx.store.transaction(() => {
            const account = ctx.store.account(i.guildId, i.user.id);
            if (account.balance < item.price)
              throw new Error(
                `Saldo insuficiente. Faltam ${fmt.format(item.price - account.balance)} ${safe(config.economy.currency)}.`,
              );
            ctx.store.changeAccount(i.guildId, i.user.id, {
              balance: account.balance - item.price,
            });
            ctx.store.set('purchases', i.id, {
              id: i.id,
              guild: i.guildId,
              user: i.user.id,
              productId: item.id,
              name: item.name,
              price: item.price,
              createdAt: Date.now(),
              state: item.kind === 'vip' ? 'giftcard' : 'activated',
            });
            if (item.kind === 'vip') gift = createGiftCard(ctx, i.guildId, i.user.id, item, i.id);
            else buff = activateBuff(ctx, i.guildId, i.user.id, item, i.id);
          });
          const receiptData = {
            kind: item.kind === 'vip' ? 'GIFT CARD' : 'COMPRA',
            guildName: i.guild.name,
            username: i.user.username,
            userId: i.user.id,
            product: item.name,
            amount: item.price,
            currency: config.economy.currency,
            code: gift?.code ?? '',
            duration: item.durationLabel,
            transactionId: i.id,
          };
          const description =
            item.kind === 'vip'
              ? `Seu gift card foi gerado. Use o código exibido no cupom em **Resgatar gift card** no painel VIP.\n\n**Final:** \`${gift.code.slice(-9)}\``
              : `O buff **${safe(item.name)}** está ativo até <t:${Math.floor(buff.expiresAt / 1000)}:F>.`;
          if (config.economy.receiptDm)
            await i.user
              .send({
                embeds: [embed(config, '🧾 Compra aprovada', description)],
                files: [receiptAttachment(receiptData, 'cupom-fiscal')],
                allowedMentions: { parse: [] },
              })
              .catch(() => {});
          return reply(i, {
            embeds: [
              embed(
                config,
                'Compra aprovada',
                `${description}\n\nO cupom fiscal acompanha esta mensagem.`,
              ),
            ],
            files: [receiptAttachment(receiptData, 'cupom-fiscal')],
          });
        }

        const role = await validateRole(i.guild, item.role),
          member = await i.guild.members.fetch(i.user.id),
          key = `${i.guildId}:${i.user.id}:${id}`,
          owned = ctx.store.get('inventory', key);
        if (owned) {
          await member.roles.add(role, 'Reaplicação de item adquirido');
          return reply(i, 'O cargo do seu item foi reaplicado sem cobrança.');
        }
        ctx.store.transaction(() => {
          const account = ctx.store.account(i.guildId, i.user.id);
          if (account.balance < item.price) throw new Error('Saldo insuficiente.');
          ctx.store.changeAccount(i.guildId, i.user.id, {
            balance: account.balance - item.price,
          });
          ctx.store.set('inventory', key, {
            guild: i.guildId,
            user: i.user.id,
            item: id,
            name: item.name,
            role: item.role,
            price: item.price,
            created: Date.now(),
            state: 'pending',
          });
        });
        try {
          await member.roles.add(role, 'Compra com moedas virtuais');
        } catch (error) {
          const refreshed = await i.guild.members
            .fetch({ user: i.user.id, force: true })
            .catch(() => null);
          if (!refreshed?.roles.cache.has(role.id)) {
            ctx.store.transaction(() => {
              const account = ctx.store.account(i.guildId, i.user.id);
              ctx.store.changeAccount(i.guildId, i.user.id, {
                balance: account.balance + item.price,
              });
              ctx.store.delete('inventory', key);
            });
            throw new Error('Não foi possível aplicar o cargo. As moedas foram devolvidas.');
          }
        }
        const entry = ctx.store.get('inventory', key);
        ctx.store.set('inventory', key, { ...entry, state: 'owned' });
        const receiptData = {
          kind: 'COMPRA',
          guildName: i.guild.name,
          username: i.user.username,
          userId: i.user.id,
          product: item.name,
          amount: item.price,
          currency: config.economy.currency,
          transactionId: i.id,
        };
        if (config.economy.receiptDm)
          await i.user
            .send({
              embeds: [embed(config, '🧾 Compra aprovada', `Você recebeu ${role}.`)],
              files: [receiptAttachment(receiptData, 'cupom-fiscal')],
              allowedMentions: { parse: [] },
            })
            .catch(() => {});
        return reply(i, {
          content: `✅ Você adquiriu **${safe(item.name)}** por ${fmt.format(item.price)} ${safe(config.economy.currency)}.`,
          files: [receiptAttachment(receiptData, 'cupom-fiscal')],
        });
      } finally {
        purchaseLocks.delete(lock);
      }
    },
  ),
  D('inventario', 'Lista os itens comprados por você.', 'economy', null, [], async (i, ctx) => {
    const items = ctx.store
      .list('inventory')
      .filter((v) => v.guild === i.guildId && v.user === i.user.id);
    const gifts = ctx.store
      .list('giftcards')
      .filter((gift) => gift.guild === i.guildId && gift.user === i.user.id && !gift.redeemedAt);
    const entitlements = ctx.store
      .list('vip-entitlements')
      .filter((vip) => vip.guild === i.guildId && vip.user === i.user.id && vip.active);
    const buffs = ctx.store
      .list('buffs')
      .filter(
        (buff) =>
          buff.guild === i.guildId && buff.user === i.user.id && buff.expiresAt > Date.now(),
      );
    const lines = [
      ...entitlements.map(
        (vip) =>
          `💎 **${safe(builtinProduct(vip.productId, ctx.store.config(i.guildId))?.name ?? vip.tier)}** · ${vip.expiresAt ? `<t:${Math.floor(vip.expiresAt / 1000)}:R>` : 'vitalício'}`,
      ),
      ...gifts.map(
        (gift) =>
          `🎁 **${safe(builtinProduct(gift.productId, ctx.store.config(i.guildId))?.name ?? 'Gift card VIP')}** · código final \`${gift.lastFour}\` · aguardando resgate`,
      ),
      ...buffs.map(
        (buff) =>
          `⚡ **${safe(builtinProduct(buff.productId, ctx.store.config(i.guildId))?.name ?? buff.buff)}** · expira <t:${Math.floor(buff.expiresAt / 1000)}:R>`,
      ),
      ...items.map((item) => `🎨 **${safe(item.name)}** · <@&${item.role}> · ${item.state}`),
    ];
    return reply(i, {
      embeds: [
        embed(
          ctx.store.config(i.guildId),
          '🎒 INVENTÁRIO',
          truncate(lines.join('\n'), 3900) || 'Seu inventário está vazio.',
        ),
      ],
    });
  }),
];

// O painel fixo substitui os antigos subcomandos administrativos da loja.
export default commands.filter((command) => command.name !== 'loja');
