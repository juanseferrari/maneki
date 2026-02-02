const CategorizationService = require('../../../services/categorization.service');

describe('CategorizationService', () => {
  let categorizationService;
  let mockSupabaseAdmin;

  beforeEach(() => {
    // Mock Supabase admin client
    mockSupabaseAdmin = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        single: jest.fn()
      }))
    };

    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

    categorizationService = new CategorizationService();
    categorizationService.supabaseAdmin = mockSupabaseAdmin;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('autoCategorizeTransaction', () => {
    it('should return existing category_id if transaction already categorized', async () => {
      const transaction = {
        description: 'Coffee Shop',
        category_id: 'existing-category-id'
      };

      const result = await categorizationService.autoCategorizeTransaction(transaction, 'user123');

      expect(result).toBe('existing-category-id');
    });

    it('should return null if no rules are found', async () => {
      const transaction = {
        description: 'Coffee Shop',
        category_id: null
      };

      // Mock getCategoryRules to return empty array
      jest.spyOn(categorizationService, 'getCategoryRules').mockResolvedValue([]);

      const result = await categorizationService.autoCategorizeTransaction(transaction, 'user123');

      expect(result).toBeNull();
    });

    it('should match rule and return category_id', async () => {
      const transaction = {
        description: 'Starbucks Coffee',
        amount: -5.50,
        category_id: null
      };

      const rules = [
        {
          id: 'rule1',
          keyword: 'coffee',
          category_id: 'food-category',
          priority: 1,
          match_type: 'contains',
          field: 'description'
        }
      ];

      jest.spyOn(categorizationService, 'getCategoryRules').mockResolvedValue(rules);
      jest.spyOn(categorizationService, 'matchRule').mockReturnValue(true);

      const result = await categorizationService.autoCategorizeTransaction(transaction, 'user123');

      expect(result).toBe('food-category');
      expect(categorizationService.matchRule).toHaveBeenCalledWith(transaction, rules[0]);
    });

    it('should pick most specific rule (longest keyword) when multiple rules match', async () => {
      const transaction = {
        description: 'Amazon Prime Subscription',
        category_id: null
      };

      const rules = [
        {
          id: 'rule1',
          keyword: 'amazon',
          category_id: 'shopping-category',
          priority: 1,
          match_type: 'contains',
          field: 'description'
        },
        {
          id: 'rule2',
          keyword: 'amazon prime',
          category_id: 'subscription-category',
          priority: 2,
          match_type: 'contains',
          field: 'description'
        }
      ];

      jest.spyOn(categorizationService, 'getCategoryRules').mockResolvedValue(rules);
      jest.spyOn(categorizationService, 'matchRule').mockReturnValue(true);

      const result = await categorizationService.autoCategorizeTransaction(transaction, 'user123');

      // Should pick 'amazon prime' (longer keyword) over 'amazon'
      expect(result).toBe('subscription-category');
    });

    it('should handle errors gracefully', async () => {
      const transaction = {
        description: 'Test',
        category_id: null
      };

      jest.spyOn(categorizationService, 'getCategoryRules').mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        categorizationService.autoCategorizeTransaction(transaction, 'user123')
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('matchRule', () => {
    it('should match "contains" rule on description field', () => {
      const transaction = {
        description: 'Uber ride to airport'
      };

      const rule = {
        keyword: 'uber',
        match_type: 'contains',
        field: 'description'
      };

      const result = categorizationService.matchRule(transaction, rule);

      expect(result).toBe(true);
    });

    it('should match case-insensitively', () => {
      const transaction = {
        description: 'STARBUCKS COFFEE'
      };

      const rule = {
        keyword: 'starbucks',
        match_type: 'contains',
        field: 'description'
      };

      const result = categorizationService.matchRule(transaction, rule);

      expect(result).toBe(true);
    });

    it('should not match if keyword not present', () => {
      const transaction = {
        description: 'Local coffee shop'
      };

      const rule = {
        keyword: 'starbucks',
        match_type: 'contains',
        field: 'description'
      };

      const result = categorizationService.matchRule(transaction, rule);

      expect(result).toBe(false);
    });

    it('should match "exact" rule type', () => {
      const transaction = {
        description: 'netflix'
      };

      const rule = {
        keyword: 'netflix',
        match_type: 'exact',
        field: 'description'
      };

      const result = categorizationService.matchRule(transaction, rule);

      expect(result).toBe(true);
    });

    it('should not match "exact" rule if not exact', () => {
      const transaction = {
        description: 'netflix subscription'
      };

      const rule = {
        keyword: 'netflix',
        match_type: 'exact',
        field: 'description'
      };

      const result = categorizationService.matchRule(transaction, rule);

      expect(result).toBe(false);
    });

    it('should match on reference field', () => {
      const transaction = {
        reference: 'REF-12345-AMAZON'
      };

      const rule = {
        keyword: 'amazon',
        match_type: 'contains',
        field: 'reference'
      };

      const result = categorizationService.matchRule(transaction, rule);

      expect(result).toBe(true);
    });
  });

  describe('getCategoryRules', () => {
    it('should fetch and return category rules for user', async () => {
      const mockRules = [
        { id: 'rule1', keyword: 'coffee', category_id: 'cat1', priority: 1 },
        { id: 'rule2', keyword: 'uber', category_id: 'cat2', priority: 2 }
      ];

      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockRules,
          error: null
        })
      };

      mockSupabaseAdmin.from.mockReturnValue(mockFrom);

      const result = await categorizationService.getCategoryRules('user123');

      expect(result).toEqual(mockRules);
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('category_rules');
      expect(mockFrom.eq).toHaveBeenCalledWith('user_id', 'user123');
      expect(mockFrom.order).toHaveBeenCalledWith('priority', { ascending: false });
    });

    it('should return empty array if no rules found', async () => {
      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      };

      mockSupabaseAdmin.from.mockReturnValue(mockFrom);

      const result = await categorizationService.getCategoryRules('user123');

      expect(result).toEqual([]);
    });

    it('should throw error on database failure', async () => {
      const mockFrom = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' }
        })
      };

      mockSupabaseAdmin.from.mockReturnValue(mockFrom);

      await expect(
        categorizationService.getCategoryRules('user123')
      ).rejects.toThrow();
    });
  });
});
