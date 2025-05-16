// This test file is used to test Kubernetes Service functionalities
import { expect, test, describe, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CreateNamespaceResponseSchema } from "../src/types";
import { KubernetesManager } from "../src/types";
import { z } from "zod";

// Define the schema for the Service response
const ServiceResponseSchema = z.any();

// Interface for service response type
interface ServiceResponse {
  serviceName: string;
  namespace: string;
  type: string;
  clusterIP: string;
  ports: Array<{
    port: number;
    targetPort: number | string;
    protocol: string;
    name: string;
    nodePort?: number;
  }>;
  status: string;
}

// Interface for list services response
interface ListServicesResponse {
  services: Array<{
    name: string;
    namespace: string;
    type: string;
    clusterIP: string;
    ports: Array<any>;
    createdAt: string;
  }>;
}

// Interface for update service response
interface UpdateServiceResponse {
  message: string;
  service: {
    name: string;
    namespace: string;
    type: string;
    clusterIP: string;
    ports: Array<any>;
  };
}

// Interface for delete service response
interface DeleteServiceResponse {
  success: boolean;
  status: string;
}

// Utility function: Sleep for a specified number of milliseconds
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Utility function: Generate a random ID string
function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// Utility function: Generate a random SHA string for resource naming in tests
function generateRandomSHA(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Utility function: Parse JSON response
function parseServiceResponse(responseText: string): ServiceResponse | null {
  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Failed to parse service response:", error);
    return null;
  }
}

// Utility function: Parse list services response
function parseListServicesResponse(responseText: string): ListServicesResponse | null {
  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Failed to parse list services response:", error);
    return null;
  }
}

// Utility function: Parse update service response
function parseUpdateServiceResponse(responseText: string): UpdateServiceResponse | null {
  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Failed to parse update service response:", error);
    return null;
  }
}

// Utility function: Parse delete service response
function parseDeleteServiceResponse(responseText: string): DeleteServiceResponse | null {
  try {
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Failed to parse delete service response:", error);
    return null;
  }
}

