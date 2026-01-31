import { validateExpenseInput, sanitizeInput } from './validation';

describe('validateExpenseInput', () => {
  const validInput = {
    amount: 100.50,
    category: 'Food',
    description: 'Lunch at restaurant',
    date: '2024-01-15',
  };

  it('should validate correct input', () => {
    const result = validateExpenseInput(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing amount', () => {
    const input = { ...validInput, amount: undefined };
    const result = validateExpenseInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Amount is required');
  });

  it('should reject negative amount', () => {
    const input = { ...validInput, amount: -10 };
    const result = validateExpenseInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Amount must be greater than 0');
  });

  it('should reject zero amount', () => {
    const input = { ...validInput, amount: 0 };
    const result = validateExpenseInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Amount must be greater than 0');
  });

  it('should reject amount with more than 2 decimal places', () => {
    const input = { ...validInput, amount: 10.123 };
    const result = validateExpenseInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Amount can have at most 2 decimal places');
  });

  it('should reject invalid category', () => {
    const input = { ...validInput, category: 'InvalidCategory' };
    const result = validateExpenseInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Category must be one of'))).toBe(true);
  });

  it('should reject empty description', () => {
    const input = { ...validInput, description: '   ' };
    const result = validateExpenseInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Description cannot be empty');
  });

  it('should reject invalid date format', () => {
    const input = { ...validInput, date: '15-01-2024' };
    const result = validateExpenseInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Date must be in YYYY-MM-DD format');
  });

  it('should reject null input', () => {
    const result = validateExpenseInput(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Request body must be a valid JSON object');
  });

  it('should accept input with idempotency key', () => {
    const input = { ...validInput, idempotency_key: 'unique-key-123' };
    const result = validateExpenseInput(input);
    expect(result.valid).toBe(true);
  });
});

describe('sanitizeInput', () => {
  it('should trim whitespace from strings', () => {
    const input = {
      amount: 100.555,
      category: '  Food  ',
      description: '  Lunch  ',
      date: ' 2024-01-15 ',
      idempotency_key: '  key  ',
    };

    const result = sanitizeInput(input);
    expect(result.category).toBe('Food');
    expect(result.description).toBe('Lunch');
    expect(result.date).toBe('2024-01-15');
    expect(result.idempotency_key).toBe('key');
  });

  it('should round amount to 2 decimal places', () => {
    const input = {
      amount: 100.556,
      category: 'Food',
      description: 'Lunch',
      date: '2024-01-15',
    };

    const result = sanitizeInput(input);
    expect(result.amount).toBe(100.56);
  });
});
