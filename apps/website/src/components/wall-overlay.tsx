// Text on the wall, in four blocks that each cover whole screens:
//   left top: title    left bottom: big number    right top: data    right bottom: comparison + credits
// Every screen draws the whole layer and shifts it by its own position.

import type { CSSProperties, ReactNode } from 'react';

import type { View } from '../lib/realtime/types';
import { formatBillions, formatMillions, type StoryStats } from '../lib/story/analysis';
import {
    COLORS,
    LEFT_BOTTOM,
    LEFT_TOP,
    PADDING,
    RIGHT_BOTTOM,
    RIGHT_TOP,
    TYPE,
    type Box
} from '../lib/story/layout';
import { VIEWS } from '../lib/story/views';
import { SCREEN_HEIGHT, SCREEN_WIDTH, WALL_HEIGHT, WALL_WIDTH } from '../lib/wall';

type Props = { c: number; r: number; view: View; stats: StoryStats | null };

export function WallOverlay({ c, r, view, stats }: Props) {
    const copy = VIEWS[view];
    return (
        <div
            className="absolute top-0 left-0"
            style={{
                width: WALL_WIDTH,
                height: WALL_HEIGHT,
                transform: `translate(${-c * SCREEN_WIDTH}px, ${-r * SCREEN_HEIGHT}px)`,
                fontFamily: 'Arial, Helvetica, sans-serif',
                color: COLORS.text
            }}
        >
            <Block box={LEFT_TOP}>
                <p style={{ fontSize: TYPE.body, color: COLORS.stepFree, fontWeight: 700 }}>
                    TRANSPORT FOR LONDON OPEN DATA
                </p>
                <h1 style={{ fontSize: TYPE.title, lineHeight: 1.02, fontWeight: 700 }}>
                    Step-Free London
                </h1>
                <p style={{ fontSize: TYPE.heading, lineHeight: 1.2 }}>
                    How many Tube stations can you use without stairs?
                </p>
            </Block>

            {/* `fadeKey` makes the block fade in again when the view changes. */}
            <Block box={LEFT_BOTTOM} fadeKey={view}>
                <p
                    style={{
                        fontSize: TYPE.body,
                        fontWeight: 700,
                        color: view === 'everyone' ? COLORS.text : COLORS.stepFree
                    }}
                >
                    SHOWING: {copy.label.toUpperCase()}
                </p>
                {stats ? (
                    <>
                        <p style={{ fontSize: TYPE.figure, fontWeight: 700, lineHeight: 1 }}>
                            {copy.figure(stats)}
                        </p>
                        <p style={{ fontSize: TYPE.body, color: COLORS.muted, lineHeight: 1.2 }}>
                            {copy.figureLabel(stats)}
                        </p>
                        <p style={{ fontSize: TYPE.body, lineHeight: 1.25 }}>
                            {copy.caption(stats)}
                        </p>
                    </>
                ) : (
                    <p style={{ fontSize: TYPE.body }}>Loading TfL data…</p>
                )}
                <Legend view={view} />
            </Block>

            <Block box={RIGHT_TOP} fadeKey={view}>
                {stats && <DataPanel view={view} stats={stats} />}
            </Block>

            <Block box={RIGHT_BOTTOM}>
                <Heading>For comparison</Heading>
                <p style={{ fontSize: TYPE.body, lineHeight: 1.25 }}>
                    {stats
                        ? `${stats.modelLines.map((l) => `${l.name}: ${l.stepFree} of ${l.stations} stations step-free`).join('. ')}.`
                        : ''}
                </p>
                <p
                    className="mt-auto"
                    style={{ fontSize: TYPE.small, color: COLORS.muted, lineHeight: 1.25 }}
                >
                    Powered by TfL Open Data. Contains OS data © Crown copyright and database rights
                    2016 and Geomni UK Map data © 2019. Map © OpenStreetMap contributors © CARTO.
                </p>
            </Block>
        </div>
    );
}

