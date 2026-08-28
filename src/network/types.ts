export interface RequestData {
  startedDateTime: string;
  time: number;

  request: Request;
  response: Response;
  cache: Cache;
  timings: Timings;

  serverIPAddress: string | undefined;
  connection: string | undefined;

  _resourceType?: RequestCategory;
  _initiator?: Initiator;
  _priority?: ResourcePriority;

  getContent(callback: (content: string, encoding: string) => void): void;
}

interface Timings {
  blocked: number | undefined;
  dns: number | undefined;
  connect: number | undefined;
  send: number | undefined;
  wait: number;
  receive: number;
  ssl: number | undefined;
}

interface Cache {
  beforeRequest: any;
  afterRequest: any;
}

interface Response {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: Header[];
  cookies: Cookie[];
  redirectURL: string;
  headersSize: number;
  bodySize: number;
  content: Content;
}

interface Request {
  method: string;
  url: string;
  httpVersion: string;
  headers: Header[];
  queryString: QueryParameter[];
  cookies: Cookie[];
  headersSize: number;
  bodySize: number;
  postData: PostData;
}

interface PostData {
  mimeType: string;
  text: string;
  params: string;
}

interface Content {
  size: number;
  compression: number | undefined;
  mimeType: string;
  text: string | undefined;
  encoding: string | undefined;
}

export interface Initiator {
  type: InitiatorType;

  url?: string;
  lineNumber?: number;

  // Preserve Chromium's complete initiator stack as-is. A later source-correlation
  // layer can interpret/map these frames without throwing away capture data now.
  stack?: unknown;
}

export type RequestCategory =
  | "Document"
  | "Stylesheet"
  | "Image"
  | "Media"
  | "Font"
  | "Script"
  | "TextTrack"
  | "XHR"
  | "Fetch"
  | "Prefetch"
  | "EventSource"
  | "WebSocket"
  | "Manifest"
  | "SignedExchange"
  | "Ping"
  | "CSPViolationReport"
  | "Preflight"
  | "FedCM"
  | "Other";

export type InitiatorType =
  | "parser"
  | "script"
  | "preload"
  | "SignedExchange"
  | "preflight"
  | "FedCM"
  | "other";

export type ResourcePriority =
  | "VeryLow"
  | "Low"
  | "Medium"
  | "High"
  | "VeryHigh";

export interface Header {
  name: string;
  value: string;
}

export interface QueryParameter {
  name: string;
  value: string;
}

export interface Cookie {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  expires?: string;
  httpOnly?: boolean;
  secure?: boolean;
}

export interface NormalizedTimings {
  blocked: number;
  dns: number;
  connect: number;
  send: number;
  wait: number;
  receive: number;
  ssl: number;
  total: number;
}

export type RequestOutcome =
  | "success"
  | "redirect"
  | "client-error"
  | "server-error"
  | "unknown";

export interface NormalizedRequest {
  // Identity / timeline
  id: string;
  startedAt: string;
  duration: number;

  // What happened
  category: RequestCategory;
  method: string;
  url: string;
  host: string;
  path: string;
  protocol: string;

  // Result
  status: number;
  statusText: string;
  outcome: RequestOutcome;

  // Data types / sizes
  requestMimeType?: string;
  responseMimeType: string;
  requestSize: number;
  responseSize: number;

  // Request data
  query: QueryParameter[];
  requestHeaders: Header[];
  requestBody?: string;

  // Response data
  responseHeaders: Header[];
  redirectUrl?: string;
  responseBody?: string;
  responseBodyEncoding?: string;
  responseBodyLoaded: boolean;

  // Performance
  timings: NormalizedTimings;

  // Browser information
  initiator?: Initiator;
  priority?: ResourcePriority;
  serverIPAddress?: string;
  connection?: string;

  // Cache
  cached: boolean;

  // Original data if Blackbox needs something later
  raw: RequestData;
}

export interface RequestAnalysis {
  severity: "none" | "info" | "warning" | "error";
  issues: RequestIssue[];
}

export interface RequestIssue {
  type: RequestIssueType;
  title: string;
  // Short one-line takeaway shown in the Overview insights card
  summary: string;
  message: string;
}

export type RequestIssueType =
  | "auth-error" // 401 / 403
  | "not-found" // 404
  | "rate-limited" // 429
  | "server-error" // 5xx
  | "client-error" // other 4xx
  | "slow-request"
  | "slow-server-wait"
  | "large-response"
  | "redirect"
  | "cached-response"
  | "other";

export interface SessionAnalysis {
  issues: SessionIssue[];
  stats: SessionStats;
}

export interface SessionIssue {
  type: SessionIssueType;
  title: string;
  // Short one-line takeaway, mirrors RequestIssue.summary
  summary: string;
  message: string;
  // Requests this insight was derived from
  requestIds: string[];
}

type SessionIssueType = "duplicate-requests" | "polling" | "error-cluster";

export interface SessionStats {
  totalRequests: number;
  totalTransferredBytes: number;
  averageDuration: number;
  endpointFrequency: EndpointFrequency[];
  domainStats: DomainStats[];
}

export interface EndpointFrequency {
  method: string;
  host: string;
  path: string;
  count: number;
  percentage: number;
}

export interface DomainStats {
  host: string;
  requestCount: number;
  transferredBytes: number;
  errorCount: number;
  averageDuration: number;
}

export interface NetworkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type GraphNodeType = "page" | "domain" | "endpoint";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;

  requestCount: number;
  transferredBytes: number;
  errorCount: number;
  averageDuration: number;

  host?: string;
  method?: string;
  path?: string;

  requestIds: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;

  requestCount: number;
  transferredBytes: number;
  errorCount: number;

  requestIds: string[];
}
