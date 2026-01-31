// Expense types
export interface Expense {
  id: string;
  amount: number; // Stored as integer (paise/cents) to avoid floating point issues
  category: string;
  description: string;
  date: string; // ISO date string (YYYY-MM-DD)
  created_at: string; // ISO timestamp
  idempotency_key?: string;
}

export interface CreateExpenseInput {
  amount: number; // Input as decimal (e.g., 100.50)
  category: string;
  description: string;
  date: string;
  idempotency_key?: string; // Client-provided key for retry safety
}

export interface ExpenseResponse {
  id: string;
  amount: number; // Returned as decimal for display
  category: string;
  description: string;
  date: string;
  created_at: string;
}

export interface GetExpensesQuery {
  category?: string;
  sort?: 'date_desc' | 'date_asc';
}

export interface ApiError {
  error: string;
  details?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
