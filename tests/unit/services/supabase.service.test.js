const SupabaseService = require('../../../services/supabase.service');

describe('SupabaseService', () => {
  let supabaseService;
  let mockSupabase;

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabase = {
      storage: {
        from: jest.fn(() => ({
          upload: jest.fn(),
          list: jest.fn(),
          remove: jest.fn(),
          getPublicUrl: jest.fn()
        }))
      },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        single: jest.fn(),
        limit: jest.fn().mockReturnThis()
      }))
    };

    // Mock environment variables
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    process.env.SUPABASE_BUCKET_NAME = 'test-uploads';

    // Create instance
    supabaseService = new SupabaseService();
    supabaseService.supabase = mockSupabase;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const mockUpload = jest.fn().mockResolvedValue({
        data: { path: 'test/file.pdf' },
        error: null
      });

      const mockGetPublicUrl = jest.fn().mockReturnValue({
        data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/test-uploads/test/file.pdf' }
      });

      mockSupabase.storage.from.mockReturnValue({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl
      });

      const result = await supabaseService.uploadFile(
        Buffer.from('test content'),
        'test/file.pdf',
        'application/pdf'
      );

      expect(result).toEqual({
        success: true,
        path: 'test/file.pdf',
        publicUrl: 'https://test.supabase.co/storage/v1/object/public/test-uploads/test/file.pdf'
      });

      expect(mockSupabase.storage.from).toHaveBeenCalledWith('test-uploads');
      expect(mockUpload).toHaveBeenCalledWith(
        'test/file.pdf',
        Buffer.from('test content'),
        { contentType: 'application/pdf', upsert: false }
      );
    });

    it('should handle upload errors', async () => {
      const mockUpload = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Upload failed' }
      });

      mockSupabase.storage.from.mockReturnValue({
        upload: mockUpload
      });

      await expect(
        supabaseService.uploadFile(
          Buffer.from('test content'),
          'test/file.pdf',
          'application/pdf'
        )
      ).rejects.toThrow('Failed to upload file: Upload failed');
    });
  });

  describe('listFiles', () => {
    it('should list files with public URLs', async () => {
      const mockFiles = [
        { name: 'file1.pdf', created_at: '2024-01-01' },
        { name: 'file2.pdf', created_at: '2024-01-02' }
      ];

      const mockList = jest.fn().mockResolvedValue({
        data: mockFiles,
        error: null
      });

      const mockGetPublicUrl = jest.fn()
        .mockReturnValueOnce({ data: { publicUrl: 'https://test.supabase.co/file1.pdf' } })
        .mockReturnValueOnce({ data: { publicUrl: 'https://test.supabase.co/file2.pdf' } });

      mockSupabase.storage.from.mockReturnValue({
        list: mockList,
        getPublicUrl: mockGetPublicUrl
      });

      const result = await supabaseService.listFiles();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('publicUrl', 'https://test.supabase.co/file1.pdf');
      expect(result[1]).toHaveProperty('publicUrl', 'https://test.supabase.co/file2.pdf');
    });

    it('should handle list errors', async () => {
      const mockList = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'List failed' }
      });

      mockSupabase.storage.from.mockReturnValue({
        list: mockList
      });

      await expect(supabaseService.listFiles()).rejects.toThrow('Failed to list files: List failed');
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const mockRemove = jest.fn().mockResolvedValue({
        data: ['file.pdf'],
        error: null
      });

      mockSupabase.storage.from.mockReturnValue({
        remove: mockRemove
      });

      const result = await supabaseService.deleteFile('file.pdf');

      expect(result).toEqual({ success: true });
      expect(mockRemove).toHaveBeenCalledWith(['file.pdf']);
    });

    it('should handle delete errors', async () => {
      const mockRemove = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Delete failed' }
      });

      mockSupabase.storage.from.mockReturnValue({
        remove: mockRemove
      });

      await expect(supabaseService.deleteFile('file.pdf')).rejects.toThrow('Failed to delete file: Delete failed');
    });
  });

  describe('saveFile', () => {
    it('should save file metadata to database', async () => {
      const mockInsert = jest.fn().mockResolvedValue({
        data: {
          id: '123',
          filename: 'test.pdf',
          filepath: 'uploads/test.pdf'
        },
        error: null
      });

      const mockFrom = mockSupabase.from();
      mockFrom.insert = mockInsert;
      mockSupabase.from.mockReturnValue(mockFrom);

      const result = await supabaseService.saveFile({
        filename: 'test.pdf',
        filepath: 'uploads/test.pdf',
        mimetype: 'application/pdf',
        size: 1024
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('files');
      expect(mockInsert).toHaveBeenCalledWith({
        filename: 'test.pdf',
        filepath: 'uploads/test.pdf',
        mimetype: 'application/pdf',
        size: 1024
      });
    });
  });

  describe('getFile', () => {
    it('should retrieve file by id', async () => {
      const mockData = {
        id: '123',
        filename: 'test.pdf',
        filepath: 'uploads/test.pdf'
      };

      const mockSingle = jest.fn().mockResolvedValue({
        data: mockData,
        error: null
      });

      const mockFrom = mockSupabase.from();
      mockFrom.single = mockSingle;
      mockSupabase.from.mockReturnValue(mockFrom);

      const result = await supabaseService.getFile('123');

      expect(result).toEqual(mockData);
      expect(mockSingle).toHaveBeenCalled();
    });

    it('should return null when file not found', async () => {
      const mockSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      const mockFrom = mockSupabase.from();
      mockFrom.single = mockSingle;
      mockSupabase.from.mockReturnValue(mockFrom);

      const result = await supabaseService.getFile('999');

      expect(result).toBeNull();
    });
  });
});
