import { createCanvas } from '@napi-rs/canvas';
import { AttachmentBuilder } from 'discord.js';

const money = (value) => Number(value ?? 0).toLocaleString('pt-BR');

const fitText = (ctx, text, maxWidth, startSize, minSize = 24) => {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `700 ${size}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
};

export function createReceipt({
  kind = 'COMPRA',
  guildName,
  username,
  userId,
  product,
  amount = 0,
  currency = 'moedas',
  code = '',
  duration = '',
  transactionId,
  createdAt = Date.now(),
}) {
  const width = 1000;
  const height = 1260;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f0c18';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#f5f0e8';
  ctx.beginPath();
  ctx.roundRect(54, 42, 892, 1176, 24);
  ctx.fill();

  ctx.fillStyle = '#17111f';
  ctx.fillRect(54, 42, 892, 185);
  ctx.fillStyle = '#d8c5ff';
  ctx.font = '700 29px Arial';
  ctx.fillText('N3XUS · SANATÓRIO', 100, 105);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 58px Arial';
  ctx.fillText('Cupom fiscal digital', 100, 178);

  ctx.fillStyle = '#6d28d9';
  ctx.beginPath();
  ctx.roundRect(727, 79, 158, 73, 36);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 25px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(kind, 806, 125);
  ctx.textAlign = 'left';

  const line = (y) => {
    ctx.strokeStyle = '#d8d0c5';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(100, y);
    ctx.lineTo(900, y);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const pair = (label, value, y) => {
    ctx.fillStyle = '#6b6570';
    ctx.font = '600 22px Arial';
    ctx.fillText(label, 100, y);
    ctx.fillStyle = '#17111f';
    ctx.font = '700 25px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(String(value), 900, y);
    ctx.textAlign = 'left';
  };

  ctx.fillStyle = '#17111f';
  ctx.font = '700 23px Arial';
  ctx.fillText(guildName || 'Comunidade', 100, 282);
  ctx.fillStyle = '#6b6570';
  ctx.font = '22px Arial';
  ctx.fillText(
    new Date(createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    100,
    319,
  );
  line(355);
  pair('Cliente', username, 405);
  pair('ID do cliente', userId, 450);
  pair('Transação', transactionId, 495);
  line(535);

  ctx.fillStyle = '#6b6570';
  ctx.font = '600 21px Arial';
  ctx.fillText('ITEM', 100, 584);
  ctx.fillStyle = '#17111f';
  const productSize = fitText(ctx, product, 800, 43);
  ctx.font = `700 ${productSize}px Arial`;
  ctx.fillText(product, 100, 640);
  if (duration) {
    ctx.fillStyle = '#6b6570';
    ctx.font = '24px Arial';
    ctx.fillText(`Validade: ${duration}`, 100, 685);
  }
  line(730);

  ctx.fillStyle = '#6b6570';
  ctx.font = '600 22px Arial';
  ctx.fillText('TOTAL', 100, 784);
  ctx.fillStyle = '#4c1d95';
  ctx.font = '700 47px Arial';
  ctx.textAlign = 'right';
  ctx.fillText(`${money(amount)} ${currency}`, 900, 792);
  ctx.textAlign = 'left';

  if (code) {
    ctx.fillStyle = '#ebe2fb';
    ctx.beginPath();
    ctx.roundRect(100, 840, 800, 132, 15);
    ctx.fill();
    ctx.fillStyle = '#4c1d95';
    ctx.font = '700 20px Arial';
    ctx.fillText('GIFT CARD', 130, 882);
    ctx.font = `700 ${fitText(ctx, code, 730, 38, 26)}px monospace`;
    ctx.fillText(code, 130, 937);
  }

  const seed = [...String(transactionId)].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );
  let x = 105;
  for (let index = 0; index < 76; index++) {
    const bar = 2 + ((seed + index * 17) % 6);
    ctx.fillStyle = '#17111f';
    ctx.fillRect(x, 1018, bar, 88);
    x += bar + 3 + ((seed + index) % 3);
    if (x > 895) break;
  }
  ctx.fillStyle = '#6b6570';
  ctx.font = '19px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Documento digital gerado automaticamente · guarde este comprovante', 500, 1155);
  ctx.fillText('Códigos de gift card são pessoais e de uso único.', 500, 1184);
  ctx.textAlign = 'left';
  return canvas.toBuffer('image/png');
}

export const receiptAttachment = (data, suffix = 'recibo') =>
  new AttachmentBuilder(createReceipt(data), {
    name: `${suffix}-${String(data.transactionId).replace(/[^a-z0-9-]/gi, '')}.png`,
  });