// Test suite: Testing Service functionality
describe("test kubernetes service", () => {
  let transport: StdioClientTransport;
  let client: Client;
  const NAMESPACE_PREFIX = "test-service";
  let testNamespace: string;

  const testServiceName = `test-service-${generateRandomSHA()}`;

  // Setup before each test
  beforeEach(async () => {
    try {
      // Initialize client transport layer, communicating with the service process via stdio
      transport = new StdioClientTransport({
        command: "bun",
        args: ["src/index.ts"],
        stderr: "pipe",
      });

      // Create an instance of the MCP client
      client = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect to the service
      await client.connect(transport);
      // Wait for the connection to be established
      await sleep(1000);

      // Create a unique test namespace to isolate the test environment
      testNamespace = `${NAMESPACE_PREFIX}-${generateRandomId()}`;
      console.log(`Creating test namespace: ${testNamespace}`);

      // Call API to create the namespace
      await client.request<any>(
        {
          method: "tools/call",
          params: {
            name: "create_namespace",
            arguments: {
              name: testNamespace,
            },
          },
        },
        CreateNamespaceResponseSchema,
      );

      // Wait for the namespace to be fully created
      await sleep(2000);
    } catch (error: any) {
      console.error("Error in beforeEach:", error);
      throw error;
    }
  });

  // Cleanup after each test
  afterEach(async () => {
    try {
      // Clean up the test namespace by directly calling the API
      console.log(`Cleaning up test namespace: ${testNamespace}`);
      const k8sManager = new KubernetesManager();

      // @ts-ignore
      await k8sManager.getCoreApi().deleteNamespace(testNamespace);

      // Close the client connection
      await transport.close();
      await sleep(1000);
    } catch (e) {
      console.error("Error during cleanup:", e);
    }
  });

  // Test case: Create ClusterIP service
  test("create ClusterIP service", async () => {
    // Define test data
    const testPorts = [{ port: 80, targetPort: 8080, protocol: "TCP", name: "http" }];
    const testSelector = { app: "test-app", tier: "backend" };
    
    // Create the service
    const response = await client.request<any>(
      {
        method: "tools/call",
        params: { 
          name: "create_service", 
          arguments: { 
            name: testServiceName, 
            namespace: testNamespace, 
            type: "ClusterIP", 
            selector: testSelector, 
            ports: testPorts 
          } 
        },
      },
      ServiceResponseSchema
    );
    await sleep(1000);
    
    // Verify response
    const parsedResponse = parseServiceResponse(response.content[0].text)!;
    console.log("ClusterIP service creation response:", parsedResponse);
    
    // Assert service properties
    expect(parsedResponse).not.toBeNull();
    expect(parsedResponse.serviceName).toBe(testServiceName);
    expect(parsedResponse.namespace).toBe(testNamespace);
    expect(parsedResponse.type).toBe("ClusterIP");
    expect(parsedResponse.status).toBe("created");
    
    // Assert port configuration
    expect(parsedResponse.ports).toHaveLength(1);
    expect(parsedResponse.ports[0].port).toBe(80);
    expect(parsedResponse.ports[0].targetPort).toBe(8080);
  });

  // Test case: List services
  test("list services", async () => {
    // Define test data
    const testPorts = [{ port: 80, targetPort: 8080, protocol: "TCP", name: "http" }];
    
    // First create a service to list
    const createResponse = await client.request<any>(
      { 
        method: "tools/call", 
        params: { 
          name: "create_service", 
          arguments: { 
            name: testServiceName, 
            namespace: testNamespace, 
            ports: testPorts
          } 
        } 
      }, 
      ServiceResponseSchema
    );
    await sleep(1000);
    
    // List the services using kubectl_list
    const response = await client.request<any>(
      { 
        method: "tools/call", 
        params: { 
          name: "kubectl_list", 
          arguments: { 
            resourceType: "services",
            namespace: testNamespace,
            output: "formatted"
          } 
        } 
      }, 
      ServiceResponseSchema
    );
    
    // Verify response
    const responseText = response.content[0].text;
    console.log("Services list response:", responseText);
    
    // Assert service is in the list
    expect(responseText).toContain(testServiceName);
    expect(responseText).toContain(testNamespace);
    expect(responseText).toContain("ClusterIP"); // Assuming default type is ClusterIP
    expect(responseText).toContain("80"); // The port we defined
  });

  // Test case: Describe service
  test("describe service", async () => {
    // Define test data
    const testPorts = [{ port: 80, targetPort: 8080, protocol: "TCP", name: "http" }];
    const serviceSelector = { app: "test-app", component: "api" };
    
    // First create a service to describe
    const createResponse = await client.request<any>(
      { 
        method: "tools/call", 
        params: { 
          name: "create_service", 
          arguments: { 
            name: testServiceName, 
            namespace: testNamespace, 
            ports: testPorts,
            selector: serviceSelector,
            type: "ClusterIP"
          } 
        } 
      }, 
      ServiceResponseSchema
    );
    await sleep(1000);
    
    // List all services in the namespace using kubectl_list
    const listResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "kubectl_list",
          arguments: {
            resourceType: "services",
            namespace: testNamespace,
            output: "formatted"
          }
        }
      },
      ServiceResponseSchema
    );
    console.log("Services list:", listResponse.content[0].text);
    
    // Get the service using kubectl_get
    const getResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "kubectl_get",
          arguments: {
            resourceType: "service",
            name: testServiceName,
            namespace: testNamespace,
            output: "json"
          }
        }
      },
      ServiceResponseSchema
    );
    
    const getServiceJson = JSON.parse(getResponse.content[0].text);
    console.log("Service GET response:", getServiceJson);
    
    // Describe the service using kubectl_describe
    const describeResponse = await client.request<any>(
      { 
        method: "tools/call", 
        params: { 
          name: "kubectl_describe", 
          arguments: { 
            resourceType: "service",
            name: testServiceName, 
            namespace: testNamespace 
          } 
        } 
      }, 
      ServiceResponseSchema
    );
    
    // Log the first part of the describe output
    console.log("Service describe output (first 150 chars):", describeResponse.content[0].text.substring(0, 150) + "...");
    
    // Verify service details from get response
    expect(getServiceJson).not.toBeNull();
    expect(getServiceJson.metadata.name).toBe(testServiceName);
    expect(getServiceJson.metadata.namespace).toBe(testNamespace);
    expect(getServiceJson.spec.ports).toHaveLength(1);
    expect(getServiceJson.spec.ports[0].port).toBe(80);
    expect(getServiceJson.spec.selector).toEqual(serviceSelector);
    
    // Verify the describe output contains key service information
    const describeOutput = describeResponse.content[0].text;
    expect(describeOutput).toContain(testServiceName);
    expect(describeOutput).toContain(testNamespace);
    expect(describeOutput).toContain("80");
    expect(describeOutput).toContain("ClusterIP");
  });

  // Test case: Update service
  test("update service", async () => {
    // Define test data
    const initialPorts = [{ port: 80, targetPort: 8080, protocol: "TCP", name: "http" }];
    const updatedPorts = [{ port: 90, targetPort: 9090, protocol: "TCP", name: "http-updated" }];
    const serviceSelector = { app: "test-app", tier: "backend" };
    const testLabels = { environment: "test", managed: "mcp" };
    
    // First create a service to update
    const createResponse = await client.request<any>(
      { 
        method: "tools/call", 
        params: { 
          name: "create_service", 
          arguments: { 
            name: testServiceName, 
            namespace: testNamespace, 
            ports: initialPorts,
            selector: serviceSelector
          } 
        } 
      }, 
      ServiceResponseSchema
    );
    await sleep(1000);
    
    // List all services in the namespace using kubectl_list
    const listBeforeResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "kubectl_list",
          arguments: {
            resourceType: "services",
            namespace: testNamespace,
            output: "formatted"
          }
        }
      },
      ServiceResponseSchema
    );
    console.log("Services before update:", listBeforeResponse.content[0].text);
    
    // Get the service using kubectl_get
    const getResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "kubectl_get",
          arguments: {
            resourceType: "service",
            name: testServiceName,
            namespace: testNamespace,
            output: "json"
          }
        }
      },
      ServiceResponseSchema
    );
    
    const initialService = JSON.parse(getResponse.content[0].text);
    console.log("Initial service GET response:", initialService);
    
    // Verify initial service properties
    expect(initialService.spec.ports[0].port).toBe(80);
    expect(initialService.spec.ports[0].targetPort).toBe(8080);
    
    // Describe the service using kubectl_describe
    const describeResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "kubectl_describe",
          arguments: {
            resourceType: "service",
            name: testServiceName,
            namespace: testNamespace
          }
        }
      },
      ServiceResponseSchema
    );
    console.log("Service DESCRIBE output:", describeResponse.content[0].text.substring(0, 150) + "...");
    
    // Use kubectl apply to modify the service with yaml
    const currentSpec = initialService.spec;
    const modifiedService = {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name: testServiceName,
        namespace: testNamespace,
        labels: testLabels
      },
      spec: {
        ...currentSpec,
        ports: updatedPorts,
        selector: { ...serviceSelector, updated: "true" }
      }
    };
    
    // Apply the modified service using kubectl_apply
    const applyResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "kubectl_apply",
          arguments: {
            manifest: JSON.stringify(modifiedService),
            namespace: testNamespace
          }
        }
      },
      ServiceResponseSchema
    );
    console.log("Apply response:", applyResponse.content[0].text);
    await sleep(1000);
    
    // Update the service using update_service
    const updateResponse = await client.request<any>(
      { 
        method: "tools/call", 
        params: { 
          name: "update_service", 
          arguments: { 
            name: testServiceName, 
            namespace: testNamespace, 
            ports: updatedPorts,
            type: "ClusterIP",
            selector: { ...serviceSelector, updated: "true" }
          } 
        } 
      }, 
      ServiceResponseSchema
    );
    await sleep(1000);
    
    // Verify response
    const parsedResponse = parseUpdateServiceResponse(updateResponse.content[0].text)!;
    console.log("Service update response:", parsedResponse);
    
    // Assert update was successful
    expect(parsedResponse).not.toBeNull();
    expect(parsedResponse.message).toBe("Service updated successfully");
    expect(parsedResponse.service.name).toBe(testServiceName);
    
    // Verify updated properties
    expect(parsedResponse.service.ports).toHaveLength(1);
    expect(parsedResponse.service.ports[0].port).toBe(90);
    expect(parsedResponse.service.ports[0].targetPort).toBe(9090);
    
    // List all services after update to verify changes
    const listAfterResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "kubectl_list",
          arguments: {
            resourceType: "services",
            namespace: testNamespace,
            output: "formatted"
          }
        }
      },
      ServiceResponseSchema
    );
    console.log("Services after update:", listAfterResponse.content[0].text);
    
    // Get the updated service with kubectl_get to verify changes
    const getUpdatedResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "kubectl_get",
          arguments: {
            resourceType: "service",
            name: testServiceName,
            namespace: testNamespace,
            output: "json"
          }
        }
      },
      ServiceResponseSchema
    );
    
    const updatedService = JSON.parse(getUpdatedResponse.content[0].text);
    console.log("Updated service GET response:", updatedService);
    
    // Comprehensive verification of the updated service
    expect(updatedService.spec.ports[0].port).toBe(90);
    expect(updatedService.spec.ports[0].targetPort).toBe(9090);
    expect(updatedService.spec.ports[0].name).toBe("http-updated");
    expect(updatedService.spec.selector.updated).toBe("true");
    expect(updatedService.spec.type).toBe("ClusterIP");
    
    // Use kubectl_get with wide output format
    const getWideResponse = await client.request<any>(
      {
        method: "tools/call",
        params: {
          name: "kubectl_get",
          arguments: {
            resourceType: "service",
            name: testServiceName,
            namespace: testNamespace,
            output: "wide"
          }
        }
      },
      ServiceResponseSchema
    );
    console.log("Service GET wide format:", getWideResponse.content[0].text);
  });

  // Test case: Delete service
  test("delete service", async () => {
    // Define test data
    const testPorts = [{ port: 80, targetPort: 8080, protocol: "TCP", name: "http" }];
    
    // First create a service to delete
    const createResponse = await client.request<any>(
      { 
        method: "tools/call", 
        params: { 
          name: "create_service", 
          arguments: { 
            name: testServiceName, 
            namespace: testNamespace, 
            ports: testPorts
          } 
        } 
      }, 
      ServiceResponseSchema
    );
    await sleep(1000);
    
    // Delete the service
    const response = await client.request<any>(
      { 
        method: "tools/call", 
        params: { 
          name: "delete_service", 
          arguments: { 
            name: testServiceName, 
            namespace: testNamespace 
          } 
        } 
      }, 
      ServiceResponseSchema
    );
    await sleep(1000);
    
    // Verify response
    const parsedResponse = parseDeleteServiceResponse(response.content[0].text)!;
    console.log("Service deletion response:", parsedResponse);
    
    // Assert deletion was successful
    expect(parsedResponse).not.toBeNull();
    expect(parsedResponse.success).toBe(true);
    expect(parsedResponse.status).toBe("deleted");
    
    // List services to verify deletion
    const listResponse = await client.request<any>(
      { 
        method: "tools/call", 
        params: { 
          name: "list_services", 
          arguments: { 
            namespace: testNamespace 
          } 
        } 
      }, 
      ServiceResponseSchema
    );
    
    // Verify service is no longer in the list
    const listResult = parseListServicesResponse(listResponse.content[0].text)!;
    console.log("Services list after deletion:", listResult);
    
    // Assert service is not found
    expect(listResult.services.find(svc => svc.name === testServiceName)).toBeUndefined();
  });

  // Test case: Create NodePort service
  test("create NodePort service", async () => {
    // Define test data
    const testPorts = [{ port: 80, targetPort: 8080, protocol: "TCP", name: "http", nodePort: 30080 }];
    
    // Create the service
    const response = await client.request<any>(
      { 
        method: "tools/call", 
        params: { 
          name: "create_service", 
          arguments: { 
            name: `${testServiceName}-nodeport`, 
            namespace: testNamespace, 
            type: "NodePort", 
            ports: testPorts 
          } 
        } 
      },
      ServiceResponseSchema
    );
    await sleep(1000);
    
    // Verify response
    const parsedResponse = parseServiceResponse(response.content[0].text)!;
    console.log("NodePort service creation response:", parsedResponse);
    
    // Assert service properties
    expect(parsedResponse).not.toBeNull();
    expect(parsedResponse.serviceName).toBe(`${testServiceName}-nodeport`);
    expect(parsedResponse.namespace).toBe(testNamespace);
    expect(parsedResponse.type).toBe("NodePort");
    expect(parsedResponse.status).toBe("created");
    
    // Assert port configuration
    expect(parsedResponse.ports).toHaveLength(1);
    expect(parsedResponse.ports[0].port).toBe(80);
    expect(parsedResponse.ports[0].nodePort).toBe(30080);
  });

  // Test case: Create LoadBalancer service
  test("create LoadBalancer service", async () => {
    // Define test data
    const testPorts = [{ port: 80, targetPort: 8080, protocol: "TCP", name: "http" }];
    
    // Create the service
    const response = await client.request<any>(
      { 
        method: "tools/call", 
        params: { 
          name: "create_service", 
          arguments: { 
            name: `${testServiceName}-lb`, 
            namespace: testNamespace, 
            type: "LoadBalancer", 
            ports: testPorts 
          } 
        } 
      },
      ServiceResponseSchema
    );
    await sleep(1000);
    
    // Verify response
    const parsedResponse = parseServiceResponse(response.content[0].text)!;
    console.log("LoadBalancer service creation response:", parsedResponse);
    
    // Assert service properties
    expect(parsedResponse).not.toBeNull();
    expect(parsedResponse.serviceName).toBe(`${testServiceName}-lb`);
    expect(parsedResponse.namespace).toBe(testNamespace);
    expect(parsedResponse.type).toBe("LoadBalancer");
    expect(parsedResponse.status).toBe("created");
    
    // Assert structure
    expect(parsedResponse.clusterIP).toBeDefined();
    expect(parsedResponse.ports).toHaveLength(1);
  });
});