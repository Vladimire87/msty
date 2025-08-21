function parseNumber(input) {
  if (typeof input !== 'string') {
    return Number.parseFloat(input);
  }
  let cleaned = input.replace(/[\s_]/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma) {
    if (hasDot) {
      // Assume commas are thousands separators
      cleaned = cleaned.replace(/,/g, '');
    } else {
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Single comma used as decimal separator
        cleaned = parts[0] + '.' + parts[1];
      } else {
        // Commas are thousands separators
        cleaned = parts.join('');
      }
    }
  }
  return Number.parseFloat(cleaned);
}

module.exports = parseNumber;
