import * as k8s from "@kubernetes/client-node";
import * as fs from "fs";
import { ResourceTracker, PortForwardTracker, WatchTracker } from "../types.js";

export class KubernetesManager {
  private resources: ResourceTracker[] = [];
  private portForwards: PortForwardTracker[] = [];
  private watches: WatchTracker[] = [];
  private kc: k8s.KubeConfig;
  private k8sApi: k8s.CoreV1Api;
  private k8sAppsApi: k8s.AppsV1Api;
  private k8sBatchApi: k8s.BatchV1Api;

  constructor() {
    this.kc = new k8s.KubeConfig();
    if (this.isRunningInCluster()) {
      console.log("Running inside a Kubernetes cluster");
      this.kc.loadFromCluster();
    } else {
      console.log("Loading default kube config file");
      this.kc.loadFromDefault();
    }
    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);
    this.k8sBatchApi = this.kc.makeApiClient(k8s.BatchV1Api);
  }

  /**
   * A very simple test to check if the application is running inside a Kubernetes cluster
   */
  private isRunningInCluster(): boolean {
    const serviceAccountPath =
      "/var/run/secrets/kubernetes.io/serviceaccount/token";
    try {
      return fs.existsSync(serviceAccountPath);
    } catch {
      return false;
    }
  }

  /**
   * Set the current context to the desired context name.
   *
   * @param contextName
   */
  public setCurrentContext(contextName: string) {
    // Get all available contexts
    const contexts = this.kc.getContexts();
    const contextNames = contexts.map((context) => context.name);

    // Check if the requested context exists
    if (!contextNames.includes(contextName)) {
      throw new Error(
        `Context '${contextName}' not found. Available contexts: ${contextNames.join(
          ", "
        )}`
      );
    }
    // Set the current context
    this.kc.setCurrentContext(contextName);
    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);
    this.k8sBatchApi = this.kc.makeApiClient(k8s.BatchV1Api);
  }

  async cleanup() {
    // Stop watches
    for (const watch of this.watches) {
      watch.abort.abort();
    }

    // Delete tracked resources in reverse order
    for (const resource of [...this.resources].reverse()) {
      try {
        await this.deleteResource(
          resource.kind,
          resource.name,
          resource.namespace
        );
      } catch (error) {
        console.error(
          `Failed to delete ${resource.kind} ${resource.name}:`,
          error
        );
      }
    }
  }

  trackResource(kind: string, name: string, namespace: string) {
    this.resources.push({ kind, name, namespace, createdAt: new Date() });
  }

  async deleteResource(kind: string, name: string, namespace: string) {
    switch (kind.toLowerCase()) {
      case "pod":
        await this.k8sApi.deleteNamespacedPod(name, namespace);
        break;
      case "deployment":
        await this.k8sAppsApi.deleteNamespacedDeployment(name, namespace);
        break;
      case "service":
        await this.k8sApi.deleteNamespacedService(name, namespace);
        break;
      case "cronjob":
        await this.k8sBatchApi.deleteNamespacedCronJob(name, namespace);
        break;
    }
    this.resources = this.resources.filter(
      (r) => !(r.kind === kind && r.name === name && r.namespace === namespace)
    );
  }

  trackPortForward(pf: PortForwardTracker) {
    this.portForwards.push(pf);
  }

  getPortForward(id: string) {
    return this.portForwards.find((p) => p.id === id);
  }

  removePortForward(id: string) {
    this.portForwards = this.portForwards.filter((p) => p.id !== id);
  }

  trackWatch(watch: WatchTracker) {
    this.watches.push(watch);
  }

  getKubeConfig() {
    return this.kc;
  }

  getCoreApi() {
    return this.k8sApi;
  }

  getAppsApi() {
    return this.k8sAppsApi;
  }

  getBatchApi() {
    return this.k8sBatchApi;
  }
}
