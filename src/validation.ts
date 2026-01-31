import { CreateExpenseInput, ValidationResult } from './types';

const VALID_CATEGORIES = [
  'Food',
  'Transport',
  'Entertainment',
  'Shopping',
  'Bills',
  'Healthcare',
  'Education',
  'Other'
];

export function validateExpenseInput(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Request body must be a valid JSON object'] };
  }

  const data = input as Record<string, unknown>;

  // Validate amount
  if (data.amount === undefined || data.amount === null) {
    errors.push('Amount is required');
  } else if (typeof data.amount !== 'number' || isNaN(data.amount)) {
    errors.push('Amount must be a valid number');
  } else if (data.amount <= 0) {
    errors.push('Amount must be greater than 0');
  } else if (data.amount > 100000000) { // 10 crore limit
    errors.push('Amount exceeds maximum allowed value');
  } else {
    // Check for reasonable decimal places (max 2 for currency)
    const amountStr = data.amount.toString();
    const decimalParts = amountStr.split('.');
    if (decimalParts[1] && decimalParts[1].length > 2) {
      errors.push('Amount can have at most 2 decimal places');
    }
  }

  // Validate category
  if (!data.category) {
    errors.push('Category is required');
  } else if (typeof data.category !== 'string') {
    errors.push('Category must be a string');
  } else if (!VALID_CATEGORIES.includes(data.category)) {
    errors.push(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`);
  }

  // Validate description
  if (!data.description) {
    errors.push('Description is required');
  } else if (typeof data.description !== 'string') {
    errors.push('Description must be a string');
  } else if (data.description.trim().length === 0) {
    errors.push('Description cannot be empty');
  } else if (data.description.length > 500) {
    errors.push('Description must be 500 characters or less');
  }

  // Validate date
  if (!data.date) {
    errors.push('Date is required');
  } else if (typeof data.date !== 'string') {
    errors.push('Date must be a string');
  } else {
    // Validate ISO date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(data.date)) {
      errors.push('Date must be in YYYY-MM-DD format');
    } else {
      const parsedDate = new Date(data.date);
      if (isNaN(parsedDate.getTime())) {
        errors.push('Date is not a valid date');
      }
      // Check if date is not too far in the future
      const maxFutureDate = new Date();
      maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 1);
      if (parsedDate > maxFutureDate) {
        errors.push('Date cannot be more than 1 year in the future');
      }
    }
  }

  // Validate idempotency_key if provided
  if (data.idempotency_key !== undefined) {
    if (typeof data.idempotency_key !== 'string') {
      errors.push('Idempotency key must be a string');
    } else if (data.idempotency_key.length > 100) {
      errors.push('Idempotency key must be 100 characters or less');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function sanitizeInput(input: CreateExpenseInput): CreateExpenseInput {
  return {
    amount: Math.round(input.amount * 100) / 100, // Round to 2 decimal places
    category: input.category.trim(),
    description: input.description.trim(),
    date: input.date.trim(),
    idempotency_key: input.idempotency_key?.trim()
  };
}

export { VALID_CATEGORIES };
