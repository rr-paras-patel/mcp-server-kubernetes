import { execFileSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import yaml from "yaml";
import {
  HelmInstallOperation,
  HelmOperation,
  HelmResponse,
  HelmUpgradeOperation,
} from "../models/helm-models.js";
import { getSpawnMaxBuffer } from "../config/max-buffer.js";

export const installHelmChartSchema = {
  name: "install_helm_chart",
  description: "Install a Helm chart. Use template mode if regular helm install has authentication issues or kubeconfig API version mismatches.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Release name",
      },
      chart: {
        type: "string",
        description: "Chart name or path to chart directory",
      },
      repo: {
        type: "string",
        description: "Chart repository URL (optional if using local chart path)",
      },
      namespace: {
        type: "string",
        description: "Kubernetes namespace",
      },
      values: {
        type: "object",
        description: "Chart values",
        properties: {},
        additionalProperties: true,
      },
      valuesFile: {
        type: "string",
        description: "Path to values.yaml file (optional, alternative to values object)",
      },
      createNamespace: {
        type: "boolean",
        description: "Whether to create the namespace if it doesn't exist",
        default: true,
      },
      useTemplate: {
        type: "boolean",
        description: "Use helm template + kubectl apply instead of helm install (bypasses authentication issues)",
        default: false,
      },
    },
    required: ["name", "chart", "namespace"],
  },
};

export const upgradeHelmChartSchema = {
  name: "upgrade_helm_chart",
  description: "Upgrade a Helm release",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Release name",
      },
      chart: {
        type: "string",
        description: "Chart name",
      },
      repo: {
        type: "string",
        description: "Chart repository URL",
      },
      namespace: {
        type: "string",
        description: "Kubernetes namespace",
      },
      values: {
        type: "object",
        description: "Chart values",
        properties: {},
        additionalProperties: true,
      },
    },
    required: ["name", "chart", "repo", "namespace"],
  },
};

export const uninstallHelmChartSchema = {
  name: "uninstall_helm_chart",
  description: "Uninstall a Helm release",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Release name",
      },
      namespace: {
        type: "string",
        description: "Kubernetes namespace",
      },
    },
    required: ["name", "namespace"],
  },
};

const executeHelmCommand = (command: string, args: string[]): string => {
  try {
    // Add a generous timeout of 60 seconds for Helm operations
    return execFileSync(command, args, {
      encoding: "utf8",
      timeout: 60000, // 60 seconds timeout
      maxBuffer: getSpawnMaxBuffer(),
      env: { ...process.env, KUBECONFIG: process.env.KUBECONFIG },
    });
  } catch (error: any) {
    throw new Error(`Helm command failed: ${error.message}`);
  }
};

const writeValuesFile = (name: string, values: Record<string, any>): string => {
  const filename = `${name}-values.yaml`;
  writeFileSync(filename, yaml.stringify(values));
  return filename;
};

