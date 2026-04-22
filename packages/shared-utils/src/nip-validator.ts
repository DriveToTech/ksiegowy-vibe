const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7] as const;

export const normalizeNip = (input: string): string => {
  return input.replace(/\D/g, '');
};

export const isValidNip = (input: string): boolean => {
  const nip = normalizeNip(input);

  if (nip.length !== 10 || /^0{10}$/.test(nip)) {
    return false;
  }

  const digits = Array.from(nip, (character) => Number.parseInt(character, 10));

  if (digits.some((digit) => Number.isNaN(digit))) {
    return false;
  }

  const checksum = NIP_WEIGHTS.reduce((sum, weight, index) => {
    const digit = digits[index] ?? 0;
    return sum + digit * weight;
  }, 0) % 11;

  if (checksum === 10) {
    return false;
  }

  return checksum === digits[9];
};
