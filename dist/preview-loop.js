/* FrameUI Studio - demand-driven, visibility-aware preview scheduling. */
(function (scope) {
    'use strict';
    function create(options, clock = scope) {
        const interval = 1000 / (options.fps || 30);
        let frame = 0, timer = 0, dirty = false, lastPaint = null, lastTick = null;
        function stop() {
            if (frame) clock.cancelAnimationFrame(frame);
            if (timer) clock.clearTimeout(timer);
            frame = timer = 0; lastTick = null;
        }
        function request(immediate = false) {
            if (!options.visible()) { stop(); return; }
            if (frame || (!dirty && !options.playing())) return;
            if (timer) { if (!immediate) return; clock.clearTimeout(timer); timer = 0; }
            const delay = immediate || lastPaint === null ? 0 : Math.max(0,interval-(clock.performance.now()-lastPaint)-8);
            if (delay > 0) timer = clock.setTimeout(() => {timer=0;frame=clock.requestAnimationFrame(tick);},delay);
            else frame = clock.requestAnimationFrame(tick);
        }
        function tick(time) {
            frame = 0;
            if (!options.visible()) { stop(); return; }
            const playing = options.playing(), changed = dirty;
            if (playing && !changed && lastPaint !== null && time-lastPaint < interval-.5) {
                frame=clock.requestAnimationFrame(tick);return;
            }
            dirty = false;
            const elapsed = playing && lastTick !== null ? Math.min(time-lastTick,100) : 0;
            lastPaint = time; lastTick = playing ? time : null;
            options.render(time,elapsed,changed);
            if (!options.playing()) lastTick = null;
            request();
        }
        return {invalidate() {dirty=true;request(true);}, suspend:stop};
    }
    const api = {create};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    scope.FrameStudioPreviewLoop = api;
})(typeof window === 'undefined' ? globalThis : window);
