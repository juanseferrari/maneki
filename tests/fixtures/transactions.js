// Test fixtures for transactions

module.exports = {
  validTransaction: {
    id: 'txn-123',
    user_id: 'user-123',
    date: '2024-01-15',
    description: 'Starbucks Coffee',
    amount: -5.50,
    currency: 'USD',
    reference: 'REF-001',
    category_id: null
  },

  categorizedTransaction: {
    id: 'txn-456',
    user_id: 'user-123',
    date: '2024-01-16',
    description: 'Uber ride',
    amount: -15.00,
    currency: 'USD',
    reference: 'REF-002',
    category_id: 'cat-transport'
  },

  transactions: [
    {
      id: 'txn-001',
      user_id: 'user-123',
      date: '2024-01-01',
      description: 'Salary deposit',
      amount: 5000.00,
      currency: 'USD',
      type: 'income'
    },
    {
      id: 'txn-002',
      user_id: 'user-123',
      date: '2024-01-05',
      description: 'Rent payment',
      amount: -1500.00,
      currency: 'USD',
      type: 'expense',
      category_id: 'cat-housing'
    },
    {
      id: 'txn-003',
      user_id: 'user-123',
      date: '2024-01-10',
      description: 'Grocery shopping',
      amount: -85.50,
      currency: 'USD',
      type: 'expense',
      category_id: 'cat-food'
    }
  ],

  categoryRule: {
    id: 'rule-001',
    user_id: 'user-123',
    keyword: 'starbucks',
    category_id: 'cat-food',
    match_type: 'contains',
    field: 'description',
    priority: 1
  },

  categoryRules: [
    {
      id: 'rule-001',
      user_id: 'user-123',
      keyword: 'coffee',
      category_id: 'cat-food',
      match_type: 'contains',
      field: 'description',
      priority: 1
    },
    {
      id: 'rule-002',
      user_id: 'user-123',
      keyword: 'uber',
      category_id: 'cat-transport',
      match_type: 'contains',
      field: 'description',
      priority: 2
    },
    {
      id: 'rule-003',
      user_id: 'user-123',
      keyword: 'amazon prime',
      category_id: 'cat-subscription',
      match_type: 'contains',
      field: 'description',
      priority: 3
    }
  ],

  category: {
    id: 'cat-food',
    user_id: 'user-123',
    name: 'Food & Dining',
    color: '#FF6B6B',
    icon: 'utensils'
  },

  categories: [
    {
      id: 'cat-food',
      user_id: 'user-123',
      name: 'Food & Dining',
      color: '#FF6B6B',
      icon: 'utensils'
    },
    {
      id: 'cat-transport',
      user_id: 'user-123',
      name: 'Transportation',
      color: '#4ECDC4',
      icon: 'car'
    },
    {
      id: 'cat-housing',
      user_id: 'user-123',
      name: 'Housing',
      color: '#95E1D3',
      icon: 'home'
    }
  ],

  file: {
    id: 'file-123',
    user_id: 'user-123',
    filename: 'statement.pdf',
    filepath: 'uploads/user-123/statement.pdf',
    mimetype: 'application/pdf',
    size: 102400,
    transaction_count: 5,
    created_at: '2024-01-15T10:00:00Z'
  }
};
