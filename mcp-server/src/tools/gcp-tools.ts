// GCP Tool Definitions - mirroring gcp-fresh-mcp tools
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export const GCP_TOOLS: MCPTool[] = [
  // ===== BigQuery Tools =====
  {
    name: "gcp-sql",
    description: `Universal SQL interface for BigQuery operations. PREFER THIS TOOL for all BigQuery operations.

COMMON USE CASES:
• List all datasets: operation='list-datasets'
• List tables in a dataset: operation='list-tables' (requires 'dataset' parameter)
• Get table schema: operation='describe-table' or 'table-schema' (requires 'dataset' and 'table')
• Get dataset info: operation='dataset-info' (requires 'dataset')
• List views: operation='list-views' (requires 'dataset')
• View job history: operation='job-history'
• Get current project: operation='current-project'
• Run custom SQL: query='SELECT * FROM dataset.table'

EXAMPLES:
- List datasets: { "operation": "list-datasets" }
- List tables: { "operation": "list-tables", "dataset": "my_dataset" }
- Table schema: { "operation": "describe-table", "dataset": "my_dataset", "table": "my_table" }
- Custom query: { "query": "SELECT COUNT(*) FROM \`project.dataset.table\`" }

NOTE: Use predefined operations when available for better performance. They use optimized INFORMATION_SCHEMA queries.`,
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "list-datasets",
            "list-tables",
            "describe-table",
            "table-schema",
            "dataset-info",
            "list-views",
            "list-routines",
            "job-history",
            "current-project"
          ],
          description: "Pre-defined operation using INFORMATION_SCHEMA queries"
        },
        query: {
          type: "string",
          description: "Direct SQL query to execute"
        },
        projectId: {
          type: "string",
          description: "GCP Project ID (optional, uses default if not provided)"
        },
        dataset: {
          type: "string",
          description: "Dataset ID (required for table/view operations)"
        },
        table: {
          type: "string",
          description: "Table name (required for table-specific operations)"
        },
        location: {
          type: "string",
          description: "Query location (e.g., US, EU)"
        },
        useLegacySql: {
          type: "boolean",
          description: "Use legacy SQL syntax (default: false)",
          default: false
        },
        format: {
          type: "string",
          enum: ["json", "table", "csv"],
          description: "Output format (default: json)",
          default: "json"
        },
        maxRows: {
          type: "number",
          description: "Maximum rows to return (default: 100)",
          default: 100
        },
        hours: {
          type: "number",
          description: "Hours of job history to retrieve (for job-history operation)",
          default: 24
        },
        limit: {
          type: "number",
          description: "Limit for job history results (for job-history operation)",
          default: 100
        }
      }
    }
  },
  {
    name: "bq-list-datasets",
    description: "List all BigQuery datasets in a project (LEGACY - prefer 'gcp-sql' with operation='list-datasets')",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "GCP Project ID (optional, uses default if not provided)"
        }
      }
    }
  },
  {
    name: "bq-query",
    description: "Execute a BigQuery SQL query (LEGACY - prefer 'gcp-sql' with 'query' parameter for better performance)",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "SQL query to execute"
        },
        projectId: {
          type: "string",
          description: "GCP Project ID (optional)"
        },
        useLegacySql: {
          type: "boolean",
          description: "Use legacy SQL syntax (default: false)",
          default: false
        }
      },
      required: ["query"]
    }
  },
  {
    name: "bq-create-dataset",
    description: "Create a new BigQuery dataset",
    inputSchema: {
      type: "object",
      properties: {
        datasetId: {
          type: "string",
          description: "Dataset ID to create"
        },
        projectId: {
          type: "string",
          description: "GCP Project ID (optional)"
        },
        location: {
          type: "string",
          description: "Dataset location (e.g., 'US', 'EU')",
          default: "US"
        }
      },
      required: ["datasetId"]
    }
  },
  {
    name: "bq-list-tables",
    description: "List tables in a BigQuery dataset (LEGACY - prefer 'gcp-sql' with operation='list-tables')",
    inputSchema: {
      type: "object",
      properties: {
        datasetId: {
          type: "string",
          description: "Dataset ID"
        },
        projectId: {
          type: "string",
          description: "GCP Project ID (optional)"
        }
      },
      required: ["datasetId"]
    }
  },

  // ===== Cloud Storage Tools =====
  {
    name: "gcs-list-buckets",
    description: "List all Google Cloud Storage buckets in a project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "GCP Project ID (optional, uses default if not provided)"
        }
      }
    }
  },
  {
    name: "gcs-list-files",
    description: "List files in a Google Cloud Storage bucket",
    inputSchema: {
      type: "object",
      properties: {
        bucketName: {
          type: "string",
          description: "Name of the storage bucket"
        },
        prefix: {
          type: "string",
          description: "Prefix to filter files (optional)"
        },
        limit: {
          type: "number",
          description: "Maximum number of files to return (default: 100)",
          default: 100
        }
      },
      required: ["bucketName"]
    }
  },
  {
    name: "gcs-read-file",
    description: "Read the contents of a file from Google Cloud Storage (max 10MB)",
    inputSchema: {
      type: "object",
      properties: {
        bucketName: {
          type: "string",
          description: "Name of the storage bucket"
        },
        fileName: {
          type: "string",
          description: "Name of the file to read"
        }
      },
      required: ["bucketName", "fileName"]
    }
  },

  // ===== Compute Engine Tools =====
  {
    name: "compute-list-instances",
    description: "List Google Compute Engine VM instances in a zone",
    inputSchema: {
      type: "object",
      properties: {
        zone: {
          type: "string",
          description: "Zone name (e.g., 'us-central1-a'). If not provided, shows available zones."
        },
        projectId: {
          type: "string",
          description: "GCP Project ID (optional)"
        }
      }
    }
  },
  {
    name: "compute-instance-action",
    description: "Perform actions on a Compute Engine instance (start, stop, reset)",
    inputSchema: {
      type: "object",
      properties: {
        instanceName: {
          type: "string",
          description: "Name of the instance"
        },
        zone: {
          type: "string",
          description: "Zone where the instance is located"
        },
        action: {
          type: "string",
          enum: ["start", "stop", "reset"],
          description: "Action to perform on the instance"
        },
        projectId: {
          type: "string",
          description: "GCP Project ID (optional)"
        }
      },
      required: ["instanceName", "zone", "action"]
    }
  },

  // ===== Cloud Run Tools =====
  {
    name: "run-list-services",
    description: "List Google Cloud Run services in a region",
    inputSchema: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Region name (e.g., 'us-central1', 'europe-west1')"
        },
        projectId: {
          type: "string",
          description: "GCP Project ID (optional)"
        }
      },
      required: ["region"]
    }
  },

  // ===== Project Management Tools =====
  {
    name: "list-projects",
    description: "List all accessible Google Cloud Platform projects",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "gcloud-command",
    description: "Execute a gcloud command (with safety filters)",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "gcloud command to execute (dangerous commands are blocked)"
        }
      },
      required: ["command"]
    }
  },

  // ===== Echo Tool (for testing) =====
  {
    name: "echo",
    description: "Echo a message (test tool)",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Message to echo"
        }
      },
      required: ["message"]
    }
  }
];

