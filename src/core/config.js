export const DEFAULT_CONFIG = {
  appearance: {
    name: 'NEXUS • Sanatório',
    color: '#7C3AED',
    footer: 'SANATÓRIO / CENTRAL DE CONTROLE',
  },
  modules: {
    moderation: true,
    automod: true,
    community: true,
    tickets: true,
    tempcalls: true,
    verification: true,
    levels: true,
    economy: true,
    fun: true,
    utilities: true,
  },
  access: { disabledCommands: '', publicCommands: '', cooldownSeconds: 2 },
  welcome: {
    channelId: '',
    goodbyeChannelId: '',
    roleId: '',
    dm: false,
    message: 'Bem-vindo(a), {user}, ao **{server}**! Leia as regras e complete sua verificação.',
    goodbyeMessage: '**{username}** recebeu alta do {server}.',
  },
  logs: { channelId: '', messages: false, members: true, moderation: true },
  moderation: { dm: true, warnThreshold: 3, timeoutMinutes: 10 },
  automod: {
    enabled: true,
    invites: true,
    links: false,
    spam: true,
    duplicates: 4,
    duplicateWindowSeconds: 45,
    spamMessages: 8,
    spamWindowSeconds: 8,
    mentions: 7,
    capsPercent: 90,
    maxLines: 25,
    maxEmojis: 18,
    newAccountHours: 0,
    blockFiles: false,
    blockedExtensions: 'exe\nscr\nbat\ncmd\ncom\nmsi\njar',
    deleteMessages: true,
    words: '',
    ignoredChannels: '',
    ignoredRoles: '',
    warnDm: true,
    timeoutAfterViolations: 3,
    violationWindowMinutes: 15,
    timeoutMinutes: 10,
  },
  tickets: {
    categoryId: '',
    staffRoleId: '',
    supervisorRoleId: '',
    adminRoleId: '',
    maxPerUser: 1,
    cooldownMinutes: 5,
    duplicateWindowMinutes: 60,
    blockDuplicates: true,
    transcriptChannelId: '',
    dmTranscript: true,
    transcriptFormat: 'html',
    logChannelId: '',
    pingStaff: true,
    autoAssign: false,
    welcomeDm: false,
    notifyUserDm: true,
    inactivityReminderMinutes: 60,
    autoCloseHours: 48,
    closeWarningMinutes: 30,
    slaMinutes: 120,
    deleteAfterCloseMinutes: 30,
    ratingsEnabled: true,
    ratingsChannelId: '',
    ratingAnonymous: false,
    ownerCanClose: true,
    attendantCanClose: true,
    supervisorCanManage: true,
    vipPriority: true,
    panelTitle: 'Central de atendimento',
    panelColor: '#7C3AED',
    panelImageUrl: '',
    panelButtonLabel: 'Abrir atendimento',
    panelButtonStyle: 'primary',
    message: 'Precisa de atendimento? Abra um chamado particular com a enfermaria.',
    openMessage:
      'Olá, {user}! Recebemos seu chamado sobre **{subject}**. Envie todos os detalhes e aguarde um atendente.',
    closeMessage: 'Atendimento encerrado. Obrigado por falar com a equipe.',
    reminderMessage: 'Este atendimento está sem novas mensagens. Responda para mantê-lo aberto.',
    quickReplies:
      'Boas-vindas|Olá! Já recebemos sua solicitação e vamos analisar.\nAguardando usuário|Precisamos de mais informações para continuar. Pode nos responder?\nResolvido|A solicitação foi resolvida. Posso ajudar em algo mais?',
  },
  tempcalls: {
    enabled: true,
    categoryId: '',
    vipCategoryId: '',
    lobbyChannelId: '',
    vipLobbyChannelId: '',
    vipRoleIds: '1564360201660801156 1564359909649289316',
    normalUserLimit: 10,
    vipUserLimit: 25,
    normalBitrateKbps: 64,
    vipBitrateKbps: 96,
    allowNormalRename: true,
    panelTitle: 'Salas temporárias',
    panelMessage:
      'Crie uma sala de voz privada em segundos. A sala é removida automaticamente quando ficar vazia.',
    vipPanelMessage:
      'Membros VIP podem personalizar nome, limite, privacidade, bitrate, acesso e proprietário da sala.',
    logChannelId: '',
  },
  verification: {
    roleId: '',
    logChannelId: '',
    captchaLength: 6,
    expiresMinutes: 5,
    maxAttempts: 3,
    blockMinutes: 5,
    minAccountHours: 0,
    message:
      'Bem-vindo(a)! Confirme que você é uma pessoa para liberar seu acesso completo ao servidor.',
  },
  levels: { xpPerMessage: 20, cooldownSeconds: 60, announceChannelId: '', rewards: '' },
  economy: {
    currency: 'moedas',
    daily: 750,
    workMin: 750,
    workMax: 1500,
    workCooldownMinutes: 20,
    workChannelId: '',
    workPanelChannelId: '',
    scratchChannelId: '',
    scratchPrice: 500,
    scratchJackpot: 5000000,
    vipNormalMultiplier: 135,
    vipPlusMultiplier: 200,
    vipNexusMultiplier: 250,
    receiptDm: true,
  },
  vip: {
    normalRoleId: '1564359412888379482',
    plusRoleId: '1564360201660801156',
    nexusRoleId: '1564359909649289316',
    redemptionChannelId: '',
    logChannelId: '',
    expiryReminderDays: 7,
    nexusCategoryName: 'N3XUS • {username}',
    nexusRolePrefix: '♛',
    normal1mPrice: 45000,
    normal3mPrice: 115000,
    normal1yPrice: 360000,
    normalLifetimePrice: 800000,
    plus1mPrice: 75000,
    plus3mPrice: 195000,
    plus1yPrice: 600000,
    plusLifetimePrice: 1300000,
    nexus1mPrice: 120000,
    nexus3mPrice: 310000,
    nexus1yPrice: 950000,
    nexusLifetimePrice: 2000000,
  },
  community: {
    suggestionsChannelId: '',
    reportsChannelId: '',
    rulesIntro:
      'Este espaço existe para conversas seguras, organizadas e acolhedoras. Ao participar, você concorda com as orientações abaixo.',
    rules:
      '### 1. Respeito é obrigatório\n- Trate todos com educação. Discriminação, assédio, ameaças, perseguição e provocações direcionadas não são permitidos.\n- Discorde de ideias sem atacar pessoas.\n\n### 2. Conteúdo seguro\n- Não publique conteúdo ilegal, sexual explícito, chocante, malicioso ou que incentive dano.\n- Preserve a privacidade: não exponha dados, conversas ou imagens de terceiros sem autorização.\n\n### 3. Organização dos canais\n- Use cada canal para sua finalidade e evite spam, flood, mensagens repetidas e excesso de marcações.\n- Divulgação, convites e autopromoção exigem autorização da equipe.\n\n### 4. Identidade e convivência\n- Nomes, avatares, perfis e status devem respeitar estas regras. Não se passe por membros ou pela equipe.\n- Em canais de voz, evite ruídos intencionais, gravações sem consentimento e interrupções constantes.\n\n### 5. Segurança e integridade\n- Não compartilhe golpes, malware, links enganosos, métodos de invasão ou formas de burlar punições.\n- Contas alternativas usadas para evasão de moderação poderão ser removidas.\n\n### 6. Moderação\n- Siga as orientações da equipe. Se discordar de uma decisão, use o canal de denúncia ou abra um ticket; não transforme o chat em debate disciplinar.\n- As medidas podem incluir aviso, remoção de conteúdo, timeout, expulsão ou banimento, conforme gravidade e reincidência.',
    rulesFooter:
      'As Diretrizes da Comunidade e os Termos de Serviço do Discord também se aplicam. Use o botão abaixo para confirmar a leitura.',
  },
};

