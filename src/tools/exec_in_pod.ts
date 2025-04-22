/**
 * Tool: exec_in_pod
 * Execute a command in a Kubernetes pod or container and return the output.
 * Uses the official Kubernetes client-node Exec API for native execution.
 * Supports both string and array command formats, and optional container targeting.
 */

import * as k8s from "@kubernetes/client-node";
import { KubernetesManager } from "../types.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

/**
 * Schema for exec_in_pod tool.
 * - name: Pod name
 * - namespace: Namespace (default: "default")
 * - command: Command to execute (string or array of args)
 * - container: (Optional) Container name
 */
export const execInPodSchema = {
  name: "exec_in_pod",
  description: "Execute a command in a Kubernetes pod or container and return the output",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the pod to execute the command in",
      },
      namespace: {
        type: "string",
        description: "Kubernetes namespace where the pod is located",
        default: "default",
      },
      command: {
        anyOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } }
        ],
        description: "Command to execute in the pod (string or array of args)",
      },
      container: {
        type: "string",
        description: "Container name (required when pod has multiple containers)",
        optional: true,
      },
    },
    required: ["name", "command"],
  },
};

/**
 * Execute a command in a Kubernetes pod or container using the Kubernetes client-node Exec API.
 * Returns the stdout output as a text response.
 * Throws McpError on failure.
 */
export async function execInPod(
  k8sManager: KubernetesManager,
  input: {
    name: string;
    namespace?: string;
    command: string | string[];
    container?: string;
  }
): Promise<{ content: { type: string; text: string }[] }> {
  const namespace = input.namespace || "default";
  // Convert command to array of strings for the Exec API
  const commandArr = Array.isArray(input.command)
    ? input.command
    : input.command.split(" ");

  // Prepare buffers to capture stdout and stderr
  let stdout = "";
  let stderr = "";

  // Create writable streams to collect output
  const stdoutStream = {
    write: (chunk: string | Buffer) => {
      stdout += chunk.toString();
    },
  };
  const stderrStream = {
    write: (chunk: string | Buffer) => {
      stderr += chunk.toString();
    },
  };

  try {
    // Use the Kubernetes client-node Exec API for native exec
    const kc = k8sManager.getKubeConfig();
    const exec = new k8s.Exec(kc);

    await new Promise<void>((resolve, reject) => {
      exec.exec(
        namespace,
        input.name,
        input.container ?? "",
        commandArr,
        stdoutStream as any,
        stderrStream as any,
        null, // stdin not needed
        false, // tty
        (status: any) => {
          // Callback after exec finishes
          if (status && status.status === "Success") {
            resolve();
          } else {
            reject(
              new McpError(
                ErrorCode.InternalError,
                `Exec failed: ${JSON.stringify(status)}`
              )
            );
          }
        }
      ).catch(reject);
    });

    // Return the collected stdout as the result
    return {
      content: [
        {
          type: "text",
          text: stdout || stderr || "No output",
        },
      ],
    };
  } catch (error: any) {
    // Collect error message and stderr output if available
    let message = error.message || "Unknown error";
    if (stderr) {
      message += "\n" + stderr;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to execute command in pod: ${message}`
    );
  }
}
