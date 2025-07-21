# Cleanup Pods Tool

The `cleanup_pods` tool helps manage and delete problematic pods in Kubernetes clusters. It can identify and remove pods that are stuck in error states or need to be cleaned up.

## Features

- **Multi-state Pod Detection**: Identifies pods in various problematic states
- **Dry Run Mode**: Preview what would be deleted without actually deleting
- **Force Delete**: Bypass graceful termination for stuck pods
- **Namespace Filtering**: Target specific namespaces or all namespaces
- **Safety Confirmation**: Requires explicit confirmation for destructive operations

## Parameters

### Required Parameters
- `namespace`: Kubernetes namespace to target (use "all" for all namespaces)

### Optional Parameters
- `dryRun`: Preview the operation without executing (default: false)
- `forceDelete`: Force delete pods that are stuck (default: false)
- `allNamespaces`: Operate on all namespaces (default: false)
- `confirmDelete`: Explicit confirmation for deletion (default: false)

## Pod States Detected

The tool identifies pods in the following states:
- **Error**: Pods that have encountered errors
- **CrashLoopBackOff**: Pods that are repeatedly crashing
- **ImagePullBackOff**: Pods that can't pull container images
- **Evicted**: Pods that have been evicted from nodes
- **Terminating**: Pods stuck in termination state
- **Unknown**: Pods with unknown status

## Usage Examples

### Preview Pods to be Cleaned (Dry Run)
```json
{
  "namespace": "default",
  "dryRun": true,
  "forceDelete": false
}
```

### Clean Up Error Pods in Specific Namespace
```json
{
  "namespace": "production",
  "dryRun": false,
  "forceDelete": true,
  "confirmDelete": true
}
```

### Clean Up All Namespaces
```json
{
  "namespace": "all",
  "allNamespaces": true,
  "dryRun": false,
  "forceDelete": false,
  "confirmDelete": true
}
```

## Safety Features

1. **Dry Run Mode**: Always use `dryRun: true` first to see what would be deleted
2. **Confirmation Required**: Set `confirmDelete: true` to actually perform deletions
3. **Namespace Targeting**: Default to specific namespaces to avoid accidental deletions
4. **State Filtering**: Only targets pods in problematic states

## Best Practices

1. **Always Preview**: Use dry run mode before actual cleanup
2. **Target Specific Namespaces**: Avoid using `allNamespaces` unless necessary
3. **Understand Pod States**: Know what each state means before deletion
4. **Monitor Results**: Check the output to ensure expected pods are targeted
5. **Use Force Sparingly**: Only use `forceDelete` for truly stuck pods

## Output Format

The tool returns a JSON response with:
- List of pods found in each state
- Number of pods that would be/were deleted
- Confirmation of actions taken
- Any errors encountered during the process 