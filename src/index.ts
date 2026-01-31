import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { database } from './database';
import { validateExpenseInput, sanitizeInput, VALID_CATEGORIES } from './validation';
import { CreateExpenseInput, Expense, ExpenseResponse, ApiError } from './types';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Helper: Convert stored expense (amount in paise) to response (amount in rupees)
function toExpenseResponse(expense: Expense): ExpenseResponse {
  return {
    id: expense.id,
    amount: expense.amount / 100, // Convert paise to rupees
    category: expense.category,
    description: expense.description,
    date: expense.date,
    created_at: expense.created_at
  };
}

// POST /expenses - Create a new expense
app.post('/expenses', async (req: Request, res: Response) => {
  try {
    // Validate input
    const validation = validateExpenseInput(req.body);
    if (!validation.valid) {
      const error: ApiError = {
        error: 'Validation failed',
        details: validation.errors
      };
      return res.status(400).json(error);
    }

    const input = sanitizeInput(req.body as CreateExpenseInput);

    // Check for idempotency - if client provided a key and we've seen it before,
    // return the existing expense instead of creating a duplicate
    if (input.idempotency_key) {
      const existing = await database.findByIdempotencyKey(input.idempotency_key);
      if (existing) {
        console.log(`Idempotent request detected: ${input.idempotency_key}`);
        return res.status(200).json(toExpenseResponse(existing));
      }
    }

    // Create the expense
    const expense: Expense = {
      id: uuidv4(),
      amount: Math.round(input.amount * 100), // Convert to paise for storage
      category: input.category,
      description: input.description,
      date: input.date,
      created_at: new Date().toISOString(),
      idempotency_key: input.idempotency_key
    };

    await database.createExpense(expense);
    console.log(`Created expense: ${expense.id}`);

    return res.status(201).json(toExpenseResponse(expense));
  } catch (error) {
    console.error('Error creating expense:', error);

    // Handle MongoDB duplicate key error (duplicate idempotency key)
    if (error instanceof Error && (error as { code?: number }).code === 11000) {
      const input = req.body as CreateExpenseInput;
      if (input.idempotency_key) {
        const existing = await database.findByIdempotencyKey(input.idempotency_key);
        if (existing) {
          return res.status(200).json(toExpenseResponse(existing));
        }
      }
    }

    const apiError: ApiError = { error: 'Failed to create expense' };
    return res.status(500).json(apiError);
  }
});

// GET /expenses - Get list of expenses with optional filtering, sorting, and pagination
app.get('/expenses', async (req: Request, res: Response) => {
  try {
    const { category, sort, page, limit } = req.query;

    // Validate category if provided
    if (category && typeof category === 'string' && !VALID_CATEGORIES.includes(category)) {
      const error: ApiError = {
        error: 'Invalid category',
        details: [`Category must be one of: ${VALID_CATEGORIES.join(', ')}`]
      };
      return res.status(400).json(error);
    }

    // Parse pagination params
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 0; // 0 = no pagination

    // Validate sort parameter
    const sortOrder = sort === 'date_asc' ? 'date_asc' : 'date_desc';

    const result = await database.getExpenses(
      category as string | undefined,
      sortOrder,
      pageNum,
      limitNum
    );

    // Convert all amounts from paise to rupees for response
    const response = {
      data: result.data.map(toExpenseResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    };

    return res.json(response);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    const apiError: ApiError = { error: 'Failed to fetch expenses' };
    return res.status(500).json(apiError);
  }
});

// PUT /expenses/:id - Update an expense
app.put('/expenses/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if expense exists
    const existing = await database.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Validate input
    const validation = validateExpenseInput(req.body);
    if (!validation.valid) {
      const error: ApiError = {
        error: 'Validation failed',
        details: validation.errors
      };
      return res.status(400).json(error);
    }

    const input = sanitizeInput(req.body as CreateExpenseInput);

    // Update the expense
    const updates: Partial<Expense> = {
      amount: Math.round(input.amount * 100),
      category: input.category,
      description: input.description,
      date: input.date
    };

    const updated = await database.updateExpense(id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    console.log(`Updated expense: ${id}`);
    return res.json(toExpenseResponse(updated));
  } catch (error) {
    console.error('Error updating expense:', error);
    const apiError: ApiError = { error: 'Failed to update expense' };
    return res.status(500).json(apiError);
  }
});

// DELETE /expenses/:id - Delete an expense
app.delete('/expenses/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await database.deleteExpense(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    console.log(`Deleted expense: ${id}`);
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting expense:', error);
    const apiError: ApiError = { error: 'Failed to delete expense' };
    return res.status(500).json(apiError);
  }
});

// GET /stats - Get spending statistics
app.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [monthlyStats, categoryStats] = await Promise.all([
      database.getMonthlyStats(),
      database.getCategoryStats()
    ]);

    // Convert amounts from paise to rupees
    const response = {
      monthly: monthlyStats.map(m => ({
        month: m.month,
        total: m.total / 100,
        count: m.count
      })),
      categories: categoryStats.map(c => ({
        category: c.category,
        total: c.total / 100,
        count: c.count
      }))
    };

    return res.json(response);
  } catch (error) {
    console.error('Error fetching stats:', error);
    const apiError: ApiError = { error: 'Failed to fetch statistics' };
    return res.status(500).json(apiError);
  }
});

// GET /categories - Get list of valid categories
app.get('/categories', (_req: Request, res: Response) => {
  return res.json(VALID_CATEGORIES);
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  return res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await database.close();
  process.exit(0);
});

// Initialize database and start server
async function start() {
  try {
    await database.init();
    app.listen(PORT, () => {
      console.log(`Expense Tracker API running on http://localhost:${PORT}`);
      console.log('Available endpoints:');
      console.log('  POST   /expenses     - Create a new expense');
      console.log('  GET    /expenses     - List expenses (query: category, sort, page, limit)');
      console.log('  PUT    /expenses/:id - Update an expense');
      console.log('  DELETE /expenses/:id - Delete an expense');
      console.log('  GET    /stats        - Get spending statistics');
      console.log('  GET    /categories   - List valid categories');
      console.log('  GET    /health       - Health check');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