/** A dark, see-through text block exactly covering whole screens. */
function Block({ box, fadeKey, children }: { box: Box; fadeKey?: string; children: ReactNode }) {
    const style: CSSProperties = {
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        padding: PADDING,
        background: COLORS.panel,
        overflow: 'hidden'
    };
    return (
        <section style={style}>
            <div
                key={fadeKey}
                className="wall-fade-in flex h-full flex-col"
                style={{ gap: TYPE.body * 0.45 }}
            >
                {children}
            </div>
        </section>
    );
}

function Heading({ children }: { children: ReactNode }) {
    return (
        <h2 style={{ fontSize: TYPE.heading, fontWeight: 700, lineHeight: 1.15 }}>{children}</h2>
    );
}

function Legend({ view }: { view: View }) {
    const dot = (color: string, opacity = 1): CSSProperties => ({
        display: 'inline-block',
        width: TYPE.small * 0.7,
        height: TYPE.small * 0.7,
        borderRadius: '50%',
        background: color,
        opacity,
        marginRight: TYPE.small * 0.3
    });
    return (
        <p className="mt-auto" style={{ fontSize: TYPE.small, color: COLORS.muted }}>
            {view === 'everyone' ? (
                <>
                    <span style={dot(COLORS.station)} />
                    station
                </>
            ) : (
                <>
                    <span style={dot(COLORS.stepFree)} />
                    step-free &nbsp; <span style={dot(COLORS.station, 0.3)} />
                    not step-free
                </>
            )}
            {' · circle size = entries and exits'}
        </p>
    );
}

function Bar({
    label,
    value,
    share,
    color,
    swatch
}: {
    label: string;
    value: string;
    share: number;
    color: string;
    swatch?: string;
}) {
    const size = TYPE.body;
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '42% 1fr auto',
                alignItems: 'center',
                columnGap: size * 0.4,
                fontSize: size,
                height: size * 1.45
            }}
        >
            <span className="flex items-center truncate" style={{ gap: size * 0.3 }}>
                {swatch && (
                    <span
                        style={{
                            width: size * 0.22,
                            height: size,
                            background: swatch,
                            flex: 'none'
                        }}
                    />
                )}
                {label}
            </span>
            <span
                style={{
                    height: size * 0.5,
                    background: 'rgba(230, 234, 242, 0.12)',
                    borderRadius: size
                }}
            >
                <span
                    style={{
                        display: 'block',
                        height: '100%',
                        width: `${Math.max(2, share * 100)}%`,
                        background: color,
                        borderRadius: size
                    }}
                />
            </span>
            <span style={{ fontWeight: 700 }}>{value}</span>
        </div>
    );
}

function DataPanel({ view, stats }: { view: View; stats: StoryStats }) {
    if (view === 'everyone') {
        return (
            <>
                <Heading>The network</Heading>
                <Figure
                    value={String(stats.tubeLines)}
                    label="Tube lines (Elizabeth line and DLR also shown)"
                />
                <Figure
                    value={formatBillions(stats.tubeUsage).replace(' billion', 'bn')}
                    label={`entries and exits in ${stats.usageYear}`}
                />
            </>
        );
    }
    if (view === 'stepfree') {
        // The three worst Tube lines, then the two fully step-free lines.
        const rows = [...stats.lines.slice(0, 3), ...stats.modelLines];
        return (
            <>
                <Heading>Step-free stations by line</Heading>
                {rows.map((line) => (
                    <Bar
                        key={line.id}
                        label={line.name}
                        value={`${line.stepFree}/${line.stations}`}
                        share={line.stepFree / line.stations}
                        color={COLORS.stepFree}
                        swatch={line.color}
                    />
                ))}
            </>
        );
    }
    const max = stats.busiestGaps[0]?.usage ?? 1;
    return (
        <>
            <Heading>Busiest, no step-free access</Heading>
            {stats.busiestGaps.map((gap) => (
                <Bar
                    key={gap.index}
                    label={gap.name}
                    value={formatMillions(gap.usage)}
                    share={gap.usage / max}
                    color={COLORS.gap}
                />
            ))}
        </>
    );
}

function Figure({ value, label }: { value: string; label: string }) {
    return (
        <div>
            <p style={{ fontSize: TYPE.figure, fontWeight: 700, lineHeight: 1 }}>{value}</p>
            <p style={{ fontSize: TYPE.body, color: COLORS.muted }}>{label}</p>
        </div>
    );
}
