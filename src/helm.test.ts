import { expect, test, describe, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { HelmResponseSchema } from "./types.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("helm operations", () => {
  let transport: StdioClientTransport;
  let client: Client;
  const testReleaseName = "test-nginx";
  const testNamespace = "default";

  beforeEach(async () => {
    try {
      transport = new StdioClientTransport({
        command: "bun",
        args: ["src/index.ts"],
        stderr: "pipe",
      });

      client = new Client(
        {
          name: "test-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );
      await client.connect(transport);
      await sleep(1000);
    } catch (e) {
      console.error("Error in beforeEach:", e);
      throw e;
    }
  });

  afterEach(async () => {
    try {
      // Cleanup: Uninstall the test release if it exists
      await client
        .request(
          {
            method: "tools/call",
            params: {
              name: "uninstall_helm_chart",
              arguments: {
                name: testReleaseName,
                namespace: testNamespace,
              },
            },
          },
          HelmResponseSchema
        )
        .catch(() => {}); // Ignore errors if release doesn't exist

      await transport.close();
      await sleep(1000);
    } catch (e) {
      console.error("Error during cleanup:", e);
    }
  });

  test("install helm chart", async () => {
    const installResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "install_helm_chart",
          arguments: {
            name: testReleaseName,
            chart: "nginx",
            repo: "https://charts.bitnami.com/bitnami",
            namespace: testNamespace,
            values: {
              service: {
                type: "ClusterIP",
              },
              resources: {
                limits: {
                  cpu: "100m",
                  memory: "128Mi",
                },
                requests: {
                  cpu: "50m",
                  memory: "64Mi",
                },
              },
            },
          },
        },
      },
      HelmResponseSchema
    );

    expect(installResult.content[0].type).toBe("text");
    const result = JSON.parse(installResult.content[0].text);
    expect(result.status).toBe("installed");

    // Wait for the deployment to be ready
    await sleep(5000);

    // Verify the deployment exists
    const deploymentResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "list_deployments",
          arguments: {
            namespace: testNamespace,
          },
        },
      },
      HelmResponseSchema
    );

    const deployments = JSON.parse(deploymentResult.content[0].text);
    expect(
      deployments.items.some(
        (d: any) =>
          d.metadata.name === testReleaseName ||
          d.metadata.name.startsWith(`${testReleaseName}-nginx`)
      )
    ).toBe(true);
  }, 30000); // Increase timeout to 30s for chart installation

  test("upgrade helm chart values", async () => {
    // First install the chart
    await client.request(
      {
        method: "tools/call",
        params: {
          name: "install_helm_chart",
          arguments: {
            name: testReleaseName,
            chart: "nginx",
            repo: "https://charts.bitnami.com/bitnami",
            namespace: testNamespace,
          },
        },
      },
      HelmResponseSchema
    );

    await sleep(5000);

    // Then upgrade it with new values
    const upgradeResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "upgrade_helm_chart",
          arguments: {
            name: testReleaseName,
            namespace: testNamespace,
            values: {
              replicaCount: 2,
              resources: {
                limits: {
                  cpu: "200m",
                  memory: "256Mi",
                },
              },
            },
          },
        },
      },
      HelmResponseSchema
    );

    expect(upgradeResult.content[0].type).toBe("text");
    const result = JSON.parse(upgradeResult.content[0].text);
    expect(result.status).toBe("upgraded");

    // Wait for the upgrade to take effect
    await sleep(5000);

    // Verify the deployment was updated
    const deploymentResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "list_deployments",
          arguments: {
            namespace: testNamespace,
          },
        },
      },
      HelmResponseSchema
    );

    const deployments = JSON.parse(deploymentResult.content[0].text);
    const nginxDeployment = deployments.items.find(
      (d: any) =>
        d.metadata.name === testReleaseName ||
        d.metadata.name.startsWith(`${testReleaseName}-nginx`)
    );
    expect(nginxDeployment).toBeDefined();
    expect(nginxDeployment.spec.replicas).toBe(2);
  }, 60000); // Increase timeout to 60s for install + upgrade

  test("uninstall helm chart", async () => {
    // First install the chart
    await client.request(
      {
        method: "tools/call",
        params: {
          name: "install_helm_chart",
          arguments: {
            name: testReleaseName,
            chart: "nginx",
            repo: "https://charts.bitnami.com/bitnami",
            namespace: testNamespace,
          },
        },
      },
      HelmResponseSchema
    );

    await sleep(5000);

    // Then uninstall it
    const uninstallResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "uninstall_helm_chart",
          arguments: {
            name: testReleaseName,
            namespace: testNamespace,
          },
        },
      },
      HelmResponseSchema
    );

    expect(uninstallResult.content[0].type).toBe("text");
    const result = JSON.parse(uninstallResult.content[0].text);
    expect(result.status).toBe("uninstalled");

    // Wait for resources to be cleaned up
    await sleep(5000);

    // Verify the deployment is gone
    const deploymentResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "list_deployments",
          arguments: {
            namespace: testNamespace,
          },
        },
      },
      HelmResponseSchema
    );

    const deployments = JSON.parse(deploymentResult.content[0].text);
    expect(
      deployments.items.every(
        (d: any) =>
          d.metadata.name !== testReleaseName &&
          !d.metadata.name.startsWith(`${testReleaseName}-nginx`)
      )
    ).toBe(true);
  }, 60000); // Increase timeout to 60s for install + uninstall
});