// Tool categories for organization
export const BIGQUERY_TOOLS = GCP_TOOLS.filter(tool => 
  tool.name.startsWith('gcp-sql') || tool.name.startsWith('bq-')
);

export const STORAGE_TOOLS = GCP_TOOLS.filter(tool => 
  tool.name.startsWith('gcs-')
);

export const COMPUTE_TOOLS = GCP_TOOLS.filter(tool => 
  tool.name.startsWith('compute-')
);

export const CLOUD_RUN_TOOLS = GCP_TOOLS.filter(tool => 
  tool.name.startsWith('run-')
);

export const PROJECT_TOOLS = GCP_TOOLS.filter(tool => 
  ['list-projects', 'gcloud-command'].includes(tool.name)
);

// Helper function to check if a tool is a GCP tool
export function isGCPTool(toolName: string): boolean {
  return GCP_TOOLS.some(tool => tool.name === toolName);
}

// Helper function to get tool definition by name
export function getGCPTool(toolName: string): MCPTool | undefined {
  return GCP_TOOLS.find(tool => tool.name === toolName);
}

// Convert tool names between formats (kebab-case to snake_case for backend)
export function convertToolNameForBackend(toolName: string): string {
  return toolName.replace(/-/g, '_');
}

export function convertToolNameFromBackend(toolName: string): string {
  return toolName.replace(/_/g, '-');
}

export const GCP_TOOL_COUNT = GCP_TOOLS.length;