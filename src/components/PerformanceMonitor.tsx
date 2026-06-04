import { useState, useEffect, useRef, ProfilerOnRenderCallback } from "react";
import { 
  Activity, 
  BarChart2, 
  ChevronDown, 
  ChevronUp, 
  Play, 
  RefreshCw, 
  Settings, 
  Sliders, 
  Terminal, 
  Zap, 
  Minimize2, 
  Maximize2,
  Trash2
} from "lucide-react";

// Structure of render telemetry
export interface ComponentRenderMetric {
  id: string;
  renderCount: number;
  lastDuration: number;
  averageDuration: number;
  totalDuration: number;
  maxDuration: number;
  phaseHistory: { phase: string; duration: number; timestamp: number }[];
}

// Global registry for render metrics so they persist without triggering infinite re-renders
const metricsRegistry: Record<string, ComponentRenderMetric> = {};
let isConsoleLogEnabled = true;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(l => l());
}

/**
 * Global implementation of the React Profiler onRender callback
 * Tracks render speed and prints styled outputs to the browser console.
 */
export const trackComponentRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  // Initialize metric if it doesn't exist
  if (!metricsRegistry[id]) {
    metricsRegistry[id] = {
      id,
      renderCount: 0,
      lastDuration: 0,
      averageDuration: 0,
      totalDuration: 0,
      maxDuration: 0,
      phaseHistory: []
    };
  }

  const metric = metricsRegistry[id];
  metric.renderCount += 1;
  metric.lastDuration = actualDuration;
  metric.totalDuration += actualDuration;
  metric.averageDuration = metric.totalDuration / metric.renderCount;
  if (actualDuration > metric.maxDuration) {
    metric.maxDuration = actualDuration;
  }
  
  // Track last 10 phase history records
  metric.phaseHistory.push({ phase, duration: actualDuration, timestamp: Date.now() });
  if (metric.phaseHistory.length > 10) {
    metric.phaseHistory.shift();
  }

  // Console logging with developer-friendly styling
  if (isConsoleLogEnabled) {
    const isPerformanceSlow = actualDuration > 10; // flag if render takes >10ms
    const timeColor = isPerformanceSlow ? "color: #ef4444; font-weight: bold;" : "color: #10b981; font-weight: bold;";
    
    console.log(
      `%c⏱️ [PerfMonitor] %c${id} %crendered (%c${phase}%c) in %c${actualDuration.toFixed(2)}ms ` +
      `%c(avg: ${metric.averageDuration.toFixed(2)}ms, count: ${metric.renderCount})`,
      "color: #a855f7; font-weight: bold;",
      "color: #3b82f6; font-weight: bold;",
      "color: #4b5563;",
      phase === "mount" ? "color: #f59e0b; font-weight: bold;" : "color: #3b82f6;",
      "color: #4b5563;",
      timeColor,
      "color: #6b7280; font-size: 10px;"
    );
  }

  notifyListeners();
};

