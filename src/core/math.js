// Analisador aritmético restrito. Nunca executa JavaScript fornecido pelo usuário.
export function calculate(input) {
  if (typeof input !== 'string' || input.length > 200) throw new Error('Use até 200 caracteres.');
  if (/[\d.,]\s+[\d.,]/.test(input)) throw new Error('Separe os números com um operador.');
  const source = input.replaceAll(',', '.').replace(/\s+/g, '');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/%^]/g) ?? [];
  if (tokens.join('') !== source || !tokens.length)
    throw new Error('Use apenas números, parênteses e + - * / % ^.');
  let pos = 0;
  const peek = () => tokens[pos];
  function atom() {
    const token = tokens[pos++];
    if (token === '(') {
      const result = sum();
      if (tokens[pos++] !== ')') throw new Error('Parênteses desbalanceados.');
      return result;
    }
    if (!token || !/^\d|^\.\d/.test(token)) throw new Error('Expressão incompleta.');
    return Number(token);
  }
  function power() {
    let n = atom();
    if (peek() === '^') {
      pos++;
      n = n ** unary();
    }
    return n;
  }
  function unary() {
    if (peek() === '+') {
      pos++;
      return unary();
    }
    if (peek() === '-') {
      pos++;
      return -unary();
    }
    return power();
  }
  function product() {
    let n = unary();
    while (['*', '/', '%'].includes(peek())) {
      const op = tokens[pos++],
        v = unary();
      n = op === '*' ? n * v : op === '/' ? n / v : n % v;
    }
    return n;
  }
  function sum() {
    let n = product();
    while (['+', '-'].includes(peek())) {
      const op = tokens[pos++],
        v = product();
      n = op === '+' ? n + v : n - v;
    }
    return n;
  }
  const result = sum();
  if (pos !== tokens.length || !Number.isFinite(result))
    throw new Error('Expressão inválida, divisão por zero ou resultado fora do limite.');
  return result;
}
