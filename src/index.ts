import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { database } from './database';
import { validateExpenseInput, sanitizeInput, VALID_CATEGORIES } from './validation';
import { CreateExpenseInput, Expense, ExpenseResponse, ApiError } from './types';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

function toExpenseResponse(expense: Expense): ExpenseResponse {
  return {
    id: expense.id,
    amount: expense.amount / 100,
    category: expense.category,
    description: expense.description,
    date: expense.date,
    created_at: expense.created_at
  };
}

app.post('/expenses', async (req: Request, res: Response) => {
  try {
    const validation = validateExpenseInput(req.body);
    if (!validation.valid) {
      const error: ApiError = {
        error: 'Validation failed',
        details: validation.errors
      };
      return res.status(400).json(error);
    }

    const input = sanitizeInput(req.body as CreateExpenseInput);

    if (input.idempotency_key) {
      const existing = await database.findByIdempotencyKey(input.idempotency_key);
      if (existing) {
        return res.status(200).json(toExpenseResponse(existing));
      }
    }

    const expense: Expense = {
      id: uuidv4(),
      amount: Math.round(input.amount * 100),
      category: input.category,
      description: input.description,
      date: input.date,
      created_at: new Date().toISOString(),
      idempotency_key: input.idempotency_key
    };

    const created = await database.createExpense(expense);
    return res.status(201).json(toExpenseResponse(created));
  } catch {
    const apiError: ApiError = { error: 'Failed to create expense' };
    return res.status(500).json(apiError);
  }
});

app.get('/expenses', async (req: Request, res: Response) => {
  try {
    const { category, sort, page, limit } = req.query;

    if (category && typeof category === 'string' && !VALID_CATEGORIES.includes(category)) {
      const error: ApiError = {
        error: 'Invalid category',
        details: [`Category must be one of: ${VALID_CATEGORIES.join(', ')}`]
      };
      return res.status(400).json(error);
    }

    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 0;
    const sortOrder = sort === 'date_asc' ? 'date_asc' : 'date_desc';

    const result = await database.getExpenses(
      category as string | undefined,
      sortOrder,
      pageNum,
      limitNum
    );

    return res.json({
      data: result.data.map(toExpenseResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    });
  } catch {
    const apiError: ApiError = { error: 'Failed to fetch expenses' };
    return res.status(500).json(apiError);
  }
});

app.put('/expenses/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await database.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const validation = validateExpenseInput(req.body);
    if (!validation.valid) {
      const error: ApiError = {
        error: 'Validation failed',
        details: validation.errors
      };
      return res.status(400).json(error);
    }

    const input = sanitizeInput(req.body as CreateExpenseInput);

    const updated = await database.updateExpense(id, {
      amount: Math.round(input.amount * 100),
      category: input.category,
      description: input.description,
      date: input.date
    });

    if (!updated) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    return res.json(toExpenseResponse(updated));
  } catch {
    const apiError: ApiError = { error: 'Failed to update expense' };
    return res.status(500).json(apiError);
  }
});

app.delete('/expenses/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await database.deleteExpense(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    return res.status(204).send();
  } catch {
    const apiError: ApiError = { error: 'Failed to delete expense' };
    return res.status(500).json(apiError);
  }
});

app.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [monthly, categories] = await Promise.all([
      database.getMonthlyStats(),
      database.getCategoryStats()
    ]);

    return res.json({
      monthly: monthly.map(m => ({
        month: m.month,
        total: m.total / 100,
        count: m.count
      })),
      categories: categories.map(c => ({
        category: c.category,
        total: c.total / 100,
        count: c.count
      }))
    });
  } catch {
    const apiError: ApiError = { error: 'Failed to fetch statistics' };
    return res.status(500).json(apiError);
  }
});

app.get('/categories', (_req: Request, res: Response) => {
  return res.json(VALID_CATEGORIES);
});

app.get('/health', (_req: Request, res: Response) => {
  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((_req: Request, res: Response) => {
  return res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

process.on('SIGINT', async () => {
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await database.close();
  process.exit(0);
});

async function start() {
  await database.init();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();

export default app;
