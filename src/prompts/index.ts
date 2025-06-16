import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { KubernetesManager } from "../types.js";
import { ListPromptsRequestSchema, GetPromptRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { kubectlList } from "../tools/kubectl-list.js";
import { kubectlDescribe } from "../tools/kubectl-describe.js";
import { kubectlLogs } from "../tools/kubectl-logs.js";

export function registerPromptHandlers(server: Server, k8sManager: KubernetesManager) {
  // Register prompts list handler
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "k8s-troubleshoot",
          description: "Troubleshoot Kubernetes resources based on a keyword.",
          arguments: [
            {
              name: "keyword",
              description: "A keyword to search for in pod names and namespaces.",
              required: true,
            },
            {
              name: "namespace",
              description: "Optional: Specify a namespace to narrow down the search.",
              required: false,
              default: "all"
            },
          ],
        },
      ],
    };
  });

  // Register prompt handler
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "k8s-troubleshoot") {
      const keyword = args?.keyword as string;
      const namespace = args?.namespace as string;

      if (!keyword) {
        throw new Error("Keyword parameter is required for k8s-troubleshoot prompt");
      }

      const actualNamespace = namespace || "monitoring";
      const message = `Troubleshooting for pod contains keyword "${keyword}" in pod name and namespace "${actualNamespace}" applied to all pods or resource types for this investigation:

**Autonomous Kubernetes Troubleshooting Flow**

0. **Perform Quick Health Checks / Golden Signals Analysis**
   - Assess latency, errors, and resource utilization. If a clear issue is identified (e.g., node not ready, network partition), streamline or deprioritize subsequent detailed steps.

1. **Identify Resource Type and Scope**  
   Determine if the resource type by analyzing labels and controller relationships.

2. **Assess Current State**  
   - Check if the desired number of replicas matches the ready replicas.  
   - Identify any pods in non-running states (e.g., CrashLoopBackOff, Pending, Evicted).  
   - Review node placement and distribution patterns.

3. **Analyze Operational History**  
   - Review recent events and warnings related to the resource.  
   - Check rollout history and update strategies.  
   - Examine recent configuration changes.

4. **Inspect Runtime Behavior**  
   - Collect logs from current and previous container instances for errors or anomalies.  
   - Test intra-cluster networking and DNS resolution.  
   - Verify storage mounts and secret accessibility.

5. **Evaluate Dependencies**  
   - Validate references to ConfigMaps and Secrets.  
   - Check service account permissions.  
   - Confirm initContainers have completed successfully.

6. **Audit Resource Constraints**  
   - Analyze CPU and memory usage trends.  
   - Check node allocatable resources.  
   - Review pod disruption budgets and quotas.

7. **Validate Cluster Context & Environment**  
   - Inspect node readiness and taints.  
   - Verify the current Kubernetes context and namespace.  
   - Confirm API server availability.  
   - Check Kubernetes version compatibility (if applicable).

8. **Compare Against Patterns**  
   - Benchmark against workload-specific best practices.  
   - Verify liveness and readiness probe configurations.  
   - Audit security context settings.

---

**Instructions:**
- For each finding, clearly state the observation, its severity (e.g., \`CRITICAL\`, \`WARNING\`, \`INFO\`), and the evidence (e.g., \`kubectl output\`, error message in POD_NAME, timestamp). Also, print which object they found symptomps, e.g., error message in POD_NAME.
- if there more than 4 pods then you can pick 3 pod which is having high level problem symptomps
- If there's a typo in user input and a closest matching object name exists, consider an auto-correction or suggest the correct name.
- Summarize the root cause clearly and concisely at the end of the investigation, along with clear, actionable steps for remediation, including specific \`kubectl\` commands or configuration changes required.`;

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: message,
            },
          },
        ],
      };
    }

    throw new Error(`Unknown prompt: ${name}`);
  });
}