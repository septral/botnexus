import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import {
  AttachmentBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { validateRole } from '../core/permissions.js';
import { button, defer, embed, reply, row, safe } from '../core/ui.js';
import { audit, log } from '../core/log.js';

const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const normalizeVerificationWord = (value) =>
  String(value ?? '')
    .trim()
    .toLocaleUpperCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '');

const captchaHash = (answer, salt) =>
  createHash('sha256')
    .update(`${salt}:${normalizeVerificationWord(answer)}`)
    .digest('hex');

const sameHash = (left, right) => {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

export function createCaptcha(length = 6) {
  const answer = Array.from(
    { length: Math.max(4, Math.min(8, Number(length) || 6)) },
    () => CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)],
  ).join('');
  const width = 560;
  const height = 210;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#130d22');
  gradient.addColorStop(0.55, '#281442');
  gradient.addColorStop(1, '#101827');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let index = 0; index < 15; index++) {
    ctx.beginPath();
    ctx.moveTo(randomInt(width), randomInt(height));
    ctx.bezierCurveTo(
      randomInt(width),
      randomInt(height),
      randomInt(width),
      randomInt(height),
      randomInt(width),
      randomInt(height),
    );
    ctx.strokeStyle = `rgba(${130 + randomInt(100)},${80 + randomInt(130)},255,${0.12 + randomInt(20) / 100})`;
    ctx.lineWidth = 1 + randomInt(4);
    ctx.stroke();
  }
  for (let index = 0; index < 180; index++) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 + randomInt(25) / 100})`;
    ctx.beginPath();
    ctx.arc(randomInt(width), randomInt(height), 1 + randomInt(3), 0, Math.PI * 2);
    ctx.fill();
  }

  const slot = 430 / answer.length;
  for (const [index, character] of [...answer].entries()) {
    ctx.save();
    ctx.translate(66 + slot * index + slot / 2, 112 + randomInt(-16, 17));
    ctx.rotate((randomInt(-18, 19) * Math.PI) / 180);
    ctx.font = `700 ${60 + randomInt(16)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#05020a';
    ctx.shadowBlur = 8;
    ctx.fillStyle = ['#F3E8FF', '#DDD6FE', '#C4B5FD', '#E9D5FF'][randomInt(4)];
    ctx.fillText(character, 0, 0);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.font = '600 16px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('SANATÓRIO • TRIAGEM VISUAL', 28, 31);
  ctx.fillStyle = 'rgba(255,255,255,.48)';
  ctx.font = '14px Arial';
  ctx.fillText('Digite apenas os caracteres exibidos', 28, 190);
  return { answer, buffer: canvas.toBuffer('image/png') };
}

