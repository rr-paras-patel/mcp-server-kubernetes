import { expect, describe, test, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { KubernetesManager } from '../src/utils/kubernetes-manager.js';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn()
}));

describe('KubernetesManager', () => {
  let kubernetesManager: KubernetesManager;
  
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Create a new instance for each test with mocked constructor behavior
    vi.spyOn(KubernetesManager.prototype, 'isRunningInCluster' as any).mockImplementation(() => false);
    kubernetesManager = new KubernetesManager();
    vi.restoreAllMocks();
  });

  describe('isRunningInCluster', () => {
    test('should return true when service account token exists', () => {
      // Mock fs.existsSync to return true
      (fs.existsSync as any).mockReturnValueOnce(true);
      
      // Use any to access private method
      const result = (kubernetesManager as any).isRunningInCluster();
      
      // Verify result
      expect(result).toBe(true);
      
      // Verify fs.existsSync was called with correct path
      expect(fs.existsSync).toHaveBeenCalledWith('/var/run/secrets/kubernetes.io/serviceaccount/token');
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
    });

    test('should return false when service account token does not exist', () => {
      // Mock fs.existsSync to return false
      (fs.existsSync as any).mockReturnValueOnce(false);
      
      // Use any to access private method
      const result = (kubernetesManager as any).isRunningInCluster();
      
      // Verify result
      expect(result).toBe(false);
      
      // Verify fs.existsSync was called with correct path
      expect(fs.existsSync).toHaveBeenCalledWith('/var/run/secrets/kubernetes.io/serviceaccount/token');
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
    });

    test('should return false when fs.existsSync throws an error', () => {
      // Mock fs.existsSync to throw an error
      (fs.existsSync as any).mockImplementationOnce(() => {
        throw new Error('Some filesystem error');
      });
      
      // Use any to access private method
      const result = (kubernetesManager as any).isRunningInCluster();
      
      // Verify result
      expect(result).toBe(false);
      
      // Verify fs.existsSync was called with correct path
      expect(fs.existsSync).toHaveBeenCalledWith('/var/run/secrets/kubernetes.io/serviceaccount/token');
      expect(fs.existsSync).toHaveBeenCalledTimes(1);
    });
  });
}); 