import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  ButtonStyle,
  ChannelType,
  AttachmentBuilder,
  PermissionFlagsBits as P,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import {
  CONFIG_PAGES,
  SETTINGS,
  DEFAULT_CONFIG,
  getPath,
  setPath,
  parseSetting,
} from '../core/config.js';
import { row, button, safe, truncate, onoff, reply, update } from '../core/ui.js';
import { requireUser, validateSettingReference } from '../core/permissions.js';
import { audit } from '../core/log.js';
import { ticketDepartments } from './tickets.js';
import { shopCategories } from './shop.js';
const settingValue = (setting, value) =>
  setting.type === 'boolean'
    ? onoff(value)
    : ['channel', 'category', 'voice'].includes(setting.type)
      ? value
        ? `<#${value}>`
        : 'Não definido'
      : setting.type === 'role'
        ? value
          ? `<@&${value}>`
          : 'Não definido'
        : setting.type === 'roles'
          ? value
            ? value
                .split(/\s+/)
                .map((id) => `<@&${id}>`)
                .join(' ')
            : 'Não definido'
          : safe(truncate(value || 'Não definido', 130));

const departmentsFor = (ctx, guildId) => ticketDepartments(ctx, guildId);

const departmentModal = (owner, department = null) => {
  const field = (id, label, value, max, required = true) => {
    const input = new TextInputBuilder()
      .setCustomId(id)
      .setStyle(id === 'description' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(required)
      .setMaxLength(max);
    if (value) input.setValue(String(value));
    return new LabelBuilder().setLabel(label).setTextInputComponent(input);
  };
  return new ModalBuilder()
    .setCustomId(`cfg:deptsave:${owner}:${department?.id ?? 'new'}`)
    .setTitle(department ? 'Editar departamento' : 'Criar departamento')
    .addLabelComponents(
      field('name', 'Nome', department?.name, 50),
      field('description', 'Descrição', department?.description, 500),
      field('emoji', 'Emoji', department?.emoji ?? '🎫', 10),
      field('categoryId', 'ID da categoria (opcional)', department?.categoryId, 20, false),
      field('roleId', 'ID do cargo atendente (opcional)', department?.roleId, 20, false),
    );
};

const shopCategoryModal = (owner, category = null) =>
  new ModalBuilder()
    .setCustomId(`cfg:shopcatsave:${owner}:${category?.id ?? 'new'}`)
    .setTitle(category ? 'Editar categoria da loja' : 'Nova categoria da loja')
    .addLabelComponents(
      new LabelBuilder().setLabel('Nome').setTextInputComponent(new TextInputBuilder().setCustomId('name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50).setValue(category?.name ?? '')),
      new LabelBuilder().setLabel('Descrição').setTextInputComponent(new TextInputBuilder().setCustomId('description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(category?.description ?? '')),
      new LabelBuilder().setLabel('Emoji').setDescription('Um emoji para identificar a categoria.').setTextInputComponent(new TextInputBuilder().setCustomId('emoji').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setValue(category?.emoji ?? '🛍️')),
    );

const shopProductModal = (owner, product = null, categories = []) =>
  new ModalBuilder()
    .setCustomId(`cfg:shopprodsave:${owner}:${product?.id ?? 'new'}`)
    .setTitle(product ? 'Editar produto da loja' : 'Novo produto da loja')
    .addLabelComponents(
      new LabelBuilder().setLabel('Nome').setTextInputComponent(new TextInputBuilder().setCustomId('name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(product?.name ?? '')),
      new LabelBuilder().setLabel('Descrição').setTextInputComponent(new TextInputBuilder().setCustomId('description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(product?.description ?? '')),
      new LabelBuilder().setLabel('Preço em moedas').setTextInputComponent(new TextInputBuilder().setCustomId('price').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setValue(product?.price ? String(product.price) : '10000')),
      new LabelBuilder().setLabel('ID do cargo').setDescription('O cargo será entregue após a compra.').setTextInputComponent(new TextInputBuilder().setCustomId('role').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setValue(product?.role ?? '')),
      new LabelBuilder().setLabel(truncate(`Categoria (${categories.slice(0, 3).map((category) => `${category.id}=${category.name}`).join(', ')})`, 45)).setTextInputComponent(new TextInputBuilder().setCustomId('category').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setValue(product?.category ?? categories[0]?.id ?? 'servidor')),
    );
export function configView(
  ctx,
  guildId,
  owner,
  page = 'overview',
  selected = null,
  notice = '',
  commandPage = 0,
) {
  const c = ctx.store.config(guildId),
    p = CONFIG_PAGES[page] ?? CONFIG_PAGES.overview;
  const box = new ContainerBuilder().setAccentColor(parseInt(c.appearance.color.slice(1), 16));
  box.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ⚙️ ${safe(c.appearance.name)}\n**CONTROLE DO SERVIDOR** · revisão \`${c.revision}\`\n${notice ? `✅ ${safe(notice)}\n` : ''}As alterações são salvas e o painel reflete o estado atual.`,
    ),
  );
  box.addSeparatorComponents(new SeparatorBuilder());
  let detail =
    page === 'overview'
      ? `# Olá! Como vamos configurar nosso bot hoje?\n\n**${Object.values(c.modules).filter(Boolean).length}/${Object.keys(c.modules).length} módulos ativos** · **${ctx.commands?.size ?? 0} comandos**\n**IA:** ${ctx.ai?.configured ? `${ctx.ai.providerName} conectada` : 'aguardando chave da IA'}\n**Respostas:** privadas por padrão · ${c.access.publicCommands.split('\n').filter(Boolean).length} públicas\n**Armazenamento:** SQLite persistente\n\nEscolha uma seção abaixo. Canais e cargos usam seletores nativos; textos abrem um editor seguro. Em **Sugestão de IA**, o NEXUS analisa a estrutura atual e propõe melhorias para identidade, cargos, canais, AutoMod e tickets.\n\nVariáveis de boas-vindas: \`{user}\`, \`{username}\`, \`{server}\`, \`{count}\`.`
      : `### ${p.icon} ${p.label}\n` +
        p.settings.map((s) => `**${s.label}:** ${settingValue(s, getPath(c, s.key))}`).join('\n');
  if (page === 'overview')
    detail = `# Olá! Como vamos configurar nosso bot hoje?\n\n**${Object.values(c.modules).filter(Boolean).length}/${Object.keys(c.modules).length} módulos ativos** · **${ctx.commands?.size ?? 0} comandos**\n**Respostas:** privadas por padrão · ${c.access.publicCommands.split('\n').filter(Boolean).length} públicas\n**Armazenamento:** SQLite persistente\n\nEscolha uma seção abaixo. Canais e cargos usam seletores nativos; textos abrem um editor seguro.`;
  if (page === 'ticket_departments') {
    const departments = departmentsFor(ctx, guildId);
    const current = departments.find((department) => department.id === selected);
    detail = `### 🏥 Departamentos de atendimento\n${
      departments.length
        ? departments
            .map(
              (department) =>
                `${department.emoji || '🎫'} **${safe(department.name)}** · ${department.roleId ? `<@&${department.roleId}>` : 'equipe padrão'} · ${department.categoryId ? `<#${department.categoryId}>` : 'categoria padrão'}`,
            )
            .join('\n')
        : 'Nenhum departamento criado. O painel usará Atendimento geral.'
    }${
      current
        ? `\n\n**Selecionado:** ${current.emoji || '🎫'} ${safe(current.name)}\n${safe(current.description)}`
        : ''
    }\n\nCrie até 25 filas. Cada uma pode usar categoria e cargo próprios; deixe os IDs vazios para herdar a estrutura padrão.`;
  }
  if (page === 'shop_catalog') {
    const categories = shopCategories(ctx, guildId);
    const products = ctx.store.list('shop').filter((product) => product.guild === guildId);
    const selectedCategory = categories.find((category) => category.id === selected);
    detail = `### 🛍️ Catálogo da loja\n${categories.map((category) => `${category.emoji || '🛍️'} **${safe(category.name)}** · ${safe(category.description || 'Sem descrição')} · **${products.filter((product) => product.category === category.id).length} produto(s)**`).join('\n') || 'Nenhuma categoria criada.'}${selectedCategory ? `\n\n**Selecionada:** ${selectedCategory.emoji || '🛍️'} ${safe(selectedCategory.name)}` : ''}\n\n**Produtos personalizados:** ${products.length || 'nenhum'}\n\nCrie categorias para organizar a vitrine. Depois adicione produtos com preço, cargo e categoria. Os planos VIP e buffs padrão aparecem automaticamente na loja.`;
  }
  box.addTextDisplayComponents(new TextDisplayBuilder().setContent(detail));
  box.addActionRowComponents(
    row(
      new StringSelectMenuBuilder()
        .setCustomId(`cfg:page:${owner}`)
        .setPlaceholder('Escolha a seção')
        .addOptions(
          Object.entries(CONFIG_PAGES).map(([key, p]) => ({
            label: p.label,
            value: key,
            emoji: p.icon,
            default: key === page,
          })),
        ),
    ),
  );
  if (p.settings.length)
    box.addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(`cfg:setting:${owner}:${page}`)
          .setPlaceholder('Escolha a configuração para alterar')
          .addOptions(
            p.settings.map((s) => ({
              label: s.label,
              value: s.key,
              description: truncate(String(getPath(c, s.key)), 90) || 'Não definido',
              default: s.key === selected,
            })),
          ),
      ),
    );
  if (page === 'ticket_departments') {
    const departments = departmentsFor(ctx, guildId);
    if (departments.length)
      box.addActionRowComponents(
        row(
          new StringSelectMenuBuilder()
            .setCustomId(`cfg:department:${owner}`)
            .setPlaceholder('Escolha um departamento')
            .addOptions(
              departments.slice(0, 25).map((department) => ({
                label: truncate(department.name, 100),
                value: department.id,
                emoji: department.emoji || '🎫',
                description: truncate(department.description, 90),
                default: department.id === selected,
              })),
            ),
        ),
      );
    box.addActionRowComponents(
      row(
        button(`cfg:deptadd:${owner}`, 'Criar departamento', ButtonStyle.Primary),
        ...(selected
          ? [
              button(`cfg:deptedit:${owner}:${selected}`, 'Editar'),
              button(`cfg:deptdelete:${owner}:${selected}`, 'Excluir', ButtonStyle.Danger),
            ]
          : []),
      ),
    );
  }
  if (page === 'shop_catalog') {
    const categories = shopCategories(ctx, guildId);
    const products = ctx.store.list('shop').filter((product) => product.guild === guildId);
    box.addActionRowComponents(
      row(
        new StringSelectMenuBuilder().setCustomId(`cfg:shopcategory:${owner}`).setPlaceholder('Selecionar categoria').addOptions(
          categories.slice(0, 25).map((category) => ({ label: truncate(category.name, 100), value: category.id, emoji: category.emoji || '🛍️' })),
        ),
      ),
    );
    if (products.length)
      box.addActionRowComponents(
        row(
          new StringSelectMenuBuilder().setCustomId(`cfg:shopproduct:${owner}`).setPlaceholder('Selecionar produto personalizado').addOptions(
            products.slice(0, 25).map((product) => ({ label: truncate(product.name, 100), value: product.id, description: `${product.price} moedas` })),
          ),
        ),
      );
    box.addActionRowComponents(
      row(
        button(`cfg:shopcatadd:${owner}`, 'Nova categoria', ButtonStyle.Primary),
        button(`cfg:shopprodadd:${owner}`, 'Novo produto', ButtonStyle.Success),
        ...(selected
          ? [button(`cfg:shopcatedit:${owner}:${selected}`, 'Editar categoria'), button(`cfg:shopcatdelete:${owner}:${selected}`, 'Excluir categoria', ButtonStyle.Danger)]
          : []),
      ),
    );
  }
  if (page === 'access' && ctx.commands?.size) {
    const all = [...ctx.commands.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const total = Math.ceil(all.length / 25);
    const currentPage = Math.max(0, Math.min(total - 1, Number(commandPage) || 0));
    const visible = all.slice(currentPage * 25, currentPage * 25 + 25);
    const publicCommands = new Set(
      c.access.publicCommands
        .split('\n')
        .map((name) => name.trim())
        .filter(Boolean),
    );
    box.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### 👁️ Visibilidade rápida · página ${currentPage + 1}/${total}\nSelecione os comandos abaixo que devem responder publicamente. Os não selecionados respondem somente para quem executou.`,
      ),
    );
    box.addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(`cfg:visibility:${owner}:${currentPage}`)
          .setPlaceholder('Escolha as respostas públicas desta página')
          .setMinValues(0)
          .setMaxValues(visible.length)
          .addOptions(
            visible.map((command) => ({
              label: `/${command.name}`,
              value: command.name,
              description: truncate(command.data.description, 90),
              default: publicCommands.has(command.name),
            })),
          ),
      ),
    );
    if (total > 1)
      box.addActionRowComponents(
        row(
          button(`cfg:commandpage:${owner}:${currentPage - 1}`, 'Página anterior').setDisabled(
            currentPage === 0,
          ),
          button(`cfg:commandpage:${owner}:${currentPage + 1}`, 'Próxima página').setDisabled(
            currentPage === total - 1,
          ),
        ),
      );
  }
  const s = SETTINGS.find((s) => s.key === selected);
  if (s && ['channel', 'category', 'voice', 'role', 'roles'].includes(s.type)) {
    const menu = ['role', 'roles'].includes(s.type)
      ? new RoleSelectMenuBuilder()
          .setCustomId(`cfg:reference:${owner}:${s.key}`)
          .setPlaceholder(s.label)
          .setMinValues(0)
          .setMaxValues(s.type === 'roles' ? (s.maxValues ?? 10) : 1)
      : new ChannelSelectMenuBuilder()
          .setCustomId(`cfg:reference:${owner}:${s.key}`)
          .setPlaceholder(s.label)
          .setMinValues(0)
          .setMaxValues(1)
          .setChannelTypes(
            s.type === 'category'
              ? ChannelType.GuildCategory
              : s.type === 'voice'
                ? ChannelType.GuildVoice
                : ChannelType.GuildText,
            ...(['category', 'voice'].includes(s.type) ? [] : [ChannelType.GuildAnnouncement]),
          );
    const current = getPath(c, s.key);
    if (current) {
      if (s.type === 'role') menu.setDefaultRoles(current);
      else if (s.type === 'roles') menu.setDefaultRoles(...current.split(/\s+/).filter(Boolean));
      else menu.setDefaultChannels(current);
    }
    box.addActionRowComponents(row(menu));
  }
  if (s?.type === 'enum')
    box.addActionRowComponents(
      row(
        new StringSelectMenuBuilder()
          .setCustomId(`cfg:enum:${owner}:${s.key}`)
          .setPlaceholder(s.label)
          .addOptions(
            s.values.map((value) => ({
              label: value,
              value,
              default: value === getPath(c, s.key),
            })),
          ),
      ),
    );
  box.addActionRowComponents(
    row(
      button(`cfg:refresh:${owner}:${page}`, 'Atualizar'),
      button(`cfg:export:${owner}`, 'Exportar JSON'),
      button(`cfg:reset:${owner}`, 'Restaurar padrão', ButtonStyle.Danger),
    ),
  );
  return { components: [box], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}
export async function configComponent(i, ctx) {
  const [, action, owner, arg] = i.customId.split(':');
  requireUser(i, P.ManageGuild);
  if (owner !== i.user.id) throw new Error('Abra seu próprio painel com /botconfig.');
  const c = ctx.store.config(i.guildId);
  if (action === 'commandpage')
    return i.update(configView(ctx, i.guildId, owner, 'access', null, '', Number(arg)));
  if (action === 'visibility') {
    const all = [...ctx.commands.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const commandPage = Math.max(0, Number(arg) || 0);
    const pageNames = new Set(
      all.slice(commandPage * 25, commandPage * 25 + 25).map((cmd) => cmd.name),
    );
    const publicCommands = new Set(
      c.access.publicCommands
        .split('\n')
        .map((name) => name.trim())
        .filter((name) => name && !pageNames.has(name)),
    );
    for (const name of i.values) if (pageNames.has(name)) publicCommands.add(name);
    c.access.publicCommands = [...publicCommands].sort().join('\n');
    ctx.store.saveConfig(i.guildId, c);
    await i.update(
      configView(
        ctx,
        i.guildId,
        owner,
        'access',
        null,
        'Visibilidade dos comandos atualizada.',
        commandPage,
      ),
    );
    return audit(
      ctx,
      i.guild,
      '👁️ Visibilidade dos comandos',
      `${i.user.tag} atualizou as respostas públicas na página ${commandPage + 1}.`,
    );
  }
  if (action === 'export')
    return reply(i, {
      files: [
        new AttachmentBuilder(Buffer.from(JSON.stringify(c, null, 2)), {
          name: 'sanatorio-config.json',
        }),
      ],
    });
  if (action === 'reset')
    return i.update({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7c3aed)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              '## Restaurar configurações?\nCanais, dados de membros, avisos e resultados não são apagados. As preferências retornam ao padrão.',
            ),
          )
          .addActionRowComponents(
            row(
              button(`cfg:confirm:${owner}`, 'Confirmar restauração', ButtonStyle.Danger),
              button(`cfg:refresh:${owner}:overview`, 'Cancelar'),
            ),
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  if (action === 'confirm') {
    ctx.store.saveConfig(i.guildId, DEFAULT_CONFIG);
    await i.update(
      configView(ctx, i.guildId, owner, 'overview', null, 'Preferências restauradas.'),
    );
    return audit(
      ctx,
      i.guild,
      '⚙️ Configuração restaurada',
      `${i.user.tag} restaurou as preferências.`,
    );
  }
  if (action === 'department')
    return i.update(configView(ctx, i.guildId, owner, 'ticket_departments', i.values[0]));
  if (action === 'deptadd') {
    if (departmentsFor(ctx, i.guildId).length >= 25)
      throw new Error('O limite é de 25 departamentos por servidor.');
    return i.showModal(departmentModal(owner));
  }
  if (action === 'deptedit') {
    const department = ctx.store.get('ticket-departments', `${i.guildId}:${arg}`);
    if (!department || department.guild !== i.guildId)
      throw new Error('Departamento não encontrado.');
    return i.showModal(departmentModal(owner, department));
  }
  if (action === 'deptdelete') {
    const department = ctx.store.get('ticket-departments', `${i.guildId}:${arg}`);
    if (!department || department.guild !== i.guildId)
      throw new Error('Departamento não encontrado.');
    ctx.store.delete('ticket-departments', `${i.guildId}:${arg}`);
    await i.update(
      configView(ctx, i.guildId, owner, 'ticket_departments', null, 'Departamento excluído.'),
    );
    return audit(
      ctx,
      i.guild,
      '🏥 Departamento excluído',
      `${i.user.tag} excluiu ${safe(department.name)}.`,
    );
  }
  if (action === 'deptsave') {
    await i.deferUpdate();
    const name = i.fields.getTextInputValue('name').trim();
    const description = i.fields.getTextInputValue('description').trim();
    const emoji = i.fields.getTextInputValue('emoji').trim();
    const categoryId = i.fields.getTextInputValue('categoryId').trim();
    const roleId = i.fields.getTextInputValue('roleId').trim();
    if (!name || !description) throw new Error('Nome e descrição são obrigatórios.');
    if ((categoryId && !/^\d{17,20}$/.test(categoryId)) || (roleId && !/^\d{17,20}$/.test(roleId)))
      throw new Error('Categoria ou cargo com ID inválido.');
    if (categoryId) {
      const category = await i.guild.channels.fetch(categoryId).catch(() => null);
      if (category?.type !== ChannelType.GuildCategory)
        throw new Error('O ID de categoria não aponta para uma categoria deste servidor.');
    }
    if (roleId) {
      const role = await i.guild.roles.fetch(roleId).catch(() => null);
      if (!role || role.id === i.guildId) throw new Error('Cargo do departamento inválido.');
    }
    const id = arg === 'new' ? randomBytes(5).toString('hex') : arg;
    const previous = ctx.store.get('ticket-departments', `${i.guildId}:${id}`);
    if (arg !== 'new' && (!previous || previous.guild !== i.guildId))
      throw new Error('Departamento não encontrado.');
    ctx.store.set('ticket-departments', `${i.guildId}:${id}`, {
      id,
      guild: i.guildId,
      name,
      description,
      emoji: emoji || '🎫',
      categoryId,
      roleId,
      createdAt: previous?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    await update(
      i,
      configView(
        ctx,
        i.guildId,
        owner,
        'ticket_departments',
        id,
        previous ? 'Departamento atualizado.' : 'Departamento criado.',
      ),
    );
    return audit(
      ctx,
      i.guild,
      previous ? '🏥 Departamento atualizado' : '🏥 Departamento criado',
      `${i.user.tag}: ${safe(name)}.`,
    );
  }
  if (action === 'shopcatadd') return i.showModal(shopCategoryModal(owner));
  if (action === 'shopcatedit') {
    const category = ctx.store.get('shop-categories', `${i.guildId}:${arg}`);
    if (!category || category.guild !== i.guildId) throw new Error('Categoria da loja não encontrada.');
    return i.showModal(shopCategoryModal(owner, category));
  }
  if (action === 'shopcatdelete') {
    const category = ctx.store.get('shop-categories', `${i.guildId}:${arg}`);
    if (!category || category.guild !== i.guildId) throw new Error('Categoria da loja não encontrada.');
    if (['vip', 'buffs', 'servidor'].includes(category.id)) throw new Error('As categorias padrão não podem ser excluídas.');
    if (ctx.store.list('shop').some((product) => product.guild === i.guildId && product.category === category.id))
      throw new Error('Mova ou exclua os produtos desta categoria antes de removê-la.');
    ctx.store.delete('shop-categories', `${i.guildId}:${arg}`);
    await i.update(configView(ctx, i.guildId, owner, 'shop_catalog', null, 'Categoria excluída.'));
    return audit(ctx, i.guild, '🛍️ Categoria da loja excluída', `${i.user.tag}: ${safe(category.name)}.`);
  }
  if (action === 'shopcategory')
    return i.update(configView(ctx, i.guildId, owner, 'shop_catalog', i.values[0]));
  if (action === 'shopprodadd')
    return i.showModal(shopProductModal(owner, null, shopCategories(ctx, i.guildId)));
  if (action === 'shopproduct') {
    const product = ctx.store.get('shop', i.values[0]);
    if (!product || product.guild !== i.guildId) throw new Error('Produto da loja não encontrado.');
    return i.showModal(shopProductModal(owner, product, shopCategories(ctx, i.guildId)));
  }
  if (action === 'shopcatsave') {
    await i.deferUpdate();
    const name = i.fields.getTextInputValue('name').trim();
    const description = i.fields.getTextInputValue('description').trim();
    const emoji = i.fields.getTextInputValue('emoji').trim() || '🛍️';
    if (!name) throw new Error('Informe um nome para a categoria.');
    const id = arg === 'new'
      ? `${name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28)}-${randomBytes(2).toString('hex')}`
      : arg;
    const previous = ctx.store.get('shop-categories', `${i.guildId}:${id}`);
    ctx.store.set('shop-categories', `${i.guildId}:${id}`, {
      id,
      guild: i.guildId,
      name,
      description,
      emoji,
      order: previous?.order ?? ctx.store.list('shop-categories').filter((item) => item.guild === i.guildId).length,
      enabled: true,
      createdAt: previous?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    await update(i, configView(ctx, i.guildId, owner, 'shop_catalog', id, previous ? 'Categoria atualizada.' : 'Categoria criada.'));
    return audit(ctx, i.guild, '🛍️ Categoria da loja salva', `${i.user.tag}: ${safe(name)}.`);
  }
  if (action === 'shopprodsave') {
    await i.deferUpdate();
    const name = i.fields.getTextInputValue('name').trim();
    const description = i.fields.getTextInputValue('description').trim();
    const price = Number(i.fields.getTextInputValue('price'));
    const role = i.fields.getTextInputValue('role').trim();
    const category = i.fields.getTextInputValue('category').trim();
    if (!name || !Number.isSafeInteger(price) || price < 1 || price > 100000000) throw new Error('Informe nome e preço inteiro entre 1 e 100000000.');
    if (!/^\d{17,20}$/.test(role)) throw new Error('Informe um ID de cargo válido.');
    if (!shopCategories(ctx, i.guildId).some((item) => item.id === category)) throw new Error('A categoria informada não existe.');
    const discordRole = await i.guild.roles.fetch(role).catch(() => null);
    if (!discordRole || discordRole.id === i.guildId) throw new Error('Cargo não encontrado neste servidor.');
    const id = arg === 'new' ? `custom-${randomBytes(6).toString('hex')}` : arg;
    const previous = ctx.store.get('shop', id);
    ctx.store.set('shop', id, { id, guild: i.guildId, name, description, price, role, category, emoji: '🎨', createdAt: previous?.createdAt ?? Date.now(), updatedAt: Date.now() });
    await update(i, configView(ctx, i.guildId, owner, 'shop_catalog', category, previous ? 'Produto atualizado.' : 'Produto criado.'));
    return audit(ctx, i.guild, '🛍️ Produto da loja salvo', `${i.user.tag}: ${safe(name)}.`);
  }
  if (action === 'page' || action === 'refresh')
    return i.update(configView(ctx, i.guildId, owner, action === 'page' ? i.values[0] : arg));
  const key = action === 'setting' ? i.values[0] : arg,
    s = SETTINGS.find((s) => s.key === key);
  if (!s) throw new Error('Configuração inválida.');
  const page = Object.keys(CONFIG_PAGES).find((k) => CONFIG_PAGES[k].settings.includes(s));
  if (action === 'setting') {
    if (s.type === 'boolean') {
      setPath(c, key, !getPath(c, key));
      ctx.store.saveConfig(i.guildId, c);
      await i.update(configView(ctx, i.guildId, owner, page, null, `${s.label} atualizado.`));
      return audit(
        ctx,
        i.guild,
        '⚙️ Configuração alterada',
        `${i.user.tag}: ${key} = ${getPath(c, key)}`,
      );
    }
    if (['channel', 'category', 'voice', 'role', 'roles'].includes(s.type))
      return i.update(configView(ctx, i.guildId, owner, page, key));
    if (s.type === 'enum') return i.update(configView(ctx, i.guildId, owner, page, key));
    const input = new TextInputBuilder()
      .setCustomId('value')
      .setStyle(
        ['multiline', 'ids', 'rewards', 'commandlist'].includes(s.type)
          ? TextInputStyle.Paragraph
          : TextInputStyle.Short,
      )
      .setRequired(!['multiline', 'ids', 'rewards', 'commandlist'].includes(s.type))
      .setMaxLength(s.max ?? 1800);
    const value = String(getPath(c, key) ?? '');
    if (value) input.setValue(value);
    return i.showModal(
      new ModalBuilder()
        .setCustomId(`cfg:save:${owner}:${key}`)
        .setTitle('Editar configuração')
        .addLabelComponents(
          new LabelBuilder().setLabel(truncate(s.label, 45)).setTextInputComponent(input),
        ),
    );
  }
  await i.deferUpdate();
  const raw =
      action === 'reference'
        ? s.type === 'roles'
          ? i.values.join(' ')
          : (i.values[0] ?? '')
        : action === 'enum'
          ? i.values[0]
          : i.fields.getTextInputValue('value'),
    value = parseSetting(s, raw);
  await validateSettingReference(i, s, value);
  if (
    s.type === 'commandlist' &&
    value
      .split('\n')
      .filter(Boolean)
      .some((name) => !ctx.commands.has(name.trim()))
  )
    throw new Error('Um dos comandos informados não existe. Consulte /ajuda.');
  const fresh = ctx.store.config(i.guildId);
  setPath(fresh, key, value);
  ctx.store.saveConfig(i.guildId, fresh);
  await update(i, configView(ctx, i.guildId, owner, page, null, `${s.label} atualizado.`));
  await audit(ctx, i.guild, '⚙️ Configuração alterada', `${i.user.tag}: ${key} atualizado.`);
}
