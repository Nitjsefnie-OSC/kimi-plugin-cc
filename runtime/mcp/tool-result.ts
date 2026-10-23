export interface McpToolResult {
  resultType?: "complete";
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError: boolean;
}

export function textResult(
  text: string,
  structuredContent?: Record<string, unknown>,
  isError = false,
): McpToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent ? { structuredContent } : {}),
    isError,
  };
}