export default function PerformanceMonitor() {
  const [metrics, setMetrics] = useState<ComponentRenderMetric[]>([]);
  const [isConsoleLog, setIsConsoleLog] = useState(isConsoleLogEnabled);
  const [isMinimized, setIsMinimized] = useState(false);
  const [fps, setFps] = useState(60);
  const [isStressTesting, setIsStressTesting] = useState(false);
  const [lastStressLoad, setLastStressLoad] = useState(0);

  // Throttled refresh trigger
  useEffect(() => {
    const handleUpdate = () => {
      setMetrics(Object.values(metricsRegistry).sort((a, b) => b.lastDuration - a.lastDuration));
    };

    listeners.add(handleUpdate);
    handleUpdate(); // initial load

    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  // Frame calculation for interactive UI smooth-feed and FPS calculation
  const frameTimes = useRef<number[]>([]);
  useEffect(() => {
    let animId: number;
    const calculateFps = () => {
      const now = performance.now();
      frameTimes.current.push(now);
      
      // Filter out frames older than 1 second
      const oneSecondAgo = now - 1000;
      frameTimes.current = frameTimes.current.filter(t => t > oneSecondAgo);
      
      setFps(frameTimes.current.length);
      animId = requestAnimationFrame(calculateFps);
    };
    
    animId = requestAnimationFrame(calculateFps);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Synchronize console logging setting
  const handleToggleConsoleLog = () => {
    isConsoleLogEnabled = !isConsoleLog;
    setIsConsoleLog(isConsoleLogEnabled);
  };

  // Reset measurements in the global registries
  const handleResetMetrics = () => {
    Object.keys(metricsRegistry).forEach(k => {
      delete metricsRegistry[k];
    });
    setMetrics([]);
    console.clear();
    console.info("⏱️ Performance Monitor stats cleared.");
  };

  /**
   * Simulates heavy UI workload (Stress Test).
   * Generates computational overhead to demonstrate bottleneck warnings and observe re-render impact.
   */
  const runStressTest = () => {
    setIsStressTesting(true);
    const startTime = performance.now();
    
    // Perform intensive calculations to block CPU for dummy rendering stress
    let result = 0;
    const iterations = 8000000; // computational loop
    for (let i = 0; i < iterations; i++) {
      result += Math.sqrt(Math.sin(i) * Math.cos(i));
    }
    
    const elapsed = performance.now() - startTime;
    setLastStressLoad(elapsed);
    
    // Simulate a brief frame drop or dynamic update by triggering a window event or timeout
    setTimeout(() => {
      setIsStressTesting(false);
      // Trigger a state push to metrics registries
      Object.keys(metricsRegistry).forEach(id => {
        const metric = metricsRegistry[id];
        if (metric) {
          metric.renderCount += 1;
          metric.lastDuration += elapsed * 0.15; // simulate artificial lag
          if (metric.lastDuration > metric.maxDuration) {
            metric.maxDuration = metric.lastDuration;
          }
        }
      });
      notifyListeners();
    }, 150);
  };

  // Check overall responsiveness health code
  const getHealthStatus = () => {
    if (fps < 30) return { label: "Performance Bottleneck", color: "text-red-500 bg-red-500/10 border-red-500/20" };
    if (fps < 50) return { label: "Frame Drops Detected", color: "text-amber-500 bg-amber-500/10 border-amber-500/20" };
    return { label: "System Responsive", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" };
  };

  const health = getHealthStatus();

  return (
    <div className="fixed bottom-4 right-4 z-[9999] select-none font-sans antialiased max-w-[340px] w-full">
      {isMinimized ? (
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-3 py-2 bg-slate-900/90 text-white dark:bg-slate-950/90 backdrop-blur-md rounded-full shadow-lg border border-slate-700 hover:scale-105 active:scale-95 transition-all text-xs font-bold font-mono tracking-tight cursor-pointer"
        >
          <Zap className={`w-3.5 h-3.5 text-yellow-400 ${fps < 40 ? "animate-bounce" : "animate-pulse"}`} />
          <span>{fps} FPS</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          <Maximize2 className="w-3 h-3 text-slate-400 ml-1" />
        </button>
      ) : (
        <div className="bg-white dark:bg-slate-900/95 backdrop-blur-md text-slate-850 dark:text-slate-100 rounded-xl border border-gray-200 dark:border-slate-800 shadow-2xl p-4 flex flex-col gap-3.5 transition-colors overflow-hidden">
          
          {/* Header Title Bar */}
          <div className="flex justify-between items-center border-b border-gray-150 dark:border-slate-850 pb-2">
            <div className="flex items-center gap-2">
              <div className="bg-purple-100 dark:bg-purple-950/50 p-1.5 rounded-lg text-purple-600 dark:text-purple-400">
                <BarChart2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider">Dev Performance</h4>
                <p className="text-[9px] text-gray-500 dark:text-slate-400 font-medium">Re-renders & Thread speed</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleResetMetrics}
                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded transition-colors cursor-pointer"
                title="Reset performance indices"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                title="Minimize monitor overlay"
                id="perf-minimize-btn"
              >
                <Minimize2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* FPS Speedometer & Frame Indicators */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 dark:bg-slate-950/60 p-2.5 rounded-lg border border-gray-150 dark:border-slate-850 flex flex-col items-center justify-center">
              <span className={`text-xl font-mono font-extrabold tracking-tight ${fps < 30 ? "text-red-500" : fps < 50 ? "text-amber-500" : "text-emerald-500"}`}>
                {fps}
              </span>
              <span className="text-[8px] font-extrabold uppercase text-gray-400 dark:text-slate-500 tracking-widest mt-0.5">Live FPS</span>
            </div>

            <div className="bg-gray-50 dark:bg-slate-950/60 p-2.5 rounded-lg border border-gray-150 dark:border-slate-850 flex flex-col justify-center">
              <div className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${fps < 30 ? "bg-red-500 animate-ping" : fps < 50 ? "bg-amber-500 animate-pulse" : "bg-emerald-500 animate-pulse"}`} />
                <span className="text-[9px] font-bold truncate max-w-[100px] text-gray-700 dark:text-slate-300">
                  {health.label}
                </span>
              </div>
              <span className="text-[8px] font-extrabold uppercase text-gray-400 dark:text-slate-500 tracking-widest mt-0.5 mt-1">Status</span>
            </div>
          </div>

          {/* Segment Component Performance table */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[8px] font-extrabold uppercase text-gray-400 dark:text-slate-500 tracking-widest px-1">
              <span>Component</span>
              <div className="flex gap-4">
                <span>Renders</span>
                <span className="w-9 text-right">Last</span>
                <span className="w-9 text-right font-bold">Avg</span>
              </div>
            </div>

            {/* Scrollable Metrics View */}
            <div className="max-h-[140px] overflow-y-auto pr-1 space-y-1 scrollbar-thin">
              {metrics.length === 0 ? (
                <div className="text-center py-4 text-gray-400 dark:text-slate-500 select-none">
                  <Activity className="w-4 h-4 mx-auto opacity-40 animate-pulse" />
                  <p className="text-[10px] mt-1">Awaiting component load...</p>
                </div>
              ) : (
                metrics.map((m) => {
                  const isLongRender = m.lastDuration > 8;
                  const isHeavyCount = m.renderCount > 25;

                  return (
                    <div 
                      key={m.id} 
                      className="p-1.5 bg-gray-50/70 dark:bg-slate-950/30 rounded border border-gray-150/40 dark:border-slate-850/60 flex items-center justify-between transition-all"
                    >
                      <div className="flex flex-col min-w-0 pr-1">
                        <span className="text-[10px] font-bold truncate max-w-[130px] font-mono text-gray-800 dark:text-slate-200">
                          {m.id}
                        </span>
                        <span className="text-[7px] text-gray-400 dark:text-slate-500 font-mono">
                          Max: {m.maxDuration.toFixed(1)}ms
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-[10px] font-mono font-medium shrink-0">
                        <span className={`text-[9px] font-bold ${isHeavyCount ? "text-amber-500 font-extrabold" : "text-gray-500 dark:text-slate-400"}`}>
                          {m.renderCount}x
                        </span>
                        
                        <span className={`w-9 text-right ${isLongRender ? "text-red-500 font-bold" : "text-gray-700 dark:text-slate-350"}`}>
                          {m.lastDuration.toFixed(1)}m
                        </span>

                        <span className="w-9 text-right font-extrabold text-purple-600 dark:text-purple-400">
                          {m.averageDuration.toFixed(1)}m
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Interactive Testing Operations panel */}
          <div className="bg-gray-50 dark:bg-slate-950/40 border border-gray-150 dark:border-slate-850 p-2.5 rounded-lg flex flex-col gap-2">
            <h5 className="text-[8px] font-extrabold text-gray-500 dark:text-slate-400 uppercase tracking-widest leading-none mb-1">Testing Controls</h5>
            
            {/* Interactive Switches */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-600 dark:text-slate-400 font-medium">Log re-renders to Console</span>
              <button
                onClick={handleToggleConsoleLog}
                className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none cursor-pointer ${
                  isConsoleLog ? "bg-purple-600" : "bg-gray-250 dark:bg-slate-850"
                }`}
              >
                <span
                  className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                    isConsoleLog ? "translate-x-4.5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Stress Test execution */}
            <div className="flex items-center justify-between gap-2 mt-1 pt-1.5 border-t border-gray-150/55 dark:border-slate-850/60">
              <button
                onClick={runStressTest}
                disabled={isStressTesting}
                className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-extrabold uppercase text-[8px] tracking-wider py-1.5 rounded transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow flex items-center justify-center gap-1 font-mono"
                id="perf-stress-test-btn"
              >
                <Zap className="w-2.5 h-2.5 text-yellow-300 animate-pulse" />
                {isStressTesting ? "STRESSING CPU..." : "Stress Workload"}
              </button>
              
              {lastStressLoad > 0 && (
                <span className="text-[9px] font-mono text-gray-400 dark:text-slate-500 shrink-0 font-bold">
                  +{lastStressLoad.toFixed(0)}ms lag
                </span>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
