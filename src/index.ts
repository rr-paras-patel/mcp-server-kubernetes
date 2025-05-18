#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  installHelmChart,
  installHelmChartSchema,
  upgradeHelmChart,
  upgradeHelmChartSchema,
  uninstallHelmChart,
  uninstallHelmChartSchema,
} from "./tools/helm-operations.js";
import {
  explainResource,
  explainResourceSchema,
  listApiResources,
  listApiResourcesSchema,
} from "./tools/kubectl-operations.js";
import { execInPod, execInPodSchema } from "./tools/exec_in_pod.js";
import { getResourceHandlers } from "./resources/handlers.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import * as k8s from "@kubernetes/client-node";
import { KubernetesManager } from "./types.js";
import { serverConfig } from "./config/server-config.js";
// Removed createDeploymentSchema import - using kubectl_create instead
import { listNamespacesSchema } from "./config/namespace-config.js";
import { cleanupSchema } from "./config/cleanup-config.js";
import { startSSEServer } from "./utils/sse.js";
import {
  startPortForward,
  PortForwardSchema,
  stopPortForward,
  StopPortForwardSchema,
} from "./tools/port_forward.js";
import {
  scaleDeployment,
  scaleDeploymentSchema,
} from "./tools/scale_deployment.js";
import { kubectlContext, kubectlContextSchema } from "./tools/kubectl-context.js";
import { kubectlGet, kubectlGetSchema } from "./tools/kubectl-get.js";
import { kubectlDescribe, kubectlDescribeSchema } from "./tools/kubectl-describe.js";
import { kubectlList, kubectlListSchema } from "./tools/kubectl-list.js";
import { kubectlApply, kubectlApplySchema } from "./tools/kubectl-apply.js";
import { kubectlDelete, kubectlDeleteSchema } from "./tools/kubectl-delete.js";
import { kubectlCreate, kubectlCreateSchema } from "./tools/kubectl-create.js";
import { kubectlLogs, kubectlLogsSchema } from "./tools/kubectl-logs.js";

// Check if non-destructive tools only mode is enabled
const nonDestructiveTools =
  process.env.ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS === "true";

// Define destructive tools (delete and uninstall operations)
const destructiveTools = [
  kubectlDeleteSchema, // This replaces all individual delete operations 
  uninstallHelmChartSchema,
  cleanupSchema, // Cleanup is also destructive as it deletes resources
];

// Get all available tools
const allTools = [
  // Core operation tools
  cleanupSchema,
  
  // Unified kubectl-style tools - these replace many specific tools
  kubectlGetSchema,
  kubectlDescribeSchema,
  kubectlListSchema,
  kubectlApplySchema,
  kubectlDeleteSchema,
  kubectlCreateSchema,
  kubectlLogsSchema,
  
  // Special operations
  scaleDeploymentSchema,
  
  // Kubernetes context management
  kubectlContextSchema,
  
  // Special operations that aren't covered by simple kubectl commands
  explainResourceSchema,
  
  // Helm operations
  installHelmChartSchema,
  upgradeHelmChartSchema,
  uninstallHelmChartSchema,
  
  // Port forwarding
  PortForwardSchema,
  StopPortForwardSchema,
  execInPodSchema,
];

const k8sManager = new KubernetesManager();

const server = new Server(
  {
    name: serverConfig.name,
    version: serverConfig.version,
  },
  serverConfig
);

// Resources handlers
const resourceHandlers = getResourceHandlers(k8sManager);
server.setRequestHandler(
  ListResourcesRequestSchema,
  resourceHandlers.listResources
);
server.setRequestHandler(
  ReadResourceRequestSchema,
  resourceHandlers.readResource
);

// Tools handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Filter out destructive tools if ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS is set to 'true'
  const tools = nonDestructiveTools
    ? allTools.filter(
        (tool) => !destructiveTools.some((dt) => dt.name === tool.name)
      )
    : allTools;

  return { tools };
});

