import {
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { button, embed, fmt, reply, row, safe, truncate } from '../core/ui.js';
import { requireUser, validateRole } from '../core/permissions.js';
import { receiptAttachment } from './receipts.js';
import {
  activateBuff,
  builtinProduct,
  builtinProducts,
  createGiftCard,
} from './vip.js';
import { createHash, randomBytes } from 'node:crypto';

const locks = new Set();

const DEFAULT_CATEGORIES = [
  { id: 'vip', name: 'VIP', emoji: '💎', description: 'Planos VIP e gift cards.' },
  { id: 'buffs', name: 'Buffs temporários', emoji: '⚡', description: 'Aumentos de trabalho, XP e diária.' },
  { id: 'servidor', name: 'Produtos do servidor', emoji: '🎨', description: 'Cargos e produtos personalizados.' },
];

export const shopCategories = (ctx, guildId) => {
  let categories = ctx.store
    .list('shop-categories')
    .filter((category) => category.guild === guildId && category.enabled !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
  if (!categories.length) {
    DEFAULT_CATEGORIES.forEach((category, order) =>
      ctx.store.set('shop-categories', `${guildId}:${category.id}`, {
        ...category,
        guild: guildId,
        order,
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    categories = DEFAULT_CATEGORIES.map((category, order) => ({
      ...category,
      guild: guildId,
      order,
      enabled: true,
    }));
  }
  return categories;
};

const categoryForProduct = (product) =>
  product.category || (product.kind === 'buff' ? 'buffs' : product.kind === 'vip' ? 'vip' : 'servidor');

export const shopProducts = (ctx, guildId) => {
  const config = ctx.store.config(guildId);
  const builtins = builtinProducts(config).map((product) => ({
    ...product,
    category: categoryForProduct(product),
  }));
  const custom = ctx.store
    .list('shop')
    .filter((item) => item.guild === guildId)
    .map((item) => ({ ...item, kind: 'role', category: item.category || 'servidor' }));
  return [...builtins, ...custom];
};

export function shopView(ctx, guild) {
  const config = ctx.store.config(guild.id);
  const currency = safe(config.economy.currency);
  return {
    embeds: [
      embed(
        config,
        '🛍️ Loja N3XUS',
        `Uma central de benefícios para evoluir seu perfil no servidor. Use suas **${currency}** para desbloquear VIPs, buffs e produtos exclusivos.\n\n**Como funciona**\n1. Abra **Ver produtos** e escolha uma categoria.\n2. Selecione um item para ver preço, duração e benefícios.\n3. Confirme a compra e, se tiver, informe seu cupom de booster.\n\n**VIPs** liberam benefícios permanentes ou temporários conforme a duração escolhida. **Buffs** entram em vigor imediatamente.\n\nSeu saldo e seu inventário continuam disponíveis em **/saldo** e **/inventario**.`,
      ).setFooter({ text: 'Preços e produtos podem ser ajustados em /botconfig.' }),
    ],
    components: [
      row(button('shop:categories', 'Ver produtos', ButtonStyle.Primary), button('shop:balance', 'Meu saldo')),
    ],
    allowedMentions: { parse: [] },
  };
}

export function shopCategoriesView(ctx, guild) {
  const config = ctx.store.config(guild.id);
  const categories = shopCategories(ctx, guild.id);
  const products = shopProducts(ctx, guild.id);
  return {
    embeds: [embed(config, '🛍️ Catálogo por categoria', 'Escolha uma categoria para ver os produtos disponíveis e seus detalhes.')],
    components: [
      row(new StringSelectMenuBuilder().setCustomId('shop:category').setPlaceholder('Escolha uma categoria').addOptions(
        categories.slice(0, 25).map((category) => ({
          label: truncate(category.name, 100),
          value: category.id,
          emoji: category.emoji || '🛍️',
          description: truncate(`${category.description || 'Produtos selecionados'} · ${products.filter((product) => product.category === category.id).length} item(ns)`, 100),
        })),
      )),
      row(button('shop:home', 'Voltar para a loja')),
    ],
    allowedMentions: { parse: [] },
  };
}

export function shopCategoryView(ctx, guild, categoryId) {
  const config = ctx.store.config(guild.id);
  const category = shopCategories(ctx, guild.id).find((item) => item.id === categoryId);
  if (!category) throw new Error('Categoria da loja não encontrada.');
  const products = shopProducts(ctx, guild.id).filter((product) => product.category === categoryId).slice(0, 25);
  const components = [];
  if (products.length)
    components.push(
      row(new StringSelectMenuBuilder().setCustomId(`shop:product:${categoryId}`).setPlaceholder('Ver produtos desta categoria').addOptions(
        products.map((product) => ({
          label: truncate(product.name, 100),
          value: product.id,
          description: truncate(`${product.description || ''}${product.description ? ' · ' : ''}${fmt.format(product.price)} ${config.economy.currency}${product.durationLabel ? ` · ${product.durationLabel}` : ''}`, 100),
          emoji: product.kind === 'vip' ? '💎' : product.kind === 'buff' ? '⚡' : product.emoji || '🎨',
        })),
      )),
    );
  components.push(row(button('shop:categories', 'Voltar às categorias'), button('shop:home', 'Início')));
  return {
    embeds: [embed(config, `${category.emoji || '🛍️'} ${safe(category.name)}`, `${safe(category.description || 'Escolha um produto para ver os detalhes.')}\n\n${products.length ? `Selecione um item abaixo. Os preços são cobrados em **${safe(config.economy.currency)}**.` : 'Ainda não há produtos nesta categoria.'}`)],
    components,
    allowedMentions: { parse: [] },
  };
}

const couponHash = (code) => createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');
const couponCode = () => `BOOST-${randomBytes(7).toString('hex').toUpperCase()}`;

export function createBoosterCoupon(ctx, guildId, userId) {
  const id = `${guildId}:${userId}`;
  const code = couponCode();
  ctx.store.set('booster-coupons', id, {
    id,
    guild: guildId,
    user: userId,
    codeHash: couponHash(code),
    lastFour: code.slice(-4),
    discountPercent: 50,
    createdAt: Date.now(),
    usedAt: null,
    active: true,
  });
  return code;
}

const couponModal = (productId) => new ModalBuilder()
  .setCustomId(`shop:coupon:${productId}`)
  .setTitle('Finalizar compra')
  .addLabelComponents(new LabelBuilder().setLabel('Cupom de booster (opcional)').setDescription('Deixe vazio se não tiver cupom.').setTextInputComponent(
    new TextInputBuilder().setCustomId('coupon').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40).setPlaceholder('BOOST-XXXXXXXXXXXX'),
  ));

const productFor = (i, ctx, id) => {
  const config = ctx.store.config(i.guildId);
  const builtin = builtinProduct(id, config);
  if (builtin) return builtin;
  const custom = ctx.store.get('shop', id);
  return custom?.guild === i.guildId ? { ...custom, kind: 'role' } : null;
};

export async function purchaseProduct(i, ctx, id, coupon = '') {
  const item = productFor(i, ctx, id);
  if (!item) throw new Error('Produto não encontrado. Atualize o painel da loja.');
  const lock = `${i.guildId}:${i.user.id}`;
  if (locks.has(lock)) throw new Error('Aguarde a conclusão da compra anterior.');
  locks.add(lock);
  try {
    const config = ctx.store.config(i.guildId);
    const purchaseId = i.id;
    let discount = 0;
    let couponRecord = null;
    if (coupon?.trim()) {
      couponRecord = ctx.store
        .list('booster-coupons')
        .find((record) => record.guild === i.guildId && record.user === i.user.id && record.active && !record.usedAt && record.codeHash === couponHash(coupon));
      if (!couponRecord) throw new Error('Cupom inválido, expirado ou não pertence a você.');
      if (item.kind !== 'vip') throw new Error('O cupom de booster vale somente para compras VIP.');
      discount = Math.min(50, Number(couponRecord.discountPercent) || 50);
    }
    const chargedPrice = Math.max(1, Math.floor(item.price * (1 - discount / 100)));
    await i.deferReply({ flags: 64 });
    if (item.kind === 'role') {
      const role = await validateRole(i.guild, item.role);
      const member = await i.guild.members.fetch(i.user.id);
      const key = `${i.guildId}:${i.user.id}:${item.id}`;
      const owned = ctx.store.get('inventory', key);
      if (owned) {
        await member.roles.add(role, 'Reaplicação de item adquirido');
        return i.editReply(`O cargo ${role} foi reaplicado sem cobrança.`);
      }
      ctx.store.transaction(() => {
        const account = ctx.store.account(i.guildId, i.user.id);
        if (account.balance < chargedPrice) throw new Error(`Saldo insuficiente. Faltam ${fmt.format(chargedPrice - account.balance)} ${safe(config.economy.currency)}.`);
        ctx.store.changeAccount(i.guildId, i.user.id, { balance: account.balance - chargedPrice });
        ctx.store.set('inventory', key, { guild: i.guildId, user: i.user.id, item: item.id, name: item.name, role: item.role, price: chargedPrice, created: Date.now(), state: 'pending' });
      });
      try {
        await member.roles.add(role, 'Compra com moedas virtuais');
      } catch (error) {
        ctx.store.transaction(() => {
          const account = ctx.store.account(i.guildId, i.user.id);
          ctx.store.changeAccount(i.guildId, i.user.id, { balance: account.balance + chargedPrice });
          ctx.store.delete('inventory', key);
        });
        throw new Error(`Não foi possível aplicar o cargo. As moedas foram devolvidas: ${error.message}`);
      }
      const entry = ctx.store.get('inventory', key);
      ctx.store.set('inventory', key, { ...entry, state: 'owned' });
      if (couponRecord) {
        couponRecord.usedAt = Date.now();
        couponRecord.active = false;
        couponRecord.purchaseId = purchaseId;
        ctx.store.set('booster-coupons', couponRecord.id, couponRecord);
      }
      const receipt = { kind: 'COMPRA', guildName: i.guild.name, username: i.user.username, userId: i.user.id, product: item.name, amount: chargedPrice, currency: config.economy.currency, transactionId: purchaseId };
      await i.user.send({ embeds: [embed(config, '🧾 Compra aprovada', `Você recebeu ${role}.`)], files: [receiptAttachment(receipt, 'cupom-fiscal')], allowedMentions: { parse: [] } }).catch(() => {});
      return i.editReply({ content: `✅ Você adquiriu **${safe(item.name)}** por ${fmt.format(chargedPrice)} ${safe(config.economy.currency)}${discount ? ` (desconto de ${discount}%)` : ''}.`, files: [receiptAttachment(receipt, 'cupom-fiscal')] });
    }
    let gift;
    let buff;
    ctx.store.transaction(() => {
      const account = ctx.store.account(i.guildId, i.user.id);
      if (account.balance < chargedPrice) throw new Error(`Saldo insuficiente. Faltam ${fmt.format(chargedPrice - account.balance)} ${safe(config.economy.currency)}.`);
      ctx.store.changeAccount(i.guildId, i.user.id, { balance: account.balance - chargedPrice });
      ctx.store.set('purchases', purchaseId, { id: purchaseId, guild: i.guildId, user: i.user.id, productId: item.id, name: item.name, price: chargedPrice, originalPrice: item.price, discountPercent: discount, createdAt: Date.now(), state: item.kind === 'vip' ? 'giftcard' : 'activated' });
      if (item.kind === 'vip') gift = createGiftCard(ctx, i.guildId, i.user.id, item, purchaseId);
      else buff = activateBuff(ctx, i.guildId, i.user.id, item, purchaseId);
    });
    if (couponRecord) {
      couponRecord.usedAt = Date.now();
      couponRecord.active = false;
      couponRecord.purchaseId = purchaseId;
      ctx.store.set('booster-coupons', couponRecord.id, couponRecord);
    }
    const receipt = { kind: item.kind === 'vip' ? 'GIFT CARD' : 'COMPRA', guildName: i.guild.name, username: i.user.username, userId: i.user.id, product: item.name, amount: chargedPrice, currency: config.economy.currency, code: gift?.code ?? '', duration: item.durationLabel, transactionId: purchaseId };
    const description = item.kind === 'vip'
      ? `Seu gift card foi gerado. Resgate no painel VIP.\n\n**Código:** \`${gift.code}\`${discount ? `\n**Cupom aplicado:** ${discount}% de desconto` : ''}`
      : `O buff **${safe(item.name)}** está ativo até <t:${Math.floor(buff.expiresAt / 1000)}:F>.`;
    await i.user.send({ embeds: [embed(config, '🧾 Compra aprovada', description)], files: [receiptAttachment(receipt, 'cupom-fiscal')], allowedMentions: { parse: [] } }).catch(() => {});
    return i.editReply({ embeds: [embed(config, 'Compra aprovada', `${description}\n\nOs detalhes da compra foram enviados para sua DM.`)], files: [receiptAttachment(receipt, 'cupom-fiscal')] });
  } finally {
    locks.delete(lock);
  }
}

export async function shopComponent(i, ctx) {
  const [, action, argument] = i.customId.split(':');
  if (action === 'home') return i.update(shopView(ctx, i.guild));
  if (action === 'categories') return i.reply({ ...shopCategoriesView(ctx, i.guild), flags: 64 });
  if (action === 'category') return i.update(shopCategoryView(ctx, i.guild, i.values?.[0]));
  if (action === 'product') return i.showModal(couponModal(i.values?.[0]));
  if (action === 'balance') {
    const config = ctx.store.config(i.guildId);
    const account = ctx.store.account(i.guildId, i.user.id);
    return reply(i, `💰 Seu saldo: **${fmt.format(account.balance)} ${safe(config.economy.currency)}** · Banco: **${fmt.format(account.bank)}**.`);
  }
  if (action === 'refresh') return i.update(shopView(ctx, i.guild));
  if (action === 'coupon') return purchaseProduct(i, ctx, argument, i.fields.getTextInputValue('coupon'));
  throw new Error('Controle da loja inválido.');
}

export async function configureShopPanel(i, ctx, channel = i.channel) {
  requireUser(i, 32);
  if (!channel?.isTextBased()) throw new Error('Escolha um canal de texto.');
  const previous = ctx.store.get('shop-panels', i.guildId);
  if (previous?.channel && previous?.message) {
    const oldChannel = await i.guild.channels.fetch(previous.channel).catch(() => null);
    await oldChannel?.messages.delete(previous.message).catch(() => {});
  }
  const message = await channel.send(shopView(ctx, i.guild));
  ctx.store.set('shop-panels', i.guildId, { guild: i.guildId, channel: channel.id, message: message.id, updatedAt: Date.now() });
  return message;
}
