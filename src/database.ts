import { MongoClient, Collection, Db } from 'mongodb';
import { Expense } from './types';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'expense_tracker';

let client: MongoClient | null = null;
let db: Db;
let expensesCollection: Collection<Expense>;
let connecting: Promise<void> | null = null;

async function connect(): Promise<void> {
  if (client) return;

  if (!connecting) {
    connecting = (async () => {
      client = new MongoClient(MONGODB_URI);
      await client.connect();
      db = client.db(DB_NAME);
      expensesCollection = db.collection<Expense>('expenses');

      await expensesCollection.createIndex(
        { idempotency_key: 1 },
        { unique: true, sparse: true }
      );
      await expensesCollection.createIndex({ category: 1 });
      await expensesCollection.createIndex({ date: -1, created_at: -1 });
    })();
  }

  await connecting;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const database = {
  async init(): Promise<void> {
    await connect();
  },

  async createExpense(expense: Expense): Promise<Expense> {
    await connect();

    const result = await expensesCollection.findOneAndUpdate(
      { idempotency_key: expense.idempotency_key },
      { $setOnInsert: expense },
      { upsert: true, returnDocument: 'after' }
    );

    return result!;
  },

  async findById(id: string): Promise<Expense | null> {
    await connect();
    return expensesCollection.findOne({ id });
  },

  async findByIdempotencyKey(key: string): Promise<Expense | null> {
    await connect();
    return expensesCollection.findOne({ idempotency_key: key });
  },

  async updateExpense(id: string, updates: Partial<Expense>): Promise<Expense | null> {
    await connect();
    return expensesCollection.findOneAndUpdate(
      { id },
      { $set: updates },
      { returnDocument: 'after' }
    );
  },

  async deleteExpense(id: string): Promise<boolean> {
    await connect();
    const result = await expensesCollection.deleteOne({ id });
    return result.deletedCount === 1;
  },

  async getExpenses(
    category?: string,
    sort: 'date_desc' | 'date_asc' = 'date_desc',
    page = 1,
    limit = 0
  ): Promise<PaginatedResult<Expense>> {
    await connect();

    const filter: Record<string, string> = {};
    if (category) filter.category = category;

    const sortOrder = sort === 'date_asc' ? 1 : -1;
    const total = await expensesCollection.countDocuments(filter);

    let query = expensesCollection
      .find(filter)
      .sort({ date: sortOrder, created_at: sortOrder });

    if (limit > 0) {
      query = query.skip((page - 1) * limit).limit(limit);
    }

    const data = await query.toArray();

    return {
      data,
      total,
      page: limit > 0 ? page : 1,
      limit: limit > 0 ? limit : total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1
    };
  },

  async getMonthlyStats(): Promise<{ month: string; total: number; count: number }[]> {
    await connect();

    const result = await expensesCollection.aggregate([
      {
        $group: {
          _id: { $substr: ['$date', 0, 7] },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 12 }
    ]).toArray();

    return result.map(r => ({
      month: r._id,
      total: r.total,
      count: r.count
    }));
  },

  async getCategoryStats(): Promise<{ category: string; total: number; count: number }[]> {
    await connect();

    const result = await expensesCollection.aggregate([
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]).toArray();

    return result.map(r => ({
      category: r._id,
      total: r.total,
      count: r.count
    }));
  },

  async getCategories(): Promise<string[]> {
    await connect();
    return (await expensesCollection.distinct('category')).sort();
  },

  async clear(): Promise<void> {
    await connect();
    await expensesCollection.deleteMany({});
  },

  async close(): Promise<void> {
    if (client) await client.close();
    client = null;
    connecting = null;
  }
};

export default database;