server.setRequestHandler(
  CallToolRequestSchema,
  async (request: {
    params: { name: string; _meta?: any; arguments?: Record<string, any> };
    method: string;
  }) => {
    try {
      const { name, arguments: input = {} } = request.params;

      // Handle new kubectl-style commands
      if (name === "kubectl_context") {
        return await kubectlContext(k8sManager, input as {
          operation: "list" | "get" | "set";
          name?: string;
          showCurrent?: boolean;
          detailed?: boolean;
          output?: string;
        });
      }

      if (name === "kubectl_get") {
        return await kubectlGet(k8sManager, input as {
          resourceType: string;
          name?: string;
          namespace?: string;
          output?: string;
          allNamespaces?: boolean;
          labelSelector?: string;
          fieldSelector?: string;
        });
      }

      if (name === "kubectl_describe") {
        return await kubectlDescribe(k8sManager, input as {
          resourceType: string;
          name: string;
          namespace?: string;
          allNamespaces?: boolean;
        });
      }

      if (name === "kubectl_list") {
        return await kubectlList(k8sManager, input as {
          resourceType: string;
          namespace?: string;
          output?: string;
          allNamespaces?: boolean;
          labelSelector?: string;
          fieldSelector?: string;
        });
      }
      
      if (name === "kubectl_apply") {
        return await kubectlApply(k8sManager, input as {
          manifest?: string;
          filename?: string;
          namespace?: string;
          dryRun?: boolean;
          force?: boolean;
        });
      }
      
      if (name === "kubectl_delete") {
        return await kubectlDelete(k8sManager, input as {
          resourceType?: string;
          name?: string;
          namespace?: string;
          labelSelector?: string;
          manifest?: string;
          filename?: string;
          allNamespaces?: boolean;
          force?: boolean;
          gracePeriodSeconds?: number;
        });
      }

      if (name === "kubectl_create") {
        return await kubectlCreate(k8sManager, input as {
          manifest?: string;
          filename?: string;
          namespace?: string;
          dryRun?: boolean;
          validate?: boolean;
        });
      }
      
      if (name === "kubectl_logs") {
        return await kubectlLogs(k8sManager, input as {
          resourceType: string;
          name: string;
          namespace: string;
          container?: string;
          tail?: number;
          since?: string;
          sinceTime?: string;
          timestamps?: boolean;
          previous?: boolean;
          follow?: boolean;
          labelSelector?: string;
        });
      }
      
      if (name === "kubectl_events") {
        return await kubectlGet(k8sManager, {
          resourceType: "events",
          namespace: (input as { namespace?: string }).namespace,
          fieldSelector: (input as { fieldSelector?: string }).fieldSelector,
          labelSelector: (input as { labelSelector?: string }).labelSelector,
          sortBy: (input as { sortBy?: string }).sortBy,
          output: (input as { output?: string }).output
        });
      }

      // For backward compatibility, redirect to kubectl_list, kubectl_get and kubectl_describe
      switch (name) {
        case "list_pods": {
          return await kubectlList(k8sManager, {
            resourceType: "pods",
            namespace: (input as { namespace?: string }).namespace || "default",
            output: "json"
          });
        }

        case "list_deployments": {
          return await kubectlList(k8sManager, {
            resourceType: "deployments",
            namespace: (input as { namespace?: string }).namespace || "default",
            output: "json"
          });
        }

        case "list_services": {
          return await kubectlList(k8sManager, {
            resourceType: "services",
            namespace: (input as { namespace?: string }).namespace || "default",
            output: "json"
          });
        }

        case "list_nodes": {
          return await kubectlList(k8sManager, {
            resourceType: "nodes",
            output: "json"
          });
        }

        case "list_namespaces": {
          return await kubectlList(k8sManager, {
            resourceType: "namespaces",
            output: "json"
          });
        }

        case "list_cronjobs": {
          return await kubectlList(k8sManager, {
            resourceType: "cronjobs",
            namespace: (input as { namespace?: string }).namespace || "default",
            output: "json"
          });
        }

        case "describe_pod": {
          const typedInput = input as { name: string; namespace: string };
          return await kubectlDescribe(k8sManager, {
            resourceType: "pod",
            name: typedInput.name,
            namespace: typedInput.namespace
          });
        }

        case "describe_service": {
          const typedInput = input as { name: string; namespace?: string };
          return await kubectlDescribe(k8sManager, {
            resourceType: "service",
            name: typedInput.name,
            namespace: typedInput.namespace || "default"
          });
        }

        case "describe_node": {
          const typedInput = input as { name: string };
          return await kubectlDescribe(k8sManager, {
            resourceType: "node",
            name: typedInput.name
          });
        }

        case "describe_deployment": {
          const typedInput = input as { name: string; namespace: string };
          return await kubectlDescribe(k8sManager, {
            resourceType: "deployment",
            name: typedInput.name,
            namespace: typedInput.namespace
          });
        }

        case "describe_cronjob": {
          const typedInput = input as { name: string; namespace: string };
          return await kubectlDescribe(k8sManager, {
            resourceType: "cronjob",
            name: typedInput.name,
            namespace: typedInput.namespace
          });
        }

        case "get_configmap": {
          const typedInput = input as { name: string; namespace: string };
          return await kubectlGet(k8sManager, {
            resourceType: "configmap",
            name: typedInput.name,
            namespace: typedInput.namespace,
            output: "json"
          });
        }

        // Keep other operations that aren't covered by kubectl_get or kubectl_describe
        case "cleanup": {
          await k8sManager.cleanup();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "create_namespace": {
          // Use kubectl_create instead of createNamespace
          return await kubectlCreate(k8sManager, {
            resourceType: "namespace",
            name: (input as { name: string }).name
          });
        }

        case "create_pod": {
          // Use kubectl_create instead of createPod
          const typedInput = input as {
            name: string;
            namespace: string;
            template: string;
            command?: string[];
          };
          
          // Generate a minimal pod manifest
          const podManifest = {
            apiVersion: "v1",
            kind: "Pod",
            metadata: {
              name: typedInput.name,
              namespace: typedInput.namespace
            },
            spec: {
              containers: [{
                name: typedInput.name,
                image: typedInput.template === "custom" ? "busybox" : typedInput.template,
                command: typedInput.command
              }]
            }
          };
          
          return await kubectlCreate(k8sManager, {
            resourceType: "pod",
            name: typedInput.name,
            namespace: typedInput.namespace,
            manifest: JSON.stringify(podManifest)
          });
        }

        case "create_cronjob": {
          // Use kubectl_create instead
          const typedInput = input as {
            name: string;
            namespace: string;
            schedule: string;
            image: string;
            command?: string[];
            suspend?: boolean;
          };
          
          // Create CronJob manifest
          const cronJobManifest = {
            apiVersion: "batch/v1",
            kind: "CronJob",
            metadata: {
              name: typedInput.name,
              namespace: typedInput.namespace
            },
            spec: {
              schedule: typedInput.schedule,
              suspend: typedInput.suspend || false,
              jobTemplate: {
                spec: {
                  template: {
                    spec: {
                      containers: [{
                        name: typedInput.name,
                        image: typedInput.image,
                        command: typedInput.command
                      }],
                      restartPolicy: "OnFailure"
                    }
                  }
                }
              }
            }
          };
          
          return await kubectlCreate(k8sManager, {
            resourceType: "cronjob",
            name: typedInput.name,
            namespace: typedInput.namespace,
            manifest: JSON.stringify(cronJobManifest)
          });
        }

        case "delete_cronjob": {
          // Use kubectl_delete instead
          const typedInput = input as {
            name: string;
            namespace: string;
          };
          
          return await kubectlDelete(k8sManager, {
            resourceType: "cronjob",
            name: typedInput.name,
            namespace: typedInput.namespace
          });
        }

        case "delete_pod": {
          // Use kubectl_delete instead of deletePod
          const typedInput = input as {
            name: string;
            namespace: string;
            ignoreNotFound?: boolean;
          };
          
          return await kubectlDelete(k8sManager, {
            resourceType: "pod",
            name: typedInput.name,
            namespace: typedInput.namespace
          });
        }

        case "explain_resource": {
          return await explainResource(
            input as {
              resource: string;
              apiVersion?: string;
              recursive?: boolean;
              output?: "plaintext" | "plaintext-openapiv2";
            }
          );
        }

        case "get_events": {
          // Use kubectl_get instead of getEvents
          return await kubectlGet(k8sManager, {
            resourceType: "events",
            namespace: (input as { namespace?: string }).namespace,
            fieldSelector: (input as { fieldSelector?: string }).fieldSelector
          });
        }

        case "get_logs": {
          // Use kubectl_logs instead of getLogs
          const typedInput = input as {
            resourceType: string;
            name?: string;
            namespace?: string;
            labelSelector?: string;
            container?: string;
            tail?: number;
            since?: string;
            timestamps?: boolean;
          };
          
          // Convert since from number (seconds) to string format if needed
          const since = typedInput.since ? `${typedInput.since}s` : undefined;
          
          return await kubectlLogs(k8sManager, {
            resourceType: typedInput.resourceType,
            name: typedInput.name || "",
            namespace: typedInput.namespace || "default",
            labelSelector: typedInput.labelSelector,
            container: typedInput.container,
            tail: typedInput.tail,
            since,
            timestamps: typedInput.timestamps
          });
        }

        case "list_contexts": {
          return await kubectlContext(
            k8sManager,
            { 
              operation: "list", 
              showCurrent: (input as { showCurrent?: boolean }).showCurrent 
            }
          );
        }

        case "get_current_context": {
          return await kubectlContext(
            k8sManager,
            { 
              operation: "get", 
              detailed: (input as { detailed?: boolean }).detailed 
            }
          );
        }

        case "set_current_context": {
          return await kubectlContext(
            k8sManager,
            { 
              operation: "set", 
              name: (input as { name: string }).name 
            }
          );
        }

        case "list_jobs": {
          const typedInput = input as { namespace: string; cronJobName?: string };
          
          // If cronJobName is specified, use field selector to filter
          if (typedInput.cronJobName) {
            return await kubectlList(k8sManager, {
              resourceType: "jobs",
              namespace: typedInput.namespace,
              output: "json",
              fieldSelector: `metadata.ownerReferences.name=${typedInput.cronJobName}`
            });
          }
          
          return await kubectlList(k8sManager, {
            resourceType: "jobs",
            namespace: typedInput.namespace,
            output: "json"
          });
        }

        case "get_job_logs": {
          // Use kubectl_logs instead of getJobLogs
          const typedInput = input as {
            name: string;
            namespace: string;
            tail?: number;
            timestamps?: boolean;
          };
          
          return await kubectlLogs(k8sManager, {
            resourceType: "job",
            name: typedInput.name,
            namespace: typedInput.namespace,
            tail: typedInput.tail,
            timestamps: typedInput.timestamps
          });
        }

        case "install_helm_chart": {
          return await installHelmChart(
            input as {
              name: string;
              chart: string;
              repo: string;
              namespace: string;
              values?: Record<string, any>;
            }
          );
        }

        case "uninstall_helm_chart": {
          return await uninstallHelmChart(
            input as {
              name: string;
              namespace: string;
            }
          );
        }

        case "upgrade_helm_chart": {
          return await upgradeHelmChart(
            input as {
              name: string;
              chart: string;
              repo: string;
              namespace: string;
              values?: Record<string, any>;
            }
          );
        }

        case "list_api_resources": {
          return await listApiResources(
            input as {
              apiGroup?: string;
              namespaced?: boolean;
              verbs?: string[];
              output?: "wide" | "name" | "no-headers";
            }
          );
        }

        case "port_forward": {
          return await startPortForward(
            k8sManager,
            input as {
              resourceType: string;
              resourceName: string;
              localPort: number;
              targetPort: number;
            }
          );
        }

        case "stop_port_forward": {
          return await stopPortForward(
            k8sManager,
            input as {
              id: string;
            }
          );
        }

        case "delete_namespace": {
          // Use kubectl_delete instead of deleteNamespace
          return await kubectlDelete(k8sManager, {
            resourceType: "namespace",
            name: (input as { name: string; ignoreNotFound?: boolean }).name
          });
        }

        case "delete_deployment": {
          // Use kubectl_delete instead
          const typedInput = input as {
            name: string;
            namespace: string;
            ignoreNotFound?: boolean;
          };
          
          return await kubectlDelete(k8sManager, {
            resourceType: "deployment",
            name: typedInput.name,
            namespace: typedInput.namespace
          });
        }

        case "create_deployment": {
          // Use kubectl_create instead
          const typedInput = input as {
            name: string;
            namespace: string;
            template: string;
            replicas?: number;
            ports?: number[];
            customConfig?: any;
          };
          
          // Create deployment manifest
          const deploymentManifest = {
            apiVersion: "apps/v1",
            kind: "Deployment",
            metadata: {
              name: typedInput.name,
              namespace: typedInput.namespace
            },
            spec: {
              replicas: typedInput.replicas || 1,
              selector: {
                matchLabels: {
                  app: typedInput.name
                }
              },
              template: {
                metadata: {
                  labels: {
                    app: typedInput.name
                  }
                },
                spec: {
                  containers: [{
                    name: typedInput.name,
                    image: typedInput.template === "custom" ? (typedInput.customConfig?.image || "nginx") : typedInput.template,
                    ports: typedInput.ports ? typedInput.ports.map(port => ({ containerPort: port })) : undefined,
                    ...(typedInput.customConfig || {})
                  }]
                }
              }
            }
          };
          
          return await kubectlCreate(k8sManager, {
            resourceType: "deployment",
            name: typedInput.name,
            namespace: typedInput.namespace,
            manifest: JSON.stringify(deploymentManifest)
          });
        }

        case "update_deployment": {
          // Use kubectl_apply instead
          const typedInput = input as {
            name: string;
            namespace: string;
            template: string;
            containerName?: string;
            replicas?: number;
            customConfig?: any;
          };
          
          // First get the current deployment
          const getCurrentDeployment = await kubectlGet(k8sManager, {
            resourceType: "deployment",
            name: typedInput.name,
            namespace: typedInput.namespace,
            output: "json"
          });
          
          const currentDeployment = JSON.parse(getCurrentDeployment.content[0].text);
          
          // Update the deployment
          if (typedInput.replicas !== undefined) {
            currentDeployment.spec.replicas = typedInput.replicas;
          }
          
          // Find the container to update
          const containerName = typedInput.containerName || typedInput.name;
          const containerIndex = currentDeployment.spec.template.spec.containers.findIndex(
            (c: any) => c.name === containerName
          );
          
          if (containerIndex >= 0) {
            // Update container with custom config
            if (typedInput.customConfig) {
              currentDeployment.spec.template.spec.containers[containerIndex] = {
                ...currentDeployment.spec.template.spec.containers[containerIndex],
                ...typedInput.customConfig
              };
            }
            
            // Update image if template is specified
            if (typedInput.template && typedInput.template !== "custom") {
              currentDeployment.spec.template.spec.containers[containerIndex].image = typedInput.template;
            }
          }
          
          return await kubectlApply(k8sManager, {
            manifest: JSON.stringify(currentDeployment),
            namespace: typedInput.namespace
          });
        }

        case "scale_deployment": {
          return await scaleDeployment(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              replicas: number;
            }
          );
        }

        case "create_configmap": {
          // Use kubectl_create instead
          const typedInput = input as {
            name: string;
            namespace: string;
            data: Record<string, string>;
          };
          
          // Create ConfigMap manifest
          const configMapManifest = {
            apiVersion: "v1",
            kind: "ConfigMap",
            metadata: {
              name: typedInput.name,
              namespace: typedInput.namespace
            },
            data: typedInput.data
          };
          
          return await kubectlCreate(k8sManager, {
            resourceType: "configmap",
            name: typedInput.name,
            namespace: typedInput.namespace,
            manifest: JSON.stringify(configMapManifest)
          });
        }

        case "update_configmap": {
          // Use kubectl_apply instead
          const typedInput = input as {
            name: string;
            namespace: string;
            data: Record<string, string>;
          };
          
          // First get the current configmap
          const getCurrentConfigMap = await kubectlGet(k8sManager, {
            resourceType: "configmap",
            name: typedInput.name,
            namespace: typedInput.namespace,
            output: "json"
          });
          
          const currentConfigMap = JSON.parse(getCurrentConfigMap.content[0].text);
          
          // Update the data field
          currentConfigMap.data = typedInput.data;
          
          return await kubectlApply(k8sManager, {
            manifest: JSON.stringify(currentConfigMap),
            namespace: typedInput.namespace
          });
        }

        case "delete_configmap": {
          // Use kubectl_delete instead
          const typedInput = input as {
            name: string;
            namespace: string;
          };
          
          return await kubectlDelete(k8sManager, {
            resourceType: "configmap",
            name: typedInput.name,
            namespace: typedInput.namespace
          });
        }

        case "create_service": {
          // Use kubectl_create instead of createService
          const typedInput = input as {
            name: string;
            namespace?: string;
            type?: "ClusterIP" | "NodePort" | "LoadBalancer";
            selector?: Record<string, string>;
            ports: Array<{
              port: number;
              targetPort?: number;
              protocol?: string;
              name?: string;
              nodePort?: number;
            }>;
          };
          
          // Create a service manifest
          const serviceManifest = {
            apiVersion: "v1",
            kind: "Service",
            metadata: {
              name: typedInput.name,
              namespace: typedInput.namespace || "default"
            },
            spec: {
              selector: typedInput.selector || { app: typedInput.name },
              type: typedInput.type || "ClusterIP",
              ports: typedInput.ports.map(p => ({
                port: p.port,
                targetPort: p.targetPort || p.port,
                protocol: p.protocol || "TCP",
                name: p.name || `port-${p.port}`,
                ...(p.nodePort && typedInput.type === "NodePort" ? { nodePort: p.nodePort } : {})
              }))
            }
          };
          
          return await kubectlCreate(k8sManager, {
            resourceType: "service",
            name: typedInput.name,
            namespace: typedInput.namespace || "default",
            manifest: JSON.stringify(serviceManifest)
          });
        }

        case "update_service": {
          // Use kubectl_apply instead of updateService
          const typedInput = input as {
            name: string;
            namespace: string;
            type?: "ClusterIP" | "NodePort" | "LoadBalancer";
            selector?: Record<string, string>;
            ports?: Array<{
              port: number;
              targetPort?: number;
              protocol?: string;
              name?: string;
              nodePort?: number;
            }>;
          };
          
          // First get the current service
          const getCurrentService = await kubectlGet(k8sManager, {
            resourceType: "service",
            name: typedInput.name,
            namespace: typedInput.namespace,
            output: "json"
          });
          
          const currentService = JSON.parse(getCurrentService.content[0].text);
          
          // Create an updated service manifest
          const updatedService = {
            ...currentService,
            spec: {
              ...currentService.spec,
              selector: typedInput.selector || currentService.spec.selector,
              type: typedInput.type || currentService.spec.type,
              ...(typedInput.ports ? { ports: typedInput.ports.map(p => ({
                port: p.port,
                targetPort: p.targetPort || p.port,
                protocol: p.protocol || "TCP",
                name: p.name || `port-${p.port}`,
                ...(p.nodePort && (typedInput.type === "NodePort" || currentService.spec.type === "NodePort") 
                  ? { nodePort: p.nodePort } 
                  : {})
              })) } : {})
            }
          };
          
          return await kubectlApply(k8sManager, {
            manifest: JSON.stringify(updatedService),
            namespace: typedInput.namespace
          });
        }

        case "delete_service": {
          // Use kubectl_delete instead of deleteService
          const typedInput = input as {
            name: string;
            namespace?: string;
            ignoreNotFound?: boolean;
          };
          
          return await kubectlDelete(k8sManager, {
            resourceType: "service",
            name: typedInput.name,
            namespace: typedInput.namespace || "default"
          });
        }

        case "describe_service": {
          return await describeService(
            k8sManager,
            input as {
              name: string;
              namespace?: string;
            }
          );
        }

        case "exec_in_pod": {
          return await execInPod(
            k8sManager,
            input as {
              name: string;
              namespace?: string;
              command: string | string[];
              container?: string;
            }
          );
        }

=======
>>>>>>> 06df868 (Integrate unified kubectl commands into server handler)
        default:
          throw new McpError(ErrorCode.InvalidRequest, `Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error}`
      );
    }
  }
);

// Start the server
if (process.env.ENABLE_UNSAFE_SSE_TRANSPORT) {
  startSSEServer(server);
  console.log(`SSE server started`);
} else {
  const transport = new StdioServerTransport();
  
  console.log(
    `Starting Kubernetes MCP server v${serverConfig.version}, handling commands...`
  );
  
  server.connect(transport);
}

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    await server.close();
    process.exit(0);
  });
});

export { allTools, destructiveTools };