export function verificationView(config, guild) {
  const panel = new ContainerBuilder()
    .setAccentColor(parseInt(config.appearance.color.slice(1), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# 🔐 Portaria de ${safe(guild.name)}\n${config.verification.message}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Triagem visual\n1. Gere seu CAPTCHA privado.\n2. Leia a imagem e clique em **Inserir CAPTCHA**.\n3. O cargo é entregue automaticamente após a validação.\n\nA imagem expira em **${config.verification.expiresMinutes} minuto(s)** e nunca aparece para outros membros.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(row(button('verify:open', 'Gerar CAPTCHA', ButtonStyle.Primary)));
  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function sendVerificationLog(ctx, guild, config, title, description) {
  await audit(ctx, guild, title, description);
  if (
    !config.verification.logChannelId ||
    config.verification.logChannelId === config.logs.channelId
  )
    return;
  const channel = await guild.channels.fetch(config.verification.logChannelId).catch(() => null);
  if (channel?.isTextBased())
    await channel
      .send({ embeds: [embed(config, title, description)], allowedMentions: { parse: [] } })
      .catch((error) =>
        log('warn', 'verification_log_failed', { guild: guild.id, error: error.message }),
      );
}

export async function verificationComponent(i, ctx) {
  const c = ctx.store.config(i.guildId);
  if (!c.modules.verification) throw new Error('Verificação desativada.');
  if (!c.verification.roleId) throw new Error('Configure o cargo de verificação em /botconfig.');
  const member = i.member;
  const key = `${i.guildId}:${i.user.id}`;

  if (i.customId === 'verify:open' || i.commandName === 'verificar') {
    if (member.roles.cache.has(c.verification.roleId))
      return reply(i, {
        embeds: [
          embed(
            c,
            '🔐 Acesso já liberado',
            'Você já possui o cargo de verificação e não precisa repetir a triagem.',
          ),
        ],
      });
    if (
      c.verification.minAccountHours > 0 &&
      Date.now() - i.user.createdTimestamp < c.verification.minAccountHours * 3600000
    )
      throw new Error(
        `Sua conta precisa ter pelo menos ${c.verification.minAccountHours} hora(s) para concluir a verificação.`,
      );
    const old = ctx.store.get('verify', key);
    if (old?.blockedUntil > Date.now())
      throw new Error(
        `Muitas tentativas. Tente novamente <t:${Math.floor(old.blockedUntil / 1000)}:R>.`,
      );
    const captcha = createCaptcha(c.verification.captchaLength);
    const salt = randomBytes(18).toString('hex');
    const expires = Date.now() + c.verification.expiresMinutes * 60000;
    ctx.store.set('verify', key, {
      hash: captchaHash(captcha.answer, salt),
      salt,
      expires,
      attempts: old?.expires > Date.now() ? Number(old.attempts ?? 0) : 0,
      createdAt: Date.now(),
    });
    return reply(i, {
      embeds: [
        embed(
          c,
          'Seu CAPTCHA privado',
          `Leia a imagem e insira os caracteres antes de <t:${Math.floor(expires / 1000)}:R>.\n\nNão diferencia maiúsculas de minúsculas. Caracteres ambíguos não são usados.`,
        ).setImage('attachment://captcha.png'),
      ],
      files: [new AttachmentBuilder(captcha.buffer, { name: 'captcha.png' })],
      components: [
        row(
          button('verify:answer', 'Inserir CAPTCHA', ButtonStyle.Primary),
          button('verify:open', 'Gerar outra imagem'),
        ),
      ],
    });
  }

  if (i.customId === 'verify:answer') {
    const challenge = ctx.store.get('verify', key);
    if (!challenge || challenge.expires < Date.now())
      throw new Error('O CAPTCHA expirou. Gere uma nova imagem.');
    return i.showModal(
      new ModalBuilder()
        .setCustomId('verify:submit')
        .setTitle('Confirmar CAPTCHA')
        .addLabelComponents(
          new LabelBuilder()
            .setLabel('Caracteres da imagem')
            .setDescription('Digite somente as letras e números exibidos no CAPTCHA.')
            .setTextInputComponent(
              new TextInputBuilder()
                .setCustomId('answer')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex.: 7KMP4R')
                .setRequired(true)
                .setMinLength(c.verification.captchaLength)
                .setMaxLength(c.verification.captchaLength),
            ),
        ),
    );
  }

  const challenge = ctx.store.get('verify', key);
  if (!challenge || challenge.expires < Date.now())
    throw new Error('O CAPTCHA expirou. Gere uma nova imagem.');
  const submitted = captchaHash(i.fields.getTextInputValue('answer'), challenge.salt);
  if (!sameHash(challenge.hash, submitted)) {
    challenge.attempts = Number(challenge.attempts ?? 0) + 1;
    if (challenge.attempts >= c.verification.maxAttempts) {
      challenge.blockedUntil = Date.now() + c.verification.blockMinutes * 60000;
      challenge.expires = 0;
    }
    ctx.store.set('verify', key, challenge);
    throw new Error(
      challenge.blockedUntil
        ? `Limite de tentativas atingido. Tente novamente <t:${Math.floor(challenge.blockedUntil / 1000)}:R>.`
        : `CAPTCHA incorreto. Restam ${c.verification.maxAttempts - challenge.attempts} tentativa(s).`,
    );
  }
  await defer(i);
  const role = await validateRole(i.guild, c.verification.roleId);
  await member.roles.add(role, 'CAPTCHA de verificação concluído');
  ctx.store.delete('verify', key);
  await sendVerificationLog(
    ctx,
    i.guild,
    c,
    '🔐 Verificação concluída',
    `<@${i.user.id}> recebeu <@&${role.id}> por CAPTCHA.`,
  );
  return reply(i, {
    embeds: [
      embed(
        c,
        'Acesso liberado',
        `Tudo certo, **${safe(i.user.displayName ?? i.user.username)}**. O cargo **${safe(role.name)}** foi aplicado.`,
      ),
    ],
    components: [],
  });
}
