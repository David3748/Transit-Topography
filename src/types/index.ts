export interface Station {
  id: string;
  lat: number;
  lon: number;
}

export interface GraphNode {
  lat: number;
  lon: number;
  id: string;
  neighbors: Map<string, number>;
  name?: string;
}

export interface Edge {
  from: string;
  to: string;
  weight: number;
}

export interface RoutingProfile {
  boardingWaitSec: number;
  transferPenaltySec: number;
  direction: 'depart' | 'arrive';
  maxNetworkTimeSec?: number;
}

export interface TransitData {
  nodes: Array<{ id: string; lat: number; lon: number }>;
  edges: Edge[];
}

export interface OptimizedWalkingData {
  v: 2;
  nodes: [number, number][];
  edges: [number, number, number][];
}

export interface LegacyWalkingData {
  nodes: Array<{ id: string; lat: number; lon: number }>;
  edges: Array<{ from: string; to: string; time: number }>;
}

export type WalkingData = OptimizedWalkingData | LegacyWalkingData;

export interface WalkingNode {
  id: string;
  lat: number;
  lon: number;
  neighbors: Array<{ id: string; time: number }>;
}

export interface CityConfig {
  name: string;
  flag: string;
  region: string;
  center: [number, number];
  zoom: number;
  files: string[];
  busFiles?: string[];
  water?: string;
  buildings?: string;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface WalkingGrid {
  data: Float32Array | number[];
  size: number;
  bounds: MapBounds;
}

export interface RenderParams {
  width: number;
  height: number;
  pixelSize: number;
  opacity: number;
  maxTime: number;
  origin: [number, number];
  bounds: MapBounds;
  activeStations: Array<{ lat: number; lon: number; time: number }>;
  obstacleData: number[] | null;
  walkingGrid: { data: number[]; size: number; bounds: MapBounds } | null;
  walkSpeedMps: number;
  isPreview: boolean;
}

export interface RenderWorkerMessage {
  type: 'render';
  params: RenderParams;
}

export interface RenderWorkerResponse {
  type: 'progress' | 'complete' | 'error';
  progress?: number;
  data?: ArrayBuffer;
  width?: number;
  height?: number;
  message?: string;
  isPreview?: boolean;
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{
    type: string;
    ref: number;
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

// ── Poster types ──────────────────────────────────────────────────────────

export interface PosterConfig {
  city: string;
  origin: [number, number];
  originLabel: string;
  themeId: string;
  aspectRatio: '16:9' | '3:2' | '1:1' | '2:3';
  maxTime: number;      // minutes
  hourOfDay: number;    // 0-23.5
  includeBuses: boolean;
}

export interface PosterBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  width: number;   // canvas pixels
  height: number;  // canvas pixels
}

export interface PosterStation {
  lat: number;
  lon: number;
  time: number;
  isRail: boolean;
}

export interface PosterEdge {
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
  isRail: boolean;
}

export interface PosterWorkerInput {
  type: 'generate';
  config: PosterConfig;
  bounds: PosterBounds;
  theme: import('../poster/poster-themes').PosterTheme;
  stations: PosterStation[];
  edges: PosterEdge[];
  waterPolygons: [number, number][][];
  walkingGrid: { data: number[]; size: number; bounds: MapBounds } | null;
  walkSpeedMps: number;
  origin: [number, number];
}

export interface PosterWorkerOutput {
  type: 'progress' | 'complete' | 'error';
  progress?: number;
  layerName?: string;
  imageData?: ArrayBuffer;
  width?: number;
  height?: number;
  message?: string;
}