const s = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
export const CONFIG_PAGES = {
  overview: { label: 'Visão geral', icon: '🧠', settings: [] },
  appearance: {
    label: 'Identidade visual',
    icon: '🎨',
    settings: [
      s('appearance.name', 'Nome nos painéis', 'text', { max: 70 }),
      s('appearance.color', 'Cor hexadecimal', 'color'),
      s('appearance.footer', 'Rodapé', 'text', { max: 100 }),
    ],
  },
  modules: {
    label: 'Módulos e comandos',
    icon: '🧩',
    settings: Object.keys(DEFAULT_CONFIG.modules).map((k) =>
      s(
        `modules.${k}`,
        {
          moderation: 'Moderação',
          automod: 'Automoderação',
          community: 'Comunidade',
          tickets: 'Tickets',
          tempcalls: 'Salas temporárias',
          verification: 'Verificação',
          levels: 'Níveis',
          economy: 'Economia',
          fun: 'Diversão',
          utilities: 'Utilidades',
        }[k],
        'boolean',
      ),
    ),
  },
  access: {
    label: 'Comandos e respostas',
    icon: '🎛️',
    settings: [
      s('access.disabledCommands', 'Comandos desativados, um por linha', 'commandlist', {
        max: 1800,
      }),
      s('access.publicCommands', 'Respostas públicas, um comando por linha', 'commandlist', {
        max: 1800,
      }),
      s('access.cooldownSeconds', 'Intervalo entre usos do comando (segundos)', 'integer', {
        min: 1,
        max: 30,
      }),
    ],
  },
  welcome: {
    label: 'Admissão e alta',
    icon: '👋',
    settings: [
      s('welcome.channelId', 'Canal de entrada', 'channel'),
      s('welcome.goodbyeChannelId', 'Canal de saída', 'channel'),
      s('welcome.roleId', 'Cargo ao entrar', 'role', { assignable: true }),
      s('welcome.dm', 'Boas-vindas por DM', 'boolean'),
      s('welcome.message', 'Mensagem de entrada', 'multiline', { max: 1800 }),
      s('welcome.goodbyeMessage', 'Mensagem de saída', 'multiline', { max: 1800 }),
    ],
  },
  logs: {
    label: 'Caixa-preta / logs',
    icon: '📜',
    settings: [
      s('logs.channelId', 'Canal de logs', 'channel'),
      s('logs.messages', 'Registrar exclusões e edições', 'boolean'),
      s('logs.members', 'Registrar entradas e saídas', 'boolean'),
      s('logs.moderation', 'Registrar ações da equipe', 'boolean'),
    ],
  },
  moderation: {
    label: 'Moderação',
    icon: '🛡️',
    settings: [
      s('moderation.dm', 'Enviar punições por DM', 'boolean'),
      s('moderation.warnThreshold', 'Avisos para timeout automático', 'integer', {
        min: 0,
        max: 100,
      }),
      s('moderation.timeoutMinutes', 'Duração do timeout automático', 'integer', {
        min: 1,
        max: 40320,
      }),
    ],
  },
  automod: {
    label: 'Contenção automática',
    icon: '🚨',
    settings: [
      s('automod.enabled', 'Ativar automod', 'boolean'),
      s('automod.invites', 'Bloquear convites Discord', 'boolean'),
      s('automod.links', 'Bloquear links', 'boolean'),
      s('automod.spam', 'Bloquear rajadas de mensagens', 'boolean'),
      s('automod.spamMessages', 'Mensagens para considerar spam', 'integer', {
        min: 4,
        max: 20,
      }),
      s('automod.spamWindowSeconds', 'Janela do spam (segundos)', 'integer', {
        min: 3,
        max: 60,
      }),
      s('automod.duplicates', 'Mensagens repetidas para bloquear (0 desativa)', 'integer', {
        min: 0,
        max: 10,
      }),
      s('automod.duplicateWindowSeconds', 'Janela das repetições (segundos)', 'integer', {
        min: 5,
        max: 300,
      }),
      s('automod.mentions', 'Limite de menções (0 desativa)', 'integer', { min: 0, max: 50 }),
      s('automod.capsPercent', 'Limite de maiúsculas (0 desativa)', 'integer', {
        min: 0,
        max: 100,
      }),
      s('automod.maxLines', 'Máximo de linhas por mensagem (0 desativa)', 'integer', {
        min: 0,
        max: 100,
      }),
      s('automod.maxEmojis', 'Máximo de emojis por mensagem (0 desativa)', 'integer', {
        min: 0,
        max: 100,
      }),
      s('automod.newAccountHours', 'Idade mínima da conta em horas (0 desativa)', 'integer', {
        min: 0,
        max: 8760,
      }),
      s('automod.blockFiles', 'Bloquear extensões de arquivo listadas', 'boolean'),
      s('automod.blockedExtensions', 'Extensões bloqueadas, uma por linha', 'multiline', {
        max: 500,
      }),
      s('automod.deleteMessages', 'Apagar mensagens detectadas', 'boolean'),
      s('automod.words', 'Palavras bloqueadas, uma por linha', 'multiline', { max: 1500 }),
      s('automod.ignoredChannels', 'IDs de canais ignorados, separados por espaço', 'ids'),
      s('automod.ignoredRoles', 'IDs de cargos ignorados, separados por espaço', 'ids'),
      s('automod.warnDm', 'Avisar o membro por DM', 'boolean'),
      s('automod.timeoutAfterViolations', 'Infrações antes do timeout', 'integer', {
        min: 1,
        max: 10,
      }),
      s('automod.violationWindowMinutes', 'Janela das infrações (minutos)', 'integer', {
        min: 1,
        max: 1440,
      }),
      s('automod.timeoutMinutes', 'Timeout por infração (0 desativa)', 'integer', {
        min: 0,
        max: 40320,
      }),
    ],
  },
  tickets: {
    label: 'Tickets · estrutura',
    icon: '🎫',
    settings: [
      s('tickets.categoryId', 'Categoria dos chamados', 'category'),
      s('tickets.staffRoleId', 'Cargo de atendentes', 'role'),
      s('tickets.supervisorRoleId', 'Cargo de supervisores', 'role'),
      s('tickets.adminRoleId', 'Cargo de administradores de tickets', 'role'),
      s('tickets.logChannelId', 'Canal de auditoria dos tickets', 'channel'),
      s('tickets.pingStaff', 'Notificar atendentes ao abrir', 'boolean'),
      s('tickets.autoAssign', 'Distribuir para atendentes disponíveis', 'boolean'),
      s('tickets.vipPriority', 'Prioridade automática para membros VIP', 'boolean'),
      s('tickets.welcomeDm', 'Enviar boas-vindas do ticket por DM', 'boolean'),
      s('tickets.notifyUserDm', 'Notificações do ticket por DM', 'boolean'),
    ],
  },
  ticket_panels: {
    label: 'Tickets · painéis',
    icon: '🪟',
    settings: [
      s('tickets.panelTitle', 'Título do painel', 'text', { max: 100 }),
      s('tickets.panelColor', 'Cor do painel', 'color'),
      s('tickets.message', 'Texto do painel', 'multiline', { max: 1800 }),
      s('tickets.panelImageUrl', 'Imagem do painel (URL HTTPS)', 'url', { max: 500 }),
      s('tickets.panelButtonLabel', 'Texto do botão de abertura', 'text', { max: 80 }),
      s('tickets.panelButtonStyle', 'Estilo do botão', 'enum', {
        values: ['primary', 'secondary', 'success', 'danger'],
        max: 9,
      }),
    ],
  },
  ticket_messages: {
    label: 'Tickets · mensagens',
    icon: '💬',
    settings: [
      s('tickets.openMessage', 'Mensagem de abertura', 'multiline', { max: 1800 }),
      s('tickets.closeMessage', 'Mensagem de encerramento', 'multiline', { max: 1800 }),
      s('tickets.reminderMessage', 'Aviso de inatividade', 'multiline', { max: 1000 }),
      s('tickets.quickReplies', 'Respostas rápidas: nome|texto', 'multiline', { max: 3500 }),
    ],
  },
  ticket_automations: {
    label: 'Tickets · automações',
    icon: '🤖',
    settings: [
      s('tickets.maxPerUser', 'Tickets simultâneos por usuário', 'integer', { min: 1, max: 10 }),
      s('tickets.cooldownMinutes', 'Cooldown de abertura (minutos)', 'integer', {
        min: 0,
        max: 10080,
      }),
      s('tickets.duplicateWindowMinutes', 'Janela para detectar duplicados (minutos)', 'integer', {
        min: 0,
        max: 43200,
      }),
      s('tickets.blockDuplicates', 'Impedir tickets duplicados', 'boolean'),
      s('tickets.inactivityReminderMinutes', 'Avisar após inatividade (0 desativa)', 'integer', {
        min: 0,
        max: 43200,
      }),
      s('tickets.autoCloseHours', 'Encerrar após inatividade (0 desativa)', 'integer', {
        min: 0,
        max: 8760,
      }),
      s('tickets.closeWarningMinutes', 'Aviso antes do encerramento (minutos)', 'integer', {
        min: 0,
        max: 10080,
      }),
      s('tickets.slaMinutes', 'Prazo para escalar ao supervisor (0 desativa)', 'integer', {
        min: 0,
        max: 43200,
      }),
      s('tickets.deleteAfterCloseMinutes', 'Exclusão automática após encerrar (fixa em 5 segundos)', 'integer', {
        min: 0,
        max: 43200,
      }),
    ],
  },
  ticket_archive: {
    label: 'Tickets · arquivo e avaliação',
    icon: '🗂️',
    settings: [
      s('tickets.transcriptChannelId', 'Canal de arquivo dos transcripts', 'channel'),
      s('tickets.dmTranscript', 'Enviar transcript ao responsável por DM', 'boolean'),
      s('tickets.transcriptFormat', 'Formato: html ou html+json', 'enum', {
        values: ['html', 'html+json'],
        max: 9,
      }),
      s('tickets.ratingsEnabled', 'Ativar avaliação ao encerrar', 'boolean'),
      s('tickets.ratingsChannelId', 'Canal de avaliações', 'channel'),
      s('tickets.ratingAnonymous', 'Ocultar usuário no canal de avaliações', 'boolean'),
    ],
  },
  ticket_permissions: {
    label: 'Tickets · permissões',
    icon: '🔑',
    settings: [
      s('tickets.ownerCanClose', 'Usuário pode encerrar o próprio ticket', 'boolean'),
      s('tickets.attendantCanClose', 'Atendente pode encerrar tickets', 'boolean'),
      s('tickets.supervisorCanManage', 'Supervisor pode gerenciar todos', 'boolean'),
    ],
  },
  ticket_departments: { label: 'Tickets · departamentos', icon: '🏥', settings: [] },
  tempcalls: {
    label: 'Salas temporárias',
    icon: '🔊',
    settings: [
      s('tempcalls.enabled', 'Ativar salas temporárias', 'boolean'),
      s('tempcalls.categoryId', 'Categoria das salas normais', 'category'),
      s('tempcalls.vipCategoryId', 'Categoria das salas VIP', 'category'),
      s('tempcalls.lobbyChannelId', 'Canal de voz criador normal', 'voice'),
      s('tempcalls.vipLobbyChannelId', 'Canal de voz criador VIP', 'voice'),
      s('tempcalls.vipRoleIds', 'Cargos VIP', 'roles', { maxValues: 10 }),
      s('tempcalls.normalUserLimit', 'Limite padrão normal', 'integer', { min: 0, max: 99 }),
      s('tempcalls.vipUserLimit', 'Limite padrão VIP', 'integer', { min: 0, max: 99 }),
      s('tempcalls.normalBitrateKbps', 'Bitrate normal (kbps)', 'integer', { min: 8, max: 384 }),
      s('tempcalls.vipBitrateKbps', 'Bitrate VIP (kbps)', 'integer', { min: 8, max: 384 }),
      s('tempcalls.allowNormalRename', 'Usuários normais podem renomear', 'boolean'),
      s('tempcalls.panelTitle', 'Título do painel', 'text', { max: 100 }),
      s('tempcalls.panelMessage', 'Texto do painel normal', 'multiline', { max: 1500 }),
      s('tempcalls.vipPanelMessage', 'Texto do painel VIP', 'multiline', { max: 1500 }),
      s('tempcalls.logChannelId', 'Canal de logs das salas', 'channel'),
    ],
  },
  verification: {
    label: 'Portaria / verificação',
    icon: '🔐',
    settings: [
      s('verification.roleId', 'Cargo de verificado', 'role', { assignable: true }),
      s('verification.logChannelId', 'Canal de auditoria', 'channel'),
      s('verification.captchaLength', 'Caracteres do CAPTCHA', 'integer', { min: 4, max: 8 }),
      s('verification.expiresMinutes', 'Validade do CAPTCHA (minutos)', 'integer', {
        min: 1,
        max: 30,
      }),
      s('verification.maxAttempts', 'Tentativas antes do bloqueio', 'integer', { min: 1, max: 10 }),
      s('verification.blockMinutes', 'Duração do bloqueio (minutos)', 'integer', {
        min: 1,
        max: 1440,
      }),
      s('verification.minAccountHours', 'Idade mínima da conta (0 desativa)', 'integer', {
        min: 0,
        max: 8760,
      }),
      s('verification.message', 'Texto do painel', 'multiline', { max: 1800 }),
    ],
  },
  levels: {
    label: 'Experiência',
    icon: '📈',
    settings: [
      s('levels.xpPerMessage', 'XP por mensagem', 'integer', { min: 1, max: 100 }),
      s('levels.cooldownSeconds', 'Intervalo de XP (segundos)', 'integer', { min: 15, max: 3600 }),
      s('levels.announceChannelId', 'Canal de subida de nível', 'channel'),
      s('levels.rewards', 'Recompensas: nível:ID_DO_CARGO por linha', 'rewards', { max: 1000 }),
    ],
  },
  economy: {
    label: 'Economia',
    icon: '🪙',
    settings: [
      s('economy.currency', 'Nome da moeda', 'text', { max: 32 }),
      s('economy.workChannelId', 'Canal permitido para /trabalhar', 'channel'),
      s('economy.workPanelChannelId', 'Canal do painel fixo de trabalho', 'channel'),
      s('economy.scratchChannelId', 'Canal do painel de raspadinha', 'channel'),
      s('economy.daily', 'Valor da diária', 'integer', { min: 1, max: 100000 }),
      s('economy.workMin', 'Trabalho: valor mínimo', 'integer', { min: 1, max: 100000 }),
      s('economy.workMax', 'Trabalho: valor máximo', 'integer', { min: 1, max: 100000 }),
      s('economy.workCooldownMinutes', 'Intervalo de trabalho (minutos)', 'integer', {
        min: 1,
        max: 1440,
      }),
      s('economy.vipNormalMultiplier', 'Bônus VIP normal (%)', 'integer', {
        min: 100,
        max: 500,
      }),
      s('economy.vipPlusMultiplier', 'Bônus VIP+ (%)', 'integer', { min: 100, max: 500 }),
      s('economy.vipNexusMultiplier', 'Bônus VIP N3XUS (%)', 'integer', {
        min: 100,
        max: 500,
      }),
      s('economy.receiptDm', 'Enviar recibos por DM', 'boolean'),
      s('economy.scratchPrice', 'Preço da raspadinha', 'integer', { min: 1, max: 100000 }),
      s('economy.scratchJackpot', 'Prêmio máximo da raspadinha', 'integer', { min: 1000, max: 5000000 }),
    ],
  },
  vip: {
    label: 'VIP e gift cards',
    icon: '💎',
    settings: [
      s('vip.normalRoleId', 'Cargo VIP normal', 'role'),
      s('vip.plusRoleId', 'Cargo VIP+', 'role'),
      s('vip.nexusRoleId', 'Cargo VIP N3XUS', 'role'),
      s('vip.redemptionChannelId', 'Canal do painel de resgate', 'channel'),
      s('vip.logChannelId', 'Canal de logs VIP', 'channel'),
      s('vip.expiryReminderDays', 'Avisar antes de expirar (dias)', 'integer', {
        min: 1,
        max: 30,
      }),
      s('vip.nexusCategoryName', 'Nome da categoria N3XUS', 'text', { max: 80 }),
      s('vip.nexusRolePrefix', 'Prefixo do cargo personalizado', 'text', { max: 12 }),
      s('vip.normal1mPrice', 'VIP: preço de 1 mês', 'integer', { min: 1, max: 100000000 }),
      s('vip.normal3mPrice', 'VIP: preço de 3 meses', 'integer', { min: 1, max: 100000000 }),
      s('vip.normal1yPrice', 'VIP: preço de 1 ano', 'integer', { min: 1, max: 100000000 }),
      s('vip.normalLifetimePrice', 'VIP: preço vitalício', 'integer', {
        min: 1,
        max: 100000000,
      }),
      s('vip.plus1mPrice', 'VIP+: preço de 1 mês', 'integer', { min: 1, max: 100000000 }),
      s('vip.plus3mPrice', 'VIP+: preço de 3 meses', 'integer', { min: 1, max: 100000000 }),
      s('vip.plus1yPrice', 'VIP+: preço de 1 ano', 'integer', { min: 1, max: 100000000 }),
      s('vip.plusLifetimePrice', 'VIP+: preço vitalício', 'integer', {
        min: 1,
        max: 100000000,
      }),
      s('vip.nexus1mPrice', 'N3XUS: preço de 1 mês', 'integer', { min: 1, max: 100000000 }),
      s('vip.nexus3mPrice', 'N3XUS: preço de 3 meses', 'integer', { min: 1, max: 100000000 }),
      s('vip.nexus1yPrice', 'N3XUS: preço de 1 ano', 'integer', { min: 1, max: 100000000 }),
      s('vip.nexusLifetimePrice', 'N3XUS: preço vitalício', 'integer', {
        min: 1,
        max: 100000000,
      }),
    ],
  },
  shop_catalog: {
    label: 'Loja · categorias e produtos',
    icon: '🛍️',
    settings: [],
  },
  community: {
    label: 'Comunidade e regras',
    icon: '💬',
    settings: [
      s('community.suggestionsChannelId', 'Canal de sugestões', 'channel'),
      s('community.reportsChannelId', 'Canal privado de denúncias', 'channel'),
      s('community.rulesIntro', 'Introdução do painel de regras', 'multiline', { max: 600 }),
      s('community.rules', 'Regras do servidor', 'multiline', { max: 3500 }),
      s('community.rulesFooter', 'Rodapé do painel de regras', 'multiline', { max: 600 }),
    ],
  },
};
export const SETTINGS = Object.values(CONFIG_PAGES).flatMap((p) => p.settings);
export const getPath = (obj, path) => path.split('.').reduce((v, k) => v?.[k], obj);
export function setPath(obj, path, value) {
  const [a, b] = path.split('.');
  obj[a][b] = value;
}
export const isId = (value) => /^\d{17,20}$/.test(String(value));
export function parseSetting(setting, value) {
  if (!setting) throw new Error('Configuração desconhecida.');
  if (setting.type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error('Use um valor booleano.');
    return value;
  }
  if (setting.type === 'integer') {
    if (!/^-?\d+$/.test(String(value))) throw new Error('Informe um número inteiro.');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < setting.min || n > setting.max)
      throw new Error(`Use um inteiro entre ${setting.min} e ${setting.max}.`);
    return n;
  }
  value = String(value).trim();
  if (['channel', 'category', 'voice', 'role'].includes(setting.type)) {
    if (value && !isId(value)) throw new Error('ID do Discord inválido.');
    return value;
  }
  if (setting.type === 'roles') {
    const ids = [...new Set(value.split(/\s+/).filter(Boolean))];
    if (ids.some((v) => !isId(v)) || ids.length > (setting.maxValues ?? 10))
      throw new Error(`Escolha no máximo ${setting.maxValues ?? 10} cargos válidos.`);
    return ids.join(' ');
  }
  if (setting.type === 'url') {
    if (!value) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') throw new Error();
      return url.href;
    } catch {
      throw new Error('Use uma URL HTTPS válida.');
    }
  }
  if (setting.type === 'enum' && !setting.values.includes(value))
    throw new Error(`Use um destes valores: ${setting.values.join(', ')}.`);
  if (setting.type === 'color' && !/^#[0-9a-f]{6}$/i.test(value))
    throw new Error('Use uma cor como #7C3AED.');
  if (
    setting.type === 'ids' &&
    value
      .split(/\s+/)
      .filter(Boolean)
      .some((v) => !isId(v))
  )
    throw new Error('Informe somente IDs separados por espaço.');
  if (
    setting.type === 'commandlist' &&
    value
      .split('\n')
      .filter(Boolean)
      .some((v) => !/^[-_\p{Ll}\p{Lo}\p{N}]{1,32}$/u.test(v.trim()))
  )
    throw new Error('Use um nome de comando sem / por linha.');
  if (
    setting.type === 'rewards' &&
    value
      .split('\n')
      .filter(Boolean)
      .some((v) => !/^\d{1,3}:\d{17,20}$/.test(v.trim()) || Number(v.split(':')[0]) < 1)
  )
    throw new Error('Use nível:ID_DO_CARGO, um por linha (nível 1 a 999).');
  if (value.length > (setting.max ?? 1800))
    throw new Error(`Máximo de ${setting.max ?? 1800} caracteres.`);
  if (['text', 'color'].includes(setting.type) && !value)
    throw new Error('Este campo não pode ficar vazio.');
  return value;
}
export function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Configuração inválida.');
  const config = structuredClone(DEFAULT_CONFIG);
  for (const setting of SETTINGS) {
    const value = getPath(input, setting.key);
    if (value !== undefined) setPath(config, setting.key, parseSetting(setting, value));
  }
  if (config.economy.workMax < config.economy.workMin)
    throw new Error('O máximo de trabalho precisa ser igual ou maior que o mínimo.');
  return config;
}
