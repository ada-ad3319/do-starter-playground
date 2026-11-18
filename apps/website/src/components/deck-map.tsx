// deck.gl map, used when a screen is a normal page (as on the real DO). Inside the simulator's
// iframes the screen uses MapLibre layers instead (`addLayers`), because many deck.gl canvases
// can run out of WebGL contexts. Both use the same `Look` values.

import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import DeckGL from '@deck.gl/react';
import { Map } from '@vis.gl/react-maplibre';
import { useMemo } from 'react';

import type { StoryStats } from '../lib/story/analysis';
import { COLORS } from '../lib/story/layout';
import {
    FADE_MS,
    LINE_WIDTH,
    MAP_STYLE,
    toGeoJson,
    type Look,
    type MapView
} from '../lib/story/map';
import type { Network } from '../lib/story/network';

type Props = { view: MapView; network: Network | null; stats: StoryStats | null; look: Look };

type LineFeature = ReturnType<typeof toGeoJson>['lines']['features'][number];
type StationFeature = ReturnType<typeof toGeoJson>['stations']['features'][number];

const rgb = (hex: string): [number, number, number] => {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const alpha = (opacity: number) => Math.round(255 * opacity);

export function DeckMap({ view, network, stats, look }: Props) {
    const data = useMemo(
        () => (network && stats ? toGeoJson(network, stats) : null),
        [network, stats]
    );
    // deck.gl fades to the new colours over FADE_MS.
    const trigger = Object.values(look);
    const transitions = { getColor: FADE_MS, getFillColor: FADE_MS, getLineColor: FADE_MS };

    const layers = data
        ? [
              new PathLayer<LineFeature>({
                  id: 'lines',
                  data: data.lines.features,
                  getPath: (f) => f.geometry.coordinates,
                  getColor: (f) => [...rgb(f.properties.color), alpha(look.lineOpacity)],
                  getWidth: LINE_WIDTH,
                  widthUnits: 'pixels',
                  capRounded: true,
                  jointRounded: true,
                  updateTriggers: { getColor: trigger },
                  transitions
              }),
              new ScatterplotLayer<StationFeature>({
                  id: 'stations',
                  data: data.stations.features,
                  getPosition: (f) => f.geometry.coordinates as [number, number],
                  getRadius: (f) => f.properties.radius,
                  radiusUnits: 'pixels',
                  getFillColor: (f) =>
                      f.properties.stepFree
                          ? [...rgb(look.stepFreeColor), 255]
                          : [...rgb(COLORS.station), alpha(look.noStepFreeOpacity)],
                  stroked: true,
                  getLineWidth: 3,
                  lineWidthUnits: 'pixels',
                  getLineColor: (f) => [
                      ...rgb(COLORS.stationStroke),
                      alpha(f.properties.stepFree ? 1 : look.noStepFreeOpacity)
                  ],
                  updateTriggers: { getFillColor: trigger, getLineColor: trigger },
                  transitions
              }),
              new ScatterplotLayer<StationFeature>({
                  id: 'gap-stations',
                  data: data.stations.features.filter((f) => f.properties.gap),
                  getPosition: (f) => f.geometry.coordinates as [number, number],
                  getRadius: (f) => f.properties.radius + 6,
                  radiusUnits: 'pixels',
                  getFillColor: [...rgb(COLORS.gap), alpha(look.gapOpacity)],
                  stroked: true,
                  getLineWidth: 4,
                  lineWidthUnits: 'pixels',
                  getLineColor: [...rgb(COLORS.stationStroke), alpha(look.gapOpacity)],
                  updateTriggers: { getFillColor: trigger, getLineColor: trigger },
                  transitions
              })
          ]
        : [];

    return (
        <DeckGL
            controller={false}
            viewState={view}
            layers={layers}
            style={{ width: '100%', height: '100%' }}
        >
            <Map mapStyle={MAP_STYLE} attributionControl={false} />
        </DeckGL>
    );
}
