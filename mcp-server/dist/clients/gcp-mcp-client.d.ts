export interface GCPMCPResponse {
    jsonrpc: string;
    id: string | number;
    result?: {
        content: Array<{
            type: string;
            text: string;
        }>;
    };
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}
export declare class GCPMCPClient {
    private httpClient;
    private logger;
    private baseUrl;
    private secretToken;
    constructor(config: {
        baseUrl: string;
        secretToken: string;
        timeout?: number;
    });
    testConnectivity(): Promise<boolean>;
    callTool(toolName: string, params: any): Promise<GCPMCPResponse>;
    listTools(): Promise<any[]>;
    private sanitizeParams;
    isToolAvailable(toolName: string): Promise<boolean>;
    getServerInfo(): Promise<any>;
}
//# sourceMappingURL=gcp-mcp-client.d.ts.map