export async function installHelmChart(
  params: HelmInstallOperation
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    // Add helm repository if provided
    if (params.repo) {
      const repoName = params.chart.split("/")[0];
      executeHelmCommand("helm", ["repo", "add", repoName, params.repo]);
      executeHelmCommand("helm", ["repo", "update"]);
    }

    // Use template mode if requested
    if (params.useTemplate) {
      return await installHelmChartTemplate(params);
    }

    // Regular helm install
    let command = "helm";
    let args = [
      "install",
      params.name,
      params.chart,
      "--namespace",
      params.namespace,
    ];

    // Add create-namespace flag if requested
    if (params.createNamespace !== false) {
      args.push("--create-namespace");
    }

    // Handle values if provided
    if (params.values) {
      const valuesFile = writeValuesFile(params.name, params.values);
      args.push("-f", valuesFile);

      try {
        executeHelmCommand(command, args);
      } finally {
        // Cleanup values file
        unlinkSync(valuesFile);
      }
    } else {
      executeHelmCommand(command, args);
    }

    const response: HelmResponse = {
      status: "installed",
      message: `Successfully installed ${params.name}`,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to install Helm chart: ${error.message}`);
  }
}

async function installHelmChartTemplate(
  params: HelmInstallOperation
): Promise<{ content: { type: string; text: string }[] }> {
  const { mkdtempSync, rmSync } = await import("fs");
  const { join } = await import("path");
  const { tmpdir } = await import("os");
  
  const tempDir = mkdtempSync(join(tmpdir(), 'helm-template-'));
  let valuesFilePath: string | undefined;
  let generatedYamlPath: string | undefined;

  try {
    // Create namespace if requested
    if (params.createNamespace !== false) {
      try {
        executeHelmCommand("kubectl", ["create", "namespace", params.namespace]);
      } catch (error: any) {
        // Namespace might already exist, which is fine
        if (!error.message.includes("already exists")) {
          throw error;
        }
      }
    }

    // Prepare values file
    if (params.valuesFile) {
      valuesFilePath = params.valuesFile;
    } else if (params.values) {
      valuesFilePath = join(tempDir, `${params.name}-values.yaml`);
      writeFileSync(valuesFilePath, yaml.stringify(params.values));
    }

    // Generate YAML using helm template
    const helmArgs = [
      "template",
      params.name,
      params.chart,
      "--namespace",
      params.namespace,
    ];

    if (valuesFilePath && valuesFilePath !== params.valuesFile) {
      helmArgs.push("-f", valuesFilePath);
    } else if (params.valuesFile) {
      helmArgs.push("-f", params.valuesFile);
    }

    const generatedYaml = executeHelmCommand("helm", helmArgs);

    // Save generated YAML to temporary file
    generatedYamlPath = join(tempDir, `${params.name}-generated.yaml`);
    writeFileSync(generatedYamlPath, generatedYaml);

    // Apply the generated YAML using kubectl
    executeHelmCommand("kubectl", ["apply", "-f", generatedYamlPath, "-n", params.namespace]);

    const response = {
      status: "installed",
      message: `Successfully installed ${params.name} using helm template + kubectl apply`,
      details: {
        namespace: params.namespace,
        chart: params.chart,
        generatedYamlPath: generatedYamlPath,
        valuesUsed: valuesFilePath || "default values",
      },
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to install Helm chart using template method: ${error.message}`);
  } finally {
    // Cleanup temporary files
    try {
      if (valuesFilePath && valuesFilePath.startsWith(tempDir)) {
        unlinkSync(valuesFilePath);
      }
      if (generatedYamlPath) {
        unlinkSync(generatedYamlPath);
      }
      // Remove temp directory
      rmSync(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
  }
}

export async function upgradeHelmChart(
  params: HelmUpgradeOperation
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    // Add helm repository if provided
    if (params.repo) {
      const repoName = params.chart.split("/")[0];
      executeHelmCommand("helm", ["repo", "add", repoName, params.repo]);
      executeHelmCommand("helm", ["repo", "update"]);
    }

    let command = "helm";
    let args = [
      "upgrade",
      params.name,
      params.chart,
      "--namespace",
      params.namespace,
    ];

    // Handle values if provided
    if (params.values) {
      const valuesFile = writeValuesFile(params.name, params.values);
      args.push("-f", valuesFile);

      try {
        executeHelmCommand(command, args);
      } finally {
        // Cleanup values file
        unlinkSync(valuesFile);
      }
    } else {
      executeHelmCommand(command, args);
    }

    const response: HelmResponse = {
      status: "upgraded",
      message: `Successfully upgraded ${params.name}`,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to upgrade Helm chart: ${error.message}`);
  }
}

export async function uninstallHelmChart(
  params: HelmOperation
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    executeHelmCommand("helm", [
      "uninstall",
      params.name,
      "--namespace",
      params.namespace,
    ]);

    const response: HelmResponse = {
      status: "uninstalled",
      message: `Successfully uninstalled ${params.name}`,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error: any) {
    throw new Error(`Failed to uninstall Helm chart: ${error.message}`);
  }
}
