import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { Frame } from '../types/frame.js';
import type { FrameTag } from '../types/tag.js';

const FRAME_SIZE = 20;
const FRAME_GAP = 1;

// Tag span colors — deterministic by index
const TAG_COLORS = [
  '#4a6fa5',
  '#6b4a8a',
  '#4a8a6b',
  '#8a6b4a',
  '#8a4a5e',
  '#4a8a8a',
  '#7a7a4a',
  '#5e4a8a',
];

const containerStyle: Record<string, string> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: '4px',
};

const tagRowStyle: Record<string, string> = {
  position: 'relative',
  height: '16px',
  marginLeft: '22px',
  marginRight: '22px',
};

const tagSpanStyle: Record<string, string> = {
  position: 'absolute',
  height: '14px',
  borderRadius: '2px',
  fontSize: '9px',
  lineHeight: '14px',
  paddingLeft: '3px',
  paddingRight: '3px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: '#fff',
  top: '0',
};

const stripRowStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
};

const navButtonStyle: Record<string, string> = {
  background: 'none',
  border: '1px solid #555',
  color: '#ccc',
  cursor: 'pointer',
  fontSize: '10px',
  width: '20px',
  height: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '2px',
  flexShrink: '0',
  padding: '0',
};

const stripContainerStyle: Record<string, string> = {
  display: 'flex',
  gap: `${String(FRAME_GAP)}px`,
  overflowX: 'auto',
  flex: '1',
};

const frameBoxBase: Record<string, string> = {
  width: `${String(FRAME_SIZE)}px`,
  height: `${String(FRAME_SIZE)}px`,
  border: '1px solid #555',
  cursor: 'pointer',
  flexShrink: '0',
  boxSizing: 'border-box',
  fontSize: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#aaa',
};

const activeFrameBg = '#3a3a5c';
const activeFrameBorder = '1px solid #7a7aff';

const controlsRowStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '11px',
  color: '#ccc',
};

const controlButtonStyle: Record<string, string> = {
  ...navButtonStyle,
  width: '24px',
  height: '20px',
};

const counterStyle: Record<string, string> = {
  fontSize: '11px',
  fontFamily: 'monospace',
  color: '#aaa',
  marginLeft: 'auto',
};

interface TimelineProps {
  frames: Frame[];
  tags: FrameTag[];
  activeFrameIndex: number;
  onSelectFrame: (frameIndex: number) => void;
}

export function Timeline({ frames, tags, activeFrameIndex, onSelectFrame }: TimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const activeFrameRef = useRef(activeFrameIndex);
  const framesRef = useRef(frames);

  // Keep refs in sync with props
  activeFrameRef.current = activeFrameIndex;
  framesRef.current = frames;

  const advance = useCallback(() => {
    const f = framesRef.current;
    const cur = activeFrameRef.current;
    if (cur >= f.length - 1) {
      if (isLooping) {
        onSelectFrame(0);
      } else {
        setIsPlaying(false);
      }
    } else {
      onSelectFrame(cur + 1);
    }
  }, [isLooping, onSelectFrame]);

  // requestAnimationFrame playback loop (7.6.5)
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) {
      return;
    }

    let elapsed = 0;

    const tick = (timestamp: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      }

      const delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;
      elapsed += delta;

      const currentFrame = framesRef.current[activeFrameRef.current];
      const duration = currentFrame?.duration_ms ?? 100;

      if (elapsed >= duration) {
        elapsed -= duration;
        advance();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, frames.length, advance]);

  const handlePrev = () => {
    if (frames.length === 0) return;
    if (isLooping) {
      onSelectFrame((activeFrameIndex - 1 + frames.length) % frames.length);
    } else {
      onSelectFrame(Math.max(0, activeFrameIndex - 1));
    }
  };

  const handleNext = () => {
    if (frames.length === 0) return;
    if (isLooping) {
      onSelectFrame((activeFrameIndex + 1) % frames.length);
    } else {
      onSelectFrame(Math.min(frames.length - 1, activeFrameIndex + 1));
    }
  };

  const togglePlay = () => {
    setIsPlaying((p) => !p);
  };

  const toggleLoop = () => {
    setIsLooping((l) => !l);
  };

  const currentDuration = frames[activeFrameIndex]?.duration_ms ?? 0;
  const hasTagRow = tags.length > 0;

  return (
    <div style={containerStyle}>
      {/* 7.6.4 — Tag spans */}
      {hasTagRow && (
        <div style={tagRowStyle}>
          {tags.map((tag, i) => {
            const left = tag.start * (FRAME_SIZE + FRAME_GAP);
            const width = (tag.end - tag.start + 1) * (FRAME_SIZE + FRAME_GAP) - FRAME_GAP;
            return (
              <div
                key={`${tag.name}-${String(tag.start)}`}
                style={{
                  ...tagSpanStyle,
                  left: `${String(left)}px`,
                  width: `${String(width)}px`,
                  backgroundColor: TAG_COLORS[i % TAG_COLORS.length],
                }}
                title={`${tag.name} (${String(tag.start + 1)}–${String(tag.end + 1)})`}
              >
                {tag.name}
              </div>
            );
          })}
        </div>
      )}

      {/* 7.6.1 — Frame strip + 7.6.2 — Prev/Next */}
      <div style={stripRowStyle}>
        <button style={navButtonStyle} onClick={handlePrev} title="Previous frame">
          {'\u25C0'}
        </button>
        <div style={stripContainerStyle}>
          {frames.map((frame) => (
            <div
              key={frame.index}
              style={{
                ...frameBoxBase,
                ...(frame.index === activeFrameIndex
                  ? { backgroundColor: activeFrameBg, border: activeFrameBorder }
                  : {}),
              }}
              onClick={() => {
                onSelectFrame(frame.index);
              }}
              title={`Frame ${String(frame.index + 1)} (${String(frame.duration_ms)}ms)`}
            >
              {String(frame.index + 1)}
            </div>
          ))}
        </div>
        <button style={navButtonStyle} onClick={handleNext} title="Next frame">
          {'\u25B6'}
        </button>
      </div>

      {/* 7.6.3 — Frame counter + 7.6.5 — Play/Pause + 7.6.6 — Loop toggle */}
      <div style={controlsRowStyle}>
        <button style={controlButtonStyle} onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '\u23F8' : '\u25B6'}
        </button>
        <button
          style={{
            ...controlButtonStyle,
            ...(isLooping ? { borderColor: '#7a7aff' } : {}),
          }}
          onClick={toggleLoop}
          title={isLooping ? 'Looping (click to disable)' : 'Not looping (click to enable)'}
        >
          {'\u21BB'}
        </button>
        <span style={counterStyle}>
          frame {String(activeFrameIndex + 1)} / {String(frames.length)} ({String(currentDuration)}
          ms)
        </span>
      </div>
    </div>
  );
}
