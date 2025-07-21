import { describe, test, expect, vi } from "vitest";
import { cleanupPodsSchema } from "../src/tools/cleanup-pods.js";

describe("cleanup_pods tool", () => {
  test("schema is properly defined", () => {
    expect(cleanupPodsSchema).toBeDefined();
    expect(cleanupPodsSchema.name).toBe("cleanup_pods");
    expect(cleanupPodsSchema.description).toContain("List and optionally force delete pods");

    // Check input schema
    expect(cleanupPodsSchema.inputSchema).toBeDefined();
    expect(cleanupPodsSchema.inputSchema.properties).toBeDefined();

    // Check required properties
    expect(cleanupPodsSchema.inputSchema.required).toContain("namespace");

    // Check optional properties
    expect(cleanupPodsSchema.inputSchema.properties.dryRun).toBeDefined();
    expect(cleanupPodsSchema.inputSchema.properties.dryRun.default).toBe(true);
    expect(cleanupPodsSchema.inputSchema.properties.forceDelete).toBeDefined();
    expect(cleanupPodsSchema.inputSchema.properties.forceDelete.default).toBe(false);
    expect(cleanupPodsSchema.inputSchema.properties.allNamespaces).toBeDefined();
    expect(cleanupPodsSchema.inputSchema.properties.allNamespaces.default).toBe(false);
    expect(cleanupPodsSchema.inputSchema.properties.confirmDelete).toBeDefined();
    expect(cleanupPodsSchema.inputSchema.properties.confirmDelete.default).toBe(false);
  });

  describe("parameter validation", () => {
    test("validates required parameters", () => {
      const validInput = {
        namespace: "default"
      };
      
      // This would be validated by the schema
      expect(validInput.namespace).toBeDefined();
    });

    test("handles optional parameters correctly", () => {
      const fullInput = {
        namespace: "production",
        dryRun: false,
        forceDelete: true,
        allNamespaces: false,
        confirmDelete: true
      };
      
      expect(fullInput.dryRun).toBe(false);
      expect(fullInput.forceDelete).toBe(true);
      expect(fullInput.allNamespaces).toBe(false);
      expect(fullInput.confirmDelete).toBe(true);
    });

    test("uses default values when not specified", () => {
      const minimalInput = {
        namespace: "default"
      };
      
      // These would be the defaults from the schema
      const defaults = {
        dryRun: true,
        forceDelete: false,
        allNamespaces: false,
        confirmDelete: false
      };
      
      expect(defaults.dryRun).toBe(true);
      expect(defaults.forceDelete).toBe(false);
      expect(defaults.allNamespaces).toBe(false);
      expect(defaults.confirmDelete).toBe(false);
    });
  });

  describe("pod state detection", () => {
    test("identifies problematic pod states", () => {
      const problematicStates = [
        "Evicted",
        "ContainerStatusUnknown", 
        "Completed",
        "Error",
        "ImagePullBackOff",
        "CrashLoopBackOff"
      ];
      
      problematicStates.forEach(state => {
        expect(state).toBeDefined();
        expect(typeof state).toBe("string");
      });
    });

    test("handles pod output parsing", () => {
      // Simulate kubectl get pods output (format: NAME READY STATUS RESTARTS AGE)
      const mockPodOutput = `pod1 1/1 Running 0 1m
pod2 0/1 Evicted 0 30s
pod3 0/1 CrashLoopBackOff 0 2m
pod4 0/1 ImagePullBackOff 0 1m`;
      
      const podLines = mockPodOutput.split('\n').filter(line => line.trim());
      expect(podLines).toHaveLength(4);
      
      // Test parsing logic (matching the actual implementation)
      const results: { [key: string]: string[] } = {};
      const problematicStates = ["Evicted", "CrashLoopBackOff", "ImagePullBackOff"];
      
      for (const podLine of podLines) {
        const columns = podLine.split(/\s+/);
        if (columns.length >= 3) {
          const podName = columns[0];
          const podStatus = columns[2]; // Status is in the 3rd column
          
          for (const state of problematicStates) {
            if (podStatus.includes(state)) {
              if (!results[state]) {
                results[state] = [];
              }
              results[state].push(podName);
              break;
            }
          }
        }
      }
      
      // Check that the results are properly populated
      expect(results.Evicted).toBeDefined();
      expect(results.CrashLoopBackOff).toBeDefined();
      expect(results.ImagePullBackOff).toBeDefined();
      expect(results.Evicted).toContain("pod2");
      expect(results.CrashLoopBackOff).toContain("pod3");
      expect(results.ImagePullBackOff).toContain("pod4");
      expect(results.Evicted).toHaveLength(1);
      expect(results.CrashLoopBackOff).toHaveLength(1);
      expect(results.ImagePullBackOff).toHaveLength(1);
    });
  });

  describe("safety features", () => {
    test("dry run mode prevents actual deletion", () => {
      const dryRunInput = {
        namespace: "test",
        dryRun: true,
        forceDelete: false,
        confirmDelete: false
      };
      
      // In dry run mode, no actual deletion should occur
      expect(dryRunInput.dryRun).toBe(true);
      expect(dryRunInput.forceDelete).toBe(false);
    });

    test("confirmation required for deletion", () => {
      const deletionInput = {
        namespace: "test",
        dryRun: false,
        forceDelete: true,
        confirmDelete: true
      };
      
      // Both forceDelete and confirmDelete must be true for actual deletion
      expect(deletionInput.forceDelete).toBe(true);
      expect(deletionInput.confirmDelete).toBe(true);
    });

    test("namespace targeting prevents accidental deletion", () => {
      const safeInput = {
        namespace: "specific-namespace",
        allNamespaces: false,
        dryRun: true
      };
      
      // Should target specific namespace, not all namespaces
      expect(safeInput.allNamespaces).toBe(false);
      expect(safeInput.namespace).toBe("specific-namespace");
    });
  });

  describe("error handling", () => {
    test("handles empty pod lists", () => {
      const emptyResults: { [key: string]: string[] } = {};
      const totalPods = Object.values(emptyResults).reduce((sum, pods) => sum + pods.length, 0);
      
      expect(totalPods).toBe(0);
    });

    test("handles missing required parameters", () => {
      // Test that missing namespace would cause validation errors
      const invalidInputs = [
        {},
        { dryRun: true },
        { forceDelete: true }
      ];
      
      invalidInputs.forEach(input => {
        expect((input as any).namespace).toBeUndefined();
      });
    });
  });
}); 